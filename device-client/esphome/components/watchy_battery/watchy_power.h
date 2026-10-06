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
};

inline bool network_due(const WakeContext &wake, const RetryState &retry = {}) {
  if (wake.is_usb || wake.is_manual_sync || wake.is_cold_boot || !wake.has_time) {
    return true;
  }
  if (retry.failures > 0) {
    return wake.timestamp >= retry.next_attempt;
  }
  const uint8_t interval = wake.sync_minutes > 0 && wake.sync_minutes <= 60 ? wake.sync_minutes : 1;
  return wake.minute % interval == 0;
}
inline uint8_t retry_minutes(const RetryState &retry, uint8_t sync_minutes) {
  return retry.failures == 0 ? 1 : retry.failures == 1 && sync_minutes == 1 ? 5 : 15;
}

inline void network_failed(RetryState &retry, uint32_t timestamp, uint8_t sync_minutes) {
  retry.failures = retry.failures < 2 ? retry.failures + 1 : 2;
  retry.next_attempt = (timestamp / 60 + retry_minutes(retry, sync_minutes)) * 60;
}

inline void network_succeeded(RetryState &retry) {
  retry = {};
}
} // namespace watchy
