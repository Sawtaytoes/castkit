"""Real Chromium coverage for touch routing and retained-event recovery."""

import asyncio
import contextlib
import io
import os
import tempfile
import types
import unittest
from unittest.mock import AsyncMock, patch

from codec import presto_frame_pixels
from interaction import Target
from PIL import Image
from playwright.async_api import async_playwright
from presto_transport import PrestoTransport
from preview import PreviewServer
from worker import TARGETS_SCRIPT, DisplaySession, create_browser_context, serve


class BrowserTouchTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.playwright = await async_playwright().start()
        executable = os.environ.get("CASTKIT_TEST_CHROMIUM")
        self.browser = await self.playwright.chromium.launch(
            **({"executable_path": executable} if executable else {}),
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        self.context = await self.browser.new_context(
            viewport={"width": 480, "height": 320}, has_touch=True
        )
        self.page = await self.context.new_page()
        await self.page.set_content("""<meta name="viewport" content="width=device-width,initial-scale=1">
          <button data-castkit-target="slot:one" style="width:200px;height:40px;touch-action:manipulation"
           onclick="this.textContent='Disc details';this.dataset.castkitTarget='removed:one:job-a'">Slot 1</button>""")
        self.session = DisplaySession(
            {},
            self.page,
            None,
            {},
            asyncio.Event(),
            PreviewServer("castkit-remote-display-test", 10),
        )
        self.session.cdp = await self.context.new_cdp_session(self.page)
        self.session.guard.remember(42, [Target("slot:one", 8, 8, 200, 40)])
        self.task = asyncio.create_task(self.session.input_loop())

    async def asyncTearDown(self):
        self.task.cancel()
        await asyncio.gather(self.task, return_exceptions=True)
        await self.browser.close()
        await self.playwright.stop()

    async def test_presto_fast_capture_preserves_square_viewport_and_ack_guard(self):
        await self.task_cancel_for_capture_test()
        await self.page.set_viewport_size({"width": 480, "height": 480})
        transport = PrestoTransport({"mac": "020000000001"}, "a" * 32)
        session = DisplaySession(
            {"viewport": {"width": 480, "height": 480}, "max_fps": 8, "heartbeat_seconds": 2},
            self.page,
            transport,
            {},
            asyncio.Event(),
            PreviewServer("test", 8),
        )

        async def acknowledge(frame_id, touch_id, payload):
            self.assertEqual(payload, presto_frame_pixels(session.preview.latest_png))
            self.assertNotIn(frame_id, session.guard.frames)
            session.stop.set()
            return ["frame", str(frame_id), str(touch_id), "0", "0", "10", "10"]

        transport.send_frame = acknowledge
        await asyncio.wait_for(session.run(1, None), timeout=3)
        self.assertEqual(Image.open(io.BytesIO(session.preview.latest_png)).size, (480, 480))
        self.assertIn(session.frame_id, session.guard.frames)
        self.assertIsNotNone(transport.capture_ms)

    async def test_unchanged_drag_skips_extra_acks_but_keeps_change_release_and_heartbeat(self):
        await self.task_cancel_for_capture_test()
        await self.page.set_viewport_size({"width": 480, "height": 480})
        transport = PrestoTransport({"mac": "020000000001"}, "a" * 32)
        session = DisplaySession(
            {"viewport": {"width": 480, "height": 480}, "max_fps": 20, "heartbeat_seconds": 1},
            self.page,
            transport,
            {},
            asyncio.Event(),
            PreviewServer("test", 20),
        )
        acknowledgements = []
        session.contact = {"is_native_active": False}
        captured = 0
        real_capture = self.page.context.new_cdp_session
        cdp = await real_capture(self.page)
        real_send = cdp.send

        async def capture(method, parameters):
            nonlocal captured
            if method == "Page.captureScreenshot":
                captured += 1
                # Both samples are visually unchanged, but a real drag repaint
                # must still reach the board while contact is held.
                if captured in (2, 3):
                    session.processed_touch = captured
                    session.force_frame.set()
                if captured == 4:
                    await self.page.evaluate("document.body.style.background = 'red'")
                if captured == 5:
                    session.contact = None
                    session.processed_touch = 3
                    session.config["heartbeat_seconds"] = 0.1
                    session.force_frame.set()
            return await real_send(method, parameters)

        cdp.send = capture

        async def acknowledge(frame_id, touch_id, payload):
            acknowledgements.append((captured, touch_id))
            if len(acknowledgements) == 4:
                session.stop.set()
            return ["frame", str(frame_id), str(touch_id), "0", "0", "10", "10"]

        transport.send_frame = acknowledge
        with patch.object(self.context, "new_cdp_session", return_value=cdp):
            await asyncio.wait_for(session.run(1, None), timeout=3)
        self.assertEqual(acknowledgements[:3], [(1, 0), (4, 3), (5, 3)])
        self.assertEqual(acknowledgements[3][1], 3)
        self.assertGreater(acknowledgements[3][0], 5)

    async def test_dead_browser_exits_worker_instead_of_retrying_a_dead_context(self):
        await self.task_cancel_for_capture_test()
        transport = types.SimpleNamespace(
            start=AsyncMock(),
            stop=AsyncMock(),
            connect=AsyncMock(),
            disconnect=AsyncMock(),
            build_marker="test-firmware",
        )
        manifest = types.SimpleNamespace(
            ok=True, url="https://panel.example/manifest", json=AsyncMock()
        )
        browser_api = types.SimpleNamespace(
            chromium=types.SimpleNamespace(launch=AsyncMock(return_value=self.browser))
        )

        @contextlib.asynccontextmanager
        async def browser_manager():
            yield browser_api

        async def crash(session, event_key, loading_frame):
            await self.browser.close()
            raise RuntimeError("browser process stopped")

        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml") as credentials:
            credentials.write("api_encryption_key: test-key\n")
            credentials.flush()
            config = {
                "transport": "esphome-presto",
                "mac": "020000000001",
                "host": "127.0.0.1",
                "secrets_path": credentials.name,
                "manifest_url": manifest.url,
            }
            parsed = {
                "url": "https://panel.example/display",
                "ready_selector": None,
                "cache_url": None,
                "max_fps": 8,
            }
            with (
                patch("worker.async_playwright", browser_manager),
                patch("worker.create_browser_context", AsyncMock(return_value=self.context)),
                patch.object(self.context.request, "get", AsyncMock(return_value=manifest)),
                patch("worker.parse_manifest", return_value=parsed),
                patch.object(self.context, "new_page", AsyncMock(return_value=self.page)),
                patch.object(self.page, "goto", AsyncMock(return_value=manifest)),
                patch("worker.ESPHomePrestoTransport", return_value=transport),
                patch.object(DisplaySession, "run", crash),
                self.assertRaisesRegex(RuntimeError, "browser process stopped"),
            ):
                await asyncio.wait_for(serve(config), timeout=3)
        transport.connect.assert_awaited_once()
        transport.disconnect.assert_awaited_once()
        transport.stop.assert_awaited_once()

    async def test_stalled_native_capture_times_out_and_releases_touch_session(self):
        await self.task_cancel_for_capture_test()
        transport = PrestoTransport({"mac": "020000000001"}, "a" * 32)
        session = DisplaySession(
            {"viewport": {"width": 480, "height": 480}, "max_fps": 8, "heartbeat_seconds": 2},
            self.page,
            transport,
            {},
            asyncio.Event(),
            PreviewServer("test", 8),
        )
        blocked = asyncio.Event()
        capture_started = asyncio.Event()
        cdp = AsyncMock()

        async def stalled_send(method, parameters):
            self.assertEqual(method, "Page.captureScreenshot")
            capture_started.set()
            await blocked.wait()

        cdp.send.side_effect = stalled_send
        with (
            patch.object(self.context, "new_cdp_session", return_value=cdp),
            patch("worker.BROWSER_TIMEOUT_SECONDS", 0.05),
            self.assertRaises(TimeoutError),
        ):
            await asyncio.wait_for(session.run(1, None), timeout=1)
        self.assertTrue(capture_started.is_set())
        cdp.detach.assert_awaited_once()
        self.assertEqual(session.frames, 0)
        self.assertIsNone(session.contact)

    async def task_cancel_for_capture_test(self):
        self.task.cancel()
        await asyncio.gather(self.task, return_exceptions=True)

    async def test_presto_palette_capture_reuses_pixels_and_preserves_artwork_colors(self):
        await self.task_cancel_for_capture_test()
        await self.page.set_viewport_size({"width": 480, "height": 480})
        await self.page.set_content("""<div data-castkit-target="now-playing-artwork"
          style="position:absolute;left:100px;top:100px;width:200px;height:200px;background:red"></div>""")
        transport = PrestoTransport({"mac": "020000000001"}, "a" * 32)
        transport.set_ambient_light(
            {"isOn": True, "brightness": 5, "mode": "album-glow", "demo": False}
        )
        session = DisplaySession(
            {"viewport": {"width": 480, "height": 480}, "max_fps": 8, "heartbeat_seconds": 2},
            self.page,
            transport,
            {},
            asyncio.Event(),
            PreviewServer("test", 8),
        )

        async def acknowledge(frame_id, touch_id, payload):
            self.assertEqual(payload, presto_frame_pixels(session.preview.latest_png))
            self.assertEqual(transport.ambient_palette, [[255, 0, 0]] * 7)
            self.assertNotIn(frame_id, session.guard.frames)
            session.stop.set()
            return ["frame", str(frame_id), str(touch_id), "0", "0", "10", "10"]

        transport.send_frame = acknowledge
        await asyncio.wait_for(session.run(1, None), timeout=3)
        self.assertIn(session.frame_id, session.guard.frames)

    async def test_saved_session_survives_context_recreation(self):
        state = {
            "cookies": [
                {
                    "name": "castkit-session",
                    "value": "read-only-fixture",
                    "domain": "panel.example",
                    "path": "/",
                    "expires": -1,
                    "httpOnly": True,
                    "secure": True,
                    "sameSite": "Strict",
                }
            ],
            "origins": [],
        }
        for _ in range(2):
            context = await create_browser_context(self.browser, {"browser_storage_state": state})
            cookies = await context.cookies("https://panel.example/d/example")
            self.assertEqual(cookies[0]["value"], "read-only-fixture")
            self.assertTrue(cookies[0]["httpOnly"])
            page = await context.new_page()
            await page.route(
                "https://panel.example/**",
                lambda route: route.fulfill(
                    status=200, content_type="text/html", body="<p>Private panel</p>"
                ),
            )
            await page.goto("https://panel.example/d/example")
            self.assertEqual(await page.evaluate("document.cookie"), "")
            await context.close()
        context = await create_browser_context(self.browser, {})
        self.assertEqual(await context.cookies(), [])
        await context.close()

    async def test_square_panel_keeps_bottom_touch_targets_and_reboot_resets_sequence(self):
        context = await create_browser_context(
            self.browser, {"viewport": {"width": 480, "height": 480}}
        )
        page = await context.new_page()
        await page.set_content("""<meta name="viewport" content="width=device-width,initial-scale=1">
            <button data-castkit-target="bottom" style="position:absolute;left:20px;top:420px;width:80px;height:40px">Bottom</button>""")
        targets = await page.evaluate(
            TARGETS_SCRIPT, {"attribute": "data-castkit-target", "width": 480, "height": 480}
        )
        self.assertEqual(targets[0]["identity"], "bottom")
        self.assertEqual(targets[0]["y"], 420)
        self.session.last_sequence = 100
        from aioesphomeapi import TextSensorState

        self.session.event_key = 1
        self.session.queued_touch = ["touch", "101", "1", "30", "25", "0", "42", "0"]
        self.session.touches.put_nowait(["touch", "102", "2", "30", "25", "0", "42", "0"])
        self.session.state_changed(TextSensorState(key=1, state="error,device-restarted"))
        self.assertEqual(self.session.last_sequence, 0)
        self.assertTrue(self.session.is_reset_required)
        self.assertEqual(self.session.guard.frames, {})
        self.assertTrue(self.session.touches.empty())
        self.assertIsNone(self.session.queued_touch)
        await context.close()

    async def event(self, sequence, phase, frame=42):
        await self.session.touches.put(
            ["touch", str(sequence), str(phase), "30", "25", "0", str(frame), "0"]
        )
        async with asyncio.timeout(3):
            while self.session.processed_touch != sequence:
                if self.task.done():
                    self.task.result()
                await asyncio.sleep(0.01)

    async def test_burst_motion_keeps_down_release_and_reversal_without_replaying_every_sample(
        self,
    ):
        await self.task_cancel_for_capture_test()

        # A frame transfer may hold up replay while many finger samples arrive.
        def event(sequence, phase, x):
            return ["touch", str(sequence), str(phase), str(x), "25", "0", "42", "0"]

        self.session.contact = {"x": 30, "y": 25}
        for item in [
            event(1, 0, 30),
            *[event(x, 1, x) for x in range(32, 101, 2)],
            *[event(201 - x, 1, x) for x in range(98, 29, -2)],
            event(172, 2, 30),
        ]:
            await self.session.touches.put(item)
        replay = []
        for _ in range(4):
            item = await self.session.next_touch()
            replay.append(item)
            # input_loop updates the contact after replaying each retained point.
            self.session.contact = {"x": int(item[3]), "y": int(item[4])}
        self.assertEqual(
            [(int(item[2]), int(item[3])) for item in replay], [(0, 30), (1, 100), (1, 30), (2, 30)]
        )
        self.assertTrue(self.session.touches.empty())
        self.assertIsNone(self.session.queued_touch)

    async def test_vertical_swipe_crosses_controls_without_clicking(self):
        await self.page.set_content("""<div class="stage" data-castkit-target="view-gesture:ambient"
          style="position:absolute;inset:0;touch-action:none">
          <button data-castkit-target="button" style="width:100px;height:40px"
          onclick="window.wasClicked=true">Tap</button></div>""")
        await self.page.evaluate("""() => {
          window.gestures = [];
          const stage = document.querySelector('.stage');
          ['pointerdown','pointermove','pointerup'].forEach(type => stage.addEventListener(type,
            event => window.gestures.push([type,event.clientY])));
        }""")
        self.session.guard.remember(
            50, [Target("view-gesture:ambient", 0, 0, 480, 320), Target("button", 0, 0, 100, 40)]
        )
        for sequence, phase, y in [(1, 0, 25), (2, 1, 45), (3, 1, 100), (4, 1, 150), (5, 2, 0)]:
            await self.session.touches.put(
                [
                    "touch",
                    str(sequence),
                    str(phase),
                    "0" if phase == 2 else "30",
                    str(y),
                    "0",
                    "50",
                    "0",
                ]
            )
            async with asyncio.timeout(3):
                while self.session.processed_touch != sequence:
                    if self.task.done():
                        self.task.result()
                    await asyncio.sleep(0.01)
        self.assertIsNone(await self.page.evaluate("window.wasClicked"))
        self.assertEqual((await self.page.evaluate("window.gestures"))[-1], ["pointerup", 150])

    async def test_horizontal_artwork_drag_reaches_control_without_becoming_view_swipe(self):
        await self.page.set_content("""<div class="stage" data-castkit-target="view-gesture:now-playing"
          style="position:absolute;inset:0;touch-action:none">
          <button data-castkit-target="now-playing-artwork"
          style="position:absolute;left:100px;top:20px;width:250px;height:250px;touch-action:none">Art</button></div>""")
        await self.page.evaluate("""() => {
          window.actions = [];
          const artwork = document.querySelector('button');
          let start;
          artwork.onpointerdown = event => {
            start = event.clientX;
            artwork.setPointerCapture(event.pointerId);
          };
          artwork.onpointerup = event => window.actions.push(
            event.clientX - start < -80 ? 'next' : 'pause');
          document.querySelector('.stage').onpointerdown = event => {
            if (event.target.className === 'stage') window.actions.push('view-swipe');
          };
        }""")
        self.session.guard.remember(
            50,
            [
                Target("view-gesture:now-playing", 0, 0, 480, 320),
                Target("now-playing-artwork", 100, 20, 250, 250),
            ],
        )
        for sequence, phase, x in [(1, 0, 300), (2, 1, 270), (3, 1, 230), (4, 1, 30), (5, 2, 0)]:
            await self.session.touches.put(
                ["touch", str(sequence), str(phase), str(x), "100", "0", "50", "0"]
            )
            async with asyncio.timeout(3):
                while self.session.processed_touch != sequence:
                    if self.task.done():
                        self.task.result()
                    await asyncio.sleep(0.01)
        self.assertEqual(await self.page.evaluate("window.actions"), ["next"])

    async def test_all_shell_edges_keep_native_capture_outside_their_acknowledged_strip(self):
        edges = [
            ("left", 0, 0, 32, 320, 10, 80, 100, 80),
            ("right", 448, 0, 32, 320, 470, 80, 380, 80),
            ("top", 32, 0, 416, 24, 240, 10, 240, 100),
            ("bottom", 32, 296, 416, 24, 240, 310, 240, 220),
        ]
        for index, (edge, left, top, width, height, start_x, start_y, end_x, end_y) in enumerate(
            edges
        ):
            with self.subTest(edge=edge):
                await self.page.set_content(f"""<div class="stage" data-view="external-view:0"
                  style="position:absolute;inset:0;touch-action:none">
                  <iframe src="about:blank" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>
                  <button data-castkit-target="navigation-edge:{edge}"
                  style="position:absolute;left:{left}px;top:{top}px;width:{width}px;height:{height}px;touch-action:none">Edge</button></div>""")
                await self.page.evaluate("""() => {
                  window.actions = [];
                  const edge = document.querySelector('button');
                  edge.onpointerdown = event => {
                    event.stopPropagation();
                    edge.setPointerCapture(event.pointerId);
                  };
                  edge.onpointermove = event => event.stopPropagation();
                  edge.onpointerup = event => {
                    event.stopPropagation();
                    window.actions.push(['release', event.clientX, event.clientY]);
                  };
                  edge.onpointercancel = () => window.actions.push(['cancel']);
                  document.querySelector('.stage').onpointerdown = () => window.actions.push(['stage']);
                }""")
                targets = await self.page.evaluate(
                    TARGETS_SCRIPT,
                    {"attribute": "data-castkit-target", "width": 480, "height": 320},
                )
                self.session.guard.remember(
                    60 + index,
                    [
                        Target(**{key: value for key, value in target.items() if key != "loading"})
                        for target in targets
                    ],
                )
                steps = [
                    (0, start_x, start_y),
                    (1, start_x + (end_x - start_x) // 3, start_y + (end_y - start_y) // 3),
                    (1, end_x, end_y),
                    (2, 0, 0),
                ]
                for offset, (phase, x, y) in enumerate(steps):
                    sequence = index * 4 + offset + 1
                    await self.session.touches.put(
                        [
                            "touch",
                            str(sequence),
                            str(phase),
                            str(x),
                            str(y),
                            "0",
                            str(60 + index),
                            "0",
                        ]
                    )
                    async with asyncio.timeout(3):
                        while self.session.processed_touch != sequence:
                            if self.task.done():
                                self.task.result()
                            await asyncio.sleep(0.01)
                self.assertEqual(
                    await self.page.evaluate("window.actions"), [["release", end_x, end_y]]
                )

    async def test_cancelled_control_contact_does_not_cancel_native_touch_twice(self):
        await self.event(1, 0)
        await self.session.touches.put(["touch", "2", "1", "30", "55", "0", "42", "0"])
        async with asyncio.timeout(3):
            while self.session.processed_touch != 2:
                if self.task.done():
                    self.task.result()
                await asyncio.sleep(0.01)
        await self.event(3, 2)
        self.assertEqual(await self.page.locator("button").inner_text(), "Slot 1")
        await self.event(4, 0)
        await self.event(5, 2)
        self.assertEqual(await self.page.locator("button").inner_text(), "Disc details")

    async def test_retained_release_does_not_break_the_next_tap(self):
        await self.event(100, 2)
        await self.event(101, 0)
        await self.event(102, 2)
        self.assertEqual(await self.page.locator("button").inner_text(), "Disc details")

    async def test_old_frame_cannot_activate_new_control_at_same_position(self):
        await self.event(1, 0)
        await self.event(2, 2)
        await self.page.locator("button").evaluate(
            "element => element.onclick = () => element.textContent = 'REMOVED'"
        )
        await self.event(3, 0)
        await self.event(4, 2)
        self.assertEqual(await self.page.locator("button").inner_text(), "Disc details")

    async def test_disabled_or_changed_control_during_contact_cancels_click(self):
        await self.event(1, 0)
        await self.page.locator("button").evaluate(
            "element => element.dataset.castkitTarget = 'slot:replacement'"
        )
        await self.event(2, 2)
        self.assertEqual(await self.page.locator("button").inner_text(), "Slot 1")
        await self.page.locator("button").evaluate(
            "element => { element.dataset.castkitTarget = 'slot:one'; element.disabled = true }"
        )
        await self.event(3, 0)
        await self.event(4, 2)
        self.assertEqual(await self.page.locator("button").inner_text(), "Slot 1")

    async def test_external_view_frame_receives_a_guarded_touch(self):
        await self.page.set_content("""
          <iframe data-castkit-target="external-view:Disc App"
           style="position:absolute;inset:0;width:100%;height:100%;border:0"
           srcdoc="<button onclick=&quot;this.textContent='Opened'&quot; style=&quot;width:200px;height:40px&quot;>Disc App</button>"></iframe>""")
        frame = self.page.frames[1]
        self.session.guard.remember(
            43,
            [Target("external-view:Disc App", 0, 0, 480, 320)],
        )

        await self.event(1, 0, frame=43)
        await self.event(2, 2, frame=43)

        self.assertEqual(await frame.locator("button").inner_text(), "Opened")

    async def test_cache_frame_is_acknowledged_but_never_becomes_a_touch_target(self):
        self.session.client = AsyncMock()
        self.session.services = {"frame_chunk": object()}

        async def acknowledge(service, values):
            if values["final_chunk"]:
                self.session.pending[values["frame_id"]].set_result(
                    ["frame", str(values["frame_id"])]
                )

        self.session.client.execute_service.side_effect = acknowledge
        await self.session.send_frame(b"cached skeleton", 0, [], format_id=3)
        self.assertIsNone(self.session.guard.match(self.session.frame_id, 30, 25, "slot:one"))
        self.assertFalse(self.session.pending)
