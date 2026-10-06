#pragma once
#include "watchy_agenda.h"
#include "watchy_scores.h"
#include "watchy_timer.h"
#include <type_traits>
#ifdef ESP_PLATFORM
#include <esp_attr.h>
#endif

namespace watchy {
// The display's previous frame uses RTC SLOW memory. Keep bounded data in FAST.
// No NVS writes; cold boots deliberately fetch a new authoritative snapshot.
struct RuntimeCache {
  AgendaCache agenda{};
  ScoresCache scores{};
  TimerCache timer{};
  int32_t agenda_page{0};
  int32_t scores_page{0};
  bool binary{false};
  bool agenda_selected{false};
  bool scores_selected{false};
  bool image_selected{false};
  bool timer_selected{false};
};
static_assert(std::is_trivially_copyable<RuntimeCache>::value);
static_assert(sizeof(RuntimeCache) <= 4096, "Leave space for RTC FAST SDK state");
#ifdef ESP_PLATFORM
inline RTC_FAST_ATTR RuntimeCache runtime_cache;
#endif
} // namespace watchy
