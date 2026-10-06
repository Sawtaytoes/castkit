#pragma once
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <string>
#include <ArduinoJson.h>

namespace watchy {
struct AgendaEvent {
  uint32_t start{0};
  bool all_day{false};
  char summary[96]{};
};
// One bounded, trivially copyable NVS snapshot. Zero initialization keeps padding
// stable for ESPHome's change detection, so reconnects do not rewrite flash.
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
    row.all_day = event["isAllDay"].as<bool>();
    // This face embeds ASCII glyphs. Replace non-ASCII
    // Unicode once per code point, never leave half a UTF-8 sequence in flash.
    const std::string title = event["summary"].as<std::string>();
    size_t written = 0;
    for (size_t i = 0; i < title.size() && written < sizeof(row.summary) - 1; i++) {
      const auto ch = static_cast<unsigned char>(title[i]);
      if (ch < 128) {
        row.summary[written++] = ch >= 32 ? ch : ' ';
      } else if ((ch & 0xc0) != 0x80) {
        row.summary[written++] = '?';
      }
    }
  }
  std::sort(next.events.begin(), next.events.begin() + next.count,
            [](const AgendaEvent &a, const AgendaEvent &b) { return a.start < b.start; });
  cache = next;
  return true;
}
} // namespace watchy
