#include "../components/watchy_display/watchy_refresh.h"
#include <cassert>
#include <cstring>

int main() {
  watchy::RefreshState state{};
  uint8_t frame[watchy::FRAME_BYTES]{};
  assert(watchy::refresh_mode(state, frame, 30) == watchy::RefreshMode::FULL);
  watchy::remember_frame(state, frame, watchy::RefreshMode::FULL);
  assert(watchy::refresh_mode(state, frame, 30) == watchy::RefreshMode::SKIP);
  for (int minute = 1; minute < 30; minute++) {
    frame[0] = minute;
    assert(watchy::refresh_mode(state, frame, 30) == watchy::RefreshMode::PARTIAL);
    watchy::remember_frame(state, frame, watchy::RefreshMode::PARTIAL);
    // A reboot into the same RTC bytes must preserve both frame and cadence.
    watchy::RefreshState restored{};
    std::memcpy(&restored, &state, sizeof(state));
    assert(watchy::refresh_mode(restored, frame, 30) == watchy::RefreshMode::SKIP);
    state = restored;
  }
  frame[0] = 30;
  assert(watchy::refresh_mode(state, frame, 30) == watchy::RefreshMode::FULL);
  watchy::remember_frame(state, frame, watchy::RefreshMode::FULL);
  frame[1] = 1;
  assert(watchy::refresh_mode(state, frame, 30) == watchy::RefreshMode::PARTIAL);
  assert(watchy::refresh_mode(state, frame, 1) == watchy::RefreshMode::FULL);
  state.magic = 0;
  assert(watchy::refresh_mode(state, frame, 30) == watchy::RefreshMode::FULL);
}
