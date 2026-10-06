#include "../components/watchy_battery/watchy_battery_estimate.h"
#include <cassert>
#include <limits>

int main() {
  watchy::BatteryEstimate state{};
  assert(watchy::smooth_battery(state, 4.17f));
  assert(watchy::battery_percent(state.voltage, true, false) == 100);
  assert(watchy::battery_percent(state.voltage, true, true) <= 99);
  // USB with an inactive charger does not turn a partly discharged cell into 100%.
  assert(watchy::battery_percent(4.01f, true, false) < 100);
  const float previous = state.voltage;
  assert(watchy::smooth_battery(state, 3.97f));
  assert(state.voltage < previous && state.voltage > 4.10f);
  const float stable = state.voltage;
  assert(!watchy::smooth_battery(state, std::numeric_limits<float>::quiet_NaN()));
  assert(!watchy::smooth_battery(state, 8.0f));
  assert(state.voltage == stable);
  // A true low sample bypasses smoothing so the low-battery sleep guard still acts.
  assert(watchy::smooth_battery(state, 3.30f));
  assert(state.voltage == 3.30f);
  assert(watchy::battery_percent(state.voltage, false, false) == 0);
  assert(watchy::battery_percent(4.3f, false, false) == 100);
}
