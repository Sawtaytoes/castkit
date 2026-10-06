#include "../components/watchy_battery/watchy_agenda.h"
#include <cassert>
#include <cstring>
#include <type_traits>

int main() {
  static_assert(std::is_trivially_copyable_v<watchy::AgendaCache>);
  watchy::AgendaCache cache{};
  JsonDocument doc;
  auto accept = [&](const char *payload) {
    assert(deserializeJson(doc, payload) == DeserializationError::Ok);
    return watchy::parse_agenda(doc.as<JsonObjectConst>(), cache);
  };
  assert(accept(
      R"({"date":"2026-10-05","events":[{"startMs":1791222000000,"summary":"Practice","isAllDay":false},{"startMs":1791176400000,"summary":"All day","isAllDay":true}]})"));
  assert(cache.count == 2);
  assert(cache.events[0].all_day);
  assert(cache.events[1].start == 1791222000);
  assert(std::string(cache.events[1].summary) == "Practice");
  assert(accept(
      R"({"date":"2026-10-05","events":[{"startMs":1791222000000,"summary":"Tutor\u2019s practice","isAllDay":false}]})"));
  assert(std::string(cache.events[0].summary) == "Tutor's practice");
  assert(accept(
      R"({"date":"2026-10-05","events":[{"startMs":1791222000000,"summary":"Pok\u00e9mon","isAllDay":false}]})"));
  assert(std::string(cache.events[0].summary) == "Pokemon");
  const auto saved = cache;
  assert(!accept(
      R"({"date":"2026-10-05","events":[{"startMs":12,"summary":"Bad timestamp","isAllDay":false}]})"));
  assert(std::memcmp(&saved, &cache, sizeof(cache)) == 0);
  assert(!accept(
      R"({"date":"2026-10-05","events":[{"startMs":1791222000000,"summary":"Missing flag"}]})"));
  assert(!accept(R"({"date":"2026-xx-05","events":[]})"));
  assert(!accept(R"({"date":"2026-10-05"})"));

  assert(accept(
      R"({"date":"2026-10-05","events":[{"startMs":1791222000000,"endMs":1791225600000,"summary":"Practice","isAllDay":false},{"startMs":1791229200000,"endMs":1791231000000,"summary":"Meeting","isAllDay":false}]})"));
  assert(watchy::next_agenda_event(cache, 1791221999, "2026-10-05") == 0);
  assert(watchy::next_agenda_event(cache, 1791222000, "2026-10-05") == 0);
  assert(watchy::next_agenda_event(cache, 1791225599, "2026-10-05") == 0);
  assert(watchy::next_agenda_event(cache, 1791225600, "2026-10-05") == 1);
  assert(watchy::next_agenda_event(cache, 1791231000, "2026-10-05") == -1);
  assert(watchy::next_agenda_event(cache, 1791222000, "2026-10-06") == -1);
  // An ongoing event remains until its exact end, even with no fresh snapshot.
  auto offline = cache;
  watchy::expire_agenda(offline, 1791225599, "2026-10-05");
  assert(offline.count == 2);
  watchy::expire_agenda(offline, 1791225600, "2026-10-05");
  assert(offline.count == 1 && std::string(offline.events[0].summary) == "Meeting");
  watchy::expire_agenda(offline, 1791231000, "2026-10-05");
  assert(offline.count == 0);
  const auto with_ends = cache;
  assert(!accept(
      R"({"date":"2026-10-05","events":[{"startMs":1791222000000,"endMs":1791221999000,"summary":"Invalid","isAllDay":false}]})"));
  assert(!accept(
      R"({"date":"2026-10-05","events":[{"startMs":1791222000000,"endMs":"invalid","summary":"Invalid","isAllDay":false}]})"));
  assert(std::memcmp(&with_ends, &cache, sizeof(cache)) == 0);
  assert(accept(
      R"({"date":"2026-10-05","events":[{"startMs":1791176400000,"summary":"All day","isAllDay":true},{"startMs":1791222000000,"summary":"Practice","isAllDay":false}]})"));
  assert(watchy::next_agenda_event(cache, 1791221999, "2026-10-05") == 1);
  assert(watchy::next_agenda_event(cache, 1791222001, "2026-10-05") == 0);

  // All-day rows with no duration last for the day; timed rows without ends expire at start.
  assert(watchy::next_agenda_event(cache, 1791222000, "2026-10-05") == 0);
  watchy::expire_agenda(cache, 1791222000, "2026-10-05");
  assert(cache.count == 1 && cache.events[0].all_day);
  watchy::expire_agenda(cache, 1791222000, "2026-10-06");
  assert(cache.count == 0);
  assert(accept(
      R"({"date":"2026-10-05","events":[{"startMs":1791176400000,"endMs":1791262800000,"summary":"All day","isAllDay":true}]})"));
  watchy::expire_agenda(cache, 1791262799, "2026-10-05");
  assert(cache.count == 1);
  watchy::expire_agenda(cache, 1791262800, "2026-10-05");
  assert(cache.count == 0);

  doc.clear();
  doc["date"] = "2026-10-05";
  auto events = doc["events"].to<JsonArray>();
  for (int index = 0; index < 35; index++) {
    auto event = events.add<JsonObject>();
    event["startMs"] = uint64_t(1791222000000) + index * 60000;
    event["summary"] = std::string(120, 'X') + "\xe2\x98\x85";
    event["isAllDay"] = false;
  }
  assert(watchy::parse_agenda(doc.as<JsonObjectConst>(), cache));
  assert(cache.count == 32);
  assert(cache.omitted == 3);
  assert(std::strlen(cache.events[31].summary) == 95);
  const auto bounded = cache;
  assert(watchy::parse_agenda(doc.as<JsonObjectConst>(), cache));
  assert(std::memcmp(&bounded, &cache, sizeof(cache)) == 0);

  // Model the exact snapshot retained in RTC SRAM across deep sleep.
  std::array<unsigned char, sizeof(cache)> retained{};
  std::memcpy(retained.data(), &cache, sizeof(cache));
  watchy::AgendaCache restored{};
  std::memcpy(&restored, retained.data(), sizeof(restored));
  assert(restored.count == 32);
  auto aged = restored;
  watchy::expire_agenda(aged, restored.events[3].end, "2026-10-05");
  assert(aged.count == 28 && aged.events[0].start == restored.events[4].start);
  watchy::expire_agenda(aged, restored.events[3].end, "2026-10-06");
  assert(aged.count == 0 && aged.omitted == 0);
  assert(restored.events[31].start == cache.events[31].start);
  assert(std::string(restored.day) == "2026-10-05");
  assert(accept(R"({"date":"2026-10-06","events":[]})"));
  assert(cache.count == 0 && cache.omitted == 0);
  assert(std::string(cache.day) != std::string(restored.day));
}
