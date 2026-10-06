import io
import unittest
import zlib

from codec import encode_frame, encode_presto_frame
from PIL import Image


class CodecTests(unittest.TestCase):
    def test_presto_matches_little_endian_framebuffer_and_exact_pixel_count(self):
        image = Image.new("RGB", (480, 480), "black")
        for index, color in enumerate([(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 255)]):
            image.putpixel((index, 0), color)
        source = io.BytesIO()
        image.save(source, format="PNG")
        decoded = zlib.decompress(encode_presto_frame(source.getvalue()))
        self.assertEqual(len(decoded), 480 * 480 * 2)
        self.assertEqual(decoded[:8], bytes.fromhex("00f8e0071f00ffff"))
        self.assertEqual(decoded[8:], bytes(len(decoded) - 8))

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
