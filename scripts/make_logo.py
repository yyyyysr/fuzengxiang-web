"""Turn a generated seal image (red seal on a white ground) into the site's logo files.

    python scripts/make_logo.py SRC.jpg

The seal is recoloured to the site cinnabar with its stamped grain kept, the ground
around it becomes transparent (rough edges stay rough), and the result is written to
web/public as logo.png (256px), logo.webp (160px, used by the pages), favicon.png (64px)
and apple-touch-icon.png (180px, on paper).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

PROJECT = Path(__file__).resolve().parents[1]
PUBLIC = PROJECT / "web" / "public"
ZHU = np.array([168, 50, 42], float)
CREAM = np.array([246, 238, 222], float)
PAPER = (243, 236, 223)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    rgb = np.asarray(Image.open(sys.argv[1]).convert("RGB"), float)
    g = rgb[..., 1]
    ink_g = np.percentile(g[g < 140], 50)  # green channel of the seal's red
    t = np.clip((255 - g) / (255 - ink_g), 0, 1)  # 0 = white ground or carved line, 1 = cinnabar

    ys, xs = np.nonzero(t > 0.5)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    core = np.zeros(t.shape, bool)
    inset = max(4, (x1 - x0) // 60)
    core[y0 + inset:y1 - inset, x0 + inset:x1 - inset] = True

    color = CREAM + (ZHU - CREAM) * t[..., None]
    edge = np.clip((t - 0.15) / 0.45, 0, 1)
    alpha = np.where(core, 1.0, edge)
    color = np.where(core[..., None], color, ZHU)
    rgba = np.dstack([color, alpha * 255]).round().astype(np.uint8)

    pad = (x1 - x0) // 40
    seal = Image.fromarray(rgba, "RGBA").crop((x0 - pad, y0 - pad, x1 + pad + 1, y1 + pad + 1))
    side = max(seal.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(seal, ((side - seal.width) // 2, (side - seal.height) // 2))

    square.resize((256, 256), Image.LANCZOS).save(PUBLIC / "logo.png", optimize=True)
    square.resize((160, 160), Image.LANCZOS).save(PUBLIC / "logo.webp", "WEBP", quality=86, method=6)
    square.resize((64, 64), Image.LANCZOS).save(PUBLIC / "favicon.png", optimize=True)
    touch = Image.new("RGBA", (180, 180), PAPER + (255,))
    small = square.resize((150, 150), Image.LANCZOS)
    touch.alpha_composite(small, (15, 15))
    touch.convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)
    for name in ("logo.png", "logo.webp", "favicon.png", "apple-touch-icon.png"):
        print(name, (PUBLIC / name).stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
