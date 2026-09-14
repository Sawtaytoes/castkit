import io
import unittest
import zlib
from PIL import Image
from codec import encode_frame


class CodecTests(unittest.TestCase):
    def test_rgb565_exact_color_and_size(self):
        image = Image.new('RGB', (480,320), 'black')
        for index, color in enumerate([(255,0,0),(0,255,0),(0,0,255),(255,255,255)]):
            image.putpixel((index,0),color)
        source = io.BytesIO()
        image.save(source,format='PNG')
        decoded = zlib.decompress(encode_frame(source.getvalue()))
        self.assertEqual(len(decoded),480*320*2)
        self.assertEqual(decoded[:8],bytes.fromhex('f80007e0001fffff'))
        self.assertEqual(decoded[8:],bytes(len(decoded)-8))

    def test_wrong_dimensions_fail_before_transmission(self):
        source = io.BytesIO()
        Image.new('RGB',(320,480)).save(source,format='PNG')
        with self.assertRaises(ValueError):
            encode_frame(source.getvalue())
