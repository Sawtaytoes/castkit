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
    return encode_presto_image(image)


def encode_presto_image(image):
    return zlib.compress(presto_image_pixels(image), 6)


def presto_frame_pixels(png):
    """Return the exact framebuffer without an intermediate compressed carrier."""
    return presto_image_pixels(Image.open(io.BytesIO(png)).convert("RGB"))


def presto_image_pixels(image):
    if image.size != (480, 480):
        raise ValueError("The Presto frame must be 480 by 480 pixels")
    return presto_rows_pixels(np.asarray(image))


def presto_frame_pixels_and_rgb(png):
    """The exact framebuffer and the RGB it was quantized from, from one PNG decode."""
    image = Image.open(io.BytesIO(png)).convert("RGB")
    rgb = np.asarray(image)
    if image.size != (480, 480):
        raise ValueError("The Presto frame must be 480 by 480 pixels")
    return presto_rows_pixels(rgb), rgb


def presto_rows_pixels(rgb):
    """Quantize RGB rows 480 pixels wide, any number of them, as the Presto shows them.

    Row 0 sits on the dither grid's row 0. A 480 x 480 frame is exactly the panel; a taller
    picture keeps the same grid down its whole height, so a part of it moved by a multiple
    of 8 rows quantizes exactly as the panel's own rows there would.
    """
    height, width = rgb.shape[:2]
    if width != 480 or not height:
        raise ValueError("Presto rows must be 480 pixels wide")
    # The tile mask works on whole 8 x 8 tiles; repeat the last row into the missing ones.
    padded = -(-height // 8) * 8
    rgb = np.asarray(rgb, dtype=np.uint16)
    if padded != height:
        rgb = np.concatenate([rgb, np.repeat(rgb[-1:], padded - height, axis=0)])
    # Ordered quantization softens gradients at the panel's 5/6/5-bit limit.
    # Anchor to screen coordinates so unchanged art never shimmers across patches.
    bayer = np.array(
        [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.uint16
    )
    threshold = np.tile(bayer, (padded // 4, 120))[:, :, None] * 16 + 8
    levels = np.array([31, 63, 31], dtype=np.uint16)
    quantized = (rgb * levels + threshold) // 255
    quantized = np.minimum(quantized, levels)
    # Flat UI fills need no spatial noise. Dither varying tiles (art/gradients)
    # while preserving solid tiles' long runs and cheap progress patches.
    tiles = rgb.reshape(padded // 8, 8, 60, 8, 3)
    varying = np.any(tiles.max(axis=(1, 3)) != tiles.min(axis=(1, 3)), axis=2)
    mask = varying.repeat(8, axis=0).repeat(8, axis=1)[:, :, None]
    quantized = np.where(mask, quantized, rgb >> np.array([3, 2, 3], dtype=np.uint16))
    pixels = (quantized[:, :, 0] << 11) | (quantized[:, :, 1] << 5) | quantized[:, :, 2]
    return pixels[:height].astype(">u2").tobytes()


def encode_presto_frame_with_palette(png, bounds):
    """Reuse the frame's PNG decode when ambient artwork colors are requested."""
    pixels, colors = presto_frame_pixels_with_palette(png, bounds)
    return zlib.compress(pixels, 6), colors


def presto_frame_pixels_with_palette(png, bounds):
    """Extract artwork colors and exact framebuffer pixels from one PNG decode."""
    from ambient_light import palette

    image = Image.open(io.BytesIO(png)).convert("RGB")
    return presto_image_pixels(image), palette(image, bounds)


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


def union_rectangle(first, second):
    """The smallest (x, y, width, height) that covers both; None counts as empty."""
    if first is None or second is None:
        return first or second
    left, top = min(first[0], second[0]), min(first[1], second[1])
    right = max(first[0] + first[2], second[0] + second[2])
    bottom = max(first[1] + first[3], second[1] + second[3])
    return (left, top, right - left, bottom - top)


def encode_presto_patch(raw, previous=None, include=None, height=480):
    """Choose a lossless patch relative to the last acknowledged frame.

    `include` is a rectangle the patch must cover even where the pixels did not
    change: the board's pixels there only approximate `previous` after a JPEG.
    `height` is for a picture taller than the panel (the scroll picture).
    """
    if len(raw) != 480 * height * 2:
        raise ValueError(f"The Presto picture must contain exactly 480x{height} RGB565 pixels")
    pixels = np.frombuffer(raw, dtype="<u2").reshape(height, 480)
    rectangle = (0, 0, 480, height)
    if previous is not None:
        changed = pixels != np.frombuffer(previous, dtype="<u2").reshape(height, 480)
        rows, columns = np.nonzero(changed)
        changed_rectangle = None
        if len(rows):
            x, y = int(columns.min()), int(rows.min())
            changed_rectangle = (x, y, int(columns.max()) + 1 - x, int(rows.max()) + 1 - y)
        rectangle = union_rectangle(changed_rectangle, include) or (0, 0, 1, 1)
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


# A motion frame lives a fraction of a second, so it can trade exact pixels for
# bytes; the board's link carries most of a frame's time. Rectangles snap to the
# 16-pixel MCU grid so a 4:2:0 JPEG never has a partial block at its edge.
MOTION_JPEG_QUALITY = 75
MOTION_JPEG_GRID = 16
# The firmware refuses a larger JPEG body (`error,jpeg_too_large`).
MOTION_JPEG_MAX_BYTES = 128 * 1024


def motion_jpeg_rectangle(rectangle):
    x, y, width, height = rectangle
    left = x - x % MOTION_JPEG_GRID
    top = y - y % MOTION_JPEG_GRID
    right = min(480, -(-(x + width) // MOTION_JPEG_GRID) * MOTION_JPEG_GRID)
    bottom = min(480, -(-(y + height) // MOTION_JPEG_GRID) * MOTION_JPEG_GRID)
    return (left, top, right - left, bottom - top)


def encode_presto_jpeg(raw, rectangle):
    """Baseline JPEG of `rectangle` of a big-endian RGB565 Presto frame."""
    x, y, width, height = rectangle
    pixels = np.frombuffer(raw, dtype=">u2").reshape(480, 480)[y : y + height, x : x + width]
    red, green, blue = (pixels >> 11) & 31, (pixels >> 5) & 63, pixels & 31
    rgb = np.stack(
        [(red << 3) | (red >> 2), (green << 2) | (green >> 4), (blue << 3) | (blue >> 2)],
        axis=2,
    ).astype(np.uint8)
    buffer = io.BytesIO()
    Image.fromarray(rgb, "RGB").save(
        buffer, format="JPEG", quality=MOTION_JPEG_QUALITY, subsampling=2, progressive=False
    )
    return buffer.getvalue()
