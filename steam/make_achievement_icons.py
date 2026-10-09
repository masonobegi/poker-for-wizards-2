"""
Achievement icons for HEXHOLD: an achieved and an unachieved JPG for each of
the 20 achievements in steam/achievements.json, at 256x256.

Steam needs both icons for every achievement before they can be published.
These follow the game's emblem (electron/icon@512.png): a gold hex on the
night plate, with a short monogram per achievement in Cinzel instead of the
H. The unachieved icon is the same art in grey, which is how Steam shows a
locked achievement. Bespoke art can replace them later; the names match the
API names, so swapping files changes nothing else.

    python steam/make_achievement_icons.py

Writes steam/art/achievements/<api_name>.jpg and <api_name>_locked.jpg.
Size: 256x256, the size Steam's upload form takes and scales down from.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from make_art import GOLD_HI, GOLD_LO, font, gold_text

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "steam" / "art" / "achievements"
SIZE = 256

# One to four characters each, chosen to be read at 64px in a friends list.
MONOGRAM = {
    "first_blood": "I",            # the first pot
    "first_run": "LS",             # Last One Standing
    "five_of_a_kind": "5K",
    "flush_house": "FH",
    "flush_five": "F5",
    "counterspell": "N",           # Nullified
    "counterspelled_twice": "LW",  # The Last Word
    "wildcard": "W",
    "long_memory": "III",          # a card that has won three pots
    "quantum_win": "Q",
    "sealed_win": "S",
    "diverged_win": "D",
    "ante_five": "V",
    "ante_eight": "VIII",
    "purist": "P",
    "archmage": "C",               # 100 sigils
    "the_inversion": "UD",         # Upside Down
    "six_omens": "VI",
    "kingmaker": "K",
    "whale": "100",                # a hundred big blinds
}


def plate() -> Image.Image:
    """The night-blue ground with a soft centre glow, as on the emblem."""
    img = Image.new("RGB", (SIZE, SIZE), (8, 10, 20))
    glow = Image.new("L", (SIZE, SIZE), 0)
    d = ImageDraw.Draw(glow)
    d.ellipse((SIZE * 0.12, SIZE * 0.12, SIZE * 0.88, SIZE * 0.88), fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(SIZE * 0.16))
    return Image.composite(Image.new("RGB", (SIZE, SIZE), (30, 34, 54)), img, glow)


def hexagon(draw: ImageDraw.ImageDraw, r: float, width: int, fill):
    c = SIZE / 2
    pts = [(c + r * math.cos(math.radians(a)), c + r * math.sin(math.radians(a))) for a in range(0, 360, 60)]
    draw.line(pts + [pts[0]], fill=fill, width=width, joint="curve")


def icon(text: str) -> Image.Image:
    img = plate().convert("RGBA")
    d = ImageDraw.Draw(img)
    # Outer ring and the hex, in the emblem's two golds.
    ring = round(SIZE * 0.035)
    d.ellipse((ring, ring, SIZE - ring, SIZE - ring), outline=GOLD_LO + (150,), width=2)
    hexagon(d, SIZE * 0.40, max(4, round(SIZE * 0.028)), GOLD_HI)
    # The monogram, as wide as the hex allows.
    target = SIZE * (0.36 if len(text) <= 1 else 0.46 if len(text) == 2 else 0.54)
    size = 160
    block = gold_text(None, text, font(900, size), tracking=0.04)
    size = max(12, round(size * target / max(1, block.width - size)))
    block = gold_text(None, text, font(900, size), tracking=0.04)
    while block.height > SIZE * 0.62 and size > 12:
        size -= 4
        block = gold_text(None, text, font(900, size), tracking=0.04)
    img.alpha_composite(block, ((SIZE - block.width) // 2, (SIZE - block.height) // 2 + round(SIZE * 0.01)))
    return img.convert("RGB")


def locked(img: Image.Image) -> Image.Image:
    grey = ImageEnhance.Color(img).enhance(0.0)
    return ImageEnhance.Brightness(grey).enhance(0.55)


def main():
    achievements = json.loads((ROOT / "steam" / "achievements.json").read_text(encoding="utf-8"))
    names = [a["name"] for a in achievements]
    missing = [n for n in names if n not in MONOGRAM]
    assert not missing, f"no monogram for {missing}"
    OUT.mkdir(parents=True, exist_ok=True)
    for name in names:
        art = icon(MONOGRAM[name])
        assert art.size == (SIZE, SIZE)
        art.save(OUT / f"{name}.jpg", quality=92, optimize=True)
        locked(art).save(OUT / f"{name}_locked.jpg", quality=92, optimize=True)
    print(f"  {len(names) * 2} icons in {OUT.relative_to(ROOT)} ({SIZE}x{SIZE})")

    # A contact sheet to look at all of them at once (not uploaded).
    cols = 10
    sheet = Image.new("RGB", (cols * 132, ((len(names) * 2 + cols - 1) // cols) * 132), (0, 0, 0))
    i = 0
    for name in names:
        for f in (f"{name}.jpg", f"{name}_locked.jpg"):
            im = Image.open(OUT / f).resize((128, 128), Image.LANCZOS)
            sheet.paste(im, ((i % cols) * 132 + 2, (i // cols) * 132 + 2))
            i += 1
    sheet.save(ROOT / "steam" / "art" / "achievements_sheet.png", optimize=True)


if __name__ == "__main__":
    main()
