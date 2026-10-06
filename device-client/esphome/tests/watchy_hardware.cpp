#include "../components/watchy_battery/watchy_hardware.h"
#include <cassert>
#include <map>
#include <utility>

// Models the BMA423 registers that the suspend routine touches.
struct FakeBma {
  uint8_t address{0x18};
  bool is_reset_honored{true};
  std::map<uint8_t, uint8_t> registers{{0x00, 0x13}, {0x7C, 0x00}, {0x7D, 0x04}};
  bool read_register(uint8_t at, uint8_t reg, uint8_t &value) {
    if (at != address) {
      return false;
    }
    value = registers[reg];
    return true;
  }
  bool write_register(uint8_t at, uint8_t reg, uint8_t value) {
    if (at != address) {
      return false;
    }
    if (reg == 0x7E && value == 0xB6 && is_reset_honored) {
      registers[0x7C] = 0x03;
      registers[0x7D] = 0x00;
    }
    return true;
  }
};

int main() {
  const auto no_delay = [](uint32_t) {};
  // The stock 100 Hz continuous configuration is reset to suspend mode.
  FakeBma primary;
  assert(watchy::suspend_bma423(primary, no_delay) == watchy::AccelState::SUSPENDED);
  assert(primary.registers[0x7D] == 0x00);
  // The alternate address is probed as well.
  FakeBma secondary;
  secondary.address = 0x19;
  assert(watchy::suspend_bma423(secondary, no_delay) == watchy::AccelState::SUSPENDED);
  // A chip that ignores the reset is reported, not assumed suspended.
  FakeBma stubborn;
  stubborn.is_reset_honored = false;
  assert(watchy::suspend_bma423(stubborn, no_delay) == watchy::AccelState::STILL_ACTIVE);
  // A missing or different chip is left alone.
  FakeBma other;
  other.registers[0x00] = 0x60;
  assert(watchy::suspend_bma423(other, no_delay) == watchy::AccelState::NOT_FOUND);
  assert(other.registers[0x7D] == 0x04);

  // The first sample seeds each average; later samples move it by one eighth.
  watchy::WakeStats stats;
  watchy::record_wake(stats, false, 800);
  assert(stats.local_ms == 800 && stats.local_count == 1 && stats.network_count == 0);
  watchy::record_wake(stats, false, 1600);
  assert(stats.local_ms == 900);
  watchy::record_wake(stats, true, 6000);
  assert(stats.network_ms == 6000 && stats.local_ms == 900);
  return 0;
}
