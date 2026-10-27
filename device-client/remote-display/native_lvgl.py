"""Experimental CastKit data -> local LVGL lists over the encrypted ESPHome API.

This trial consumes the normal read-only display-view endpoint. The firmware knows
only a bounded list scene; child/task navigation and all content live on this host.
No browser capture or frame transfer happens while the person scrolls.
"""

import argparse
import asyncio
import contextlib
import hashlib
import json
import logging
import pathlib
import re
import time
from datetime import datetime
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import aiohttp
import yaml
from aioesphomeapi import APIClient, ButtonInfo, TextSensorState
from aiohttp import web

LOG = logging.getLogger("castkit.native-lvgl")
MAX_ITEMS = 32
MAX_DOCUMENT_BYTES = 6144


def day_of(at_ms, zone):
    return datetime.fromtimestamp(at_ms / 1000, ZoneInfo(zone)).strftime("%Y-%m-%d")


def number(value):
    return f"{value:g}"


def scene_text(value, limit=100):
    """Firmware limits UTF-8 bytes and rejects controls; keep code points intact."""
    normalized = "".join(" " if ord(char) < 32 or ord(char) == 127 else char for char in value)
    return normalized.encode("utf-8", errors="replace")[:limit].decode("utf-8", errors="ignore")


async def apply_scene(api, action, scene, revision, status, timeout=15):
    document = json.dumps(
        {**scene, "revision": revision}, ensure_ascii=False, separators=(",", ":")
    )
    if len(document.encode()) > MAX_DOCUMENT_BYTES:
        raise ValueError("Native scene exceeds the firmware's document budget")
    status["value"] = ""
    api.execute_service(action, {"document": document})
    deadline = time.monotonic() + timeout
    while status["value"] != f"applied,{revision},{len(scene['items'])}":
        if status["value"].startswith("error,"):
            raise ValueError(status["value"])
        if not api.is_connected or time.monotonic() >= deadline:
            raise TimeoutError("Native scene acknowledgement did not arrive")
        await asyncio.sleep(0.02)
    return len(document.encode())


class KidsPointsScene:
    """The same read-only child -> daily task -> individual entries navigation."""

    def __init__(self):
        self.kid_id = None
        self.task_name = None
        self.actions = {}

    def build(self, data, now_ms, style=None):
        kids = data.get("kids", [])
        kid = next((k for k in kids if k["id"] == self.kid_id), None)
        self.actions = {}
        scene = {
            "version": 1,
            "id": "children",
            "title": "Tally Marks",
            "subtitle": "LVGL trial - tap a child",
            "items": [],
            "canBack": False,
            "background": "#131822",
            "surface": "#1F2631",
            "foreground": "#EDF0F5",
            "muted": "#A9B2C1",
            "accent": "#6DAE4F",
            "rowHeight": 84,
            "gap": 6,
            "padding": 12,
            "radius": 8,
        }

        def append(title, detail, value, action=None, color=None):
            key = f"row:{len(scene['items'])}"
            scene["items"].append(
                {
                    "id": key,
                    "title": title[:100],
                    "detail": detail[:100],
                    "value": value[:100],
                    **({"color": color} if color else {}),
                }
            )
            if action is not None:
                self.actions[key] = action

        if kid is None:
            self.kid_id = self.task_name = None
            for entry in kids:
                append(
                    entry["name"],
                    f"Today / {number(entry.get('goal', 0))} goal",
                    number(entry["pointsToday"]),
                    (entry["id"], None),
                    entry.get("color"),
                )
        else:
            zone = kid.get("timeZone", "UTC")
            today = day_of(now_ms, zone)
            tasks = (
                []
                if kid.get("day", today) != today
                else sorted(
                    [t for t in kid.get("tasksToday", []) if day_of(t["atMs"], zone) == today],
                    key=lambda t: (-t["atMs"], t["id"]),
                )
            )
            identity = json.dumps([kid["id"], self.task_name], ensure_ascii=True)
            scene.update(
                id=hashlib.sha256(identity.encode()).hexdigest()[:24],
                title=kid["name"][:100],
                value=number(kid["pointsToday"]),
                canBack=True,
                accent=kid.get("color", "#6DAE4F"),
            )
            self.actions["back"] = (kid["id"], None) if self.task_name else (None, None)
            if self.task_name is None:
                names = list(dict.fromkeys(t["name"] for t in tasks))
                scene["subtitle"] = f"Today's tasks ({len(names)}) - tap header to go back"
                for name in names:
                    entries = [t for t in tasks if t["name"] == name]
                    append(
                        name,
                        f"{len(entries)} entries / {number(sum(t.get('minutes', 0) for t in entries))} min",
                        "+" + number(sum(t["points"] for t in entries)),
                        (kid["id"], name),
                    )
            else:
                selected = [t for t in tasks if t["name"] == self.task_name]
                scene["subtitle"] = f"{self.task_name[:60]} - tap header to go back"
                for entry in selected:
                    at = datetime.fromtimestamp(entry["atMs"] / 1000, ZoneInfo(zone))
                    append(
                        entry["name"],
                        f"{at.strftime('%I:%M %p')} / {number(entry.get('minutes', 0))} min",
                        "+" + number(entry["points"]),
                    )
        # Never silently truncate a daily history and claim the whole thing is present.
        if len(scene["items"]) > MAX_ITEMS:
            raise ValueError("This trial's native scene holds at most 32 rows")
        for key, value in (style or {}).items():
            if key in ("background", "surface", "foreground", "muted", "accent"):
                if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
                    raise ValueError(f"Invalid native scene color: {key}")
            elif key in ("rowHeight", "gap", "padding", "radius"):
                low, high = {
                    "rowHeight": (56, 160),
                    "gap": (0, 20),
                    "padding": (0, 24),
                    "radius": (0, 24),
                }[key]
                if type(value) is not int or not low <= value <= high:
                    raise ValueError(f"Invalid native scene dimension: {key}")
            else:
                raise ValueError(f"Unsupported native scene style: {key}")
            scene[key] = value
        for key in ("title", "subtitle", "value"):
            if key in scene:
                scene[key] = scene_text(scene[key])
        for item in scene["items"]:
            for key in ("title", "detail", "value"):
                item[key] = scene_text(item[key])
        return scene

    def click(self, key):
        action = self.actions.get(key)
        if action is None:
            return False
        self.kid_id, self.task_name = action
        return True


async def read_view(session, url):
    async with session.get(url, allow_redirects=False) as response:
        response.raise_for_status()
        view = await response.json()
    panel = next(p for p in view["view"]["panels"] if p["specId"] == "kids-points")
    snapshot = view["channels"][panel["bindings"]["data"]]
    if snapshot.get("error") or snapshot.get("data") is None:
        raise ValueError("CastKit's points channel is unavailable")
    return snapshot["data"], panel.get("settings", {}).get("nativeScene", {})


async def run(config, view_url, *, benchmark=False, duration=0, health=False):
    origin = urlsplit(config["manifest_url"])
    target = urlsplit(view_url)
    if (origin.scheme, origin.netloc) != (target.scheme, target.netloc):
        raise ValueError("The native view must use the configured CastKit origin")
    if target.scheme not in ("http", "https") or target.username or target.password:
        raise ValueError("The view URL must be HTTP(S) without embedded credentials")
    secrets = yaml.safe_load(pathlib.Path(config["secrets_path"]).read_text())
    key = secrets[config.get("api_key_name", "api_encryption_key")]
    api = APIClient(config["host"], 6053, None, noise_psk=key)
    await api.connect(login=True)
    runner = None
    try:
        info = await api.device_info()
        if info.mac_address.lower().replace(":", "") != config["mac"].lower().replace(":", ""):
            raise ValueError("Device identity mismatch")
        entities, services = await api.list_entities_services()
        actions = {s.name: s for s in services}
        if "native_scene" not in actions:
            raise ValueError("This firmware does not advertise native_scene")
        names = {e.key: e.name for e in entities}
        status = {"value": "", "revision": 0}
        diagnostics = {
            "build": "castkit-native-lvgl-v1",
            "firmware": info.compilation_time,
            "scene": status,
            "timing": None,
            "last_event": None,
        }
        if health:

            async def health_response(request):
                return web.json_response({**diagnostics, "is_connected": api.is_connected})

            app = web.Application()
            app.router.add_get("/healthz", health_response)
            runner = web.AppRunner(app, access_log=None)
            await runner.setup()
            await web.TCPSite(runner, "0.0.0.0", config["listen_port"]).start()
        clicked = asyncio.Queue(maxsize=16)

        def received(state):
            if not isinstance(state, TextSensorState):
                return
            name = names.get(state.key, "")
            if name.endswith("Native Scene Status"):
                status["value"] = state.state
                fields = state.state.split(",")
                if fields[0] == "applied" and len(fields) >= 2:
                    status["revision"] = int(fields[1])
                LOG.info("scene status %s", state.state)
            elif name.endswith("Native Scene Events"):
                diagnostics["last_event"] = state.state
                fields = state.state.split(",", 2)
                LOG.info("local event %s", state.state)
                if fields[0] == "click" and len(fields) == 3 and not clicked.full():
                    clicked.put_nowait((int(fields[1]), fields[2]))
            elif name.endswith("LVGL Frame Timing"):
                diagnostics["timing"] = state.state
                LOG.info("timing %s", state.state)

        api.subscribe_states(received)
        await asyncio.sleep(0.5)
        # The receiving board rejects stale revisions, including across bridge restarts.
        revision = max(int(time.time()), status["revision"] + 1)
        scene_builder = KidsPointsScene()
        previous = None
        start = time.monotonic()
        benchmarked = False
        timeout = aiohttp.ClientTimeout(total=10)
        async with aiohttp.ClientSession(timeout=timeout, trust_env=True) as session:
            while api.is_connected and (duration <= 0 or time.monotonic() - start < duration):
                data, style = await read_view(session, view_url)
                while not clicked.empty():
                    event_revision, item = clicked.get_nowait()
                    if event_revision == revision - 1:
                        scene_builder.click(item)
                scene = scene_builder.build(data, int(time.time() * 1000), style)
                encoded = json.dumps(scene, ensure_ascii=False, separators=(",", ":"))
                if encoded != previous:
                    document_bytes = await apply_scene(
                        api, actions["native_scene"], scene, revision, status
                    )
                    LOG.info(
                        "CastKit applied revision=%d rows=%d bytes=%d",
                        revision,
                        len(scene["items"]),
                        document_bytes,
                    )
                    previous = encoded
                    revision += 1
                    if benchmark and not benchmarked:
                        # Start at a child's longer list, not the three-row board.
                        if scene_builder.kid_id is None and data.get("kids"):
                            scene_builder.kid_id = data["kids"][0]["id"]
                            continue
                        await asyncio.sleep(1)
                        button = next(
                            e
                            for e in entities
                            if isinstance(e, ButtonInfo)
                            and e.name.endswith("LVGL Scroll Benchmark")
                        )
                        api.button_command(button.key)
                        benchmarked = True
                try:
                    event = await asyncio.wait_for(clicked.get(), timeout=0.5)
                    clicked.put_nowait(event)
                except TimeoutError:
                    pass
    finally:
        if runner is not None:
            await runner.cleanup()
        await api.disconnect()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--view-url", required=True)
    parser.add_argument("--benchmark", action="store_true")
    parser.add_argument("--duration", type=float, default=0)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    config = yaml.safe_load(pathlib.Path(args.config).read_text())
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(run(config, args.view_url, benchmark=args.benchmark, duration=args.duration))


if __name__ == "__main__":
    main()
