"""Smoke test for the running API: data endpoints + one streamed chat answer.

    python scripts/smoke_test.py [--base http://127.0.0.1:8000] [--q 问题]
"""
import argparse
import json
import time
import urllib.parse
import urllib.request


def get(base, path):
    return json.load(urllib.request.urlopen(base + urllib.parse.quote(path, safe="/?=&")))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    ap.add_argument("--q", default="宋本扬子法言是怎么合璧的？")
    args = ap.parse_args()
    for _ in range(40):
        try:
            h = get(args.base, "/api/health")
            break
        except OSError:
            time.sleep(1)
    print("health:", {k: h[k] for k in ("pages", "documents", "llm", "dense")})
    for path in ["/api/timeline", "/api/stories", "/api/cases", "/api/books", "/api/people", "/api/network",
                 "/api/images", "/api/stories/乐府诗集避火", "/api/cases/外库书册数之谜", "/api/wiki/傅增湘",
                 "/api/docs/cnki-0130", "/api/search?q=扬子法言"]:
        data = get(args.base, path)
        size = len(data) if isinstance(data, list) else len(json.dumps(data, ensure_ascii=False))
        print(f"  OK {path} -> {size}")
    req = urllib.request.Request(args.base + "/api/chat", data=json.dumps({"question": args.q}).encode(),
                                 headers={"Content-Type": "application/json"})
    text, reasoning, tools, sources, done = "", "", [], None, None
    event = None
    for raw in urllib.request.urlopen(req).read().decode("utf-8").splitlines():
        if raw.startswith("event:"):
            event = raw[6:].strip()
        elif raw.startswith("data:"):
            data = json.loads(raw[5:])
            if event == "delta":
                text += data["text"]
            elif event == "reasoning":
                reasoning += data["text"]
            elif event == "tool":
                tools.append(data)
            elif event == "sources":
                sources = data
            elif event == "done":
                done = data
    print("\ntools:")
    for t in tools:
        print(f"  {t['tool']:<18} {t['label']}  count={t['count']} {t['ms']}ms -> {str(t['output'])[:80]}")
    print("reasoning:", reasoning[:300] + ("…" if len(reasoning) > 300 else ""))
    print("\nQ:", args.q)
    print("entities:", sources["entities"], "terms:", sources["terms"], "dense:", sources["dense"])
    for s in sources["sources"]:
        print(f"  [{s['n']}] {s['kind']:5s} {s['title'][:24]} {s.get('bid') or ''}")
    print("\nA:", text)
    print("\ndone:", done)


if __name__ == "__main__":
    main()
