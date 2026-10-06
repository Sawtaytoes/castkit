#include "../components/watchy_battery/watchy_power.h"
#include <cassert>

int main() {
  // A calendar watch still has minute clock wakes without enabling the radio.
  assert(!watchy::network_due({false, false, false, true, 14, 15}));
  assert(watchy::network_due({false, false, false, true, 15, 15}));
  assert(watchy::network_due({false, false, false, true, 0, 15}));
  // Idle scans may skip odd minutes; an active timer uses the one-minute cadence.
  assert(!watchy::network_due({false, false, false, true, 13, 2}));
  assert(watchy::network_due({false, false, false, true, 14, 2}));
  assert(watchy::network_due({false, false, false, true, 13, 2, 0, true, 1}));
  assert(watchy::network_due({false, false, false, true, 14, 2, 0, true, 1}));
  // The timer watch retains its one-minute scan response budget.
  assert(watchy::network_due({false, false, false, true, 14, 1}));
  assert(!watchy::network_due({false, false, false, true, 9, 10}));
  assert(watchy::network_due({false, false, false, true, 10, 10}));
  // Manual sync, USB and bootstrapping time must bypass the slower calendar cadence.
  assert(watchy::network_due({true, false, false, true, 14, 15}));
  assert(watchy::network_due({false, true, false, true, 14, 15}));
  assert(watchy::network_due({false, false, true, true, 14, 15}));
  assert(watchy::network_due({false, false, false, false, 14, 15}));
  watchy::RetryState retry{};
  watchy::network_failed(retry, 1800000010, 1);
  assert(watchy::retry_minutes(retry, 1) == 5);
  assert(!watchy::network_due({false, false, false, true, 5, 1, 1800000240}, retry));
  assert(watchy::network_due({false, false, false, true, 6, 1, retry.next_attempt}, retry));
  assert(watchy::network_due({false, true, false, true, 5, 1, 1800000240}, retry));
  watchy::network_failed(retry, retry.next_attempt, 1);
  assert(watchy::retry_minutes(retry, 1) == 15);
  watchy::network_succeeded(retry);
  assert(retry.next_attempt == 0 && retry.failures == 0);
  assert(watchy::network_due({false, false, false, true, 5, 1, 1800000240}, retry));
  watchy::network_failed(retry, 1800000010, 2);
  assert(watchy::retry_minutes(retry, 2) == 5);
  assert(!watchy::network_due({false, false, false, true, 5, 2, 1800000240}, retry));
  assert(watchy::network_due({false, true, false, true, 5, 2, 1800000240}, retry));
  watchy::network_succeeded(retry);
  watchy::network_failed(retry, 1800000010, 10);
  assert(watchy::retry_minutes(retry, 10) == 15);
  assert(!watchy::network_due({false, false, false, true, 10, 10, 1800000240}, retry));
  assert(watchy::network_due({false, false, false, true, 15, 10, retry.next_attempt}, retry));
  // Invalid settings cannot strand a watch without automatic network checks.
  assert(watchy::network_due({false, false, false, true, 14, 0}));
  assert(watchy::network_due({false, false, false, true, 14, 255}));
}
