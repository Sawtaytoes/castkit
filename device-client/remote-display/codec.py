"""Convert a browser PNG into the WT32's exact big-endian RGB565 pixels."""
import io
import zlib
import numpy as np
from PIL import Image


def encode_frame(png):
    image = Image.open(io.BytesIO(png)).convert('RGB')
    if image.size != (480, 320):
        raise ValueError('The WT32 frame must be 480 by 320 pixels')
    rgb = np.asarray(image, dtype=np.uint16)
    pixels = ((rgb[:, :, 0] >> 3) << 11) | ((rgb[:, :, 1] >> 2) << 5) | (rgb[:, :, 2] >> 3)
    return zlib.compress(pixels.astype('>u2').tobytes(), 6)
