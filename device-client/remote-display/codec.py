"""Convert a browser PNG into the WT32's exact big-endian RGB565 pixels."""

import io
import zlib

import numpy as np
from PIL import Image


def encode_frame(png):
    image = Image.open(io.BytesIO(png)).convert("RGB")
    if image.size != (480, 320):
        raise ValueError("The WT32 frame must be 480 by 320 pixels")
    rgb = np.asarray(image, dtype=np.uint16)
    pixels = ((rgb[:, :, 0] >> 3) << 11) | ((rgb[:, :, 1] >> 2) << 5) | (rgb[:, :, 2] >> 3)
    return zlib.compress(pixels.astype(">u2").tobytes(), 6)


def encode_presto_frame(png):
    """Match PicoGraphics' native little-endian RGB565 back buffer.

    Inflate into the framebuffer directly instead of asking PNGdec to convert
    and paint every pixel. The panel still receives a complete atomic frame.
    """
    image = Image.open(io.BytesIO(png)).convert("RGB")
    if image.size != (480, 480):
        raise ValueError("The Presto frame must be 480 by 480 pixels")
    rgb = np.asarray(image, dtype=np.uint16)
    pixels = ((rgb[:, :, 0] >> 3) << 11) | ((rgb[:, :, 1] >> 2) << 5) | (rgb[:, :, 2] >> 3)
    return zlib.compress(pixels.astype("<u2").tobytes(), 6)
