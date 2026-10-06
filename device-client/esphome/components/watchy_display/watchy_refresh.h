#pragma once

#include <cstddef>
#include <cstdint>
#include <cstring>

namespace watchy {
constexpr size_t FRAME_BYTES = 200 * 200 / 8;
constexpr uint32_t FRAME_MAGIC = 0x57444631;

struct RefreshState {
  uint32_t magic{};
  uint32_t partial_count{};
  uint8_t frame[FRAME_BYTES]{};
};

enum class RefreshMode { SKIP, PARTIAL, FULL };

inline RefreshMode refresh_mode(const RefreshState &state, const uint8_t *frame,
                                uint32_t full_every) {
  if (state.magic != FRAME_MAGIC) {
    return RefreshMode::FULL;
  }
  if (std::memcmp(state.frame, frame, FRAME_BYTES) == 0) {
    return RefreshMode::SKIP;
  }
  return state.partial_count >= full_every - 1 ? RefreshMode::FULL : RefreshMode::PARTIAL;
}

inline void remember_frame(RefreshState &state, const uint8_t *frame, RefreshMode mode) {
  if (mode == RefreshMode::SKIP) {
    return;
  }
  std::memcpy(state.frame, frame, FRAME_BYTES);
  state.partial_count = mode == RefreshMode::FULL ? 0 : state.partial_count + 1;
  state.magic = FRAME_MAGIC;
}
} // namespace watchy
