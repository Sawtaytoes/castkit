import asyncio
import io
import unittest

from aiohttp.test_utils import AioHTTPTestCase
from PIL import Image

from preview import BOUNDARY, PreviewServer, encode_jpeg, validate_preview_port

MARKER = 'castkit-remote-display-test'


def png_bytes(color):
    buffer = io.BytesIO()
    Image.new('RGB', (480, 320), color).save(buffer, format='PNG')
    return buffer.getvalue()


RED_FRAME = png_bytes((255, 0, 0))
BLUE_FRAME = png_bytes((0, 0, 255))


class PortValidationTests(unittest.TestCase):
    def test_absent_port_disables_the_server(self):
        self.assertIsNone(validate_preview_port(None))
        self.assertFalse(PreviewServer(MARKER, 10).is_enabled)

    def test_valid_port_is_accepted(self):
        self.assertEqual(validate_preview_port(8790), 8790)
        self.assertTrue(PreviewServer(MARKER, 10, 8790).is_enabled)

    def test_invalid_ports_are_rejected(self):
        for port in (0, 65536, -1, '8790', 8790.0, True):
            with self.subTest(port=port), self.assertRaises(ValueError):
                validate_preview_port(port)


class FrameBookkeepingTests(unittest.IsolatedAsyncioTestCase):
    async def test_identical_frames_do_not_bump_the_sequence(self):
        server = PreviewServer(MARKER, 10, 8790)
        server.set_frame(RED_FRAME)
        self.assertEqual(server.sequence, 1)
        server.set_frame(RED_FRAME)
        self.assertEqual(server.sequence, 1, 'a repeated frame must not wake viewers')
        server.set_frame(BLUE_FRAME)
        self.assertEqual(server.sequence, 2)

    async def test_a_repeated_frame_still_records_the_capture(self):
        server = PreviewServer(MARKER, 10, 8790)
        server.set_frame(RED_FRAME)
        changed = server.changed_monotonic
        await asyncio.sleep(0.01)
        server.set_frame(RED_FRAME)
        self.assertEqual(server.changed_monotonic, changed)
        self.assertGreater(server.captured_monotonic, changed)

    async def test_wait_for_change_returns_when_the_frame_changes(self):
        server = PreviewServer(MARKER, 10, 8790)
        server.set_frame(RED_FRAME)
        waiter = asyncio.create_task(server.wait_for_change(server.sequence, timeout=5))
        await asyncio.sleep(0)
        self.assertFalse(waiter.done())
        server.set_frame(BLUE_FRAME)
        await asyncio.wait_for(waiter, timeout=1)

    async def test_wait_for_change_returns_at_once_on_a_stale_sequence(self):
        server = PreviewServer(MARKER, 10, 8790)
        server.set_frame(RED_FRAME)
        await asyncio.wait_for(server.wait_for_change(-1, timeout=5), timeout=1)


class EncodeJpegTests(unittest.TestCase):
    def test_a_png_becomes_a_jpeg_of_the_same_size(self):
        jpeg = encode_jpeg(RED_FRAME)
        self.assertEqual(jpeg[:2], b'\xff\xd8', 'JPEG start-of-image marker')
        self.assertEqual(Image.open(io.BytesIO(jpeg)).size, (480, 320))


class PreviewRouteTests(AioHTTPTestCase):
    async def get_application(self):
        self.preview = PreviewServer(MARKER, 10, 8790)
        return self.preview.build_application()

    async def test_health_reports_the_build_marker(self):
        body = await (await self.client.get('/healthz')).json()
        self.assertEqual(body['build'], MARKER)
        self.assertEqual(body['viewers'], 0)
        self.assertIsNone(body['frameAgeSeconds'])

    async def test_the_still_is_unavailable_before_the_first_frame(self):
        self.assertEqual((await self.client.get('/screen.jpg')).status, 503)

    async def test_the_still_returns_the_latest_frame_as_jpeg(self):
        self.preview.set_frame(RED_FRAME)
        response = await self.client.get('/screen.jpg')
        self.assertEqual(response.status, 200)
        self.assertEqual(response.content_type, 'image/jpeg')
        self.assertEqual(Image.open(io.BytesIO(await response.read())).size, (480, 320))

    async def test_the_stream_sends_each_new_frame_and_counts_its_viewer(self):
        self.preview.set_frame(RED_FRAME)
        response = await self.client.get('/screen.mjpeg')
        self.assertEqual(response.status, 200)
        self.assertIn(f'boundary={BOUNDARY}', response.headers['Content-Type'])

        async def read_one_part():
            await response.content.readuntil(f'--{BOUNDARY}\r\n'.encode('ascii'))
            headers = await response.content.readuntil(b'\r\n\r\n')
            length = int(headers.decode('ascii').split('Content-Length:')[1].split('\r\n')[0])
            return await response.content.readexactly(length)

        first = await asyncio.wait_for(read_one_part(), timeout=5)
        self.assertEqual(Image.open(io.BytesIO(first)).convert('RGB').getpixel((1, 1))[0], 254, 'red frame')
        self.assertEqual((await (await self.client.get('/healthz')).json())['viewers'], 1)

        self.preview.set_frame(BLUE_FRAME)
        second = await asyncio.wait_for(read_one_part(), timeout=5)
        self.assertEqual(Image.open(io.BytesIO(second)).convert('RGB').getpixel((1, 1))[2], 254, 'blue frame')

        response.close()
        await asyncio.sleep(0.1)
        self.assertEqual((await (await self.client.get('/healthz')).json())['viewers'], 0,
                         'the viewer count must fall back to zero when the client disconnects')


if __name__ == '__main__':
    unittest.main()
