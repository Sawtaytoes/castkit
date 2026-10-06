#pragma once

#include <algorithm>
#include <cmath>

namespace watchy {
struct BatteryEstimate {
  float voltage{};
  bool has_sample{};
};

inline bool smooth_battery(BatteryEstimate &state, float measured) {
  if (!std::isfinite(measured) || measured < 2.5f || measured > 4.5f) {
    return false;
  }
  // Preserve the low-cell guard: smoothing must never hide a critical sample.
  if (!state.has_sample || measured < 3.35f) {
    state.voltage = measured;
  } else {
    state.voltage += (measured - state.voltage) * 0.2f;
  }
  state.has_sample = true;
  return true;
}

// SQFMI's example face: coarse voltage levels, not remaining capacity.
inline int battery_bars(float voltage) {
  if (!std::isfinite(voltage)) {
    return 0;
  }
  return voltage > 4.0f ? 3 : voltage > 3.6f ? 2 : voltage > 3.2f ? 1 : 0;
}

inline int battery_percent(float voltage, bool usb_connected, bool charging) {
  if (!std::isfinite(voltage)) {
    return 0;
  }
  // Charge completion alone does not prove a low-voltage cell is full.
  if (usb_connected && !charging && voltage >= 4.15f) {
    return 100;
  }
  return int(
      std::clamp(std::round((voltage - 3.35f) / 0.85f * 100.0f), 0.0f, charging ? 99.0f : 100.0f));
}
} // namespace watchy
