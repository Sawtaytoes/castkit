#pragma once
#include "esphome/core/component.h"
#include "esphome/core/helpers.h"
#include "esphome/core/string_ref.h"
#include "esphome/core/log.h"
#include "esphome/components/display/display.h"
#include "esphome/components/text_sensor/text_sensor.h"
#include "esphome/components/runtime_image/runtime_image.h"
#include "esp_heap_caps.h"
#include <array>
#include <vector>
#include <memory>
#include <cstring>
#include <JPEGDEC.h>
#include <miniz.h>
#include "mbedtls/base64.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/queue.h"

namespace esphome::castkit_display {
class CastKitDisplay : public Component {
  struct FrameJob { int frame_id; int touch_id; int format; size_t size; };
  /*
    The frame path allocates nothing. Both buffers are taken from PSRAM once, at
    setup, and every frame is written into them in place.

    It used to accumulate the base64 in a std::string and then malloc two more
    internal-RAM buffers per frame to decode it. That worked on the nine-row rip
    view, whose payload is about 10 KB. It did not survive Now Playing: album art
    takes the payload to 22 KB, which is 29 KB of base64, and std::string grows by
    doubling, so the receiver asked internal RAM for one contiguous 48 KB block
    every second while the decode task still held about 51 KB of the frame before
    it. Internal RAM has no such block left after Wi-Fi, TLS, MQTT and the API
    have taken theirs. `operator new` threw, ESP-IDF builds with exceptions off,
    and the abort rebooted the panel every twenty to thirty seconds. Decoded
    backtrace and evidence: `agentic/docs/runbooks/rip-deck-wt32-display.md`.

    A fixed buffer cannot fragment and cannot fail. The capacity is the size limit
    the receiver already enforced, so no frame that used to be accepted is
    refused now.
  */
  static constexpr size_t ENCODED_CAPACITY = 160000;
  static constexpr size_t PAYLOAD_CAPACITY = ENCODED_CAPACITY / 4 * 3;
 public:
  void setup() override {
    encoded_ = static_cast<char *>(heap_caps_malloc(ENCODED_CAPACITY, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    payload_ = static_cast<uint8_t *>(heap_caps_malloc(PAYLOAD_CAPACITY, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
    jobs_ = xQueueCreate(1, sizeof(FrameJob));
    if (!encoded_ || !payload_ || !jobs_ ||
        xTaskCreatePinnedToCore(worker, "bitmap_decode", 32768, this, 1, nullptr, 0) != pdPASS) {
      this->mark_failed();
    }
  }
  void configure_touch_regions(int frame_id, const std::string &regions) {
    pending_regions_.clear();
    pending_region_frame_ = frame_id;
    size_t offset = 0;
    while (offset < regions.size() && pending_regions_.size() < 32) {
      Region region;
      if (sscanf(regions.c_str() + offset, "%d:%d:%d:%d", &region.x, &region.y, &region.width, &region.height) != 4 ||
          region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0 ||
          region.x + region.width > 480 || region.y + region.height > 320) {
        pending_regions_.clear(); return;
      }
      pending_regions_.push_back(region);
      const size_t next = regions.find(';', offset);
      if (next == std::string::npos) break;
      offset = next + 1;
    }
  }
  void loop() override {
    if (last_frame_ms_ && !is_offline_ && millis() - last_frame_ms_ > 7000) {
      is_offline_ = true;
      optimistic_touch_id_ = 0;
      // A red border signals a lost renderer; stale images never enable input.
      std::array<uint8_t, 480 * 2> border;
      for (size_t index = 0; index < border.size(); index += 2) { border[index] = 0xF8; border[index + 1] = 0; }
      for (int row = 0; row < 4; row++) {
        display_->draw_pixels_at(0, row, 480, 1, border.data(), display::COLOR_ORDER_RGB, display::COLOR_BITNESS_565, true, 0, 0, 0);
        display_->draw_pixels_at(0, 319-row, 480, 1, border.data(), display::COLOR_ORDER_RGB, display::COLOR_BITNESS_565, true, 0, 0, 0);
      }
    }
  }
  void set_display(display::Display *value) { display_ = value; }
  void set_events(text_sensor::TextSensor *value) { events_ = value; }
  /*
    `encoded` is a StringRef, not a std::string. ESPHome passes the API action a
    non-owning view over the protobuf buffer, so binding it to a std::string
    parameter built a 12 KB copy in internal RAM for every chunk of every frame.
  */
  void frame_chunk(int frame_id, int touch_id, int format, int offset, bool final_chunk, const StringRef &encoded) {
    if (this->is_failed() || busy_) { events_->publish_state("error,receiver_busy"); return; }
    if (offset == 0) { encoded_size_ = 0; receiving_frame_ = frame_id; }
    if (receiving_frame_ != frame_id || offset != int(encoded_size_) || encoded_size_ + encoded.size() > ENCODED_CAPACITY) {
      events_->publish_state("error,chunk_order_or_size"); encoded_size_ = 0; return;
    }
    memcpy(encoded_ + encoded_size_, encoded.c_str(), encoded.size());
    encoded_size_ += encoded.size();
    if (!final_chunk) return;
    const FrameJob job{frame_id, touch_id, format, encoded_size_};
    busy_ = true;
    if (xQueueSend(jobs_, &job, 0) != pdTRUE) {
      busy_ = false; events_->publish_state("error,queue_full");
    }
  }
  void decode_frame(const FrameJob &job) {
    const int frame_id = job.frame_id, touch_id = job.touch_id, format = job.format;
    const uint32_t started = micros();
    size_t count = 0;
    if (mbedtls_base64_decode(payload_, PAYLOAD_CAPACITY, &count,
        reinterpret_cast<const uint8_t *>(encoded_), job.size) != 0) {
      publish_error("error,invalid_base64"); return;
    }
    const uint32_t decoded_base64 = micros();
    const uint8_t *pixels = nullptr;
    if (format == 2 || format == 3) {
      png_.release();
      uint8_t *&destination = format == 3 ? loading_pixels_ : jpeg_pixels_;
      if (!destination) destination = static_cast<uint8_t *>(heap_caps_malloc(480 * 320 * 2, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
      if (!destination || tinfl_decompress_mem_to_mem(destination, 480 * 320 * 2, payload_, count,
          TINFL_FLAG_PARSE_ZLIB_HEADER) != 480 * 320 * 2) {
        publish_error("error,rgb565_inflate"); return;
      }
      pixels = destination;
    } else if (format == 1) {
      const bool began = png_.begin_decode(count);
      const int consumed = began ? png_.feed_data(payload_, count) : -1;
      const bool finished = began && png_.end_decode();
      if (consumed < 0 || !finished || png_.get_width() != 480 || png_.get_height() != 320) {
        publish_error("error,png_decode"); return;
      }
      pixels = png_.get_data_start();
    } else {
      png_.release();
      if (!jpeg_pixels_) jpeg_pixels_ = static_cast<uint8_t *>(heap_caps_malloc(480 * 320 * 2, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
      if (!jpeg_pixels_ || !jpeg_decoder_.openRAM(payload_, count, jpeg_draw)) {
        publish_error("error,jpeg_open"); return;
      }
      if (jpeg_decoder_.getWidth() != 480 || jpeg_decoder_.getHeight() != 320 || jpeg_decoder_.getJPEGType() == JPEG_MODE_PROGRESSIVE) {
        jpeg_decoder_.close(); publish_error("error,jpeg_dimensions"); return;
      }
      jpeg_decoder_.setUserPointer(this);
      jpeg_decoder_.setPixelType(RGB565_BIG_ENDIAN);
      const bool decoded_ok = jpeg_decoder_.decode(0, 0, 0);
      jpeg_decoder_.close();
      if (!decoded_ok) { publish_error("error,jpeg_decode"); return; }
      pixels = jpeg_pixels_;
    }
    const uint32_t decoded = micros();
    this->defer([this, frame_id, touch_id, format, count, started, decoded_base64, decoded, pixels]() {
    const uint32_t draw_started = micros();
    if (format == 3) {
      // A new renderer session must not inherit an unfinished gesture.
      optimistic_touch_id_ = 0;
      is_contact_ignored_ = true;
      is_loading_tap_ = false;
      active_regions_.clear();
    }
    const bool should_draw = format != 3 && (optimistic_touch_id_ == 0 || touch_id >= optimistic_touch_id_);
    if (should_draw) {
      display_->draw_pixels_at(0, 0, 480, 320, pixels, display::COLOR_ORDER_RGB, display::COLOR_BITNESS_565, true, 0, 0, 0);
      shown_frame_ = frame_id;
      last_frame_ms_ = millis();
      is_offline_ = false;
      optimistic_touch_id_ = 0;
      active_regions_ = pending_region_frame_ == frame_id ? pending_regions_ : std::vector<Region>{};
    }
    const uint32_t drawn = micros();
    char message[240];
    const int touch_latency = touch_id == last_touch_id_ && touch_id > 0 ? int(millis() - last_touch_ms_) : -1;
    snprintf(message, sizeof(message), "frame,%d,%d,%zu,%u,%u,%u,%d,%u,%u", frame_id, touch_id, count,
      unsigned(decoded_base64 - started), unsigned(decoded - decoded_base64), unsigned(drawn - draw_started), touch_latency,
      unsigned(heap_caps_get_free_size(MALLOC_CAP_INTERNAL)), unsigned(heap_caps_get_free_size(MALLOC_CAP_SPIRAM)));
    busy_ = false;
    events_->publish_state(message);
    });
  }
  void touch(int phase, int x, int y) {
    const uint32_t started = micros();
    if (phase == 0) {
      is_contact_ignored_ = is_offline_ || !last_frame_ms_ || optimistic_touch_id_ != 0;
      start_x_ = x; start_y_ = y;
      is_loading_tap_ = false;
      for (const auto &region : active_regions_) {
        if (x >= region.x && x < region.x + region.width && y >= region.y && y < region.y + region.height) is_loading_tap_ = true;
      }
    }
    if (is_contact_ignored_) return;
    last_touch_id_++;
    last_touch_ms_ = millis();
    if (phase == 1 && (std::abs(x-start_x_) > 10 || std::abs(y-start_y_) > 10)) is_loading_tap_ = false;
    // Draw circle spans only: pixels outside the circle keep their original image.
    if (phase != 2) {
      std::array<uint8_t, 14 * 2> marker;
      marker.fill(0xFF);
      for (int row = -6; row <= 6; row++) {
        int half_width = 0;
        while ((half_width+1)*(half_width+1) + row*row <= 36) half_width++;
        const int top = y + row;
        const int start = std::max(0, x-half_width);
        const int end = std::min(479, x+half_width);
        if (top >= 0 && top < 320 && end >= start) display_->draw_pixels_at(start, top, end-start+1, 1,
          marker.data(), display::COLOR_ORDER_RGB, display::COLOR_BITNESS_565, true, 0, 0, 0);
      }
    }
    if (phase == 2 && is_loading_tap_ && loading_pixels_) {
      optimistic_touch_id_ = last_touch_id_;
      display_->draw_pixels_at(0, 0, 480, 320, loading_pixels_, display::COLOR_ORDER_RGB, display::COLOR_BITNESS_565, true, 0, 0, 0);
      is_loading_tap_ = false;
    }
    char message[180];
    snprintf(message, sizeof(message), "touch,%d,%d,%d,%d,%u,%d,%u", last_touch_id_, phase, x, y,
      unsigned(last_touch_ms_), shown_frame_, unsigned(micros() - started));
    events_->publish_state(message);
  }
 protected:
  static void worker(void *argument) {
    auto *self = static_cast<CastKitDisplay *>(argument);
    FrameJob job;
    while (true) {
      if (xQueueReceive(self->jobs_, &job, portMAX_DELAY) == pdTRUE) {
        self->decode_frame(job);
      }
    }
  }
  void publish_error(const char *message) {
    this->defer([this, message]() { busy_ = false; events_->publish_state(message); });
  }
  struct Region { int x, y, width, height; };
  std::vector<Region> active_regions_, pending_regions_;
  int pending_region_frame_{0}, optimistic_touch_id_{0}, start_x_{0}, start_y_{0};
  uint32_t last_frame_ms_{0};
  bool is_offline_{true}, is_contact_ignored_{true}, is_loading_tap_{false};
  uint8_t *loading_pixels_{nullptr};
  QueueHandle_t jobs_{nullptr};
  bool busy_{false};
  display::Display *display_{nullptr};
  text_sensor::TextSensor *events_{nullptr};
  static int jpeg_draw(JPEGDRAW *draw) {
    auto *self = static_cast<CastKitDisplay *>(draw->pUser);
    if (draw->x < 0 || draw->y < 0 || draw->x + draw->iWidth > 480 || draw->y + draw->iHeight > 320) return 0;
    for (int row = 0; row < draw->iHeight; row++) {
      memcpy(self->jpeg_pixels_ + ((draw->y + row) * 480 + draw->x) * 2,
        draw->pPixels + row * draw->iWidth, draw->iWidth * 2);
    }
    return 1;
  }
  JPEGDEC jpeg_decoder_;
  uint8_t *jpeg_pixels_{nullptr};
  char *encoded_{nullptr};
  uint8_t *payload_{nullptr};
  size_t encoded_size_{0};
  int receiving_frame_{0};
  runtime_image::RuntimeImage png_{runtime_image::PNG, image::IMAGE_TYPE_RGB565, image::TRANSPARENCY_OPAQUE, nullptr, true};
  int shown_frame_{0};
  int last_touch_id_{0};
  uint32_t last_touch_ms_{0};
};
}
