"""
Steam store and library art for HEXHOLD, made from the game's own frames.

Every background here is a 1920x1080 capture of the packaged game
(`node test/packaged.mjs 240 --shots` writes them to steam/screenshots/raw/),
and the title is set in Cinzel, the game's own display face, vendored in
public/fonts/ under the SIL OFL. Re-run after the game's look changes:

    python steam/make_art.py

Writes steam/art/*.png at Steam's exact pixel sizes, plus electron/icon.ico.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "steam" / "screenshots" / "raw"
OUT = ROOT / "steam" / "art"
FONTS = ROOT / "public" / "fonts"
ICON = ROOT / "electron" / "icon@512.png"

GOLD_HI = (246, 221, 150)
GOLD_LO = (201, 151, 63)
INK = (11, 8, 6)

# Which captures to build from. Override with: make_art.py table.png hand.png
TABLE_SHOT = RAW / (sys.argv[1] if len(sys.argv) > 1 else "02-your-turn.png")
HAND_SHOT = RAW / (sys.argv[2] if len(sys.argv) > 2 else "02-your-turn.png")


def font(weight: int, size: int) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(FONTS / f"cinzel-{weight}.woff2"), size)
    # The vendored Cinzel files are the variable font; without this every
    # weight renders as the default 400.
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def cover(img: Image.Image, w: int, h: int, focus=(0.5, 0.5), zoom=1.0) -> Image.Image:
    """Scale to cover w x h, then crop around a focus point (fractions of the source)."""
    s = max(w / img.width, h / img.height) * zoom
    big = img.resize((max(w, round(img.width * s)), max(h, round(img.height * s))), Image.LANCZOS)
    cx, cy = focus[0] * big.width, focus[1] * big.height
    x = min(max(0, round(cx - w / 2)), big.width - w)
    y = min(max(0, round(cy - h / 2)), big.height - h)
    return big.crop((x, y, x + w, y + h))


def grade(img: Image.Image, dark=0.55, blur=0) -> Image.Image:
    """Push a UI capture back so it reads as a scene behind a title, not as a UI."""
    out = img.convert("RGB")
    if blur:
        out = out.filter(ImageFilter.GaussianBlur(blur))
    out = ImageEnhance.Brightness(out).enhance(1 - dark * 0.55)
    out = ImageEnhance.Color(out).enhance(1.1)
    return out


def vignette(img: Image.Image, strength=0.85, warm=True) -> Image.Image:
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    steps = 60
    for i in range(steps):
        t = i / steps
        inset_x, inset_y = round(w * 0.5 * t), round(h * 0.5 * t)
        d.ellipse((inset_x - w * 0.25, inset_y - h * 0.25, w - inset_x + w * 0.25, h - inset_y + h * 0.25),
                  fill=round(255 * t))
    mask = mask.filter(ImageFilter.GaussianBlur(max(w, h) / 12))
    dark = Image.new("RGB", (w, h), INK if warm else (0, 0, 0))
    inv = mask.point(lambda v: round((255 - v) * strength))
    return Image.composite(dark, img, inv)


def gradient_band(img: Image.Image, side: str, reach: float, alpha=235) -> Image.Image:
    """Darken one edge so the title sits on calm ground."""
    w, h = img.size
    band = Image.new("L", (w, h), 0)
    px = band.load()
    for yy in range(h):
        for xx in range(0, w, 1):
            if side == "left":
                f = 1 - xx / (w * reach)
            elif side == "bottom":
                f = 1 - (h - yy) / (h * reach)
            elif side == "top":
                f = 1 - yy / (h * reach)
            else:
                f = 0
            if f > 0:
                px[xx, yy] = round(alpha * min(1, f) ** 1.4)
    return Image.composite(Image.new("RGB", (w, h), INK), img, band)


def tracked_size(text: str, f: ImageFont.FreeTypeFont, tracking: float) -> tuple[int, int]:
    width = sum(f.getlength(c) for c in text) + tracking * f.size * (len(text) - 1)
    asc, desc = f.getmetrics()
    return round(width), asc + desc


def draw_tracked(layer: Image.Image, xy, text, f, fill, tracking=0.0):
    d = ImageDraw.Draw(layer)
    x, y = xy
    for c in text:
        d.text((x, y), c, font=f, fill=fill)
        x += f.getlength(c) + tracking * f.size


def gold_text(size_wh, text, f, tracking=0.12) -> Image.Image:
    """Title in a vertical gold gradient, with a soft dark shadow and a faint glow."""
    tw, th = tracked_size(text, f, tracking)
    pad = round(f.size * 0.5)
    w, h = tw + pad * 2, th + pad * 2
    mask = Image.new("L", (w, h), 0)
    draw_tracked(mask, (pad, pad), text, f, 255, tracking)
    grad = Image.new("RGB", (w, h))
    gd = ImageDraw.Draw(grad)
    for yy in range(h):
        t = min(1, max(0, (yy - pad) / max(1, th)))
        c = tuple(round(GOLD_HI[i] + (GOLD_LO[i] - GOLD_HI[i]) * t) for i in range(3))
        gd.line([(0, yy), (w, yy)], fill=c)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    shadow = mask.filter(ImageFilter.GaussianBlur(f.size * 0.08))
    out.paste(Image.new("RGBA", (w, h), (0, 0, 0, 230)), (round(f.size * 0.03), round(f.size * 0.05)), shadow)
    glow = mask.filter(ImageFilter.GaussianBlur(f.size * 0.25)).point(lambda v: round(v * 0.35))
    out.paste(Image.new("RGBA", (w, h), (232, 180, 90, 255)), (0, 0), glow)
    out.paste(grad, (0, 0), mask)
    return out


def tagline(text, f, tracking=0.42, fill=(214, 186, 128, 235)) -> Image.Image:
    tw, th = tracked_size(text, f, tracking)
    out = Image.new("RGBA", (tw + 8, th + 8), (0, 0, 0, 0))
    sh = Image.new("RGBA", out.size, (0, 0, 0, 0))
    draw_tracked(sh, (5, 6), text, f, (0, 0, 0, 220), tracking)
    out = Image.alpha_composite(out, sh.filter(ImageFilter.GaussianBlur(2)))
    draw_tracked(out, (4, 4), text, f, fill, tracking)
    return out


def emblem(size: int) -> Image.Image:
    return Image.open(ICON).convert("RGBA").resize((size, size), Image.LANCZOS)


def title_block(width: int, with_tag=True, with_emblem=False) -> Image.Image:
    """The wordmark sized to a target width: HEXHOLD over IMPOSSIBLE POKER."""
    size = 200
    t = gold_text(None, "HEXHOLD", font(900, size))
    scale = width / t.width
    t = gold_text(None, "HEXHOLD", font(900, max(10, round(size * scale))))
    parts = [t]
    if with_tag:
        tag_size = max(9, round(t.height * 0.13))
        parts.append(tagline("IMPOSSIBLE POKER", font(600, tag_size)))
    em = emblem(round(t.height * 0.62)) if with_emblem else None
    gap = round(t.height * -0.3)
    w = max(p.width for p in parts)
    h = sum(p.height for p in parts) + gap * (len(parts) - 1) + ((em.height + round(t.height * 0.02)) if em else 0)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    y = 0
    if em:
        out.alpha_composite(em, ((w - em.width) // 2, 0))
        y += em.height + round(t.height * 0.02)
    for p in parts:
        out.alpha_composite(p, ((w - p.width) // 2, y))
        y += p.height + gap
    return out


def place(bg: Image.Image, block: Image.Image, cx: float, cy: float) -> Image.Image:
    out = bg.convert("RGBA")
    x = round(cx * out.width - block.width / 2)
    y = round(cy * out.height - block.height / 2)
    out.alpha_composite(block, (x, y))
    return out.convert("RGB")


def save(img: Image.Image, name: str, size: tuple[int, int]):
    assert img.size == size, f"{name}: {img.size} != {size}"
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / name, optimize=True)
    print(f"  {name:28s} {size[0]}x{size[1]}")


def main():
    table = Image.open(TABLE_SHOT).convert("RGB")
    hand = Image.open(HAND_SHOT).convert("RGB")

    # Header capsule 920x430: the felt and the seats, title centred.
    bg = grade(cover(table, 920, 430, focus=(0.43, 0.36), zoom=1.25), dark=0.7, blur=1.2)
    bg = vignette(bg, 0.9)
    save(place(bg, title_block(560), 0.5, 0.5), "header_capsule_920x430.png", (920, 430))

    # Small capsule 462x174: legibility first, nearly all title.
    bg = grade(cover(table, 462, 174, focus=(0.43, 0.36), zoom=1.1), dark=0.85, blur=2.5)
    bg = vignette(bg, 0.95)
    save(place(bg, title_block(380, with_tag=False), 0.5, 0.52), "small_capsule_462x174.png", (462, 174))

    # Main capsule 1232x706.
    bg = grade(cover(table, 1232, 706, focus=(0.43, 0.42), zoom=1.15), dark=0.66, blur=1.0)
    bg = vignette(bg, 0.9)
    save(place(bg, title_block(760, with_emblem=True), 0.5, 0.47), "main_capsule_1232x706.png", (1232, 706))

    # Vertical capsule 748x896: your hand and your sigils, title above.
    bg = grade(cover(hand, 748, 896, focus=(0.19, 0.80), zoom=2.1), dark=0.45, blur=0.6)
    bg = gradient_band(vignette(bg, 0.8), "top", 0.6)
    save(place(bg, title_block(600, with_emblem=True), 0.5, 0.2), "vertical_capsule_748x896.png", (748, 896))

    # Library capsule 600x900.
    bg = grade(cover(hand, 600, 900, focus=(0.19, 0.80), zoom=2.3), dark=0.45, blur=0.6)
    bg = gradient_band(vignette(bg, 0.8), "top", 0.6)
    save(place(bg, title_block(500, with_emblem=True), 0.5, 0.18), "library_capsule_600x900.png", (600, 900))

    # Library hero 3840x1240: NO text, Steam lays the logo over it.
    bg = grade(cover(table, 3840, 1240, focus=(0.43, 0.38), zoom=1.0), dark=0.5, blur=3.0)
    save(vignette(bg, 0.75), "library_hero_3840x1240.png", (3840, 1240))

    # Library logo 1280x720, transparent.
    logo = Image.new("RGBA", (1280, 720), (0, 0, 0, 0))
    block = title_block(1100)
    logo.alpha_composite(block, ((1280 - block.width) // 2, (720 - block.height) // 2))
    OUT.mkdir(parents=True, exist_ok=True)
    logo.save(OUT / "library_logo_1280x720.png", optimize=True)
    print("  library_logo_1280x720.png    1280x720 (transparent)")

    # Community icon 184x184 and the Windows .ico the build uses.
    save(emblem(184).convert("RGB"), "community_icon_184x184.png", (184, 184))
    ico = Image.open(ICON).convert("RGBA")
    ico.save(OUT / "hexhold.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    ico.save(ROOT / "electron" / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("  hexhold.ico + electron/icon.ico (16-256)")

    # Store screenshots: the curated set at exactly 1920x1080.
    shots = OUT.parent / "screenshots"
    for f in sorted(RAW.glob("*.png")):
        im = Image.open(f)
        if im.size != (1920, 1080):
            print(f"  ! {f.name} is {im.size}, not 1920x1080")


if __name__ == "__main__":
    main()
