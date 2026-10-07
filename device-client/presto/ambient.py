"""Seven manual Presto LEDs, driven locally without touching the LCD framebuffer."""

import asyncio
import json
import time


def clock_ms():
    """Use wrap-aware device ticks or the host's monotonic clock."""
    return time.ticks_ms() if hasattr(time, "ticks_ms") else int(time.monotonic() * 1000)


def clock_diff(end, start):
    return time.ticks_diff(end, start) if hasattr(time, "ticks_diff") else end - start


LED_INDEXES = (0, 1, 2, 3, 4, 5, 6)
CHANNEL_INDEXES = tuple(range(21))
MODES = ("album-glow", "swipe-comet", "meeting-fuse", "weather-aura", "progress-bar")
DEMO_COLORS = (
    (255, 90, 35),
    (255, 150, 35),
    (160, 210, 45),
    (40, 210, 160),
    (35, 150, 255),
    (100, 80, 255),
    (220, 60, 170),
)
WEATHER_COLORS = {
    "clear": (255, 170, 40),
    "rain": (25, 130, 255),
    "storm": (160, 70, 255),
    "snow": (180, 220, 255),
    "sunny": (255, 170, 40),
    "clear-night": (60, 65, 255),
    "partlycloudy": (140, 170, 210),
    "cloudy": (130, 145, 170),
    "rainy": (25, 130, 255),
    "pouring": (25, 130, 255),
    "snowy": (180, 220, 255),
    "snowy-rainy": (100, 190, 255),
    "lightning": (160, 70, 255),
    "lightning-rainy": (100, 70, 255),
    "fog": (140, 160, 170),
    "windy": (40, 190, 160),
    "windy-variant": (40, 190, 160),
    "hail": (150, 200, 255),
}


def bounded_number(value, minimum, maximum):
    # Range comparisons also reject NaN/infinity; bool is not numeric metadata.
    return type(value) in (int, float) and minimum <= value <= maximum


class AmbientLight:
    def __init__(self, screen):
        self.screen = screen
        self.is_on = False
        self.brightness = 5
        self.mode = "album-glow"
        self.is_demo = False
        self.colors = bytearray(21)
        self.output = bytearray(21)
        self.previous_output = bytearray(b"\xff" * 21)
        self.progress = 0
        self.seconds_until_event = None
        self.weather = ""
        self.is_playing = False
        self.duration_seconds = None
        self.progress_milli = 0
        self.event_ms = None
        self.duration_ms = 0
        self.updated_at = clock_ms()
        self.progress_updated_at = self.updated_at
        self.event_updated_at = self.updated_at
        self.mode_started_at = self.updated_at
        self.is_swiping = False
        self.is_swipe_released = False
        self.swipe_start_x = 0
        self.swipe_start_y = 0
        self.swipe_distance = 0
        self.swipe_direction = 1
        self.swipe_released_at = self.updated_at
        self.flush()

    def control_state(self):
        return {
            "on": self.is_on,
            "brightness": self.brightness,
            "mode": self.mode,
            "demo": self.is_demo,
        }

    def stop(self):
        self.is_on = False
        self.is_demo = False
        self.cancel_touch()
        self.clear_output()
        self.flush()

    def apply_header(self, encoded):
        previous_controls = (self.is_on, self.brightness, self.mode, self.is_demo)
        if encoded is None:
            self.stop()
            return previous_controls != (self.is_on, self.brightness, self.mode, self.is_demo)
        try:
            if not isinstance(encoded, str) or len(encoded) > 2048:
                raise ValueError("Ambient header exceeds its budget")
            document = json.loads(encoded)
            if not isinstance(document, dict):
                raise ValueError("Expected ambient controls")
            on = document.get("on")
            brightness = document.get("brightness")
            mode = document.get("mode")
            demo = document.get("demo", False)
            colors = document.get("colors")
            progress = document.get("progress", 0)
            seconds = document.get("seconds_until_event")
            weather = document.get("weather", "")
            is_playing = document.get("is_playing", False)
            duration = document.get("duration_seconds")
            if (
                type(on) is not bool
                or type(brightness) is not int
                or not 0 <= brightness <= 100
                or mode not in MODES
                or type(demo) is not bool
                or type(is_playing) is not bool
                or not isinstance(weather, str)
                or len(weather) > 48
                or not bounded_number(progress, 0, 1)
                or (seconds is not None and not bounded_number(seconds, -86400, 31622400))
                or (duration is not None and not bounded_number(duration, 0, 604800))
                or not isinstance(colors, list)
                or len(colors) != 7
            ):
                raise ValueError("Invalid ambient controls or metadata")
            for color in colors:
                if (
                    not isinstance(color, list)
                    or len(color) != 3
                    or any(type(channel) is not int or not 0 <= channel <= 255 for channel in color)
                ):
                    raise ValueError("Invalid ambient color")
        except (ValueError, TypeError):
            self.stop()
            return previous_controls != (self.is_on, self.brightness, self.mode, self.is_demo)

        now = clock_ms()
        has_progress_changed = (
            self.progress != progress
            or self.is_playing != is_playing
            or self.duration_seconds != duration
        )
        has_event_changed = self.seconds_until_event != seconds
        has_mode_changed = self.mode != mode or self.is_demo != demo or self.is_on != on
        self.is_on, self.brightness, self.mode, self.is_demo = on, brightness, mode, demo
        for index in LED_INDEXES:
            offset = index * 3
            self.colors[offset] = colors[index][0]
            self.colors[offset + 1] = colors[index][1]
            self.colors[offset + 2] = colors[index][2]
        if has_progress_changed or has_mode_changed:
            self.progress_updated_at = now
            self.progress_milli = int(progress * 1000)
            self.duration_ms = 0 if duration is None else int(duration * 1000)
        if has_event_changed or has_mode_changed:
            self.event_updated_at = now
            self.event_ms = None if seconds is None else int(seconds * 1000)
        self.progress, self.seconds_until_event = progress, seconds
        self.weather, self.is_playing, self.duration_seconds = weather, is_playing, duration
        if has_mode_changed:
            self.mode_started_at = now
            self.cancel_touch()
        if not on:
            self.cancel_touch()
        self.tick(now)
        return previous_controls != (self.is_on, self.brightness, self.mode, self.is_demo)

    def cancel_touch(self):
        self.is_swiping = False
        self.is_swipe_released = False
        self.swipe_distance = 0

    def touch_event(self, phase, x, y):
        if not self.is_on or self.mode != "swipe-comet":
            return
        if phase == 0:
            self.swipe_start_x, self.swipe_start_y = x, y
            self.is_swiping = True
            self.is_swipe_released = False
            self.swipe_distance = 0
        elif phase == 1 and self.is_swiping:
            horizontal = x - self.swipe_start_x
            vertical = y - self.swipe_start_y
            distance = horizontal if abs(horizontal) >= abs(vertical) else vertical
            self.swipe_distance = abs(distance)
            self.swipe_direction = 1 if distance >= 0 else -1
        elif phase == 2 and self.is_swiping:
            self.is_swiping = False
            self.is_swipe_released = self.swipe_distance >= 48
            self.swipe_released_at = clock_ms()
            if not self.is_swipe_released:
                self.swipe_distance = 0

    def clear_output(self):
        for channel in CHANNEL_INDEXES:
            self.output[channel] = 0

    def pixel(self, index, red, green, blue, gain=100):
        offset = index * 3
        scale = self.brightness * gain
        self.output[offset] = red * scale // 10000
        self.output[offset + 1] = green * scale // 10000
        self.output[offset + 2] = blue * scale // 10000

    def flush(self):
        for index in LED_INDEXES:
            offset = index * 3
            if (
                self.output[offset] != self.previous_output[offset]
                or self.output[offset + 1] != self.previous_output[offset + 1]
                or self.output[offset + 2] != self.previous_output[offset + 2]
            ):
                self.screen.set_led_rgb(
                    index, self.output[offset], self.output[offset + 1], self.output[offset + 2]
                )
                self.previous_output[offset] = self.output[offset]
                self.previous_output[offset + 1] = self.output[offset + 1]
                self.previous_output[offset + 2] = self.output[offset + 2]

    def comet(self, now, elapsed):
        gain = min(100, self.swipe_distance * 100 // 48)
        head = min(6, self.swipe_distance * 6 // 180)
        direction = self.swipe_direction
        if self.is_swipe_released:
            released = max(0, clock_diff(now, self.swipe_released_at))
            gain = max(0, 100 - released * 100 // 450)
            head = min(6, head + released * 6 // 450)
            if released >= 450:
                self.cancel_touch()
        elif not self.is_swiping:
            if not self.is_demo:
                return
            phase = elapsed % 1200
            head, gain, direction = min(6, phase * 7 // 900), 100 if phase < 900 else 0, 1
        if direction < 0:
            head = 6 - head
        for index in LED_INDEXES:
            distance = (head - index) * direction
            if 0 <= distance <= 2:
                self.pixel(index, 60, 170, 255, gain // (distance + 1))

    def tick(self, now=None):
        if now is None:
            now = clock_ms()
        self.clear_output()
        if not self.is_on or self.brightness == 0:
            self.flush()
            return
        elapsed = max(0, clock_diff(now, self.mode_started_at))
        if self.mode == "album-glow":
            needs_demo_palette = self.is_demo and not any(self.colors)
            for index in LED_INDEXES:
                offset = index * 3
                if needs_demo_palette:
                    color = DEMO_COLORS[index]
                    self.pixel(index, color[0], color[1], color[2])
                else:
                    self.pixel(
                        index, self.colors[offset], self.colors[offset + 1], self.colors[offset + 2]
                    )
        elif self.mode == "swipe-comet":
            self.comet(now, elapsed)
        elif self.mode == "meeting-fuse":
            remaining = 45000 - elapsed % 45000 if self.is_demo else self.event_ms
            if remaining is not None:
                if not self.is_demo:
                    remaining -= max(0, clock_diff(now, self.event_updated_at))
                if remaining > 0:
                    count = min(7, (remaining * 7 + 299999) // 300000)
                    for index in LED_INDEXES:
                        if index < count:
                            if remaining <= 10000:
                                self.pixel(
                                    index, 255, 35, 15, 55 + abs(elapsed % 1000 - 500) * 45 // 500
                                )
                            elif remaining <= 60000:
                                self.pixel(index, 255, 140, 20)
                            else:
                                self.pixel(index, 40, 210, 160)
                elif remaining > -30000:
                    for index in LED_INDEXES:
                        self.pixel(index, 255, 35, 15, (30000 + remaining) * 100 // 30000)
        elif self.mode == "weather-aura":
            weather = (
                "rain" if self.is_demo and self.weather not in WEATHER_COLORS else self.weather
            )
            color = WEATHER_COLORS.get(weather)
            if color is not None:
                gain = 65 + abs(elapsed % 4000 - 2000) * 35 // 2000
                if weather in ("storm", "lightning", "lightning-rainy"):
                    gain = 40 + max(0, 300 - elapsed % 2400) * 60 // 300
                for index in LED_INDEXES:
                    self.pixel(index, color[0], color[1], color[2], gain)
        elif self.mode == "progress-bar":
            progress = elapsed % 10000 * 1000 // 10000 if self.is_demo else self.progress_milli
            if not self.is_demo and self.is_playing and self.duration_ms > 0:
                progress_elapsed = max(0, clock_diff(now, self.progress_updated_at))
                progress = min(1000, progress + progress_elapsed * 1000 // self.duration_ms)
            for index in LED_INDEXES:
                gain = max(0, min(100, progress * 7 * 100 // 1000 - index * 100))
                self.pixel(index, 40, 210, 170, gain)
        # A preview is visibly distinct and the control ACK also reports demo.
        if self.is_demo and elapsed % 8000 < 300:
            self.pixel(0, 255, 0, 200)
        self.flush()

    async def run(self):
        while True:
            if self.is_on:
                self.tick()
            await asyncio.sleep_ms(50 if self.is_on else 250)
