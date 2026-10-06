#pragma once
#include "watchy_text.h"
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <string>
#include <ArduinoJson.h>

namespace watchy {
struct AgendaEvent {
  uint32_t start{0};
  uint32_t end{0};
  bool all_day{false};
  char summary[96]{};
};
// One bounded, trivially copyable snapshot retained in RTC SRAM across sleep.
struct AgendaCache {
  char day[11]{};
  uint16_t count{0};
  uint16_t omitted{0};
  std::array<AgendaEvent, 32> events{};
};
inline bool parse_agenda(JsonObjectConst json, AgendaCache &cache) {
  const std::string day = json["date"] | "";
  if (day.size() != 10 || day[4] != '-' || day[7] != '-' || !json["events"].is<JsonArrayConst>()) {
    return false;
  }
  for (size_t i = 0; i < day.size(); i++) {
    if (i != 4 && i != 7 && (day[i] < '0' || day[i] > '9')) {
      return false;
    }
  }
  AgendaCache next{};
  std::memcpy(next.day, day.c_str(), 10);
  for (JsonObjectConst event : json["events"].as<JsonArrayConst>()) {
    if (!event["startMs"].is<uint64_t>() || !event["summary"].is<const char *>() ||
        !event["isAllDay"].is<bool>()) {
      return false;
    }
    const uint64_t start = event["startMs"].as<uint64_t>() / 1000;
    if (start < 1700000000 || start > UINT32_MAX) {
      return false;
    }
    if (next.count >= next.events.size()) {
      if (next.omitted < UINT16_MAX) {
        next.omitted++;
      }
      continue;
    }
    auto &row = next.events[next.count++];
    row.start = start;
    if (!event["endMs"].isNull()) {
      if (!event["endMs"].is<uint64_t>()) {
        return false;
      }
      const uint64_t end = event["endMs"].as<uint64_t>() / 1000;
      if (end < start || end > UINT32_MAX) {
        return false;
      }
      row.end = end;
    } else {
      row.end = start;
    }
    row.all_day = event["isAllDay"].as<bool>();
    // Normalize curly apostrophes to the embedded ASCII apostrophe glyph.
    ascii_text(row.summary, event["summary"].as<std::string>());
  }
  std::sort(next.events.begin(), next.events.begin() + next.count,
            [](const AgendaEvent &a, const AgendaEvent &b) { return a.start < b.start; });
  cache = next;
  return true;
}

// End times are exclusive. All-day rows without a duration last for their cached day.
inline bool agenda_event_visible(const AgendaEvent &event, uint32_t now) {
  return (event.all_day && event.end == event.start) || event.end > now;
}

// Compact the RTC cache locally, including minute wakes with no network connection.
inline void expire_agenda(AgendaCache &cache, uint32_t now, const std::string &day) {
  if (day != cache.day) {
    cache.count = 0;
    cache.omitted = 0;
    return;
  }
  uint16_t remaining = 0;
  for (uint16_t index = 0; index < cache.count; index++) {
    if (agenda_event_visible(cache.events[index], now)) {
      cache.events[remaining++] = cache.events[index];
    }
  }
  cache.count = remaining;
}

// Ongoing timed events precede future ones; all-day items are a fallback.
inline int next_agenda_event(const AgendaCache &cache, uint32_t now, const std::string &day) {
  if (day != cache.day) {
    return -1;
  }
  int all_day = -1;
  for (int index = 0; index < cache.count; index++) {
    const auto &event = cache.events[index];
    if (!agenda_event_visible(event, now)) {
      continue;
    }
    if (event.all_day) {
      if (all_day < 0) {
        all_day = index;
      }
    } else {
      return index;
    }
  }
  return all_day;
}
} // namespace watchy
