#!/usr/bin/env python3
"""Regenerate icons/icon{16,48,128}.png (a white fish on a teal rounded
square). Adapted from address-quick-display's stdlib-only PNG writer:

    python3 scripts/generate-icons.py
"""
import os
import struct
import zlib

TEAL = (15, 118, 110)   # background (#0f766e)
WHITE = (255, 255, 255)
SIZES = (16, 48, 128)
SUPERSAMPLE = 4  # subpixel grid per axis for antialiasing


def rounded_rect_dist(x, y, half, radius):
    """Signed distance to a rounded square centered at origin (negative inside)."""
    qx = abs(x) - (half - radius)
    qy = abs(y) - (half - radius)
    outside = (max(qx, 0.0) ** 2 + max(qy, 0.0) ** 2) ** 0.5
    return outside + min(max(qx, qy), 0.0) - radius


def in_triangle(px, py, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

    d1, d2, d3 = sign((px, py), a, b), sign((px, py), b, c), sign((px, py), c, a)
    has_neg = d1 < 0 or d2 < 0 or d3 < 0
    has_pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (has_neg and has_pos)


def sample(x, y):
    """Color + alpha at a point in the 128x128 design grid."""
    if rounded_rect_dist(x - 64, y - 64, 62, 24) > 0:
        return (0, 0, 0, 0)
    # Fish: elliptical body + tail triangle, with a hole punched for the eye.
    body = ((x - 56) / 36) ** 2 + ((y - 64) / 22) ** 2 <= 1
    tail = in_triangle(x, y, (82, 64), (110, 42), (110, 86))
    eye = (x - 38) ** 2 + (y - 58) ** 2 <= 5 ** 2
    if (body or tail) and not eye:
        return (*WHITE, 255)
    return (*TEAL, 255)


def render(size):
    rows = []
    step = 128 / size / SUPERSAMPLE
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SUPERSAMPLE):
                for sx in range(SUPERSAMPLE):
                    x = (px * SUPERSAMPLE + sx + 0.5) * step
                    y = (py * SUPERSAMPLE + sy + 0.5) * step
                    cr, cg, cb, ca = sample(x, y)
                    r, g, b, a = r + cr * ca, g + cg * ca, b + cb * ca, a + ca
            n = SUPERSAMPLE * SUPERSAMPLE
            if a:
                row += bytes((round(r / a), round(g / a), round(b / a), round(a / n)))
            else:
                row += b"\x00\x00\x00\x00"
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    def chunk(tag, data):
        payload = tag + data
        return struct.pack(">I", len(data)) + payload + struct.pack(">I", zlib.crc32(payload))

    raw = b"".join(b"\x00" + row for row in rows)  # filter type 0 per scanline
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    with open(path, "wb") as fh:
        fh.write(b"\x89PNG\r\n\x1a\n")
        fh.write(chunk(b"IHDR", ihdr))
        fh.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        fh.write(chunk(b"IEND", b""))


def main():
    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
    os.makedirs(out_dir, exist_ok=True)
    for size in SIZES:
        path = os.path.join(out_dir, f"icon{size}.png")
        write_png(path, size, render(size))
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
