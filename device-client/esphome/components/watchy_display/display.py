import esphome.codegen as cg
import esphome.config_validation as cv
from esphome import pins
from esphome.components import display, spi
from esphome.components.waveshare_epaper.display import WaveshareEPaper
from esphome.const import (
    CONF_BUSY_PIN,
    CONF_DC_PIN,
    CONF_FULL_UPDATE_EVERY,
    CONF_ID,
    CONF_LAMBDA,
    CONF_RESET_PIN,
)

DEPENDENCIES = ["spi"]
AUTO_LOAD = ["waveshare_epaper"]
watchy_display_ns = cg.esphome_ns.namespace("watchy_display")
WatchyDisplay = watchy_display_ns.class_("WatchyDisplay", WaveshareEPaper)

CONFIG_SCHEMA = (
    display.FULL_DISPLAY_SCHEMA.extend(
        {
            cv.GenerateID(): cv.declare_id(WatchyDisplay),
            cv.Required(CONF_DC_PIN): pins.gpio_output_pin_schema,
            cv.Required(CONF_RESET_PIN): pins.gpio_output_pin_schema,
            cv.Required(CONF_BUSY_PIN): pins.gpio_input_pin_schema,
            cv.Optional(CONF_FULL_UPDATE_EVERY, default=30): cv.int_range(min=1),
        }
    )
    .extend(cv.polling_component_schema("never"))
    .extend(spi.spi_device_schema())
)
FINAL_VALIDATE_SCHEMA = spi.final_validate_device_schema(
    "watchy_display", require_miso=False, require_mosi=True
)


async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await display.register_display(var, config)
    await spi.register_spi_device(var, config, write_only=True)
    for key, setter in (
        (CONF_DC_PIN, var.set_dc_pin),
        (CONF_RESET_PIN, var.set_reset_pin),
        (CONF_BUSY_PIN, var.set_busy_pin),
    ):
        cg.add(setter(await cg.gpio_pin_expression(config[key])))
    cg.add(var.set_full_update_every(config[CONF_FULL_UPDATE_EVERY]))
    if CONF_LAMBDA in config:
        writer = await cg.process_lambda(
            config[CONF_LAMBDA], [(display.DisplayRef, "it")], return_type=cg.void
        )
        cg.add(var.set_writer(writer))
