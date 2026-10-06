#pragma once
#include "watchy_text.h"
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <string>
#include <ArduinoJson.h>

namespace watchy {
struct ScoreEntry {
  char id[32]{};
  char name[24]{};
  int32_t points{0};
  uint16_t order{255};
};
struct ScoresCache {
  char day[11]{};
  uint16_t count{0};
  uint32_t saved_at{0};
  std::array<ScoreEntry, 6> entries{};
};
inline bool parse_scores(JsonObjectConst json, ScoresCache &cache, uint32_t received_at) {
  const std::string day = json["day"] | json["date"] | "";
  if (day.size() != 10 || day[4] != '-' || day[7] != '-') {
    return false;
  }
  for (size_t i = 0; i < day.size(); i++) {
    if (i != 4 && i != 7 && (day[i] < '0' || day[i] > '9')) {
      return false;
    }
  }
  if (std::strcmp(cache.day, day.c_str()) > 0) {
    return false;
  }
  ScoresCache next{};
  const bool snapshot = json["kids"].is<JsonArrayConst>();
  if (!snapshot && day == cache.day) {
    next = cache;
  }
  std::memcpy(next.day, day.c_str(), 10);
  next.saved_at = cache.saved_at;
  auto add = [&](JsonObjectConst row) {
    const std::string identity = row["id"] | row["kid"] | "";
    const std::string name = row["name"] | row["kidName"] | "";
    if (identity.empty() || identity.size() >= sizeof(ScoreEntry::id) || name.empty() ||
        !row["pointsToday"].is<int32_t>()) {
      return false;
    }
    size_t index = 0;
    for (; index < next.count; index++) {
      if (identity == next.entries[index].id) {
        break;
      }
    }
    if (index >= next.entries.size()) {
      return false;
    }
    if (index == next.count) {
      next.count++;
    }
    ScoreEntry entry{};
    std::memcpy(entry.id, identity.c_str(), identity.size());
    ascii_text(entry.name, name);
    entry.points = row["pointsToday"].as<int32_t>();
    entry.order = row["displayOrder"].is<uint16_t>() ? row["displayOrder"].as<uint16_t>() : 255;
    next.entries[index] = entry;
    return true;
  };
  if (snapshot) {
    for (JsonObjectConst row : json["kids"].as<JsonArrayConst>()) {
      if (!add(row)) {
        return false;
      }
    }
  } else if (!add(json)) {
    return false;
  }
  // Insertion sort is sufficient for six rows and avoids libstdc++'s
  // sixteen-element sort fast path on this smaller array.
  auto before = [](const ScoreEntry &a, const ScoreEntry &b) {
    return a.order != b.order ? a.order < b.order : std::strcmp(a.name, b.name) < 0;
  };
  for (size_t i = 1; i < next.count; i++) {
    const auto entry = next.entries[i];
    size_t position = i;
    while (position > 0 && before(entry, next.entries[position - 1])) {
      next.entries[position] = next.entries[position - 1];
      position--;
    }
    next.entries[position] = entry;
  }
  if (std::memcmp(&next, &cache, sizeof(cache)) != 0) {
    const uint64_t timestamp = json["ts"] | uint64_t(0);
    next.saved_at = timestamp / 1000 >= 1700000000 && timestamp / 1000 <= UINT32_MAX
                        ? uint32_t(timestamp / 1000)
                        : received_at;
    cache = next;
  }
  return true;
}
} // namespace watchy
