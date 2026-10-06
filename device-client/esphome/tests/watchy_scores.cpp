#include "../components/watchy_battery/watchy_scores.h"
#include <cassert>
#include <cstring>
#include <type_traits>

int main() {
  static_assert(std::is_trivially_copyable_v<watchy::ScoresCache>);
  watchy::ScoresCache cache{};
  JsonDocument document;
  auto accept = [&](const char *payload, uint32_t received = 1791222000) {
    assert(deserializeJson(document, payload) == DeserializationError::Ok);
    return watchy::parse_scores(document.as<JsonObjectConst>(), cache, received);
  };
  assert(accept(
      R"({"kid":"second","kidName":"Second","day":"2026-10-05","pointsToday":200,"displayOrder":1})"));
  assert(accept(
      R"({"kid":"first","kidName":"First","day":"2026-10-05","pointsToday":300,"displayOrder":0})"));
  assert(accept(
      R"({"kid":"third","kidName":"Third","day":"2026-10-05","pointsToday":75,"displayOrder":2})"));
  assert(cache.count == 3);
  assert(std::string(cache.entries[0].name) == "First" && cache.entries[0].points == 300);
  assert(cache.entries[1].points == 200 && cache.entries[2].points == 75);
  const auto saved = cache;
  // Retained reconnects and producer heartbeats do not rewrite unchanged data.
  assert(accept(
      R"({"kid":"third","kidName":"Third","day":"2026-10-05","pointsToday":75,"displayOrder":2,"ts":1791222060000})",
      1791222060));
  assert(std::memcmp(&saved, &cache, sizeof(cache)) == 0);
  assert(!accept(R"({"kid":"first","kidName":"First","day":"2026-10-05","pointsToday":1.5})"));
  assert(!accept(R"({"kid":"first","kidName":"First","day":"2026-10-04","pointsToday":999})"));
  assert(!accept(R"({"kid":"first","kidName":"First","day":"2026-xx-05","pointsToday":999})"));
  assert(std::memcmp(&saved, &cache, sizeof(cache)) == 0);
  assert(accept(
      R"({"kid":"first","kidName":"First","day":"2026-10-05","pointsToday":-50,"displayOrder":0})"));
  assert(cache.count == 3 && cache.entries[0].points == -50);
  std::array<unsigned char, sizeof(cache)> flash{};
  std::memcpy(flash.data(), &cache, sizeof(cache));
  watchy::ScoresCache restored{};
  std::memcpy(&restored, flash.data(), sizeof(restored));
  assert(restored.count == 3 && restored.entries[0].points == -50);
  assert(accept(R"({"kid":"first","kidName":"First","day":"2026-10-06","pointsToday":0})"));
  assert(cache.count == 1 && std::string(cache.day) == "2026-10-06");
  assert(!accept(
      R"({"date":"2026-10-06","kids":[{"id":"first","name":"First","pointsToday":100},{}]})"));
  assert(cache.count == 1 && cache.entries[0].points == 0);
  assert(accept(
      R"({"date":"2026-10-06","kids":[{"id":"first","name":"Long\u2605 name with more than twenty four characters","pointsToday":100}]})"));
  assert(std::strlen(cache.entries[0].name) == 23);
  assert(std::string(cache.entries[0].name).find('?') != std::string::npos);
  assert(accept(
      R"({"date":"2026-10-06","kids":[{"id":"first","name":"Tutor\u2019s child","pointsToday":100}]})"));
  assert(std::string(cache.entries[0].name) == "Tutor's child");
  document.clear();
  document["date"] = "2026-10-06";
  auto kids = document["kids"].to<JsonArray>();
  for (int i = 0; i < 7; i++) {
    auto kid = kids.add<JsonObject>();
    kid["id"] = std::to_string(i);
    kid["name"] = "Child";
    kid["pointsToday"] = i;
  }
  const auto bounded = cache;
  assert(!watchy::parse_scores(document.as<JsonObjectConst>(), cache, 1791222000));
  assert(std::memcmp(&bounded, &cache, sizeof(cache)) == 0);
  assert(accept(R"({"date":"2026-10-06","kids":[]})"));
  assert(cache.count == 0);
}
