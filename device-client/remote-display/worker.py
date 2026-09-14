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
from codec import encode_frame
from interaction import FrameGuard, Target
from manifest import parse_manifest, same_origin_url
from playwright.async_api import async_playwright
from preview import PreviewServer, validate_preview_port

LOG = logging.getLogger("castkit.remote-display")
ROOT = pathlib.Path(__file__).resolve().parent
BUILD_MARKER = "castkit-remote-display-v1"
TARGETS_SCRIPT = """({attribute, loadingSelector}) => Array.from(document.querySelectorAll(`[${attribute}]`)).filter(element => {
  const bounds = element.getBoundingClientRect();
  return bounds.width && bounds.height && bounds.left >= 0 && bounds.top >= 0 && bounds.right <= 480 && bounds.bottom <= 320 && !element.matches(':disabled,[aria-disabled="true"]');
}).map(element => { const bounds = element.getBoundingClientRect(); return {
  identity: element.getAttribute(attribute), x: bounds.x, y: bounds.y,
  width: bounds.width, height: bounds.height, loading: loadingSelector ? element.matches(loadingSelector) : false
}; })"""
HIT_SCRIPT = """({x,y,attribute}) => {
 const element = document.elementFromPoint(x,y)?.closest(`[${attribute}]`);
 return element && !element.matches(':disabled,[aria-disabled="true"]') ? element.getAttribute(attribute) : null;
}"""


def read_config(path):
    config = yaml.safe_load(pathlib.Path(path).read_text())
    if not isinstance(config, dict):
        raise ValueError("Display configuration must be a mapping")
    for key in ("manifest_url", "host", "mac", "secrets_path"):
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
        self.guard = FrameGuard(config.get("max_frame_age", 7))
        self.target_attribute = config.get("target_attribute", "data-castkit-target")
        self.target_options = {
            "attribute": self.target_attribute,
            "loadingSelector": config.get("loading_selector"),
        }
        self.processed_touch = 0
        self.last_sequence = 0
        self.contact = None
        self.frame_id = secrets.randbelow(100_000_000) + 1
        self.force_frame = asyncio.Event()
        self.is_reset_required = False
        self.frames = 0
        self.last_report = time.monotonic()

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
                self.touches.put_nowait(parts)
            elif parts[0] == "error":
                for future in self.pending.values():
                    if not future.done():
                        future.set_exception(RuntimeError(parts[1]))
        except (ValueError, IndexError):
            LOG.warning("Ignored malformed display telemetry")

    async def cancel_contact(self):
        if self.contact is not None:
            await self.cdp.send(
                "Input.dispatchTouchEvent", {"type": "touchCancel", "touchPoints": []}
            )
        self.contact = None

    async def input_loop(self):
        while True:
            event = await self.touches.get()
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
                self.contact = {"identity": identity, "x": x, "y": y, "started": time.monotonic()}
            elif self.contact is None:
                # ESPHome replays its retained sensor value after reconnect.
                self.processed_touch = sequence
                self.force_frame.set()
                continue
            if phase == 2:
                x, y = self.contact["x"], self.contact["y"]
            current = await self.page.evaluate(
                HIT_SCRIPT, {"x": x, "y": y, "attribute": self.target_attribute}
            )
            if (
                current != self.contact["identity"]
                or time.monotonic() - self.contact["started"] > 5
            ):
                await self.cancel_contact()
                self.processed_touch = sequence
                self.force_frame.set()
                continue
            await self.cdp.send(
                "Input.dispatchTouchEvent",
                {
                    "type": ("touchStart", "touchMove", "touchEnd")[phase],
                    "touchPoints": [] if phase == 2 else [{"x": x, "y": y, "id": 0}],
                },
            )
            if phase == 2:
                self.contact = None
            else:
                self.contact.update(x=x, y=y)
            self.processed_touch = sequence
            self.force_frame.set()

    async def send_frame(self, payload, touch_id, targets, format_id=2):
        self.frame_id += 1
        frame_id = self.frame_id
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
        if loading_frame is not None:
            await self.send_frame(loading_frame, 0, [], format_id=3)
        input_task = asyncio.create_task(self.input_loop())
        previous_payload = None
        last_sent = 0
        previous_touch = -1
        try:
            while not self.stop.is_set():
                if input_task.done():
                    input_task.result()
                cycle = time.monotonic()
                touch_id = self.processed_touch
                before = await self.page.evaluate(TARGETS_SCRIPT, self.target_options)
                png = await self.page.screenshot(type="png", animations="disabled", timeout=5000)
                after = await self.page.evaluate(TARGETS_SCRIPT, self.target_options)
                if before != after:
                    continue
                self.preview.set_frame(png)
                payload = await asyncio.to_thread(encode_frame, png)
                if (
                    payload != previous_payload
                    or touch_id != previous_touch
                    or self.force_frame.is_set()
                    or cycle - last_sent >= self.config["heartbeat_seconds"]
                ):
                    self.force_frame.clear()
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
            input_task.cancel()
            await asyncio.gather(input_task, return_exceptions=True)
            await self.cancel_contact()
            await self.cdp.detach()


async def serve(config):
    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        asyncio.get_running_loop().add_signal_handler(sig, stop.set)
    credentials = yaml.safe_load(pathlib.Path(config["secrets_path"]).read_text())
    api_key = credentials[config.get("api_key_name", "api_encryption_key")]
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            **({"executable_path": config["chromium"]} if config.get("chromium") else {}),
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = await browser.new_context(
            viewport={"width": 480, "height": 320},
            device_scale_factor=1,
            has_touch=True,
            is_mobile=True,
            reduced_motion="reduce",
            accept_downloads=False,
        )
        manifest_response = await context.request.get(config["manifest_url"], timeout=15000)
        same_origin_url(config["manifest_url"], manifest_response.url)
        if not manifest_response.ok:
            raise ConnectionError("CastKit manifest unavailable")
        config = {
            **config,
            **parse_manifest(await manifest_response.json(), config["manifest_url"]),
        }
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
                client = APIClient(config["host"], 6053, None, noise_psk=api_key)
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
                    info = await client.device_info()
                    if info.mac_address.lower().replace(":", "") != config["mac"].lower().replace(
                        ":", ""
                    ):
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
                    LOG.warning("Display session ended: %s; reconnecting", type(error).__name__)
                finally:
                    await client.disconnect()
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(stop.wait(), timeout=2)
        finally:
            await preview.stop()
            await browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    asyncio.run(serve(read_config(args.config)))
