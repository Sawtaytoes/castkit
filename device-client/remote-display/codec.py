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
    """Match PicoGraphics' byte-swapped RGB565 back buffer.

    Inflate into the framebuffer directly instead of asking PNGdec to convert
    and paint every pixel. The panel still receives a complete atomic frame.
    """
    image = Image.open(io.BytesIO(png)).convert("RGB")
    if image.size != (480, 480):
        raise ValueError("The Presto frame must be 480 by 480 pixels")
    rgb = np.asarray(image, dtype=np.uint16)
    # Ordered quantization softens gradients at the panel's 5/6/5-bit limit.
    # Anchor to screen coordinates so unchanged art never shimmers across patches.
    bayer = np.array(
        [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.uint16
    )
    threshold = np.tile(bayer, (120, 120))[:, :, None] * 16 + 8
    levels = np.array([31, 63, 31], dtype=np.uint16)
    quantized = (rgb * levels + threshold) // 255
    quantized = np.minimum(quantized, levels)
    # Flat UI fills need no spatial noise. Dither varying tiles (art/gradients)
    # while preserving solid tiles' long runs and cheap progress patches.
    tiles = rgb.reshape(60, 8, 60, 8, 3)
    varying = np.any(tiles.max(axis=(1, 3)) != tiles.min(axis=(1, 3)), axis=2)
    mask = varying.repeat(8, axis=0).repeat(8, axis=1)[:, :, None]
    quantized = np.where(mask, quantized, rgb >> np.array([3, 2, 3], dtype=np.uint16))
    pixels = (quantized[:, :, 0] << 11) | (quantized[:, :, 1] << 5) | quantized[:, :, 2]
    return zlib.compress(pixels.astype(">u2").tobytes(), 6)


def encode_rle(raw):
    """Little-endian run controls followed by unchanged RGB565 pixel bytes."""
    pixels = np.frombuffer(raw, dtype="<u2")
    starts = np.concatenate(([0], np.flatnonzero(pixels[1:] != pixels[:-1]) + 1, [len(pixels)]))
    lengths = np.diff(starts)
    output = bytearray()
    cursor = 0

    def literal(start, end):
        for offset in range(start, end, 32768):
            stop = min(end, offset + 32768)
            output.extend((stop - offset - 1).to_bytes(2, "little"))
            output.extend(raw[offset * 2 : stop * 2])

    for index in np.flatnonzero(lengths >= 3):
        start, count = int(starts[index]), int(lengths[index])
        literal(cursor, start)
        while count:
            size = min(count, 32768)
            output.extend((32768 | (size - 1)).to_bytes(2, "little"))
            output.extend(raw[start * 2 : start * 2 + 2])
            count -= size
        cursor = start + int(lengths[index])
    literal(cursor, len(pixels))
    return bytes(output)


def encode_presto_patch(raw, previous=None):
    """Choose a lossless patch relative to the last acknowledged frame."""
    if len(raw) != 480 * 480 * 2:
        raise ValueError("The Presto frame must contain exactly 480x480 RGB565 pixels")
    pixels = np.frombuffer(raw, dtype="<u2").reshape(480, 480)
    rectangle = (0, 0, 480, 480)
    if previous is not None:
        changed = pixels != np.frombuffer(previous, dtype="<u2").reshape(480, 480)
        rows, columns = np.nonzero(changed)
        if len(rows):
            x, y = int(columns.min()), int(rows.min())
            rectangle = (x, y, int(columns.max()) + 1 - x, int(rows.max()) + 1 - y)
        else:
            rectangle = (0, 0, 1, 1)
    x, y, width, height = rectangle
    patch = pixels[y : y + height, x : x + width].tobytes()
    compressed, rle = zlib.compress(patch, 6), encode_rle(patch)
    # Extra network bytes must earn their cost by avoiding the slow DEFLATE
    # decoder. Small UI patches nearly always use the bounded native RLE copy.
    return (
        (rle, "rle", rectangle)
        if len(rle) <= len(compressed) + min(24000, len(patch) // 10)
        else (compressed, "zlib", rectangle)
    )
