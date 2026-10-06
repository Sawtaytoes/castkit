#pragma once
#include "watchy_text.h"
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <ArduinoJson.h>

namespace watchy {
// One authoritative snapshot retained in RTC SRAM across deep sleep.
struct TimerCache {
  uint64_t started_ms{0};
  float goal_minutes{0};
  int32_t banked_minutes{0};
  bool is_countdown{false};
  char name[32]{};
  uint8_t reserved[7]{};
};

inline bool timer_running(const TimerCache &timer) {
  return timer.started_ms > 0 && timer.name[0];
}

inline void parse_timer(JsonObjectConst json, TimerCache &timer) {
  JsonObjectConst task = json["activeTask"].is<JsonObjectConst>()
                             ? json["activeTask"].as<JsonObjectConst>()
                             : json["runningSession"].as<JsonObjectConst>();
  TimerCache next{};
  next.started_ms = task["startedAtMs"] | task["startedMs"] | uint64_t(0);
  const std::string name = task["name"] | task["taskName"] | "";
  ascii_text(next.name, name);
  next.goal_minutes = task["goalMinutes"] | 0.0f;
  next.banked_minutes = std::max(0, task["bankedMinutes"] | 0);
  next.is_countdown = task["isCountdown"] | false;
  timer = timer_running(next) ? next : TimerCache{};
}

inline double elapsed_timer_minutes(const TimerCache &timer, uint32_t timestamp) {
  return std::max(0.0, (double(timestamp) - double(timer.started_ms) / 1000.0) / 60.0);
}

inline int elapsed_minutes(const TimerCache &timer, uint32_t timestamp) {
  return int(elapsed_timer_minutes(timer, timestamp));
}

inline int timer_minutes(const TimerCache &timer, uint32_t timestamp) {
  const double elapsed = elapsed_timer_minutes(timer, timestamp);
  return timer.is_countdown && timer.goal_minutes > 0
             ? std::max(0, int(std::ceil(timer.goal_minutes - elapsed)))
             : timer.banked_minutes + int(elapsed);
}
} // namespace watchy
