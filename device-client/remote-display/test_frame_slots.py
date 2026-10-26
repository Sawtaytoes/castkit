"""Swipe destinations held on the board: slot bookkeeping, show at release, and fallback."""

import asyncio
import base64
import random
import struct
import time
import types
import unittest
from unittest.mock import AsyncMock

import esphome_presto
from aioesphomeapi import TextSensorState
from esphome_presto import ESPHomePrestoTransport
from manifest import parse_manifest
from presto_transport import FrameSupersededError, SlotUnavailableError
from preview import PreviewServer
from stream_frames import StreamFrameFeed, plan_slots
from worker import DisplaySession

FRAME_BYTES = 480 * 480 * 2
# Incompressible, so a patch of it takes many chunks.
NOISE = random.Random(1).randbytes(FRAME_BYTES)


def solid(value):
    return bytes([value]) * FRAME_BYTES


def build_frame(view, key, pixels=None):
    return {
        "view": view,
        "key": key,
        "png": f"png of {view}".encode(),
        "pixels": pixels if pixels is not None else solid(len(view)),
        "targets": [
            {
                "identity": f"view-gesture:{view}",
                "x": 0,
                "y": 0,
                "width": 480,
                "height": 480,
                "loading": False,
            }
        ],
    }


def packet_of(calls):
    encoded = "".join(call.args[1]["image_data"] for call in calls)
    packet = base64.b64decode(encoded)
    return struct.unpack(">IHHHHB", packet[:13]), packet[13:]


class SlotTransportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.transport = ESPHomePrestoTransport(
            {"mac": "02:00:00:00:00:01", "host": "127.0.0.1", "controls_url": "unused"},
            base64.b64encode(bytes(32)).decode(),
        )
        self.transport.api = types.SimpleNamespace(execute_service=AsyncMock())
        self.transport.event_key = 7
        self.transport.actions = {
            name: name
            for name in ("frame_chunk", "set_display_controls", *esphome_presto.SLOT_ACTIONS)
        }
        self.transport.has_slots = True
        self.transport.control_task = asyncio.create_task(asyncio.sleep(3600))

    async def asyncTearDown(self):
        self.transport.control_task.cancel()
        await asyncio.gather(self.transport.control_task, return_exceptions=True)

    def event(self, value):
        self.transport.native_state(TextSensorState(key=7, state=value))

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

    async def load(self, slot, frame_id, frame, status="0"):
        uploading = asyncio.create_task(
            self.transport.upload_slot(slot, frame_id, frame, lambda: True)
        )
        await self.wait_for(lambda: self.transport.slot_pending is not None)
        self.event(f"slot,{slot},{frame_id},{status}")
        return await uploading

    async def test_connect_drops_every_slot_only_on_slot_firmware(self):
        for has_slot_actions in (True, False):
            names = ["frame_chunk", "set_display_controls"]
            if has_slot_actions:
                names += sorted(esphome_presto.SLOT_ACTIONS)
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
                        ],
                        [types.SimpleNamespace(name=name) for name in names],
                    )
                ),
            )
            self.transport.slots = {0: {"view": "queue", "key": "old"}}
            self.transport.control_task.cancel()
            await self.transport.connect()
            self.assertEqual(self.transport.has_slots, has_slot_actions)
            self.assertEqual(self.transport.slot_event_key, 8)
            self.assertEqual(self.transport.slots, {})
            drops = [
                call
                for call in self.transport.api.execute_service.call_args_list
                if call.args[0].name == "drop_slots"
            ]
            self.assertEqual(len(drops), 1 if has_slot_actions else 0)

    async def test_a_slot_is_loaded_in_full_then_patched_against_what_it_holds(self):
        first = build_frame("queue", "a", solid(1))
        self.assertTrue(await self.load(2, 100, first))
        header, _ = packet_of(self.calls("slot_chunk"))
        self.assertEqual(header[:5], (0, 0, 0, 480, 480))
        self.assertEqual(self.transport.slots[2]["frame_id"], 100)
        self.assertEqual(self.transport.find_slot("queue", "a"), 2)

        self.transport.api.execute_service.reset_mock()
        changed = bytearray(first["pixels"])
        changed[0:4] = b"\xff\xff\xff\xff"
        second = build_frame("queue", "b", bytes(changed))
        self.assertTrue(await self.load(2, 101, second))
        header, _ = packet_of(self.calls("slot_chunk"))
        self.assertEqual(header[0], 100)
        self.assertLess(header[3] * header[4], 480 * 480)
        self.assertIsNone(self.transport.find_slot("queue", "a"))
        self.assertEqual(self.transport.find_slot("queue", "b"), 2)

    async def test_a_failed_load_leaves_the_slot_empty(self):
        self.assertTrue(await self.load(1, 100, build_frame("queue", "a")))
        self.assertFalse(await self.load(1, 101, build_frame("queue", "b"), status="3"))
        self.assertNotIn(1, self.transport.slots)

    async def test_a_stopped_load_empties_the_slot_and_the_next_one_is_full(self):
        self.assertTrue(await self.load(1, 100, build_frame("queue", "a", solid(1))))
        noisy = NOISE
        chunks = {"count": 0}

        def should_continue():
            chunks["count"] += 1
            return chunks["count"] == 1

        self.transport.api.execute_service.reset_mock()
        self.assertFalse(
            await self.transport.upload_slot(
                1, 101, build_frame("queue", "b", noisy), should_continue
            )
        )
        self.assertEqual(len(self.calls("slot_chunk")), 1)
        # The board empties a slot at an upload's first chunk.
        self.assertNotIn(1, self.transport.slots)
        self.transport.api.execute_service.reset_mock()
        self.assertTrue(await self.load(1, 102, build_frame("queue", "b", noisy)))
        self.assertEqual(packet_of(self.calls("slot_chunk"))[0][0], 0)

    async def test_an_error_event_does_not_fail_a_load_in_progress(self):
        uploading = asyncio.create_task(
            self.transport.upload_slot(0, 100, build_frame("queue", "a"), lambda: True)
        )
        await self.wait_for(lambda: self.transport.slot_pending is not None)
        self.event("error,slot_unavailable")
        self.event("slot,0,100,0")
        self.assertTrue(await uploading)

    async def test_a_reconnect_during_a_load_records_nothing(self):
        uploading = asyncio.create_task(
            self.transport.upload_slot(0, 100, build_frame("queue", "a"), lambda: True)
        )
        await self.wait_for(lambda: self.transport.slot_pending is not None)
        self.transport.slot_epoch += 1
        self.event("slot,0,100,0")
        self.assertFalse(await uploading)
        self.assertEqual(self.transport.slots, {})

    async def test_a_shown_slot_becomes_the_base_and_is_left_alone_while_it_settles(self):
        frame = build_frame("queue", "a")
        self.assertTrue(await self.load(3, 100, frame))
        showing = asyncio.create_task(self.transport.show_slot(3, 9))
        await self.wait_for(lambda: self.calls("show_slot"))
        self.assertEqual(self.calls("show_slot")[0].args[1], {"slot": 3, "touch_id": 9})
        self.event("frame,100,9,0,0,0,40")
        await showing
        self.assertEqual(
            (self.transport.base_id, self.transport.base_pixels), (100, frame["pixels"])
        )
        self.assertEqual(self.transport.last_delivery["view"], "queue")
        # The slot keeps its content after it is shown.
        self.assertEqual(self.transport.find_slot("queue", "a"), 3)
        self.assertEqual(self.transport.deferred_slots(), {3})

        # The next live frame is a patch on the slot's frame, and it ends the deferral.
        self.transport.api.execute_service.reset_mock()
        changed = bytearray(frame["pixels"])
        changed[0:2] = b"\x00\x00"
        sending = asyncio.create_task(self.transport.send_frame(101, 10, bytes(changed)))
        await self.wait_for(lambda: self.calls("frame_chunk"))
        self.event("frame,101,10,0,0,10,20")
        await sending
        header, _ = packet_of(self.calls("frame_chunk"))
        self.assertEqual(header[0], 100)
        self.assertEqual(self.transport.deferred_slots(), frozenset())

    async def test_slot_events_are_read_from_their_own_entity(self):
        self.transport.slot_event_key = 8
        uploading = asyncio.create_task(
            self.transport.upload_slot(0, 100, build_frame("queue", "a"), lambda: True)
        )
        await self.wait_for(lambda: self.transport.slot_pending is not None)
        self.transport.native_state(TextSensorState(key=8, state="slot,0,100,0"))
        self.assertTrue(await uploading)
        self.assertEqual(self.transport.find_slot("queue", "a"), 0)

    async def test_an_unconfirmed_slot_is_never_shown(self):
        uploading = asyncio.create_task(
            self.transport.upload_slot(0, 100, build_frame("queue", "a"), lambda: True)
        )
        await self.wait_for(lambda: self.transport.slot_pending is not None)
        self.assertIsNone(self.transport.find_slot("queue", "a"))
        uploading.cancel()
        await asyncio.gather(uploading, return_exceptions=True)
        self.assertIsNone(self.transport.find_slot("queue", "a"))

    async def test_a_lost_show_acknowledgement_is_asked_for_again(self):
        self.assertTrue(await self.load(3, 100, build_frame("queue", "a")))
        showing = asyncio.create_task(self.transport.show_slot(3, 9))
        await self.wait_for(lambda: len(self.calls("show_slot")) == 2)
        self.event("frame,100,9,0,0,0,40")
        await showing
        self.assertEqual(self.transport.base_id, 100)

    async def test_an_unavailable_slot_changes_nothing_and_is_forgotten(self):
        self.transport.base_id, self.transport.base_pixels = 55, solid(5)
        self.assertTrue(await self.load(3, 100, build_frame("queue", "a")))
        showing = asyncio.create_task(self.transport.show_slot(3, 9))
        await self.wait_for(lambda: self.calls("show_slot"))
        self.event("error,slot_unavailable")
        with self.assertRaises(SlotUnavailableError):
            await showing
        self.assertEqual((self.transport.base_id, self.transport.base_pixels), (55, solid(5)))
        self.assertNotIn(3, self.transport.slots)
        with self.assertRaises(SlotUnavailableError):
            await self.transport.show_slot(3, 10)

    async def test_a_live_frame_superseded_between_chunks_keeps_the_base(self):
        self.transport.base_id, self.transport.base_pixels = 55, solid(5)
        noisy = NOISE
        gate = asyncio.Event()

        async def slow(*_):
            await gate.wait()

        self.transport.api.execute_service = AsyncMock(side_effect=slow)
        sending = asyncio.create_task(self.transport.send_frame(101, 10, noisy))
        await self.wait_for(lambda: self.transport.api.execute_service.await_count == 1)
        self.transport.supersede_live()
        gate.set()
        with self.assertRaises(FrameSupersededError):
            await sending
        self.assertEqual(self.transport.api.execute_service.await_count, 1)
        self.assertEqual((self.transport.base_id, self.transport.base_pixels), (55, solid(5)))

    async def test_a_live_frame_superseded_after_its_last_chunk_is_the_base(self):
        raw = solid(9)
        sending = asyncio.create_task(self.transport.send_frame(101, 10, raw))
        await self.wait_for(
            lambda: self.transport.pending is not None and self.calls("frame_chunk")
        )
        await asyncio.sleep(0.01)
        self.transport.supersede_live()
        with self.assertRaises(FrameSupersededError):
            await sending
        self.assertEqual((self.transport.base_id, self.transport.base_pixels), (101, raw))


class PlanSlotsTests(unittest.TestCase):
    def test_nearest_destinations_take_free_slots_first(self):
        frames = [build_frame(view, "a") for view in ("queue", "calendar", "now-playing")]
        self.assertEqual(
            [(slot, frame["view"]) for slot, frame in plan_slots({}, frames, 2)],
            [(0, "queue"), (1, "calendar")],
        )

    def test_a_changed_key_patches_the_slot_that_view_already_has(self):
        slots = {4: {"view": "queue", "key": "a"}, 0: {"view": "calendar", "key": "a"}}
        frames = [build_frame("queue", "b"), build_frame("calendar", "a")]
        self.assertEqual(
            [(slot, frame["key"]) for slot, frame in plan_slots(slots, frames, 6)], [(4, "b")]
        )

    def test_a_view_no_longer_wanted_gives_its_slot_up_last(self):
        slots = {index: {"view": f"old-{index}", "key": "a"} for index in range(2)}
        slots[1] = {"view": "queue", "key": "a"}
        frames = [build_frame("queue", "a"), build_frame("calendar", "a")]
        self.assertEqual(
            [(slot, frame["view"]) for slot, frame in plan_slots(slots, frames, 2)],
            [(0, "calendar")],
        )

    def test_the_slot_just_shown_is_not_rewritten_while_it_settles(self):
        views = ["a", "b", "c", "d", "e", "f"]
        slots = {slot: {"view": view, "key": "1"} for slot, view in enumerate(views[:5])}
        slots[5] = {"view": "shown", "key": "1"}
        frames = [build_frame(view, "1") for view in views]
        self.assertEqual([slot for slot, _ in plan_slots(slots, frames, 6)], [5])
        self.assertEqual(plan_slots(slots, frames, 6, frozenset({5})), [])

    def test_every_fresh_slot_plans_nothing(self):
        slots = {0: {"view": "queue", "key": "a"}}
        self.assertEqual(plan_slots(slots, [build_frame("queue", "a")], 6), [])


class FakeResponse:
    def __init__(self, url, status, document):
        self.url, self.status, self.document = url, status, document
        self.ok = 200 <= status < 300
        self.is_disposed = False

    async def json(self):
        return self.document

    async def dispose(self):
        self.is_disposed = True


class StreamFrameFeedTests(unittest.IsolatedAsyncioTestCase):
    INDEX = "http://castkit.test/d/panel/stream-frames"

    def build_feed(self, routes):
        responses = []

        async def get(url, timeout):
            status, document = routes[url]
            response = FakeResponse(url, status, document)
            responses.append(response)
            return response

        feed = StreamFrameFeed(types.SimpleNamespace(get=get), self.INDEX, lambda png: b"px:" + png)
        return feed, responses

    def frame_document(self, view, key):
        return 200, {
            "key": key,
            "view": view,
            "targets": [],
            "png": base64.b64encode(f"{view}-{key}".encode()).decode(),
        }

    async def test_an_index_fetches_only_changed_frames_and_disposes_every_response(self):
        routes = {
            "http://castkit.test/d/panel/stream-frame/queue": self.frame_document("queue", "a"),
            "http://castkit.test/d/panel/stream-frame/calendar": self.frame_document(
                "calendar", "a"
            ),
        }
        feed, responses = self.build_feed(routes)
        await feed.apply_index(
            {
                "tag": "t1",
                "frames": [{"view": "queue", "key": "a"}, {"view": "calendar", "key": "a"}],
            }
        )
        self.assertEqual(feed.version, 1)
        self.assertEqual(feed.read("queue")["pixels"], b"px:queue-a")
        self.assertEqual([frame["view"] for frame in feed.ordered()], ["queue", "calendar"])
        count = len(responses)
        await feed.apply_index({"tag": "t2", "frames": [{"view": "queue", "key": "a"}]})
        self.assertEqual(len(responses), count)
        self.assertEqual(feed.version, 2)
        self.assertIsNone(feed.read("calendar"))
        self.assertTrue(all(response.is_disposed for response in responses))

    async def test_a_frame_drawn_again_since_the_index_is_skipped(self):
        routes = {
            "http://castkit.test/d/panel/stream-frame/queue": self.frame_document("queue", "b")
        }
        feed, _ = self.build_feed(routes)
        await feed.apply_index({"tag": "t1", "frames": [{"view": "queue", "key": "a"}]})
        self.assertIsNone(feed.read("queue"))
        self.assertEqual(feed.version, 0)

    async def test_a_server_without_frames_ahead_is_not_asked_again_soon(self):
        feed, responses = self.build_feed({self.INDEX: (404, None)})
        stop = asyncio.Event()
        running = asyncio.create_task(feed.run(stop))
        await asyncio.sleep(0.05)
        self.assertEqual(len(responses), 1)
        stop.set()
        await asyncio.wait_for(running, 1)

    def test_the_manifest_names_the_index_on_its_own_origin_only(self):
        document = {
            "version": 1,
            "viewport": {"width": 480, "height": 480},
            "page_url": "/d/panel",
            "cache": [{"id": "loading", "url": "/d/panel/loading", "on_tap": "[data-loading]"}],
        }
        url = "https://castkit.test/d/panel/castkit.json"
        viewport = {"width": 480, "height": 480}
        self.assertIsNone(parse_manifest(document, url, viewport)["stream_frames_url"])
        self.assertEqual(
            parse_manifest(
                {**document, "stream_frames_url": "/d/panel/stream-frames"}, url, viewport
            )["stream_frames_url"],
            "https://castkit.test/d/panel/stream-frames",
        )
        with self.assertRaises(ValueError):
            parse_manifest(
                {**document, "stream_frames_url": "https://elsewhere.test/x"}, url, viewport
            )


class FakeFeed:
    def __init__(self, frames):
        self.frames = {frame["view"]: frame for frame in frames}
        self.version = 0

    def read(self, view):
        return self.frames.get(view)

    def ordered(self):
        return list(self.frames.values())

    async def wait_for_change(self, version):
        await asyncio.Event().wait()


class ReleaseTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.transport = ESPHomePrestoTransport(
            {"mac": "02:00:00:00:00:01", "host": "127.0.0.1", "controls_url": "unused"},
            base64.b64encode(bytes(32)).decode(),
        )
        self.transport.control_task = asyncio.create_task(asyncio.sleep(3600))
        self.queue = build_frame("queue", "a")
        self.page = types.SimpleNamespace(evaluate=AsyncMock(return_value="queue"))
        self.session = DisplaySession(
            {"viewport": {"width": 480, "height": 480}},
            self.page,
            self.transport,
            {},
            asyncio.Event(),
            PreviewServer("test", 8),
            feed=FakeFeed([self.queue]),
        )
        self.shown = []
        self.sent = []

        async def show_slot(slot, touch_id):
            self.shown.append(slot)
            return [
                "frame",
                str(self.transport.slots[slot]["frame_id"]),
                str(touch_id),
                "0",
                "0",
                "0",
                "1",
            ]

        async def send_frame(frame_id, touch_id, raw):
            self.sent.append(raw)
            return ["frame", str(frame_id), str(touch_id), "0", "0", "1", "1"]

        self.transport.show_slot = show_slot
        self.transport.send_frame = send_frame

    async def asyncTearDown(self):
        self.transport.control_task.cancel()
        await asyncio.gather(self.transport.control_task, return_exceptions=True)

    async def release(self):
        await self.session.release_swipe(12)
        await asyncio.gather(*self.session.release_tasks)

    async def test_a_fresh_slot_is_shown_at_release(self):
        self.transport.has_slots = True
        self.transport.slots = {4: {**self.queue, "frame_id": 300}}
        await self.release()
        self.assertEqual((self.shown, self.sent), ([4], []))
        self.assertIn(300, self.session.guard.frames)
        self.assertEqual(self.session.previous_payload, self.queue["pixels"])
        self.assertEqual(self.session.preview.latest_png, self.queue["png"])
        self.assertEqual(self.transport.last_release["path"], "slot")

    async def test_a_stale_slot_is_never_shown(self):
        self.transport.has_slots = True
        self.transport.slots = {4: {**self.queue, "key": "older", "frame_id": 300}}
        await self.release()
        self.assertEqual(self.shown, [])
        self.assertEqual(self.sent, [self.queue["pixels"]])
        self.assertEqual(self.transport.last_release["path"], "frame")

    async def test_firmware_without_slots_sends_the_frame_drawn_ahead(self):
        await self.release()
        self.assertEqual((self.shown, self.sent), ([], [self.queue["pixels"]]))
        self.assertEqual(self.session.releases_ahead, 1)

    async def test_an_unavailable_slot_falls_back_to_the_frame_drawn_ahead(self):
        self.transport.has_slots = True
        self.transport.slots = {4: {**self.queue, "frame_id": 300}}

        async def unavailable(slot, touch_id):
            raise SlotUnavailableError("empty")

        self.transport.show_slot = unavailable
        await self.release()
        self.assertEqual(self.sent, [self.queue["pixels"]])
        self.assertEqual(self.transport.last_release["path"], "frame")

    async def test_a_view_not_drawn_ahead_waits_for_the_live_capture(self):
        self.page.evaluate = AsyncMock(return_value="calendar")
        generation = self.session.release_generation
        await self.release()
        self.assertEqual((self.shown, self.sent), ([], []))
        # The release still drops frames captured before it.
        self.assertEqual(self.session.release_generation, generation + 1)

    async def test_a_frame_captured_before_the_release_is_dropped(self):
        generation = self.session.release_generation
        await self.release()
        with self.assertRaises(FrameSupersededError):
            await self.session.send_frame(solid(3), 13, [], generation=generation)
        self.assertEqual(self.sent, [self.queue["pixels"]])

    async def test_slots_load_only_on_a_quiet_panel(self):
        self.transport.has_slots = True
        loaded = []

        async def upload_slot(slot, frame_id, frame, should_continue):
            self.assertTrue(should_continue())
            loaded.append((slot, frame["view"]))
            self.transport.slots[slot] = {**frame, "frame_id": frame_id}
            return True

        self.transport.upload_slot = upload_slot
        self.session.last_live_activity = time.monotonic()
        self.session.contact = object()
        loading = asyncio.create_task(self.session.slot_loop())
        await asyncio.sleep(0.7)
        # A finger on the glass holds every load back.
        self.assertEqual(loaded, [])
        self.session.contact = None
        async with asyncio.timeout(3):
            while not loaded:
                await asyncio.sleep(0.01)
        await asyncio.sleep(0.05)
        self.assertEqual(loaded, [(0, "queue")])
        loading.cancel()
        await asyncio.gather(loading, return_exceptions=True)

    async def test_a_newer_release_wins_over_an_older_one(self):
        self.page.evaluate = AsyncMock(return_value="queue")
        await self.session.release_swipe(12)
        await self.session.release_swipe(13)
        await asyncio.gather(*self.session.release_tasks)
        self.assertEqual(len(self.sent), 1)


if __name__ == "__main__":
    unittest.main()
