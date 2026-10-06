#pragma once

#include "esphome/components/waveshare_epaper/waveshare_epaper.h"
#include "esphome/core/log.h"
#include "watchy_refresh.h"

#include <esp_attr.h>
#include <esp_sleep.h>
#include "driver/rtc_io.h"
#include <esp_system.h>

namespace esphome::watchy_display {
// One watch panel; RTC SRAM survives deep sleep without a flash write per minute.
inline RTC_DATA_ATTR watchy::RefreshState saved_frame;

class WatchyDisplay : public waveshare_epaper::WaveshareEPaper {
 public:
  void set_full_update_every(uint32_t count) { full_update_every_ = count; }

  void initialize() override {
    if (esp_reset_reason() != ESP_RST_DEEPSLEEP) {
      saved_frame.magic = 0;
    }
    ESP_LOGI("watchy_display", "SSD1681; retained frame: %s; partial count: %u",
             saved_frame.magic == watchy::FRAME_MAGIC ? "yes" : "no", saved_frame.partial_count);
  }

  void dump_config() override {
    ESP_LOGCONFIG("watchy_display", "Watchy SSD1681: 200x200 monochrome");
  }

  void display() override {
    const auto mode = watchy::refresh_mode(saved_frame, this->buffer_, full_update_every_);
    if (mode == watchy::RefreshMode::SKIP) {
      ESP_LOGI("watchy_display", "Unchanged frame; skipping refresh");
      return;
    }
    this->reset_();
    if (!this->wait_until_idle_()) {
      return;
    }
    // SSD1681's own temperature-driven waveform, as in SQFMI's Watchy driver.
    this->command(0x12);
    delay(10);
    if (!this->wait_until_idle_()) {
      return;
    }
    this->send_({0x01, 0xC7, 0x00, 0x00});
    this->send_({0x3C, 0x05});
    this->send_({0x18, 0x80});
    write_frame_(0x26, mode == watchy::RefreshMode::FULL ? this->buffer_ : saved_frame.frame);
    write_frame_(0x24, this->buffer_);
    this->command(0x22);
    this->data(mode == watchy::RefreshMode::FULL ? 0xF7 : 0xFC);
    this->command(0x20);
    delay(10);
    if (!this->wait_until_idle_()) {
      saved_frame.magic = 0;
      this->status_set_warning();
      return;
    }
    // Keep both controller planes synchronized with the final physical image.
    write_frame_(0x26, this->buffer_);
    this->deep_sleep();
    watchy::remember_frame(saved_frame, this->buffer_, mode);
    this->status_clear_warning();
    ESP_LOGI("watchy_display", "%s refresh; partial count: %u",
             mode == watchy::RefreshMode::FULL ? "Full" : "Partial", saved_frame.partial_count);
  }

  void deep_sleep() override {
    this->command(0x22);
    this->data(0x83);
    this->command(0x20);
    delay(10);
    this->wait_until_idle_();
    this->command(0x10);
    this->data(0x01);
  }

 protected:
  int get_width_internal() override { return 200; }
  int get_height_internal() override { return 200; }
  uint32_t idle_timeout_() override { return 5000; }
  uint32_t full_update_every_{30};

  template <size_t Count> void send_(const uint8_t (&bytes)[Count]) {
    this->cmd_data(bytes, Count);
  }

  void write_frame_(uint8_t command, const uint8_t *frame) {
    this->send_({0x11, 0x03});
    this->send_({0x44, 0x00, 0x18});
    this->send_({0x45, 0x00, 0x00, 0xC7, 0x00});
    this->send_({0x4E, 0x00});
    this->send_({0x4F, 0x00, 0x00});
    this->command(command);
    this->start_data_();
    this->write_array(frame, watchy::FRAME_BYTES);
    this->end_data_();
  }
};
} // namespace esphome::watchy_display
