import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import sensor
from esphome.components.esp32 import include_builtin_idf_component, only_on_variant
from esphome.const import DEVICE_CLASS_VOLTAGE, STATE_CLASS_MEASUREMENT, UNIT_VOLT

DEPENDENCIES = ["esp32"]
ns = cg.esphome_ns.namespace("watchy_battery")
WatchyBattery = ns.class_("WatchyBattery", sensor.Sensor, cg.PollingComponent)
CONFIG_SCHEMA = sensor.sensor_schema(
    WatchyBattery,
    unit_of_measurement=UNIT_VOLT,
    accuracy_decimals=3,
    device_class=DEVICE_CLASS_VOLTAGE,
    state_class=STATE_CLASS_MEASUREMENT,
).extend(cv.polling_component_schema("30s"))
FINAL_VALIDATE_SCHEMA = only_on_variant(supported="ESP32S3", msg_prefix="Watchy v3 battery sensor")


async def to_code(config):
    include_builtin_idf_component("esp_adc")
    var = await sensor.new_sensor(config)
    await cg.register_component(var, config)
