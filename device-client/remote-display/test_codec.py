import hashlib
import io
import unittest
import zlib

from codec import encode_frame, encode_presto_frame, presto_frame_pixels
from PIL import Image


class CodecTests(unittest.TestCase):
    def test_raw_handoff_preserves_all_prior_dithered_and_flat_tile_pixels(self):
        image = Image.frombytes(
            "RGB",
            (480, 480),
            bytes((column * 17 + row * 31) % 256 for row in range(480) for column in range(1440)),
        )
        image.paste((20, 20, 20), (8, 8, 16, 16))
        image.putpixel((16, 16), (21, 21, 21))
        source = io.BytesIO()
        image.save(source, format="PNG")
        raw = presto_frame_pixels(source.getvalue())
        self.assertEqual(len(raw), 460800)
        # Frozen from the compressed-carrier encoder before the raw handoff.
        self.assertEqual(
            hashlib.sha256(raw).hexdigest(),
            "2c82ed44e7f2bfcf67eade69b24125980c9818dcc068f4d65a6e4a9383c75c0b",
        )
        self.assertEqual(zlib.decompress(encode_presto_frame(source.getvalue())), raw)

    def test_presto_matches_measured_framebuffer_and_exact_pixel_count(self):
        image = Image.new("RGB", (480, 480), "black")
        for index, color in enumerate([(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)]):
            image.putpixel((index, 0), color)
        source = io.BytesIO()
        image.save(source, format="PNG")
        decoded = zlib.decompress(encode_presto_frame(source.getvalue()))
        self.assertEqual(len(decoded), 480 * 480 * 2)
        # Presto v2.0.0: create_pen + pixel + memoryview yields these bytes.
        self.assertEqual(decoded[:8], bytes.fromhex("f80007e0001fffff"))
        self.assertEqual(decoded[8:], bytes(len(decoded) - 8))

    def test_presto_dither_is_stable_and_distributes_gray_between_adjacent_levels(self):
        source = io.BytesIO()
        image = Image.new("RGB", (480, 480), (20, 20, 20))
        image.putpixel((0, 0), (21, 21, 21))
        image.save(source, format="PNG")
        first = encode_presto_frame(source.getvalue())
        self.assertEqual(first, encode_presto_frame(source.getvalue()))
        raw = zlib.decompress(first)
        red_levels = {
            int.from_bytes(raw[offset : offset + 2], "big") >> 11 for offset in range(0, 32, 2)
        }
        self.assertEqual(red_levels, {2, 3})

    def test_rgb565_exact_color_and_size(self):
        image = Image.new("RGB", (480, 320), "black")
        for index, color in enumerate([(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)]):
            image.putpixel((index, 0), color)
        source = io.BytesIO()
        image.save(source, format="PNG")
        decoded = zlib.decompress(encode_frame(source.getvalue()))
        self.assertEqual(len(decoded), 480 * 320 * 2)
        self.assertEqual(decoded[:8], bytes.fromhex("f80007e0001fffff"))
        self.assertEqual(decoded[8:], bytes(len(decoded) - 8))

    def test_wrong_dimensions_fail_before_transmission(self):
        source = io.BytesIO()
        Image.new("RGB", (320, 480)).save(source, format="PNG")
        with self.assertRaises(ValueError):
            encode_frame(source.getvalue())
