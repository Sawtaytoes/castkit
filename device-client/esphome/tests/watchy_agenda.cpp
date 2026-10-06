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
  const auto saved = cache;
  assert(!accept(
      R"({"date":"2026-10-05","events":[{"startMs":12,"summary":"Bad timestamp","isAllDay":false}]})"));
  assert(std::memcmp(&saved, &cache, sizeof(cache)) == 0);
  assert(!accept(
      R"({"date":"2026-10-05","events":[{"startMs":1791222000000,"summary":"Missing flag"}]})"));
  assert(!accept(R"({"date":"2026-xx-05","events":[]})"));
  assert(!accept(R"({"date":"2026-10-05"})"));

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

  // Model the exact blob persistence used by ESPHome preferences.
  std::array<unsigned char, sizeof(cache)> flash{};
  std::memcpy(flash.data(), &cache, sizeof(cache));
  watchy::AgendaCache restored{};
  std::memcpy(&restored, flash.data(), sizeof(restored));
  assert(restored.count == 32);
  assert(restored.events[31].start == cache.events[31].start);
  assert(std::string(restored.day) == "2026-10-05");
  assert(accept(R"({"date":"2026-10-06","events":[]})"));
  assert(cache.count == 0 && cache.omitted == 0);
  assert(std::string(cache.day) != std::string(restored.day));
}
