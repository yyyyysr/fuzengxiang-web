"""Copy the six 小傅 portraits into web/public as compact transparent WebP files.

    python scripts/prepare_assets.py
"""
from pathlib import Path

from PIL import Image

PROJECT = Path(__file__).resolve().parents[1]
SRC = PROJECT.parent / "藏书家智能体" / "卡通形象"
DEST = PROJECT / "web" / "public" / "xiaofu"
STATES = {
    "发呆": "idle", "思考": "thinking", "鼓励": "encourage",
    "开心雀跃": "happy", "难过伤心": "sad", "睡觉": "sleep",
}


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    for cn, en in STATES.items():
        src = SRC / f"傅增湘-卡通-{cn}.png"
        with Image.open(src) as im:
            im = im.convert("RGBA")
            bbox = im.getbbox()
            if bbox:
                im = im.crop(bbox)
            im.thumbnail((560, 560), Image.LANCZOS)
            im.save(DEST / f"{en}.webp", "WEBP", quality=88, method=6)
        print(en, (DEST / f"{en}.webp").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
