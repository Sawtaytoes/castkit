"""CastKit Presto client: full-resolution RGB565 frames and physical touch input.

Requires Pimoroni's Presto MicroPython build and a private secrets.py. No frame
is written to flash. The browser, views and source credentials stay on the server.
"""

import asyncio
import gc
import io
import json
import os
import secrets
import time

import deflate
import network
from pixels import blit_patch, decode_rle
from presto import Presto

BUILD_MARKER = "castkit-presto-v7-buffered-touch"
MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_FRAME_AGE_MS = 7000


class CastKitPresto:
    def __init__(self):
        self.screen = Presto(full_res=True, ambient_light=False)
        self.backlight_percent = None
        self.screen.set_backlight(0)
        self.display = self.screen.display
        self.framebuffer = memoryview(self.display)
        self.mac = network.WLAN().config("mac").hex()
        self.boot_id = os.urandom(8).hex()
        self.frame_id = 0
        self.last_frame_at = time.ticks_ms()
        self.sequence = 0
        self.events = []
        self.is_touched = False
        self.last_position = (0, 0)
        self.has_connection_notice = False
        self.frames_drawn = 0
        self.is_presenting = False
        self.is_frame_ack_pending = False
        self.connections = {}

    def notice(self, message):
        self.display.set_pen(self.display.create_pen(0, 0, 0))
        self.display.clear()
        self.display.set_pen(self.display.create_pen(255, 255, 255))
        self.display.text("CastKit", 28, 120, 424, 5)
        self.display.text(message, 28, 220, 424, 3)
        self.screen.update()
        self.frame_id = 0
        self.events = []

    async def request(self, method, path, body=None):
        encoded = json.dumps(body).encode() if body is not None else b""
        channel = "touch" if path == "/touch" else "frame"
        connection = self.connections.get(channel)
        if connection is None:
            connection = await asyncio.open_connection(secrets.CASTKIT_HOST, secrets.CASTKIT_PORT)
            self.connections[channel] = connection
        reader, writer = connection
        complete = False
        try:
            # Stream.write can send immediately. Keep small JSON requests in
            # one write so their body does not wait behind a separate header packet.
            writer.write(
                (
                    f"{method} {path} HTTP/1.1\r\nHost: {secrets.CASTKIT_HOST}\r\n"
                    f"Authorization: Bearer {secrets.CASTKIT_TOKEN}\r\n"
                    f"X-CastKit-Device: {self.mac}\r\nX-CastKit-Boot: {self.boot_id}\r\n"
                    f"X-CastKit-Build: {BUILD_MARKER}\r\n"
                    "X-CastKit-Accept: rgb565-patch-v1\r\nContent-Type: application/json\r\n"
                    f"Content-Length: {len(encoded)}\r\nConnection: keep-alive\r\n\r\n"
                ).encode()
                + encoded
            )
            await writer.drain()
            status_line = await reader.readline()
            status = int(status_line.split(b" ")[1])
            headers = {}
            while True:
                line = await reader.readline()
                if line == b"\r\n":
                    break
                if not line or len(line) > 4096 or len(headers) > 32:
                    raise ValueError("Invalid HTTP response")
                key, value = line.decode().split(":", 1)
                headers[key.lower()] = value.strip()
            length = int(headers.get("content-length", "0"))
            if not 0 <= length <= MAX_IMAGE_BYTES:
                raise ValueError("Frame exceeds memory budget")
            data = bytearray(length)
            offset = 0
            body_started = time.ticks_us()
            while offset < length:
                chunk = await reader.read(min(8192, length - offset))
                if not chunk:
                    raise OSError("Incomplete frame")
                data[offset : offset + len(chunk)] = chunk
                offset += len(chunk)
            # Local telemetry, not a server-supplied HTTP header. This excludes
            # waiting for the response headers (including an idle long poll).
            headers["_body_read_us"] = time.ticks_diff(time.ticks_us(), body_started)
            complete = headers.get("connection", "").lower() != "close"
            return status, headers, data
        finally:
            if not complete:
                self.connections.pop(channel, None)
                writer.close()
                await writer.wait_closed()

    def decode_frame(self, headers, image):
        content_type = headers.get("content-type", "").split(";")[0]
        rectangle = (0, 0, 480, 480)
        encoding = "zlib"
        if content_type.startswith("application/vnd.castkit.rgb565-patch+"):
            encoding = content_type.split("+")[-1]
            rectangle = tuple(int(value) for value in headers["x-castkit-rect"].split(","))
            if len(rectangle) != 4:
                raise ValueError("Invalid patch rectangle")
            base_id = int(headers["x-castkit-base-frame"])
            if base_id != self.frame_id and base_id != 0:
                raise ValueError("Patch base is not displayed")
            if base_id == 0 and rectangle != (0, 0, 480, 480):
                raise ValueError("Recovery requires a full frame")
        elif content_type != "application/vnd.castkit.rgb565+zlib":
            raise ValueError("Expected an RGB565 frame")
        x, y, width, height = rectangle
        if x < 0 or y < 0 or width < 1 or height < 1 or x + width > 480 or y + height > 480:
            raise ValueError("Patch outside panel")
        full = rectangle == (0, 0, 480, 480)
        destination = self.framebuffer if full else bytearray(width * height * 2)
        if encoding == "rle":
            if decode_rle(image, destination, width * height) != width * height:
                raise ValueError("Invalid RLE pixels")
        elif encoding == "zlib":
            with deflate.DeflateIO(io.BytesIO(image), deflate.ZLIB) as pixels:
                if pixels.readinto(destination) != len(destination) or pixels.read(1):
                    raise ValueError("Invalid RGB565 size")
        else:
            raise ValueError("Unknown pixel encoding")
        if not full and blit_patch(destination, self.framebuffer, x, y, width, height) != 0:
            raise ValueError("Invalid patch copy")

    async def apply_controls(self, headers):
        percent = int(headers.get("x-castkit-backlight", "100"))
        if not 0 <= percent <= 100:
            raise ValueError("Invalid backlight level")
        has_changed = percent != self.backlight_percent
        if has_changed:
            self.screen.set_backlight(percent / 100)
            self.backlight_percent = percent
        if "x-castkit-backlight" in headers and (
            has_changed or headers.get("x-castkit-backlight-ack") == "1"
        ):
            status, _, _ = await self.request(
                "POST", "/control-ack", {"backlight_percent": percent}
            )
            if status != 204:
                self.backlight_percent = None
                raise OSError("Backlight acknowledgement rejected")

    async def fetch_frames(self):
        while True:
            try:
                if not self.screen.wifi.isconnected():
                    await self.screen.async_connect()
                    network.WLAN().config(pm=network.WLAN.PM_NONE)
                started = time.ticks_us()
                status, headers, image = await asyncio.wait_for(
                    self.request("GET", f"/frame?after={self.frame_id}"), 8
                )
                if status in (200, 204):
                    await self.apply_controls(headers)
                if status == 200:
                    frame_id = int(headers["x-castkit-frame"])
                    touch_id = int(headers["x-castkit-touch"])
                    fetched = time.ticks_us()
                    self.is_presenting = True
                    self.decode_frame(headers, image)
                    decoded = time.ticks_us()
                    self.screen.update()
                    drawn = time.ticks_us()
                    self.last_frame_at = time.ticks_ms()
                    # The new pixels are now visible. Keep sampling input while
                    # the ACK travels, but queue it until the server knows this frame.
                    self.frame_id = frame_id
                    self.is_frame_ack_pending = True
                    self.is_presenting = False
                    ack_status, _, _ = await asyncio.wait_for(
                        self.request(
                            "POST",
                            "/ack",
                            {
                                "frame_id": frame_id,
                                "touch_id": touch_id,
                                "decode_us": time.ticks_diff(decoded, fetched),
                                "draw_us": time.ticks_diff(drawn, decoded),
                                "body_read_us": headers.get("_body_read_us", 0),
                            },
                        ),
                        3,
                    )
                    if ack_status != 204:
                        raise OSError("Frame acknowledgement rejected")
                    self.has_connection_notice = False
                    self.frames_drawn += 1
                    if self.frames_drawn == 1 or self.frames_drawn % 30 == 0:
                        print(
                            "castkit frame",
                            frame_id,
                            "bytes",
                            len(image),
                            "fetch_ms",
                            time.ticks_diff(fetched, started) // 1000,
                            "decode_ms",
                            time.ticks_diff(decoded, fetched) // 1000,
                            "heap",
                            gc.mem_free(),
                        )
                    del image
                    if self.frames_drawn % 20 == 0:
                        gc.collect()
                elif status != 204:
                    raise OSError("Frame request rejected")
            except Exception as error:
                self.frame_id = 0
                self.events = []
                self.is_touched = False
                print("castkit reconnect", type(error).__name__)
                await asyncio.sleep_ms(1000)
            finally:
                self.is_presenting = False
                self.is_frame_ack_pending = False
            await asyncio.sleep_ms(10)

    async def poll_touch(self):
        while True:
            if self.backlight_percent == 0:
                self.events = []
                self.is_touched = False
                await asyncio.sleep_ms(20)
                continue
            if self.is_presenting:
                await asyncio.sleep_ms(10)
                continue
            if (
                time.ticks_diff(time.ticks_ms(), self.last_frame_at) > 15000
                and not self.has_connection_notice
            ):
                self.notice("Connection lost. Reconnecting...")
                self.has_connection_notice = True
            self.screen.touch_poll()
            contact = self.screen.touch_a
            is_current = (
                self.frame_id > 0
                and time.ticks_diff(time.ticks_ms(), self.last_frame_at) <= MAX_FRAME_AGE_MS
            )
            is_touched = bool(contact.touched) and is_current
            position = (contact.x, contact.y) if is_touched else self.last_position
            phase = None
            if is_touched and not self.is_touched:
                phase = 0
            elif is_touched and position != self.last_position:
                phase = 1
            elif not is_touched and self.is_touched:
                phase = 2
            if phase is not None and is_current:
                if len(self.events) >= 64:
                    # Never synthesize a release: it could activate a control.
                    # Wait for the next frame before sampling a new contact.
                    self.events = []
                    self.frame_id = 0
                    self.is_touched = False
                    await asyncio.sleep_ms(20)
                    continue
                self.sequence += 1
                self.events.append([self.sequence, phase, position[0], position[1], self.frame_id])
                if phase in (0, 2):
                    print("castkit touch", self.sequence, phase, position)
            self.is_touched = is_touched
            self.last_position = position
            await asyncio.sleep_ms(20)

    async def send_touches(self):
        while True:
            if self.events and not self.is_frame_ack_pending:
                batch, self.events = self.events, []
                try:
                    status, _, _ = await asyncio.wait_for(self.request("POST", "/touch", batch), 3)
                    if status != 204:
                        raise OSError("Touch rejected")
                except Exception as error:
                    # Do not replay a gesture against a newer screen.
                    print("castkit touch dropped", type(error).__name__)
            await asyncio.sleep_ms(10)

    async def run(self):
        self.notice("Connecting to Wi-Fi...")
        print(BUILD_MARKER, "mac", self.mac, "boot", self.boot_id)
        await self.screen.async_connect()
        # This continuously refreshed USB-powered receiver favors low latency.
        network.WLAN().config(pm=network.WLAN.PM_NONE)
        self.notice("Waiting for the first frame...")
        print("castkit network", self.screen.wifi.ipv4())
        await asyncio.gather(self.fetch_frames(), self.poll_touch(), self.send_touches())


def main():
    client = CastKitPresto()
    while True:
        try:
            asyncio.run(client.run())
        except Exception as error:
            print("castkit restart", type(error).__name__)
            client.notice("Connecting to Wi-Fi...")
            time.sleep(2)


if __name__ == "__main__":
    main()
