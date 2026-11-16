"""Visual check: screenshot pages at a given viewport with Playwright.

    python scripts/shots.py [--w 1440 --h 900] [--base http://127.0.0.1:5173] path[@scrollY][!click-selector] ...
"""
import argparse
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[1] / ".shots"


def launch(p):
    for kw in ({}, {"channel": "msedge"}, {"channel": "chrome"}):
        try:
            return p.chromium.launch(**kw)
        except Exception as e:  # noqa: BLE001
            last = e
    raise last


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("targets", nargs="+")
    ap.add_argument("--w", type=int, default=1440)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--base", default="http://127.0.0.1:5173")
    ap.add_argument("--wait", type=float, default=2.5)
    args = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = launch(p)
        page = browser.new_page(viewport={"width": args.w, "height": args.h})
        page.add_init_script("sessionStorage.setItem('fzx-loaded','1')")
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        for t in args.targets:
            m = re.match(r"^([^@!]*)(?:@(\d+))?(?:!(.+))?$", t)
            path, y, click = m.group(1), m.group(2), m.group(3)
            page.goto(args.base + path, wait_until="networkidle")
            time.sleep(args.wait)
            if y:
                page.mouse.wheel(0, int(y))
                time.sleep(2.2)
            if click:
                for sel in click.split("|"):
                    page.locator(sel).first.click()
                    time.sleep(1.4)
            name = re.sub(r"[^\w]+", "_", f"{path}_{y or 0}_{click or ''}").strip("_") or "home"
            f = OUT / f"{args.w}_{name}.jpg"
            page.screenshot(path=str(f), type="jpeg", quality=72)
            print(f)
        if errors:
            print("PAGE ERRORS:")
            for e in errors[:20]:
                print(" ", e[:300])
        browser.close()


if __name__ == "__main__":
    main()
