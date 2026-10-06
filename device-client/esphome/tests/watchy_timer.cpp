#include "../components/watchy_battery/watchy_timer.h"
#include <cassert>
#include <cstring>
#include <type_traits>

int main() {
  static_assert(std::is_trivially_copyable_v<watchy::TimerCache>);
  static_assert(sizeof(watchy::TimerCache) == 56);
  JsonDocument document;
  deserializeJson(
      document,
      R"({"runningSession":{"taskName":"Practice","startedMs":1791258900123,"bankedMinutes":32,"goalMinutes":60,"isCountdown":false}})");
  watchy::TimerCache timer{};
  watchy::parse_timer(document.as<JsonObjectConst>(), timer);
  assert(watchy::timer_running(timer));
  assert(timer.started_ms == 1791258900123ULL);
  assert(std::strcmp(timer.name, "Practice") == 0);
  assert(watchy::timer_minutes(timer, 1791258960) == 32);
  assert(watchy::timer_minutes(timer, 1791258961) == 33);
  // Restoring the persisted bytes on a minute wake preserves totals and elapsed time.
  watchy::TimerCache restored{};
  std::memcpy(&restored, &timer, sizeof(timer));
  assert(watchy::elapsed_minutes(restored, 1791259021) == 2);
  assert(watchy::timer_minutes(restored, 1791259021) == 34);
  assert(watchy::elapsed_minutes(restored, 1791258899) == 0);
  // Repeated health snapshots do not alter the cache or require another flash write.
  watchy::parse_timer(document.as<JsonObjectConst>(), timer);
  assert(std::memcmp(&timer, &restored, sizeof(timer)) == 0);
  deserializeJson(
      document,
      R"({"activeTask":{"name":"Study","startedAtMs":1791258900123,"goalMinutes":2,"isCountdown":true}})");
  watchy::parse_timer(document.as<JsonObjectConst>(), timer);
  assert(watchy::timer_minutes(timer, 1791258961) == 1);
  assert(watchy::timer_minutes(timer, 1791259021) == 0);
  deserializeJson(document, R"({"runningSession":null})");
  watchy::parse_timer(document.as<JsonObjectConst>(), timer);
  assert(!watchy::timer_running(timer));
  assert(timer.started_ms == 0 && timer.name[0] == '\0');
}
