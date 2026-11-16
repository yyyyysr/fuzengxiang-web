"""Compress the AI-generated story / chapter illustrations into web/public/story.

    python scripts/prepare_story_images.py [SRC_DIR]

SRC_DIR defaults to $STORY_ART_DIR. Every story-*.jpg|png and chapter-*.jpg|png is
written as <name>.webp (max 1600px wide) plus thumb/<name>.webp (640px wide).
These images are AI 示意图 and must be labelled as such wherever they are shown.
"""
import os
import sys
from pathlib import Path

from PIL import Image

PROJECT = Path(__file__).resolve().parents[1]
DEST = PROJECT / "web" / "public" / "story"


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("STORY_ART_DIR", ""))
    if not src.is_dir():
        sys.exit("usage: prepare_story_images.py SRC_DIR (or set STORY_ART_DIR)")
    (DEST / "thumb").mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in src.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
                   and p.stem.startswith(("story-", "chapter-")))
    total = 0
    for p in files:
        with Image.open(p) as im:
            im = im.convert("RGB")
            w, h = im.size
            big = im.copy()
            big.thumbnail((1600, 1600), Image.LANCZOS)
            big.save(DEST / f"{p.stem}.webp", "WEBP", quality=80, method=6)
            small = im.copy()
            small.thumbnail((640, 640), Image.LANCZOS)
            small.save(DEST / "thumb" / f"{p.stem}.webp", "WEBP", quality=72, method=6)
        kb = (DEST / f"{p.stem}.webp").stat().st_size // 1024
        total += kb
        print(f"{p.stem:20s} {w}x{h} -> {kb} KB")
    print(len(files), "images,", total, "KB")


if __name__ == "__main__":
    main()
