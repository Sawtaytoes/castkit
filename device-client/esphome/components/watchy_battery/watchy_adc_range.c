// SPDX-FileCopyrightText: 2024 Espressif Systems (Shanghai) CO LTD
// SPDX-License-Identifier: Apache-2.0
// Range-extension algorithm adapted from Espressif's official v5.3.1 patch:
// https://docs.espressif.com/projects/esp-iot-solution/en/release-v2.0/others/adc_range.html
// Keep the SDK unchanged: only this Watchy-specific read changes the hardware
// offset, with the same ADC lock / RTC critical section as the IDF driver.
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_private/adc_share_hw_ctrl.h"
#include "esp_private/regi2c_ctrl.h"
#include "hal/adc_oneshot_hal.h"
#include "hal/adc_hal.h"

extern portMUX_TYPE rtc_spinlock;

esp_err_t watchy_adc_voltage(adc_oneshot_unit_handle_t handle, adc_cali_handle_t calibration,
                             uint32_t init_code, int *millivolts) {
  int raw = 0;
  esp_err_t result = adc_oneshot_read(handle, ADC_CHANNEL_8, &raw);
  if (result != ESP_OK) {
    return result;
  }
  result = adc_cali_raw_to_voltage(calibration, raw, millivolts);
  if (result != ESP_OK || *millivolts <= 2900) {
    return result;
  }

  adc_oneshot_hal_ctx_t hal = {0};
  const adc_oneshot_hal_cfg_t config = {.unit = ADC_UNIT_1, .work_mode = ADC_HAL_SINGLE_READ_MODE};
  const adc_oneshot_hal_chan_cfg_t channel = {.atten = ADC_ATTEN_DB_12,
                                              .bitwidth = ADC_BITWIDTH_12};
  adc_oneshot_hal_init(&hal, &config);
  adc_oneshot_hal_channel_config(&hal, &channel, ADC_CHANNEL_8);
  result = adc_lock_try_acquire(ADC_UNIT_1);
  if (result != ESP_OK) {
    return result;
  }
  portENTER_CRITICAL(&rtc_spinlock);
  ANALOG_CLOCK_ENABLE();
  adc_oneshot_hal_setup(&hal, ADC_CHANNEL_8);
  adc_hal_set_calibration_param(ADC_UNIT_1, init_code + 1200);
  const bool valid = adc_oneshot_hal_convert(&hal, &raw);
  adc_hal_set_calibration_param(ADC_UNIT_1, init_code);
  ANALOG_CLOCK_DISABLE();
  portEXIT_CRITICAL(&rtc_spinlock);
  adc_lock_release(ADC_UNIT_1);
  if (!valid || raw >= 4095) {
    return ESP_ERR_INVALID_STATE;
  }
  result = adc_cali_raw_to_voltage(calibration, raw, millivolts);
  if (result != ESP_OK) {
    return result;
  }

  *millivolts += 1000;
  if (*millivolts > 2700) {
    const float v = *millivolts;
    const float error_percent =
        -0.0000016625088686597596f * v * v + 0.0012152697844402401f * v + 7.660092154791914f;
    *millivolts = (int)(v * (1 + error_percent / 100));
  }
  return ESP_OK;
}
