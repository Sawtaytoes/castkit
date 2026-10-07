"""Bounded native copies for RGB565 patches; pixel bytes stay unchanged."""

# Viper needs explicit casts: len() returns an object to its native compiler.
# ruff: noqa: RUF046

import micropython


@micropython.viper
def decode_rle(source, destination, pixels: int) -> int:
    src = ptr16(source)  # noqa: F821 -- MicroPython Viper pointer type
    dst = ptr16(destination)  # noqa: F821
    words = int(len(source)) // 2
    capacity = int(len(destination)) // 2
    if pixels < 0 or pixels > capacity or int(len(source)) & 1:
        return -1
    read = 0
    written = 0
    while read < words:
        control = int(src[read])
        read += 1
        count = (control & 32767) + 1
        if written + count > pixels:
            return -1
        if control & 32768:
            if read >= words:
                return -1
            color = src[read]
            read += 1
            for index in range(count):
                dst[written + index] = color
        else:
            if read + count > words:
                return -1
            for index in range(count):
                dst[written + index] = src[read + index]
            read += count
        written += count
    return written if written == pixels else -1


@micropython.viper
def blit_patch(source, destination, x: int, y: int, width: int, height: int) -> int:
    if x < 0 or y < 0 or width < 1 or height < 1 or x + width > 480 or y + height > 480:
        return -1
    if int(len(source)) != width * height * 2 or int(len(destination)) != 480 * 480 * 2:
        return -1
    src = ptr16(source)  # noqa: F821
    dst = ptr16(destination)  # noqa: F821
    for row in range(height):
        offset = (y + row) * 480 + x
        for column in range(width):
            dst[offset + column] = src[row * width + column]
    return 0
