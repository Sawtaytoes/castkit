import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import display, text_sensor, runtime_image
from esphome.const import CONF_ID

DEPENDENCIES = ["display"]
AUTO_LOAD = ["runtime_image", "text_sensor"]
ns = cg.esphome_ns.namespace("castkit_display")
CastKitDisplay = ns.class_("CastKitDisplay", cg.Component)
CONFIG_SCHEMA = cv.Schema({
    cv.GenerateID(): cv.declare_id(CastKitDisplay),
    cv.Required("display_id"): cv.use_id(display.Display),
    cv.Required("events_id"): cv.use_id(text_sensor.TextSensor),
}).extend(cv.COMPONENT_SCHEMA)

async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    cg.add(var.set_display(await cg.get_variable(config["display_id"])))
    cg.add(var.set_events(await cg.get_variable(config["events_id"])))
    runtime_image.enable_format("JPEG")
    runtime_image.enable_format("PNG")
