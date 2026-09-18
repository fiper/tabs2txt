#!/usr/bin/env python3
"""Generate the extension icons from code so the assets stay reproducible.

Usage:  python3 tools/make-icons.py
Output: src/icons/icon-{16,32,48,96,128}.png

Design: a graphite plate holding a short list of lines (the saved link list)
with a viridian mark on the last line (the file that was just written).
"""

import os

from PIL import Image, ImageDraw

INK = (34, 38, 45, 255)
PAPER = (246, 247, 249, 255)
VIRIDIAN = (26, 127, 100, 255)

S = 512  # master canvas, downscaled with LANCZOS
SIZES = (16, 32, 48, 96, 128)
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "icons")


def master() -> Image.Image:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Plate
    d.rounded_rectangle([24, 24, S - 24, S - 24], radius=96, fill=INK)

    # Link lines: three full-width rules and one short one.
    x0, x1 = 112, S - 112
    bar_h, gap = 46, 46
    y = 140
    for i in range(3):
        d.rounded_rectangle([x0, y, x1, y + bar_h], radius=bar_h // 2, fill=PAPER)
        y += bar_h + gap

    # Last line: shorter and viridian — the newest entry.
    d.rounded_rectangle(
        [x0, y, x0 + (x1 - x0) * 0.45, y + bar_h], radius=bar_h // 2, fill=VIRIDIAN
    )
    return img


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    base = master()
    for size in SIZES:
        icon = base.resize((size, size), Image.LANCZOS)
        icon.save(os.path.join(OUT_DIR, f"icon-{size}.png"), optimize=True)
        print(f"wrote icon-{size}.png")


if __name__ == "__main__":
    main()
