#pragma once
#include "watchy_agenda.h"
#include "watchy_scores.h"

#include "esphome/core/component.h"
#include "esphome/core/log.h"
#include "esphome/components/sensor/sensor.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_efuse_rtc_calib.h"
#include <cmath>

extern "C" esp_err_t watchy_adc_voltage(adc_oneshot_unit_handle_t handle,
                                        adc_cali_handle_t calibration, uint32_t init_code,
                                        int *millivolts);

namespace esphome::watchy_battery {

// Watchy v3 GPIO9 is ADC1 channel 8, behind a (360 + 100) / 360 divider.
// Its full battery exceeds the standard S3 ADC range. The second measurement
// ports Espressif's v5.3.1 range-extension patch without changing the shared SDK:
// https://docs.espressif.com/projects/esp-iot-solution/en/release-v2.0/others/adc_range.html
class WatchyBattery : public sensor::Sensor, public PollingComponent {
 public:
  void setup() override {
    adc_oneshot_unit_init_cfg_t unit{};
    unit.unit_id = ADC_UNIT_1;
    adc_oneshot_chan_cfg_t channel{};
    channel.atten = ADC_ATTEN_DB_12;
    channel.bitwidth = ADC_BITWIDTH_12;
    adc_cali_curve_fitting_config_t calibration{};
    calibration.unit_id = ADC_UNIT_1;
    calibration.chan = ADC_CHANNEL_8;
    calibration.atten = ADC_ATTEN_DB_12;
    calibration.bitwidth = ADC_BITWIDTH_12;
    if (adc_oneshot_new_unit(&unit, &this->handle_) != ESP_OK ||
        adc_oneshot_config_channel(this->handle_, ADC_CHANNEL_8, &channel) != ESP_OK ||
        adc_cali_create_scheme_curve_fitting(&calibration, &this->calibration_) != ESP_OK ||
        esp_efuse_rtc_calib_get_ver() != 1) {
      this->mark_failed();
      return;
    }
    this->init_code_ = esp_efuse_rtc_calib_get_init_code(1, ADC_UNIT_1, ADC_ATTEN_DB_12);
  }

  void update() override {
    if (this->is_failed()) {
      return;
    }
    float total = 0;
    for (int sample = 0; sample < 8; sample++) {
      int millivolts = 0;
      if (watchy_adc_voltage(this->handle_, this->calibration_, this->init_code_, &millivolts) !=
          ESP_OK) {
        this->status_set_warning();
        return;
      }
      total += millivolts;
    }
    this->status_clear_warning();
    this->publish_state(total / 8.0f / 1000.0f * ((360.0f + 100.0f) / 360.0f));
  }

 protected:
  adc_oneshot_unit_handle_t handle_{nullptr};
  adc_cali_handle_t calibration_{nullptr};
  uint32_t init_code_{0};
};
} // namespace esphome::watchy_battery
