"""Decode the newest CDP Page.captureScreenshot response into a JPEG for review.

    python scripts/cdp_shot.py out.jpg
"""
import base64
import json
import sys
from pathlib import Path

logs = sorted((Path.home() / ".cursor" / "browser-logs").glob("cdp-response-Page.captureScreenshot-*.json"))
data = json.loads(logs[-1].read_text(encoding="utf-8"))
payload = data.get("data") or data.get("result", {}).get("data")
out = Path(sys.argv[1] if len(sys.argv) > 1 else "shot.jpg")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(base64.b64decode(payload))
print(out.resolve())
