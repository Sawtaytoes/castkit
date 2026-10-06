"""Real Chromium coverage for touch routing and retained-event recovery."""

import asyncio
import io
import os
import unittest
from unittest.mock import AsyncMock

from interaction import Target
from PIL import Image
from playwright.async_api import async_playwright
from presto_transport import PrestoTransport
from preview import PreviewServer
from worker import TARGETS_SCRIPT, DisplaySession, create_browser_context


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
            session.stop.set()
            return ["frame", str(frame_id), str(touch_id), "0", "0", "10", "10"]

        transport.send_frame = acknowledge
        await asyncio.wait_for(session.run(1, None), timeout=3)
        self.assertEqual(Image.open(io.BytesIO(session.preview.latest_png)).size, (480, 480))
        self.assertIn(session.frame_id, session.guard.frames)
        self.assertIsNotNone(transport.capture_ms)

    async def task_cancel_for_capture_test(self):
        self.task.cancel()
        await asyncio.gather(self.task, return_exceptions=True)

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
        self.session.state_changed(TextSensorState(key=1, state="error,device-restarted"))
        self.assertEqual(self.session.last_sequence, 0)
        self.assertTrue(self.session.is_reset_required)
        self.assertEqual(self.session.guard.frames, {})
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
