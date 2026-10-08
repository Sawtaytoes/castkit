#!/usr/bin/env python3
"""CastKit remote-browser client for an ESPHome RGB565 display."""

import argparse
import asyncio
import base64
import contextlib
import logging
import pathlib
import secrets
import signal
import time
from urllib.parse import urlsplit

import yaml
from aioesphomeapi import APIClient, TextSensorState
from ambient_light import artwork_bounds
from codec import encode_frame, presto_frame_pixels, presto_frame_pixels_with_palette
from esphome_presto import ESPHomePrestoTransport
from interaction import FrameGuard, Target
from manifest import parse_manifest, same_origin_url
from playwright.async_api import Error as BrowserError
from playwright.async_api import async_playwright
from presto_transport import PrestoTransport
from preview import PreviewServer, validate_preview_port

LOG = logging.getLogger("castkit.remote-display")
ROOT = pathlib.Path(__file__).resolve().parent
BUILD_MARKER = "castkit-remote-display-v16-document-navigation"
BROWSER_TIMEOUT_SECONDS = 5
TARGETS_SCRIPT = """({attribute, loadingSelector, width = 480, height = 320}) => {
const stage = document.querySelector('.stage');
const gestures = stage ? [{identity: `view-gesture:${stage.dataset.view}`,x:0,y:0,width,height,loading:false}] : [];
return gestures.concat(Array.from(document.querySelectorAll(`[${attribute}]`)).filter(element => {
  const bounds = element.getBoundingClientRect();
  return bounds.width && bounds.height && bounds.left >= 0 && bounds.top >= 0 && bounds.right <= width && bounds.bottom <= height && !element.matches(':disabled,[aria-disabled="true"]');
}).map(element => { const bounds = element.getBoundingClientRect(); return {
  identity: element.getAttribute(attribute), x: bounds.x, y: bounds.y,
  width: bounds.width, height: bounds.height, loading: loadingSelector ? element.matches(loadingSelector) : false
}; })); }"""
HIT_SCRIPT = """({x,y,attribute}) => {
 const element = document.elementFromPoint(x,y)?.closest(`[${attribute}]`);
 return element && !element.matches(':disabled,[aria-disabled="true"]') ? element.getAttribute(attribute) : document.querySelector('.stage') ? `view-gesture:${document.querySelector('.stage').dataset.view}` : null;
}"""


def is_navigation_error(error):
    """A document replacement invalidates evaluations without killing the browser."""
    return isinstance(error, BrowserError) and any(
        message in str(error)
        for message in ("Execution context was destroyed", "Cannot find context with specified id")
    )


def read_config(path):
    config = yaml.safe_load(pathlib.Path(path).read_text())
    if not isinstance(config, dict):
        raise ValueError("Display configuration must be a mapping")
    is_presto = config.get("transport") in ("presto", "esphome-presto")
    for key in ("manifest_url", "mac", "secrets_path") + (
        () if config.get("transport") == "presto" else ("host",)
    ):
        if not isinstance(config.get(key), str) or not config[key]:
            raise ValueError(f"Missing display configuration field: {key}")
    parsed = urlsplit(config["manifest_url"])
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise ValueError("Display URL must be HTTP(S), without embedded credentials")
    validate_preview_port(config.get("preview_port"))
    if is_presto:
        port = config.get("listen_port")
        if type(port) is not int or not 1024 <= port <= 65535:
            raise ValueError("Presto requires a listen_port between 1024 and 65535")
        config["viewport"] = {"width": 480, "height": 480}
    return config


class DisplaySession:
    def __init__(self, config, page, client, services, stop, preview):
        self.config, self.page, self.client, self.services, self.stop = (
            config,
            page,
            client,
            services,
            stop,
        )
        self.preview = preview
        self.pending = {}
        self.touches = asyncio.Queue(maxsize=128)
        self.queued_touch = None
        self.guard = FrameGuard(config.get("max_frame_age", 7))
        self.target_attribute = config.get("target_attribute", "data-castkit-target")
        self.target_options = {
            "attribute": self.target_attribute,
            "loadingSelector": config.get("loading_selector"),
            **config.get("viewport", {"width": 480, "height": 320}),
        }
        self.processed_touch = 0
        self.last_sequence = 0
        self.contact = None
        self.frame_id = secrets.randbelow(100_000_000) + 1
        self.force_frame = asyncio.Event()
        self.is_reset_required = False
        self.frames = 0
        self.last_report = time.monotonic()
        self.document_revision = 0
        self.document_changed_at = 0

    def state_changed(self, state):
        if not isinstance(state, TextSensorState) or state.key != self.event_key:
            return
        parts = state.state.split(",")
        try:
            if parts[0] == "frame":
                future = self.pending.get(int(parts[1]))
                if future is not None and not future.done():
                    future.set_result(parts)
            elif parts[0] == "touch" and len(parts) >= 8:
                if self.touches.full():
                    while not self.touches.empty():
                        self.touches.get_nowait()
                    self.is_reset_required = True
                    self.queued_touch = None
                self.touches.put_nowait(parts)
            elif parts[0] == "error":
                if parts[1] == "device-restarted":
                    self.last_sequence = 0
                    self.processed_touch = 0
                    self.is_reset_required = True
                    self.queued_touch = None
                    while not self.touches.empty():
                        self.touches.get_nowait()
                    self.guard.frames.clear()
                    self.force_frame.set()
                for future in self.pending.values():
                    if not future.done():
                        future.set_exception(RuntimeError(parts[1]))
        except (ValueError, IndexError):
            LOG.warning("Ignored malformed display telemetry")

    async def cancel_contact(self):
        if self.contact is not None and self.contact.get("is_native_active"):
            await self.send_cdp(
                "Input.dispatchTouchEvent", {"type": "touchCancel", "touchPoints": []}
            )
        self.contact = None

    async def send_cdp(self, method, parameters):
        # CDP capture/input has no Playwright timeout. A stalled compositor
        # must hand control back to the reconnect loop before the glass goes stale.
        return await asyncio.wait_for(
            self.cdp.send(method, parameters), timeout=BROWSER_TIMEOUT_SECONDS
        )

    async def next_touch(self):
        event = self.queued_touch
        self.queued_touch = None
        if event is None:
            event = await self.touches.get()
        if int(event[2]) != 1:
            return event
        origin = self.contact or {"x": int(event[3]), "y": int(event[4])}
        direction_x = int(event[3]) - origin["x"]
        direction_y = int(event[4]) - origin["y"]
        while not self.touches.empty():
            candidate = self.touches.get_nowait()
            if int(candidate[2]) != 1:
                self.queued_touch = candidate
                break
            dx = int(candidate[3]) - int(event[3])
            dy = int(candidate[4]) - int(event[4])
            if dx * direction_x < 0 or dy * direction_y < 0:
                # Keep direction changes, so a pull-and-return cannot become a tap.
                self.queued_touch = candidate
                break
            direction_x = direction_x or dx
            direction_y = direction_y or dy
            event = candidate
        return event

    def document_changed(self, frame):
        if frame != self.page.main_frame:
            return
        self.document_revision += 1
        self.document_changed_at = time.monotonic()
        self.guard.frames.clear()
        self.is_reset_required = True
        self.force_frame.set()
        LOG.info("Display document changed; keeping device connection")

    async def input_loop(self):
        while True:
            try:
                await self.process_input()
            except BrowserError as error:
                if not is_navigation_error(error):
                    raise
                # The replaced document no longer owns this contact. Consume no
                # action from it; a new contact needs a newly acknowledged frame.
                self.contact = None
                self.processed_touch = self.last_sequence
                self.force_frame.set()

    async def process_input(self):
        while True:
            event = await self.next_touch()
            sequence, phase, x, y = map(int, event[1:5])
            shown_frame = int(event[6])
            if self.is_reset_required:
                await self.cancel_contact()
                self.is_reset_required = False
            if sequence <= self.last_sequence or phase not in (0, 1, 2):
                continue
            self.last_sequence = sequence
            if phase == 0:
                await self.cancel_contact()
                current = await self.page.evaluate(
                    HIT_SCRIPT, {"x": x, "y": y, "attribute": self.target_attribute}
                )
                identity = self.guard.match(shown_frame, x, y, current)
                if identity is None:
                    self.processed_touch = sequence
                    self.force_frame.set()
                    continue
                self.contact = {
                    "identity": identity,
                    "x": x,
                    "y": y,
                    "start_x": x,
                    "start_y": y,
                    "started": time.monotonic(),
                    "is_gesture": False,
                    "is_native_active": False,
                }
            elif self.contact is None:
                # ESPHome replays its retained sensor value after reconnect.
                self.processed_touch = sequence
                self.force_frame.set()
                continue
            if phase == 2:
                x, y = self.contact["x"], self.contact["y"]
            if (
                phase == 1
                and not self.contact["is_gesture"]
                and not self.contact["identity"].startswith("navigation-edge:")
                and max(abs(y - self.contact["start_y"]), abs(x - self.contact["start_x"])) >= 48
                and (
                    self.contact["identity"] != "now-playing-artwork"
                    or abs(y - self.contact["start_y"]) > abs(x - self.contact["start_x"])
                )
            ):
                if self.contact["is_native_active"]:
                    await self.send_cdp(
                        "Input.dispatchTouchEvent", {"type": "touchCancel", "touchPoints": []}
                    )
                self.contact["is_native_active"] = False
                self.contact["is_gesture"] = True
                await self.page.evaluate(
                    """({x,y}) => document.querySelector('.stage')?.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true,pointerId:1,clientX:x,clientY:y}))""",
                    {"x": self.contact["start_x"], "y": self.contact["start_y"]},
                )
            if self.contact["is_gesture"]:
                await self.page.evaluate(
                    """({phase,x,y}) => document.querySelector('.stage')?.dispatchEvent(new PointerEvent(phase === 2 ? 'pointerup' : 'pointermove', {bubbles:true,pointerId:1,clientX:x,clientY:y}))""",
                    {"phase": phase, "x": x, "y": y},
                )
                if phase == 2:
                    self.contact = None
                else:
                    self.contact.update(x=x, y=y)
                self.processed_touch = sequence
                self.force_frame.set()
                continue
            current = await self.page.evaluate(
                HIT_SCRIPT, {"x": x, "y": y, "attribute": self.target_attribute}
            )
            if time.monotonic() - self.contact["started"] > 5:
                await self.cancel_contact()
                self.processed_touch = sequence
                self.force_frame.set()
                continue
            # Artwork captures its pointer: a horizontal drag can legitimately
            # leave its rectangle and must still receive the release. Other
            # controls retain the cross-control cancellation guard.
            is_artwork_drag = self.contact["identity"] == "now-playing-artwork" and abs(
                x - self.contact["start_x"]
            ) > abs(y - self.contact["start_y"])
            # Shell edges capture their pointer above native and external views.
            # Their acknowledged starting hitbox owns the whole inward pull.
            is_navigation_drag = self.contact["identity"].startswith("navigation-edge:")
            if (
                phase == 1
                and current != self.contact["identity"]
                and not is_artwork_drag
                and not is_navigation_drag
            ):
                # Cancel the tap but keep sampling the finger: it may cross a
                # small control before travelling far enough to commit a swipe.
                if self.contact["is_native_active"]:
                    await self.send_cdp(
                        "Input.dispatchTouchEvent", {"type": "touchCancel", "touchPoints": []}
                    )
                self.contact.update(x=x, y=y, is_tap_cancelled=True, is_native_active=False)
                self.processed_touch = sequence
                self.force_frame.set()
                continue
            if self.contact.get("is_tap_cancelled") or (
                current != self.contact["identity"]
                and not is_artwork_drag
                and not is_navigation_drag
            ):
                if phase == 2:
                    await self.cancel_contact()
                else:
                    self.contact.update(x=x, y=y)
                self.processed_touch = sequence
                self.force_frame.set()
                continue
            await self.send_cdp(
                "Input.dispatchTouchEvent",
                {
                    "type": ("touchStart", "touchMove", "touchEnd")[phase],
                    "touchPoints": [] if phase == 2 else [{"x": x, "y": y, "id": 0}],
                },
            )
            if phase == 2:
                self.contact = None
            else:
                self.contact.update(x=x, y=y, is_native_active=True)
            self.processed_touch = sequence
            self.force_frame.set()

    async def send_frame(self, payload, touch_id, targets, format_id=2):
        self.frame_id += 1
        frame_id = self.frame_id
        if isinstance(self.client, PrestoTransport):
            # A touch can only use a frame that the physical panel acknowledged.
            response = await self.client.send_frame(frame_id, touch_id, payload)
            self.guard.remember(
                frame_id,
                [
                    Target(**{key: value for key, value in target.items() if key != "loading"})
                    for target in targets
                ],
            )
            return response
        if format_id == 2:
            rectangles = ";".join(
                ":".join(str(round(target[key])) for key in ("x", "y", "width", "height"))
                for target in targets
                if target["loading"]
            )
            await self.client.execute_service(
                self.services["configure_touch_regions"],
                {"frame_id": frame_id, "regions": rectangles},
            )
        future = asyncio.get_running_loop().create_future()
        self.pending[frame_id] = future
        encoded = base64.b64encode(payload).decode("ascii")
        try:
            for offset in range(0, len(encoded), 12000):
                await self.client.execute_service(
                    self.services["frame_chunk"],
                    {
                        "frame_id": frame_id,
                        "touch_id": touch_id,
                        "format": format_id,
                        "offset": offset,
                        "final_chunk": offset + 12000 >= len(encoded),
                        "image_data": encoded[offset : offset + 12000],
                    },
                )
            response = await asyncio.wait_for(future, timeout=6)
            if format_id == 2:
                self.guard.remember(
                    frame_id,
                    [
                        Target(**{key: value for key, value in target.items() if key != "loading"})
                        for target in targets
                    ],
                )
            return response
        finally:
            self.pending.pop(frame_id, None)

    async def run(self, event_key, loading_frame):
        self.event_key = event_key
        self.cdp = await self.page.context.new_cdp_session(self.page)
        self.client.subscribe_states(self.state_changed)
        self.page.on("framenavigated", self.document_changed)
        if loading_frame is not None:
            await self.send_frame(loading_frame, 0, [], format_id=3)
        input_task = asyncio.create_task(self.input_loop())
        previous_payload = None
        last_sent = time.monotonic()
        previous_touch = -1
        try:
            while not self.stop.is_set():
                if input_task.done():
                    input_task.result()
                cycle = time.monotonic()
                if cycle - max(last_sent, self.document_changed_at) > BROWSER_TIMEOUT_SECONDS:
                    raise TimeoutError("No stable frame captured")
                touch_id = self.processed_touch
                document_revision = self.document_revision
                try:
                    before = await asyncio.wait_for(
                        self.page.evaluate(TARGETS_SCRIPT, self.target_options),
                        timeout=BROWSER_TIMEOUT_SECONDS,
                    )
                    capture_started = time.monotonic()
                    if isinstance(self.client, PrestoTransport):
                        shot = await self.send_cdp(
                            "Page.captureScreenshot",
                            {
                                "format": "png",
                                "fromSurface": True,
                                "captureBeyondViewport": False,
                                "optimizeForSpeed": True,
                            },
                        )
                        png = base64.b64decode(shot["data"])
                    else:
                        png = await self.page.screenshot(
                            type="png", animations="disabled", timeout=5000
                        )
                    capture_finished = time.monotonic()
                    after = await asyncio.wait_for(
                        self.page.evaluate(TARGETS_SCRIPT, self.target_options),
                        timeout=BROWSER_TIMEOUT_SECONDS,
                    )
                except BrowserError as error:
                    if not is_navigation_error(error):
                        raise
                    # A real document reload invalidates capture. Keep it bounded
                    # without rebuilding the encrypted device session.
                    await asyncio.sleep(0.05)
                    continue
                except TimeoutError:
                    if document_revision == self.document_revision:
                        raise
                    continue
                if document_revision != self.document_revision or before != after:
                    continue
                self.preview.set_frame(png)
                needs_palette = (
                    isinstance(self.client, PrestoTransport)
                    and self.client.ambient_light is not None
                    and self.client.ambient_light["on"]
                    and self.client.ambient_light["mode"] in ("album-glow", "swipe-comet")
                )
                if needs_palette:
                    payload, colors = await asyncio.to_thread(
                        presto_frame_pixels_with_palette, png, artwork_bounds(after)
                    )
                    self.client.set_ambient_palette(colors)
                else:
                    payload = (
                        await asyncio.to_thread(presto_frame_pixels, png)
                        if isinstance(self.client, PrestoTransport)
                        else await asyncio.to_thread(encode_frame, png)
                    )
                encoded_at = time.monotonic()
                if isinstance(self.client, PrestoTransport):
                    self.client.capture_ms = round((capture_finished - capture_started) * 1000, 1)
                    self.client.encode_ms = round((encoded_at - capture_finished) * 1000, 1)
                is_forced = self.force_frame.is_set()
                self.force_frame.clear()
                if (
                    payload != previous_payload
                    # Captured gestures with no visual change need no extra
                    # round trip for every move. Preserve changed drag frames,
                    # the release acknowledgement and the periodic heartbeat.
                    or (self.contact is None and (touch_id != previous_touch or is_forced))
                    or cycle - last_sent >= self.config["heartbeat_seconds"]
                ):
                    response = await self.send_frame(payload, touch_id, after)
                    previous_payload, last_sent, previous_touch = (
                        payload,
                        time.monotonic(),
                        touch_id,
                    )
                    self.frames += 1
                    if time.monotonic() - self.last_report >= 30:
                        LOG.info(
                            "frames=%s payload=%s decode_ms=%.1f draw_ms=%.1f",
                            self.frames,
                            len(payload),
                            int(response[5]) / 1000,
                            int(response[6]) / 1000,
                        )
                        self.last_report = time.monotonic()
                delay = max(0, 1 / self.config["max_fps"] - (time.monotonic() - cycle))
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(self.force_frame.wait(), timeout=delay)
        finally:
            self.page.remove_listener("framenavigated", self.document_changed)
            input_task.cancel()
            await asyncio.gather(input_task, return_exceptions=True)
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self.cancel_contact(), timeout=BROWSER_TIMEOUT_SECONDS)
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self.cdp.detach(), timeout=BROWSER_TIMEOUT_SECONDS)


async def create_browser_context(browser, config):
    """Restore infrastructure credentials without changing panel rendering properties."""
    return await browser.new_context(
        viewport=config.get("viewport", {"width": 480, "height": 320}),
        device_scale_factor=1,
        has_touch=True,
        is_mobile=True,
        reduced_motion="reduce",
        accept_downloads=False,
        storage_state=config.get("browser_storage_state"),
    )


async def poll_controls(context, config, transport, stop):
    """Read app-owned controls independently of capture and frame acknowledgements."""
    while not stop.is_set():
        try:
            response = await context.request.get(config["controls_url"], timeout=5000)
            same_origin_url(config["manifest_url"], response.url)
            if not response.ok:
                raise ConnectionError("Controls unavailable")
            controls = await response.json()
            if "backlight_percent" in controls:
                transport.set_backlight(controls["backlight_percent"])
            transport.set_ambient_light(
                controls.get("ambientLight"), controls.get("ambientLightData")
            )
        except Exception as error:
            LOG.warning("Display controls unavailable: %s", type(error).__name__)
        await asyncio.sleep(0.5)


async def serve(config):
    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        asyncio.get_running_loop().add_signal_handler(sig, stop.set)
    credentials = yaml.safe_load(pathlib.Path(config["secrets_path"]).read_text())
    is_presto = config.get("transport") in ("presto", "esphome-presto")
    api_key = credentials[
        config.get(
            "api_key_name",
            "presto_token" if config.get("transport") == "presto" else "api_encryption_key",
        )
    ]
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            **({"executable_path": config["chromium"]} if config.get("chromium") else {}),
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = await create_browser_context(browser, config)
        manifest_response = await context.request.get(config["manifest_url"], timeout=15000)
        same_origin_url(config["manifest_url"], manifest_response.url)
        if not manifest_response.ok:
            raise ConnectionError("CastKit manifest unavailable")
        config = {
            **config,
            **parse_manifest(
                await manifest_response.json(),
                config["manifest_url"],
                config.get("viewport"),
                max_cache_entries=0 if is_presto else 1,
            ),
        }
        # Refresh limits describe transport capability, not a user-facing view setting.
        if is_presto:
            config = {**config, "max_fps": min(config["max_fps"], 8)}
        presto = (
            ESPHomePrestoTransport(config, api_key)
            if config.get("transport") == "esphome-presto"
            else PrestoTransport(config, api_key)
            if is_presto
            else None
        )
        controls_task = None
        if presto is not None:
            await presto.start()
            if config.get("controls_url"):
                controls_task = asyncio.create_task(poll_controls(context, config, presto, stop))
        page = await context.new_page()
        origin = urlsplit(config["url"])

        async def route_request(route):
            requested = urlsplit(route.request.url)
            if (
                route.request.is_navigation_request()
                and route.request.frame == page.main_frame
                and (requested.scheme, requested.netloc) != (origin.scheme, origin.netloc)
            ):
                await route.abort()
            else:
                await route.continue_()

        await page.route("**/*", route_request)
        loading_frame = None
        if config["cache_url"]:
            loading = await context.new_page()
            response = await loading.goto(
                config["cache_url"], wait_until="networkidle", timeout=15000
            )
            same_origin_url(config["manifest_url"], loading.url)
            if response is None or not response.ok:
                raise ConnectionError("Cached image URL unavailable")
            await loading.evaluate("document.fonts.ready")
            loading_frame = await asyncio.to_thread(
                encode_frame, await loading.screenshot(type="png", animations="disabled")
            )
            await loading.close()
        LOG.info("%s starting", BUILD_MARKER)
        preview = PreviewServer(BUILD_MARKER, config["max_fps"], config.get("preview_port"))
        await preview.start()
        try:
            while not stop.is_set():
                client = presto or APIClient(config["host"], 6053, None, noise_psk=api_key)
                try:
                    if page.is_closed():
                        page = await context.new_page()
                        await page.route("**/*", route_request)
                    if page.url == "about:blank" or (
                        config["ready_selector"]
                        and not await page.locator(config["ready_selector"]).count()
                    ):
                        response = await page.goto(
                            config["url"], wait_until="domcontentloaded", timeout=15000
                        )
                        if response is None or not response.ok:
                            raise ConnectionError("Kiosk page unavailable")
                        if config["ready_selector"]:
                            await page.locator(config["ready_selector"]).wait_for(timeout=15000)
                    await client.connect(login=True)
                    if is_presto:
                        actions, event_key = {}, 1
                        LOG.info("Presto connected; firmware=%s", client.build_marker)
                    else:
                        info = await client.device_info()
                        if info.mac_address.lower().replace(":", "") != config[
                            "mac"
                        ].lower().replace(":", ""):
                            raise ValueError("Device identity mismatch")
                        entities, services = await client.list_entities_services()
                        actions = {service.name: service for service in services}
                        if not {"frame_chunk", "configure_touch_regions"} <= actions.keys():
                            raise ValueError("The display needs CastKit remote-display firmware")
                        event_key = next(
                            entity.key for entity in entities if entity.name == "Display Events"
                        )
                        LOG.info("Display connected; firmware=%s", info.compilation_time)
                    session = DisplaySession(config, page, client, actions, stop, preview)
                    await session.run(event_key, loading_frame)
                except Exception as error:
                    LOG.warning(
                        "Display session ended: %s: %s; reconnecting", type(error).__name__, error
                    )
                    if not browser.is_connected():
                        # A killed browser has no context left to recreate pages
                        # in. Exit so the service supervisor starts a fresh worker.
                        LOG.error("Capture browser disconnected; restarting worker")
                        raise
                    # Recreate a stalled page instead of reusing its compositor.
                    with contextlib.suppress(Exception):
                        await asyncio.wait_for(page.close(), timeout=BROWSER_TIMEOUT_SECONDS)
                finally:
                    await client.disconnect()
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(stop.wait(), timeout=2)
        finally:
            if controls_task is not None:
                controls_task.cancel()
                await asyncio.gather(controls_task, return_exceptions=True)
            await preview.stop()
            if presto is not None:
                await presto.stop()
            await browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    asyncio.run(serve(read_config(args.config)))
