"""The scroll window: geometry, the stitched picture, the transport, and touch sync."""

import asyncio
import base64
import io
import itertools
import json
import os
import time
import types
import unittest
from unittest.mock import AsyncMock

import esphome_presto
import numpy as np
from aioesphomeapi import APIConnectionError, TextSensorState
from codec import encode_presto_patch, presto_frame_pixels_and_rgb, presto_rows_pixels
from esphome_presto import ESPHomePrestoTransport, hidden_window
from interaction import Target
from PIL import Image
from playwright.async_api import async_playwright
from preview import PreviewServer
from scroll_window import (
    SCROLL_STATE_SCRIPT,
    STITCH_BEGIN_SCRIPT,
    STITCH_END_SCRIPT,
    STITCH_STEP_SCRIPT,
    StitchRefusedError,
    band_offsets,
    plan_window,
    rows_match,
)
from test_frame_slots import build_frame, packet_of
from worker import PAGE_STATE_SCRIPT, TARGETS_SCRIPT, DisplaySession, create_browser_context


def list_state(top=93, height=330, scroll_height=1800, scroll_top=0, left=20, width=440):
    return {
        "identity": "scroll:test",
        "left": left,
        "top": top,
        "width": width,
        "height": height,
        "scrollTop": scroll_top,
        "scrollHeight": scroll_height,
    }


class GeometryTests(unittest.TestCase):
    def test_the_window_snaps_inward_to_the_eight_row_grid(self):
        plan = plan_window(list_state(top=93.5, height=330), 4096)
        self.assertEqual((plan["top"], plan["bottom"]), (96, 416))
        # Every row the list can scroll, plus the window itself.
        self.assertEqual(plan["max_scroll"], 1800 - 330)
        self.assertEqual(plan["rows"], 320 + 1470)
        self.assertEqual((plan["left"], plan["right"]), (20, 460))

    def test_a_list_that_cannot_use_a_window_is_refused_with_its_reason(self):
        for state, capacity, reason in (
            (None, 4096, "no_list"),
            (list_state(top=100, height=60), 4096, "small"),
            (list_state(scroll_height=330), 4096, "no_overflow"),
            (list_state(scroll_height=5000), 4096, "too_tall"),
            (list_state(), 1000, "too_tall"),
        ):
            with self.assertRaises(StitchRefusedError) as raised:
                plan_window(state, capacity)
            self.assertEqual(raised.exception.reason, reason)

    def test_bands_overlap_and_end_exactly_at_the_bottom(self):
        self.assertEqual(band_offsets(320, 1470), [0, 312, 624, 936, 1248, 1470])
        self.assertEqual(band_offsets(320, 40), [0, 40])
        offsets = band_offsets(64, 1000)
        self.assertTrue(all(b - a <= 64 - 8 for a, b in itertools.pairwise(offsets)))

    def test_rows_match_compares_the_window_rows_at_the_lists_offset(self):
        rng = np.random.default_rng(5)
        state = list_state(scroll_top=40)
        plan = plan_window(state, 4096)
        picture = {
            **plan,
            "rgb": rng.integers(0, 256, (plan["rows"], 480, 3), dtype=np.uint8),
        }
        frame = np.zeros((480, 480, 3), dtype=np.uint8)
        frame[96:416] = picture["rgb"][40:360]
        self.assertTrue(rows_match(picture, frame, state))
        # Another offset, another list, or one changed pixel do not.
        self.assertFalse(rows_match(picture, frame, {**state, "scrollTop": 48}))
        self.assertFalse(rows_match(picture, frame, {**state, "identity": "scroll:other"}))
        frame[200, 200, 0] ^= 1
        self.assertFalse(rows_match(picture, frame, state))
        self.assertFalse(rows_match(None, frame, state))


class CodecTests(unittest.TestCase):
    def test_a_tall_picture_quantizes_like_the_panel_at_every_eighth_row(self):
        rng = np.random.default_rng(9)
        tall = rng.integers(0, 256, (1003, 480, 3), dtype=np.uint8)
        tall[100:500] = 20
        pixels = presto_rows_pixels(tall)
        self.assertEqual(len(pixels), 1003 * 480 * 2)
        for offset in (0, 16, 520):
            frame = Image.fromarray(tall[offset : offset + 480])
            self.assertEqual(
                pixels[offset * 960 : (offset + 480) * 960],
                presto_frame_pixels_and_rgb(png_of(frame))[0],
            )

    def test_a_patch_of_a_tall_picture_covers_only_what_changed(self):
        before = bytes(480 * 900 * 2)
        after = bytearray(before)
        after[(700 * 480 + 10) * 2] = 1
        _, _, rectangle = encode_presto_patch(bytes(after), before, height=900)
        self.assertEqual(rectangle, (10, 700, 1, 1))
        _, _, whole = encode_presto_patch(before, height=900)
        self.assertEqual(whole, (0, 0, 480, 900))


def png_of(image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class ScrollTransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.transport = ESPHomePrestoTransport(
            {"mac": "02:00:00:00:00:01", "host": "127.0.0.1", "controls_url": "unused"},
            base64.b64encode(bytes(32)).decode(),
        )
        self.transport.api = types.SimpleNamespace(execute_service=AsyncMock())
        self.transport.event_key = 7
        self.transport.slot_event_key = 8
        self.transport.codecs_key = 9
        self.transport.actions = {
            name: name
            for name in (
                "frame_chunk",
                "set_display_controls",
                *esphome_presto.SLOT_ACTIONS,
                *esphome_presto.SCROLL_ACTIONS,
            )
        }
        self.transport.has_slots = True
        self.transport.has_scroll_actions = True
        self.transport.control_task = asyncio.create_task(asyncio.sleep(3600))
        self.reported = []
        self.transport.callback = lambda state: self.reported.append(state.state)
        self.state(9, "zlib,rle,jpeg,scroll=3600")

    async def asyncTearDown(self):
        self.transport.control_task.cancel()
        await asyncio.gather(self.transport.control_task, return_exceptions=True)

    def state(self, key, value):
        self.transport.native_state(TextSensorState(key=key, state=value))

    def calls(self, action):
        return [
            call
            for call in self.transport.api.execute_service.call_args_list
            if call.args[0] == action
        ]

    async def wait_for(self, condition):
        async with asyncio.timeout(3):
            while not condition():
                await asyncio.sleep(0.001)

    async def upload(self, frame_id, pixels, rows, status="0"):
        uploading = asyncio.create_task(
            self.transport.upload_scroll(frame_id, pixels, rows, lambda: True)
        )
        await self.wait_for(lambda: self.transport.scroll_pending is not None)
        self.state(8, f"scroll,{frame_id},{status}")
        return await uploading

    async def test_the_codecs_report_names_the_picture_capacity(self):
        self.assertTrue(self.transport.has_scroll)
        self.assertEqual(self.transport.scroll_capacity, 3600)
        self.state(9, "zlib,rle,jpeg")
        self.assertFalse(self.transport.has_scroll)
        self.state(9, "zlib,rle,scroll=900")
        self.assertTrue(self.transport.has_scroll)
        self.assertFalse(self.transport.has_jpeg)

    async def test_connect_finds_scroll_firmware_only_with_every_action(self):
        for names, is_scroll in (
            (sorted(esphome_presto.SLOT_ACTIONS | esphome_presto.SCROLL_ACTIONS), True),
            (sorted(esphome_presto.SLOT_ACTIONS), False),
        ):
            self.transport.api = types.SimpleNamespace(
                connect=AsyncMock(),
                execute_service=AsyncMock(),
                subscribe_states=lambda callback: lambda: None,
                device_info=AsyncMock(
                    return_value=types.SimpleNamespace(
                        mac_address="02:00:00:00:00:01", compilation_time="now"
                    )
                ),
                list_entities_services=AsyncMock(
                    return_value=(
                        [
                            types.SimpleNamespace(name="Display Events", key=7),
                            types.SimpleNamespace(name="Display Slot Events", key=8),
                            types.SimpleNamespace(name="Display Codecs", key=9),
                        ],
                        [
                            types.SimpleNamespace(name=name)
                            for name in ["frame_chunk", "set_display_controls", *names]
                        ],
                    )
                ),
            )
            self.transport.scroll_picture = {"frame_id": 3, "pixels": b"", "rows": 1}
            self.transport.control_task.cancel()
            await self.transport.connect()
            # The board's drop_slots emptied the picture; capacity waits for Display Codecs.
            self.assertIsNone(self.transport.scroll_picture)
            self.assertFalse(self.transport.has_scroll)
            self.state(9, "zlib,rle,scroll=2000")
            self.assertEqual(self.transport.has_scroll, is_scroll)
            self.transport.control_task.cancel()

    async def test_a_picture_loads_whole_then_as_a_patch_on_what_the_board_holds(self):
        rows = 700
        first = bytes(480 * rows * 2)
        self.assertTrue(await self.upload(40, first, rows))
        header, _ = packet_of(self.calls("scroll_chunk"))
        self.assertEqual(header[:5], (0, 0, 0, 480, rows))
        self.assertEqual(self.transport.scroll_picture["frame_id"], 40)
        second = bytearray(first)
        second[(650 * 480 + 3) * 2] = 9
        self.transport.api.execute_service.reset_mock()
        self.assertTrue(await self.upload(41, bytes(second), rows))
        header, _ = packet_of(self.calls("scroll_chunk"))
        self.assertEqual(header[:5], (40, 3, 650, 1, 1))
        # A failure leaves no picture, so the next upload is whole again.
        self.transport.api.execute_service.reset_mock()
        self.assertFalse(await self.upload(42, first, rows, status="3"))
        self.assertIsNone(self.transport.scroll_picture)
        self.transport.api.execute_service.reset_mock()
        self.assertTrue(await self.upload(43, first, rows))
        self.assertEqual(packet_of(self.calls("scroll_chunk"))[0][0], 0)

    async def test_a_stopped_upload_leaves_no_picture(self):
        rows = 600
        self.assertTrue(await self.upload(40, bytes(480 * rows * 2), rows))
        noise = np.random.default_rng(1).integers(0, 65536, 480 * rows, dtype=np.uint16)
        answers = iter([True, False])
        self.assertFalse(
            await self.transport.upload_scroll(
                41, noise.tobytes(), rows, lambda: next(answers, False)
            )
        )
        self.assertIsNone(self.transport.scroll_picture)

    async def test_a_scroll_upload_waits_for_a_slot_upload_on_the_board(self):
        slot = asyncio.create_task(
            self.transport.upload_slot(1, 30, build_frame("queue", "a"), lambda: True)
        )
        await self.wait_for(lambda: self.transport.slot_pending is not None)
        scroll = asyncio.create_task(
            self.transport.upload_scroll(31, bytes(480 * 500 * 2), 500, lambda: True)
        )
        await asyncio.sleep(0.05)
        # The board takes one upload at a time: a second would abandon the first.
        self.assertEqual(self.calls("scroll_chunk"), [])
        self.state(8, "slot,1,30,0")
        self.assertTrue(await slot)
        await self.wait_for(lambda: self.transport.scroll_pending is not None)
        self.state(8, "scroll,31,0")
        self.assertTrue(await scroll)

    async def test_the_window_follows_the_boards_reports(self):
        showing = asyncio.create_task(self.transport.show_scroll(40, 96, 416, 24))
        await self.wait_for(lambda: self.calls("scroll_show"))
        self.assertEqual(
            self.calls("scroll_show")[0].args[1],
            {"frame_id": 40, "top": 96, "bottom": 416, "scroll_y": 24},
        )
        # A hide reported before the show arrived does not undo it.
        self.state(8, "scroll_window,0,0,0,0,0")
        self.assertTrue(self.transport.window["is_shown"])
        self.state(8, "scroll_window,40,0,96,416,24")
        self.assertEqual(await showing, "0")
        self.assertEqual(
            {key: self.transport.window[key] for key in ("is_shown", "top", "bottom", "offset")},
            {"is_shown": True, "top": 96, "bottom": 416, "offset": 24},
        )
        # A touch on the window carries its offset; scroll_at moves it and reaches the session.
        self.state(7, "touch,5,0,100,200,2,77,64")
        self.assertEqual(self.transport.window["offset"], 64)
        self.state(8, "scroll_at,40,300")
        self.assertEqual(self.transport.window["offset"], 300)
        self.assertEqual(self.reported[-1], "scroll_at,40,300")
        # The board hid it by itself (a full frame).
        self.state(8, "scroll_window,0,0,0,0,0")
        self.assertFalse(self.transport.window["is_shown"])

    async def test_a_refused_show_forgets_the_picture(self):
        self.transport.scroll_picture = {"frame_id": 40, "pixels": b"", "rows": 900}
        showing = asyncio.create_task(self.transport.show_scroll(40, 96, 416, 0))
        await self.wait_for(lambda: self.calls("scroll_show"))
        self.state(8, "scroll_window,40,4,0,0,0")
        self.assertEqual(await showing, "4")
        self.assertFalse(self.transport.window["is_shown"])
        self.assertIsNone(self.transport.scroll_picture)

    async def test_a_touch_without_the_window_flag_hides_a_window_shown_a_while_ago(self):
        self.transport.window = {**hidden_window(), "is_shown": True, "shown_at": 0}
        self.state(7, "touch,5,0,100,200,0,77,0")
        self.assertFalse(self.transport.window["is_shown"])
        # A show just sent is not undone by a touch that crossed it.
        self.transport.window = {**hidden_window(), "is_shown": True, "shown_at": time.monotonic()}
        self.state(7, "touch,6,0,100,200,0,77,0")
        self.assertTrue(self.transport.window["is_shown"])

    async def test_a_full_frame_or_a_slot_hides_the_window(self):
        self.transport.window = {**hidden_window(), "is_shown": True}
        delivering = asyncio.create_task(self.transport.deliver_frame(5, 0, bytes(480 * 480 * 2)))
        await self.wait_for(
            lambda: self.transport.pending is not None and self.calls("frame_chunk")
        )
        self.state(7, "frame,5,0,0,0,1,1")
        await delivering
        self.assertFalse(self.transport.window["is_shown"])
        self.transport.window = {**hidden_window(), "is_shown": True}
        self.transport.slots[2] = {**build_frame("queue", "a"), "frame_id": 9}
        showing = asyncio.create_task(self.transport.show_slot(2, 0))
        await self.wait_for(lambda: self.transport.pending is not None and self.calls("show_slot"))
        self.state(7, "frame,9,0,0,0,1,1")
        await showing
        self.assertFalse(self.transport.window["is_shown"])

    async def test_health_reports_the_scroll_window(self):
        self.transport.scroll_stats = {"stitches": 2, "refusal": None}
        response = await self.transport.health(None)
        scroll = json.loads(response.body)["scroll"]
        self.assertEqual(scroll["capacity_rows"], 3600)
        self.assertTrue(scroll["has_scroll"])
        self.assertEqual(scroll["stitches"], 2)
        self.assertFalse(scroll["window"]["is_shown"])


ROWS = "".join(
    f'<button data-castkit-target="item:{index}" '
    f'onclick="window.clicks.push({index})" '
    f'style="display:block;width:100%;height:52px;margin:0 0 6px;border:0;border-radius:8px;'
    f'background:hsl({index * 37 % 360} 50% 40%);color:white;font:16px sans-serif">'
    f"Task number {index} with some text</button>"
    for index in range(30)
)
LIST_PAGE = f"""<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 body {{ margin:0; background:#123; color:#fff; font:16px sans-serif; overflow:hidden }}
 header {{ height:93px }}
 .list {{ position:absolute; left:20px; top:93px; width:428px; height:318px; padding:6px;
   overflow-y:auto; touch-action:none; scrollbar-width:thin; scrollbar-color:#888 transparent }}
</style>
<header>Header <span id="clock">9:41</span></header>
<section class="list" data-castkit-scroll="true" data-castkit-target="scroll:test">{ROWS}</section>
<script>
 window.clicks = []; window.cancels = 0;
 document.querySelector('.list').addEventListener('pointercancel', () => {{ window.cancels += 1 }});
</script>"""


class FakeScrollClient:
    """What ScrollWindow needs of ESPHomePrestoTransport, recording each call."""

    has_scroll = True
    scroll_capacity = 4096

    def __init__(self):
        self.window = hidden_window()
        self.scroll_picture = None
        self.scroll_upload = None
        self.scroll_stats = None
        self.base_id = 50
        self.uploads, self.shows, self.hides = [], [], 0

    async def upload_scroll(self, frame_id, pixels, rows, should_continue):
        self.uploads.append((frame_id, rows))
        if getattr(self, "upload_error", None) is not None:
            raise self.upload_error
        self.scroll_picture = {"frame_id": frame_id, "pixels": pixels, "rows": rows}
        return True

    async def show_scroll(self, frame_id, top, bottom, offset):
        self.shows.append((frame_id, top, bottom, offset))
        self.window = {
            "is_shown": True,
            "frame_id": frame_id,
            "top": top,
            "bottom": bottom,
            "offset": offset,
            "shown_at": time.monotonic(),
        }
        return "0"

    async def hide_scroll(self):
        self.hides += 1
        self.window = hidden_window()


class BrowserScrollTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.playwright = await async_playwright().start()
        executable = os.environ.get("CASTKIT_TEST_CHROMIUM")
        self.browser = await self.playwright.chromium.launch(
            **({"executable_path": executable} if executable else {}),
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        viewport = {"width": 480, "height": 480}
        self.context = await create_browser_context(self.browser, {"viewport": viewport})
        self.page = await self.context.new_page()
        await self.page.set_content(LIST_PAGE)
        self.client = FakeScrollClient()
        self.session = DisplaySession(
            {"viewport": viewport},
            self.page,
            self.client,
            {},
            asyncio.Event(),
            PreviewServer("test", 8),
        )
        self.session.cdp = await self.context.new_cdp_session(self.page)
        self.scroll = self.session.scroll
        self.task = None
        self.sequence = 0

    async def asyncTearDown(self):
        if self.task is not None:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
        await self.scroll.close()
        await self.browser.close()
        await self.playwright.stop()

    async def capture(self):
        """One cycle of the capture loop's view: pixels, RGB, list state, page state."""
        shot = await self.session.send_cdp(
            "Page.captureScreenshot",
            {"format": "png", "fromSurface": True, "captureBeyondViewport": False},
        )
        payload, rgb = presto_frame_pixels_and_rgb(base64.b64decode(shot["data"]))
        state = await self.page.evaluate(SCROLL_STATE_SCRIPT, self.scroll.options())
        page_state = await self.page.evaluate(PAGE_STATE_SCRIPT)
        return payload, rgb, state, page_state

    async def cycle(self):
        """Capture, 'send' the frame, and let the scroll window act, as `run` does."""
        payload, rgb, state, page_state = await self.capture()
        self.scroll.observe(page_state)
        # Treat the page as long still, so a stitch is allowed now.
        self.scroll.changed_at = 0
        await self.scroll.before_frame(rgb, state)
        self.session.previous_payload = payload
        await self.scroll.after_frame(rgb, state, page_state, payload)
        if self.scroll.upload_task is not None:
            await self.scroll.upload_task
        return payload, rgb, state

    async def scroll_to(self, top):
        await self.page.evaluate(
            """top => { document.querySelector('.list').scrollTop = top;
              return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))) }""",
            top,
        )

    async def test_the_stitched_picture_is_the_list_at_every_offset(self):
        await self.cycle()
        picture = self.scroll.picture
        self.assertIsNotNone(picture)
        self.assertEqual((picture["top"], picture["bottom"]), (96, 416))
        state = await self.page.evaluate(SCROLL_STATE_SCRIPT, self.scroll.options())
        # The stitch put the list back where it was.
        self.assertEqual(state["scrollTop"], 0)
        self.assertEqual(picture["rows"], 320 + state["scrollHeight"] - state["height"])
        self.assertEqual(self.client.uploads, [(picture["frame_id"], picture["rows"])])
        for offset in (0, 13, 16, 333, picture["max_scroll"]):
            await self.scroll_to(offset)
            payload, rgb, state, _ = await self.capture()
            self.assertTrue(rows_match(picture, rgb, state), offset)
            if offset % 8 == 0:
                # On the 8-row grid even the quantized pixels are the panel's own.
                self.assertEqual(
                    picture["pixels"][offset * 960 : (offset + 320) * 960],
                    payload[96 * 960 : 416 * 960],
                    offset,
                )

    async def test_the_window_is_shown_over_matching_rows_and_hidden_when_they_change(self):
        await self.cycle()
        frame_id = self.scroll.picture["frame_id"]
        # The upload finished: the next cycle shows the window at the list's offset.
        await self.cycle()
        self.assertEqual(self.client.shows, [(frame_id, 96, 416, 0)])
        # A change outside the window rows leaves it.
        await self.page.evaluate("document.getElementById('clock').textContent = '9:42'")
        await self.cycle()
        self.assertEqual(self.client.hides, 0)
        # The page moved its own list: the window moves with it.
        await self.scroll_to(200)
        await self.cycle()
        self.assertEqual(self.client.shows[-1], (frame_id, 96, 416, 200))
        # The list's content changed: hide before the frame, then draw it again.
        await self.page.evaluate(
            "document.querySelector('[data-castkit-target=\"item:5\"]').textContent = 'Done'"
        )
        await self.cycle()
        self.assertEqual(self.client.hides, 1)
        self.assertNotEqual(self.scroll.picture["frame_id"], frame_id)

    async def test_a_list_with_something_over_it_or_moving_beside_it_is_not_drawn(self):
        for script, reason in (
            (
                """() => { const cover = document.createElement('div');
                  cover.style.cssText = 'position:fixed;left:200px;top:200px;width:60px;height:60px;background:red';
                  document.body.append(cover) }""",
                "covered",
            ),
            (
                """() => { const sticky = document.createElement('div');
                  sticky.textContent = 'Sticky';
                  sticky.style.cssText = 'position:sticky;top:0;height:30px;background:#c00';
                  document.querySelector('.list').prepend(sticky) }""",
                "overlap",
            ),
        ):
            with self.subTest(reason=reason):
                await self.page.set_content(LIST_PAGE)
                await self.page.evaluate(script)
                self.scroll.refusal = None
                await self.cycle()
                self.assertIsNone(self.scroll.picture)
                self.assertEqual(self.scroll.stats["refusal"], reason)

    async def test_a_side_column_that_differs_down_the_window_is_refused(self):
        await self.page.evaluate(
            """() => { const mark = document.createElement('div');
              mark.style.cssText = 'position:absolute;left:4px;top:200px;width:8px;height:8px;background:#fff';
              document.body.append(mark) }"""
        )
        await self.cycle()
        self.assertIsNone(self.scroll.picture)
        self.assertEqual(self.scroll.stats["refusal"], "edges")

    async def touch(self, phase, x, y, flags=0, offset=0):
        self.sequence += 1
        await self.session.touches.put(
            ["touch", str(self.sequence), str(phase), str(x), str(y), str(flags), "50", str(offset)]
        )
        sequence = self.sequence
        async with asyncio.timeout(3):
            while self.session.processed_touch != sequence:
                if self.task.done():
                    self.task.result()
                await asyncio.sleep(0.01)

    async def remember_targets(self):
        targets = await self.page.evaluate(TARGETS_SCRIPT, self.session.target_options)
        self.session.guard.remember(
            50,
            [
                Target(**{key: value for key, value in target.items() if key != "loading"})
                for target in targets
            ],
        )

    async def test_the_board_takes_a_drag_and_the_page_follows_where_it_rests(self):
        await self.cycle()
        await self.cycle()
        await self.remember_targets()
        self.task = asyncio.create_task(self.session.input_loop())
        # A press on the list, a short move, then the board takes the contact over.
        await self.touch(0, 100, 200, flags=2)
        self.assertIsNotNone(self.session.contact)
        await self.touch(1, 100, 194, flags=2)
        await self.touch(2, 100, 186, flags=3, offset=14)
        self.assertIsNone(self.session.contact)
        self.assertTrue(self.scroll.is_board_dragging())
        self.assertEqual(await self.page.evaluate("window.cancels"), 1)
        self.assertEqual(await self.page.evaluate("window.clicks"), [])
        # It comes to rest; the page's list follows before the next press.
        await self.session.touches.put(["scroll_at", str(self.scroll.picture["frame_id"]), "290"])
        async with asyncio.timeout(3):
            while self.scroll.is_board_dragging():
                await asyncio.sleep(0.01)
        self.assertEqual(await self.page.evaluate("document.querySelector('.list').scrollTop"), 290)
        # A tap lands on the row the panel shows there now, not the one it showed before.
        expected = await self.page.evaluate(
            "() => document.elementFromPoint(100, 300).closest('[data-castkit-target]').dataset.castkitTarget"
        )
        await self.touch(0, 100, 300, flags=2, offset=290)
        await self.touch(2, 0, 0, flags=2, offset=290)
        self.assertEqual(await self.page.evaluate("window.clicks"), [int(expected.split(":")[1])])
        self.assertNotEqual(expected, "item:3")

    async def test_a_press_on_the_window_moves_the_page_to_its_offset_first(self):
        await self.cycle()
        await self.remember_targets()
        self.task = asyncio.create_task(self.session.input_loop())
        # The board's scroll_at was lost: the press still carries where the window is.
        await self.touch(0, 100, 300, flags=2, offset=120)
        self.assertEqual(await self.page.evaluate("document.querySelector('.list').scrollTop"), 120)
        await self.touch(2, 0, 0, flags=2, offset=120)
        # Another list on the glass is never moved to the old picture's offset.
        await self.page.evaluate(
            "document.querySelector('.list').dataset.castkitTarget = 'scroll:other'"
        )
        await self.touch(0, 100, 300, flags=2, offset=40)
        self.assertEqual(await self.page.evaluate("document.querySelector('.list').scrollTop"), 120)

    async def test_a_contact_the_board_will_not_take_hides_a_window_the_page_moved_under(self):
        await self.cycle()
        await self.cycle()
        self.assertEqual(len(self.client.shows), 1)
        await self.remember_targets()
        self.task = asyncio.create_task(self.session.input_loop())
        await self.touch(0, 100, 200, flags=2)
        await self.touch(1, 106, 200, flags=2)
        # The page moves the list under a press the board may still take: keep the window.
        await self.scroll_to(30)
        await self.cycle()
        self.assertEqual(self.client.hides, 0)
        self.assertEqual(len(self.client.shows), 1)
        # Past the board's threshold and still forwarded: the board will never take it.
        # The page scrolling its own list moves the window with it...
        await self.touch(1, 118, 202, flags=2)
        await self.cycle()
        self.assertEqual(self.client.hides, 0)
        self.assertEqual(self.client.shows[-1][3], 30)
        # ...and anything else that changes under it hides it, so live frames show.
        await self.page.evaluate(
            "document.querySelector('[data-castkit-target=\"item:5\"]').textContent = 'Done'"
        )
        await self.cycle()
        self.assertEqual(self.client.hides, 1)

    async def test_a_refused_picture_backs_off_and_waits_for_a_change(self):
        await self.page.evaluate(
            """() => { const cover = document.createElement('div');
              cover.style.cssText = 'position:fixed;left:200px;top:200px;width:60px;height:60px;background:red';
              document.body.append(cover) }"""
        )
        await self.cycle()
        self.assertEqual(self.scroll.stats["stitch_attempts"], 1)
        self.assertEqual(self.scroll.stats["refusal"], "covered")
        first = self.scroll.refusal
        self.assertEqual(first["retry_at"] - first["at"], 2)
        # The stitch's own scrolling is not a page change.
        await self.cycle()
        self.assertEqual(self.scroll.refusal["changes"], self.scroll.changes)
        # A page that changes every cycle still waits out the backoff.
        for minute in range(3):
            await self.page.evaluate(
                f"document.getElementById('clock').textContent = '9:5{minute}'"
            )
            await self.cycle()
        self.assertEqual(self.scroll.stats["stitch_attempts"], 1)
        # Past it, with no change, the page is not drawn again either.
        self.scroll.refusal["retry_at"] = 0
        self.scroll.refusal["changes"] = self.scroll.changes
        await self.cycle()
        self.assertEqual(self.scroll.stats["stitch_attempts"], 1)
        # Past it and changed: one more attempt, and the next wait doubles.
        await self.page.evaluate("document.getElementById('clock').textContent = '10:00'")
        await self.cycle()
        self.assertEqual(self.scroll.stats["stitch_attempts"], 2)
        second = self.scroll.refusal
        self.assertEqual((second["count"], second["retry_at"] - second["at"]), (2, 4))

    async def test_a_change_beside_the_list_during_a_stitch_still_counts(self):
        """END resets the page's change count; only the stitch's own list scrolling may go."""
        await self.page.evaluate(
            """() => { const side = document.createElement('div');
              side.id = 'side';
              side.style.cssText = 'position:absolute;left:0;top:0;width:20px;height:20px;overflow:auto;'
                + 'opacity:1;transition:opacity 300ms linear';
              side.innerHTML = '<div style="height:200px"></div>';
              document.body.append(side) }"""
        )
        options = self.scroll.options(top=96, bottom=416)

        async def stitch(during):
            before = (await self.page.evaluate(PAGE_STATE_SCRIPT))["changes"]
            await self.page.evaluate(STITCH_BEGIN_SCRIPT, options)
            await self.page.evaluate(STITCH_STEP_SCRIPT, 40)
            await self.page.evaluate(during)
            end = await self.page.evaluate(STITCH_END_SCRIPT)
            after = (await self.page.evaluate(PAGE_STATE_SCRIPT))["changes"]
            return after - before, end["changes"]

        # The list's own scrolling is taken back out of the count.
        self.assertEqual(await stitch("() => {}"), (0, 0))
        # Another element scrolls during the stitch: no mutation, only a scroll event.
        scrolled, changes = await stitch(
            """() => new Promise(resolve => {
              const side = document.getElementById('side');
              side.addEventListener('scroll', resolve, {once: true});
              side.scrollTop = 50 })"""
        )
        self.assertGreater(scrolled, 0)
        self.assertGreater(changes, 0)
        # A transition started before the stitch ends during it: only a transitionend event.
        await self.page.evaluate(
            """() => new Promise(resolve => {
              document.getElementById('side').style.opacity = '0.5';
              requestAnimationFrame(() => requestAnimationFrame(resolve)) })"""
        )
        transitioned, changes = await stitch(
            """() => new Promise(resolve =>
              document.getElementById('side').addEventListener('transitionend', resolve, {once: true}))"""
        )
        self.assertGreater(transitioned, 0)
        self.assertGreater(changes, 0)

    async def test_a_lost_link_during_an_upload_ends_it_and_leaves_no_picture(self):
        self.client.upload_error = APIConnectionError("link lost")
        await self.cycle()
        self.assertTrue(self.scroll.upload_task.done())
        self.assertIsNone(self.scroll.upload_task.exception())
        self.assertIsNone(self.scroll.picture["frame_id"])
        self.assertFalse(self.scroll.is_picture_on_board())
        await self.cycle()
        self.assertEqual(self.client.shows, [])

    async def test_a_touch_stops_a_stitch_and_the_list_goes_back(self):
        self.session.pending_input = ["touch"]
        payload, rgb, state, page_state = await self.capture()
        self.scroll.changed_at = 0
        await self.scroll.after_frame(rgb, state, page_state, payload)
        self.assertIsNone(self.scroll.picture)
        self.assertEqual(self.scroll.stats["refusal"], "touch")
        self.assertEqual(await self.page.evaluate("document.querySelector('.list').scrollTop"), 0)


class TimestampTouchTests(unittest.IsolatedAsyncioTestCase):
    """The WT32 firmware puts a millisecond timestamp where scroll firmware puts flags."""

    async def asyncSetUp(self):
        self.playwright = await async_playwright().start()
        executable = os.environ.get("CASTKIT_TEST_CHROMIUM")
        self.browser = await self.playwright.chromium.launch(
            **({"executable_path": executable} if executable else {}),
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        viewport = {"width": 480, "height": 480}
        self.context = await create_browser_context(self.browser, {"viewport": viewport})
        self.page = await self.context.new_page()
        await self.page.set_content(LIST_PAGE)
        # What a WT32 session's client offers: no scroll window at all.
        self.session = DisplaySession(
            {"viewport": viewport},
            self.page,
            types.SimpleNamespace(),
            {},
            asyncio.Event(),
            PreviewServer("test", 8),
        )
        self.session.cdp = await self.context.new_cdp_session(self.page)
        targets = await self.page.evaluate(TARGETS_SCRIPT, self.session.target_options)
        self.session.guard.remember(
            50,
            [
                Target(**{key: value for key, value in target.items() if key != "loading"})
                for target in targets
            ],
        )
        self.task = asyncio.create_task(self.session.input_loop())

    async def asyncTearDown(self):
        self.task.cancel()
        await asyncio.gather(self.task, return_exceptions=True)
        await self.browser.close()
        await self.playwright.stop()

    async def test_a_timestamp_in_the_flags_field_never_cancels_or_scrolls(self):
        expected = await self.page.evaluate(
            "() => document.elementFromPoint(100, 200).closest('[data-castkit-target]')"
            ".dataset.castkitTarget"
        )
        # 123459 has both flag bits set: read as flags it would cancel the tap.
        for sequence, phase in ((1, 0), (2, 2)):
            await self.session.touches.put(
                ["touch", str(sequence), str(phase), "100", "200", "123459", "50", "77"]
            )
            async with asyncio.timeout(3):
                while self.session.processed_touch != sequence:
                    if self.task.done():
                        self.task.result()
                    await asyncio.sleep(0.01)
        self.assertEqual(await self.page.evaluate("window.clicks"), [int(expected.split(":")[1])])
        self.assertEqual(await self.page.evaluate("window.cancels"), 0)
        self.assertEqual(await self.page.evaluate("document.querySelector('.list').scrollTop"), 0)


if __name__ == "__main__":
    unittest.main()
