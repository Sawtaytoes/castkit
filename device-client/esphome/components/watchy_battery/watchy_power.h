#pragma once
#include <cstdint>
#ifdef ESP_PLATFORM
#include <esp_attr.h>
#endif

namespace watchy {
struct RetryState {
  uint32_t next_attempt{0};
  uint8_t failures{0};
};
#ifdef ESP_PLATFORM
inline RTC_DATA_ATTR RetryState network_retry;
#endif

struct WakeContext {
  bool is_usb;
  bool is_manual_sync;
  bool is_cold_boot;
  bool has_time;
  uint8_t minute;
  uint8_t sync_minutes;
  uint32_t timestamp{0};
  bool has_active_timer{false};
  uint8_t active_sync_minutes{1};
};

inline bool network_due(const WakeContext &wake, const RetryState &retry = {}) {
  if (wake.is_usb || wake.is_manual_sync || wake.is_cold_boot || !wake.has_time) {
    return true;
  }
  if (retry.failures > 0) {
    return wake.timestamp >= retry.next_attempt;
  }
  const uint8_t configured = wake.has_active_timer ? wake.active_sync_minutes : wake.sync_minutes;
  const uint8_t interval = configured > 0 && configured <= 60 ? configured : 1;
  return wake.minute % interval == 0;
}
inline uint8_t retry_minutes(const RetryState &retry, uint8_t sync_minutes) {
  return retry.failures == 0 ? 1 : retry.failures == 1 && sync_minutes <= 2 ? 5 : 15;
}

inline void network_failed(RetryState &retry, uint32_t timestamp, uint8_t sync_minutes) {
  retry.failures = retry.failures < 2 ? retry.failures + 1 : 2;
  retry.next_attempt = (timestamp / 60 + retry_minutes(retry, sync_minutes)) * 60;
}

inline void network_succeeded(RetryState &retry) {
  retry = {};
}

// Fast connect returns to the saved access point while it still answers, however weak.
// After a weak link, forget it so the next sync scans and joins the strongest one.
constexpr int8_t WEAK_RSSI = -75;
constexpr uint32_t ROAM_RESCAN_SECONDS = 30 * 60;

struct RoamState {
  uint32_t last_rescan{0};
};
#ifdef ESP_PLATFORM
inline RTC_DATA_ATTR RoamState roam_state;
#endif

inline bool should_rescan(int8_t rssi, uint32_t timestamp, const RoamState &roam) {
  if (rssi <= -127 || rssi >= WEAK_RSSI || timestamp == 0) {
    return false;
  }
  return roam.last_rescan == 0 || timestamp - roam.last_rescan >= ROAM_RESCAN_SECONDS;
}
} // namespace watchy
