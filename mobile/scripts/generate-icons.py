"""Generate ResQMe app icons: an orange tile with a white shield and plus (matching the sign-in logo).

Usage: python scripts/generate-icons.py   (writes into mobile/assets)
Shapes are drawn at 4x and downsampled for smooth anti-aliased edges.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ASSETS = Path(__file__).resolve().parent.parent / 'assets'
ORANGE = (244, 140, 37, 255)
ORANGE_DARK = (217, 115, 15, 255)
WHITE = (255, 255, 255, 255)
SS = 4  # supersampling factor


def cubic(p0, p1, p2, p3, n=40):
    pts = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        pts.append((
            mt ** 3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t ** 3 * p3[0],
            mt ** 3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t ** 3 * p3[1],
        ))
    return pts


def shield_points(cx, cy, size):
    """Shield outline in a 24-unit grid (like the lucide shield), scaled to `size` and centred."""
    right = []
    right += cubic((12, 2.2), (14.2, 3.9), (16.8, 5.0), (19.2, 5.0))   # top edge to shoulder
    right += cubic((19.2, 5.0), (19.7, 5.0), (20.0, 5.4), (20.0, 5.9))  # shoulder corner
    right += [(20.0, 12.6)]                                              # straight side
    right += cubic((20.0, 12.6), (20.0, 17.6), (16.4, 20.3), (12.0, 21.9))  # sweep to the tip
    left = [(24 - x, y) for x, y in reversed(right)]
    s = size / 24.0
    return [(cx + (x - 12) * s, cy + (y - 12) * s) for x, y in right + left]


def draw_mark(img, cx, cy, size, shield=WHITE, plus=ORANGE, shadow=True):
    d = ImageDraw.Draw(img)
    pts = shield_points(cx, cy, size)
    if shadow:
        sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).polygon([(x, y + size * 0.035) for x, y in pts], fill=(120, 50, 0, 90))
        img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(size * 0.03)))
        d = ImageDraw.Draw(img)
    d.polygon(pts, fill=shield)
    # plus sign, slightly above the shield's geometric centre
    s = size / 24.0
    arm, thick = 3.6 * s, 1.9 * s
    px, py = cx, cy + (11.6 - 12) * s
    r = thick / 2
    d.rounded_rectangle([px - arm, py - r, px + arm, py + r], radius=r, fill=plus)
    d.rounded_rectangle([px - r, py - arm, px + r, py + arm], radius=r, fill=plus)


def vertical_gradient(w, h, top, bottom):
    img = Image.new('RGBA', (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (w, y)], fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(4)))
    return img


def render(size, painter):
    big = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
    painter(big, size * SS)
    return big.resize((size, size), Image.LANCZOS)


def app_icon(img, S):
    img.alpha_composite(vertical_gradient(S, S, (248, 152, 52, 255), ORANGE_DARK))
    draw_mark(img, S / 2, S / 2, S * 0.60)


def adaptive_foreground(img, S):
    # Android masks to a circle/squircle: keep the mark inside the central ~60% safe zone.
    draw_mark(img, S / 2, S / 2, S * 0.46)


def splash_mark(img, S):
    draw_mark(img, S / 2, S / 2, S * 0.62, shield=ORANGE, plus=WHITE, shadow=False)


if __name__ == '__main__':
    render(1024, app_icon).save(ASSETS / 'icon.png')
    render(1024, adaptive_foreground).save(ASSETS / 'adaptive-icon.png')
    render(1024, splash_mark).save(ASSETS / 'splash-icon.png')
    render(48, app_icon).save(ASSETS / 'favicon.png')
    print('icons written to', ASSETS)
