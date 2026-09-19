"""Draw the built-in emoji sticker set as PNGs. Dev script — run by hand, never at runtime.

    python services/api/scripts/make_emoji.py

Why we draw our own instead of shipping Twemoji/Noto: those are real assets under CC-BY /
OFL, which means attribution obligations and a download step in a repo that otherwise has
neither. These are simple flat shapes we own outright, and the whole generator is Python
stdlib (`zlib`, `struct`, `math`) — no Pillow, no cairo, nothing added to
`services/api/requirements.txt`, which ships to production.

Technique: render each shape at SUPERSAMPLE x the output size with a plain inside/outside
test, then box-filter down. The downsample is what produces the antialiasing, so no shape
needs its own coverage maths.

Output: services/api/assets/emoji/<name>.png, 256x256 RGBA. The runtime only ever READS
these (see app/agent/tools/emoji_assets.py); regenerating is a deliberate act.
"""
from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

SIZE = 256
SUPERSAMPLE = 3
OUT_DIR = Path(__file__).resolve().parents[1] / "assets" / "emoji"

Color = tuple[int, int, int, int]


class Canvas:
    """An RGBA canvas at SIZE*SUPERSAMPLE, drawn with painter's-algorithm shapes."""

    def __init__(self) -> None:
        self.n = SIZE * SUPERSAMPLE
        self.px = bytearray(self.n * self.n * 4)

    # --- compositing ---------------------------------------------------------------
    def _blend(self, x: int, y: int, color: Color) -> None:
        r, g, b, a = color
        if a == 0:
            return
        i = (y * self.n + x) * 4
        if a == 255:
            self.px[i : i + 4] = bytes((r, g, b, 255))
            return
        dr, dg, db, da = self.px[i], self.px[i + 1], self.px[i + 2], self.px[i + 3]
        sa = a / 255
        out_a = sa + (da / 255) * (1 - sa)
        if out_a <= 0:
            return
        self.px[i] = round((r * sa + dr * (da / 255) * (1 - sa)) / out_a)
        self.px[i + 1] = round((g * sa + dg * (da / 255) * (1 - sa)) / out_a)
        self.px[i + 2] = round((b * sa + db * (da / 255) * (1 - sa)) / out_a)
        self.px[i + 3] = round(out_a * 255)

    def _fill(self, bbox, inside, color: Color) -> None:
        """Fill every pixel in `bbox` (units: output px) where `inside(x, y)` holds."""
        s = SUPERSAMPLE
        x0 = max(0, int(bbox[0] * s) - 1)
        y0 = max(0, int(bbox[1] * s) - 1)
        x1 = min(self.n - 1, int(math.ceil(bbox[2] * s)) + 1)
        y1 = min(self.n - 1, int(math.ceil(bbox[3] * s)) + 1)
        for py in range(y0, y1 + 1):
            y = (py + 0.5) / s
            for px_ in range(x0, x1 + 1):
                if inside((px_ + 0.5) / s, y):
                    self._blend(px_, py, color)

    # --- shapes (all coordinates in OUTPUT pixels, 0..SIZE) -------------------------
    def ellipse(self, cx, cy, rx, ry, color: Color, rot: float = 0.0) -> None:
        cos_r, sin_r = math.cos(-rot), math.sin(-rot)
        reach = max(rx, ry)

        def inside(x, y):
            dx, dy = x - cx, y - cy
            u, v = dx * cos_r - dy * sin_r, dx * sin_r + dy * cos_r
            return (u / rx) ** 2 + (v / ry) ** 2 <= 1.0

        self._fill((cx - reach, cy - reach, cx + reach, cy + reach), inside, color)

    def circle(self, cx, cy, r, color: Color) -> None:
        self.ellipse(cx, cy, r, r, color)

    def polygon(self, points, color: Color) -> None:
        xs = [p[0] for p in points]
        ys = [p[1] for p in points]

        def inside(x, y):
            # Even-odd crossing test.
            hit = False
            j = len(points) - 1
            for i, (xi, yi) in enumerate(points):
                xj, yj = points[j]
                if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                    hit = not hit
                j = i
            return hit

        self._fill((min(xs), min(ys), max(xs), max(ys)), inside, color)

    def capsule(self, x1, y1, x2, y2, width, color: Color) -> None:
        """A thick line with round caps — brows, mouths, tears, teeth."""
        r = width / 2
        dx, dy = x2 - x1, y2 - y1
        length_sq = dx * dx + dy * dy

        def inside(x, y):
            if length_sq == 0:
                t = 0.0
            else:
                t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / length_sq))
            px_, py_ = x1 + t * dx, y1 + t * dy
            return (x - px_) ** 2 + (y - py_) ** 2 <= r * r

        self._fill((min(x1, x2) - r, min(y1, y2) - r, max(x1, x2) + r, max(y1, y2) + r), inside, color)

    def curve(self, p0, p1, p2, width, color: Color, steps: int = 24) -> None:
        """A quadratic bezier, drawn as a chain of capsules. Mouths and brows."""
        prev = p0
        for i in range(1, steps + 1):
            t = i / steps
            mt = 1 - t
            point = (
                mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
                mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
            )
            self.capsule(prev[0], prev[1], point[0], point[1], width, color)
            prev = point

    def blob(self, points, color: Color, closed: bool = True) -> None:
        """A closed shape through `points` smoothed by midpoint quadratic beziers."""
        smoothed: list[tuple[float, float]] = []
        count = len(points)
        for i in range(count if closed else count - 1):
            p0 = points[i]
            p1 = points[(i + 1) % count]
            mid_prev = ((points[i - 1][0] + p0[0]) / 2, (points[i - 1][1] + p0[1]) / 2)
            mid_next = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
            for step in range(12):
                t = step / 12
                mt = 1 - t
                smoothed.append(
                    (
                        mt * mt * mid_prev[0] + 2 * mt * t * p0[0] + t * t * mid_next[0],
                        mt * mt * mid_prev[1] + 2 * mt * t * p0[1] + t * t * mid_next[1],
                    )
                )
        self.polygon(smoothed, color)

    # --- output ---------------------------------------------------------------------
    def downsample(self) -> bytes:
        s = SUPERSAMPLE
        area = s * s
        out = bytearray(SIZE * SIZE * 4)
        for y in range(SIZE):
            for x in range(SIZE):
                r = g = b = a = 0
                for sy in range(s):
                    row = ((y * s + sy) * self.n + x * s) * 4
                    for sx in range(s):
                        i = row + sx * 4
                        pa = self.px[i + 3]
                        # Premultiply before averaging, or transparent pixels drag the
                        # colour of an edge toward black.
                        r += self.px[i] * pa
                        g += self.px[i + 1] * pa
                        b += self.px[i + 2] * pa
                        a += pa
                o = (y * SIZE + x) * 4
                if a:
                    out[o] = min(255, round(r / a))
                    out[o + 1] = min(255, round(g / a))
                    out[o + 2] = min(255, round(b / a))
                out[o + 3] = round(a / area)
        return bytes(out)


def write_png(path: Path, rgba: bytes) -> None:
    raw = b"".join(b"\x00" + rgba[y * SIZE * 4 : (y + 1) * SIZE * 4] for y in range(SIZE))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


# --- palette ------------------------------------------------------------------------
YELLOW = (255, 202, 40, 255)
SKIN = (255, 183, 77, 255)
DARK = (62, 39, 35, 255)
WHITE = (255, 255, 255, 255)
RED = (229, 57, 53, 255)
ANGRY_FACE = (239, 83, 80, 255)
TEAR = (79, 195, 247, 255)
BONE = (236, 239, 241, 255)
GOLD = (255, 193, 7, 255)
ORANGE = (255, 109, 0, 255)
TONGUE = (216, 67, 53, 255)

C = 128.0  # centre
R = 108.0  # face radius


def _open_mouth(canvas: Canvas, cx, top, half_width, depth) -> None:
    """A laughing/shouting mouth: flat top, arc bottom, with teeth and tongue."""
    arc = [(cx - half_width, top)]
    for i in range(1, 24):
        t = i / 24
        arc.append((cx - half_width + 2 * half_width * t, top + depth * math.sin(math.pi * t)))
    arc.append((cx + half_width, top))
    canvas.polygon(arc, DARK)
    canvas.capsule(cx - half_width + 6, top + 7, cx + half_width - 6, top + 7, 14, WHITE)
    canvas.ellipse(cx, top + depth * 0.78, half_width * 0.44, depth * 0.24, TONGUE)


def draw_angry(canvas: Canvas) -> None:
    canvas.circle(C, C, R, ANGRY_FACE)
    canvas.capsule(66, 88, 114, 112, 18, DARK)   # brows driven down toward the nose
    canvas.capsule(190, 88, 142, 112, 18, DARK)
    canvas.circle(96, 134, 14, DARK)
    canvas.circle(160, 134, 14, DARK)
    canvas.curve((84, 194), (128, 162), (172, 194), 15, DARK)


def draw_laugh(canvas: Canvas) -> None:
    canvas.circle(C, C, R, YELLOW)
    canvas.curve((70, 118), (96, 90), (122, 118), 13, DARK)   # squeezed-shut eyes
    canvas.curve((134, 118), (160, 90), (186, 118), 13, DARK)
    _open_mouth(canvas, C, 152, 56, 60)
    canvas.capsule(40, 116, 34, 158, 17, TEAR)
    canvas.capsule(216, 116, 222, 158, 17, TEAR)


def draw_shock(canvas: Canvas) -> None:
    canvas.circle(C, C, R, YELLOW)
    canvas.curve((66, 88), (94, 74), (120, 88), 11, DARK)     # brows up
    canvas.curve((136, 88), (162, 74), (190, 88), 11, DARK)
    canvas.ellipse(96, 122, 19, 23, WHITE)
    canvas.ellipse(160, 122, 19, 23, WHITE)
    canvas.circle(96, 124, 11, DARK)
    canvas.circle(160, 124, 11, DARK)
    canvas.ellipse(C, 184, 27, 37, DARK)


def draw_heart(canvas: Canvas) -> None:
    canvas.circle(88, 100, 53, RED)
    canvas.circle(168, 100, 53, RED)
    canvas.polygon([(36, 104), (220, 104), (128, 230)], RED)


def draw_fire(canvas: Canvas) -> None:
    canvas.blob([(128, 40), (180, 88), (198, 140), (176, 200), (128, 234), (80, 200), (58, 140), (76, 88)], ORANGE)
    canvas.polygon([(128, 8), (152, 74), (104, 74)], ORANGE)
    canvas.blob([(128, 112), (162, 148), (168, 186), (128, 216), (88, 186), (94, 148)], GOLD)
    canvas.blob([(128, 158), (148, 186), (128, 210), (108, 186)], (255, 241, 118, 255))


def draw_skull(canvas: Canvas) -> None:
    canvas.circle(C, 112, 84, BONE)
    canvas.ellipse(C, 192, 44, 34, BONE)
    canvas.ellipse(98, 114, 25, 29, DARK)
    canvas.ellipse(158, 114, 25, 29, DARK)
    canvas.polygon([(128, 146), (140, 172), (116, 172)], DARK)
    for x in (108, 128, 148):
        canvas.capsule(x, 180, x, 210, 7, DARK)


def draw_cool(canvas: Canvas) -> None:
    canvas.circle(C, C, R, YELLOW)
    canvas.ellipse(94, 116, 36, 27, DARK)
    canvas.ellipse(162, 116, 36, 27, DARK)
    canvas.capsule(94, 106, 162, 106, 14, DARK)   # bridge
    canvas.capsule(58, 108, 94, 112, 11, DARK)    # temples
    canvas.capsule(198, 108, 162, 112, 11, DARK)
    canvas.curve((84, 170), (128, 208), (172, 170), 15, DARK)


def draw_star(canvas: Canvas) -> None:
    points = []
    for i in range(10):
        angle = -math.pi / 2 + i * math.pi / 5
        radius = 116 if i % 2 == 0 else 48
        points.append((C + radius * math.cos(angle), C + radius * math.sin(angle)))
    canvas.polygon(points, GOLD)
    canvas.polygon([(C + r * 0.42 * math.cos(a), C + r * 0.42 * math.sin(a))
                    for a, r in ((-math.pi / 2 + i * math.pi / 5, 116 if i % 2 == 0 else 48) for i in range(10))],
                   (255, 224, 130, 255))


def draw_thumbs_up(canvas: Canvas) -> None:
    # Cuff first, so the fist sits ON it rather than the sleeve pooling underneath.
    canvas.ellipse(140, 206, 56, 30, (30, 136, 229, 255))
    canvas.ellipse(136, 168, 64, 54, SKIN)        # the fist
    canvas.capsule(112, 136, 98, 58, 46, SKIN)    # the thumb
    for y in (150, 176, 198):
        canvas.capsule(152, y, 192, y, 6, (230, 145, 56, 255))


EMOJI = {
    "angry": draw_angry,
    "laugh": draw_laugh,
    "shock": draw_shock,
    "heart": draw_heart,
    "fire": draw_fire,
    "skull": draw_skull,
    "cool": draw_cool,
    "star": draw_star,
    "thumbs_up": draw_thumbs_up,
}


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, draw in EMOJI.items():
        canvas = Canvas()
        draw(canvas)
        write_png(OUT_DIR / f"{name}.png", canvas.downsample())
        print(f"wrote {name}.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
