#pragma once
#include <cstddef>
#include <cstdint>
#ifdef ESP_PLATFORM
#include <driver/gpio.h>
#include <esp_attr.h>
#include <esp_pm.h>
#endif

namespace watchy {
// The BMA423 keeps whatever the stock firmware configured (100 Hz continuous,
// step/tilt/wake features) until it loses power, which deep sleep never does.
constexpr uint8_t BMA423_CHIP_ID = 0x13;
constexpr uint8_t BMA423_REG_CHIP_ID = 0x00;
constexpr uint8_t BMA423_REG_PWR_CONF = 0x7C;
constexpr uint8_t BMA423_REG_PWR_CTRL = 0x7D;
constexpr uint8_t BMA423_REG_CMD = 0x7E;
constexpr uint8_t BMA423_SOFT_RESET = 0xB6;

enum class AccelState : uint8_t { UNKNOWN, SUSPENDED, NOT_FOUND, STILL_ACTIVE };

// Bus is any object with read_register(address, reg, value&) and
// write_register(address, reg, value) returning true on success.
template <typename Bus, typename Delay> AccelState suspend_bma423(Bus &bus, Delay delay_ms) {
  for (const uint8_t address : {uint8_t(0x18), uint8_t(0x19)}) {
    uint8_t value = 0;
    if (!bus.read_register(address, BMA423_REG_CHIP_ID, value) || value != BMA423_CHIP_ID) {
      continue;
    }
    // A soft reset restores power-on defaults: accelerometer off, advanced power save on.
    bus.write_register(address, BMA423_REG_CMD, BMA423_SOFT_RESET);
    delay_ms(2);
    uint8_t control = 0xFF;
    uint8_t config = 0;
    if (!bus.read_register(address, BMA423_REG_PWR_CTRL, control) ||
        !bus.read_register(address, BMA423_REG_PWR_CONF, config)) {
      return AccelState::STILL_ACTIVE;
    }
    return (control & 0x04) == 0 && (config & 0x01) ? AccelState::SUSPENDED
                                                    : AccelState::STILL_ACTIVE;
  }
  return AccelState::NOT_FOUND;
}

inline const char *accel_state_text(AccelState state) {
  switch (state) {
  case AccelState::SUSPENDED:
    return "Suspended";
  case AccelState::NOT_FOUND:
    return "Not found";
  case AccelState::STILL_ACTIVE:
    return "Still active";
  default:
    return "Unknown";
  }
}

// Awake time per wake, averaged across deep sleep without flash writes.
struct WakeStats {
  uint32_t local_ms{0};
  uint32_t network_ms{0};
  uint16_t local_count{0};
  uint16_t network_count{0};
};

// Exponential average, 1/8 weight per new sample; the first sample seeds it.
inline void record_wake(WakeStats &stats, bool is_network, uint32_t awake_ms) {
  uint32_t &average = is_network ? stats.network_ms : stats.local_ms;
  uint16_t &count = is_network ? stats.network_count : stats.local_count;
  average = count == 0 ? awake_ms : average - average / 8 + awake_ms / 8;
  if (count < UINT16_MAX) {
    count++;
  }
}

#ifdef ESP_PLATFORM
inline RTC_DATA_ATTR WakeStats wake_stats;
inline RTC_DATA_ATTR AccelState accel_state;

constexpr gpio_num_t VIBRATION_MOTOR = GPIO_NUM_17;

// The motor driver input must not float. Drive it low and keep the RTC pad hold,
// which survives deep sleep, so later wakes never release or glitch it.
inline void hold_motor_off() {
  gpio_hold_dis(VIBRATION_MOTOR);
  gpio_set_level(VIBRATION_MOTOR, 0);
  gpio_set_direction(VIBRATION_MOTOR, GPIO_MODE_OUTPUT);
  gpio_set_pull_mode(VIBRATION_MOTOR, GPIO_FLOATING);
  gpio_hold_en(VIBRATION_MOTOR);
}

// The CPU idles at the 80 MHz boot frequency. Network work holds 160 MHz.
inline esp_pm_lock_handle_t cpu_lock = nullptr;
inline bool is_cpu_boosted = false;

inline void configure_cpu() {
  esp_pm_config_t config{};
  config.max_freq_mhz = 160;
  config.min_freq_mhz = 80;
  config.light_sleep_enable = false;
  if (esp_pm_configure(&config) == ESP_OK && cpu_lock == nullptr) {
    esp_pm_lock_create(ESP_PM_CPU_FREQ_MAX, 0, "watchy_network", &cpu_lock);
  }
}

inline void boost_cpu(bool is_on) {
  if (cpu_lock == nullptr || is_on == is_cpu_boosted) {
    return;
  }
  if ((is_on ? esp_pm_lock_acquire(cpu_lock) : esp_pm_lock_release(cpu_lock)) == ESP_OK) {
    is_cpu_boosted = is_on;
  }
}
#endif
} // namespace watchy
