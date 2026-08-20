#!/usr/bin/env python3
"""Add a signature to the public roster.

    python3 scripts/sign.py "Marcus T" "Y12 · CS"
    python3 scripts/sign.py --list

Then commit data/signatures.json and push. GitHub Pages redeploys itself.
"""
import json
import pathlib
import sys
from datetime import date

DATA = pathlib.Path(__file__).resolve().parent.parent / "data" / "signatures.json"


def load():
    return json.loads(DATA.read_text(encoding="utf-8"))


def save(doc):
    doc["updated"] = date.today().isoformat()
    DATA.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main(argv):
    doc = load()
    sigs = doc.setdefault("signatures", [])

    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0

    if argv[0] == "--list":
        for i, s in enumerate(sigs, 1):
            print(f"{i:>3}. {s['name']}" + (f"  ({s['group']})" if s.get("group") else ""))
        print(f"\n{len(sigs)} signature(s)")
        return 0

    name = " ".join(argv[0].split())
    group = " ".join(argv[1].split()) if len(argv) > 1 else ""
    if not name:
        print("Give a name.", file=sys.stderr)
        return 1

    if any(s["name"].casefold() == name.casefold() for s in sigs):
        print(f"{name!r} has already signed — skipping.")
        return 0

    sigs.append({"name": name, "group": group})
    save(doc)
    print(f"Added {name!r}. {len(sigs)} signature(s) total.")
    print("Now: git add data/signatures.json && git commit -m 'Add signature' && git push")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
