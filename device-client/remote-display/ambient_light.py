"""App-owned ambient controls and bounded metadata for seven local LED zones."""

import math

from PIL import Image

MODES = {"album-glow", "swipe-comet", "meeting-fuse", "weather-aura", "progress-bar"}


def control_state(value):
    if not isinstance(value, dict):
        raise ValueError("Ambient light controls must be an object")
    is_on = value.get("isOn", value.get("on"))
    brightness = value.get("brightness")
    if (
        type(is_on) is not bool
        or type(brightness) is not int
        or not 0 <= brightness <= 100
        or not isinstance(value.get("mode"), str)
        or value.get("mode") not in MODES
        or type(value.get("demo")) is not bool
    ):
        raise ValueError("Invalid ambient light controls")
    return {"on": is_on, "brightness": brightness, "mode": value["mode"], "demo": value["demo"]}


def finite_number(value, minimum, maximum):
    return (
        value
        if type(value) in (int, float) and math.isfinite(value) and minimum <= value <= maximum
        else None
    )


def metadata(value):
    value = value if isinstance(value, dict) else {}
    weather = str(value.get("weather") or "unknown").lower()
    if "lightning" in weather or "storm" in weather:
        weather = "storm"
    elif "snow" in weather or "hail" in weather:
        weather = "snow"
    elif "rain" in weather or "pouring" in weather:
        weather = "rain"
    elif "cloud" in weather or "overcast" in weather:
        weather = "cloudy"
    elif weather in ("sunny", "clear", "clear-night"):
        weather = "clear"
    else:
        weather = "unknown"
    return {
        "progress": finite_number(value.get("progress"), 0, 1) or 0,
        "is_playing": value.get("isPlaying") is True,
        "duration_seconds": finite_number(value.get("durationSeconds"), 0.001, 86400),
        "seconds_until_event": finite_number(value.get("secondsUntilEvent"), 0, 86400 * 366),
        "weather": weather,
    }


def artwork_bounds(targets):
    target = next(
        (target for target in targets if target["identity"] == "now-playing-artwork"), None
    )
    return (
        (
            target["x"],
            target["y"],
            target["x"] + target["width"],
            target["y"] + target["height"],
        )
        if target
        else None
    )


def palette(image, bounds):
    """Seven spatial colors from existing captured art, with no extra capture."""
    artwork = image.crop(bounds) if bounds else image
    return [
        list(color) for color in artwork.resize((7, 1), Image.Resampling.BOX).get_flattened_data()
    ]
