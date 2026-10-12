#!/usr/bin/env python3
"""How long every readable thing is on screen in the cut, against the rule.

    python tools/trailer/legibility.py <rec_dir> [<rec_dir> ...]

Reads legibility.json from each recording (record_trailer.mjs times every
text card, the game's banners, the showdown's winning row, the typed spell
and its reading, the title and end cards, frame by frame) and prints a
Markdown table: when each was fully on screen, how long it was held, and
whether that meets Mason's rule of 1.5 s plus 0.3 s a word (2026-10-11),
measured from the moment it has landed, not from when it began to animate.
"""
import json
import os
import re
import sys

# How long each kind takes to land once it first appears, in the cut. A text
# card slams in 0.32 s; the game's banner title 0.24 s (slower where the shot
# is slowed, set per shot below); the title card's line fades in 0.45 s. A
# line the game decodes letter by letter is only counted from the frame its
# last letter settles (the recorder marks it "[decoding]" until then).
LAND = {"card": 0.32, "banner": 0.0, "title": 0.5, "end_line": 0.45, "end_cta": 0.5, "end_fine": 0.5,
        "showdown": 0.0, "typed": 0.0, "reading": 0.0}
SKIP = {"reading"}                  # read together with the typed words, as one block


def norm(kind, text):
    t = re.sub(r"\s+", " ", text).strip()
    if kind == "showdown":
        t = re.sub(r"[+\-]?\d[\d,]*", "", t).replace("Mirr", "").strip()
        t = re.sub(r"\bK+\b", "", t).replace("◆", "").strip()
        t = re.sub(r"^(You|Vesper|Corvid)(?=[A-Z])", r"\1: ", t)
    return t


def words(text):
    return len([w for w in re.split(r"[\s/]+", text) if re.search(r"[A-Za-z]", w)])


def main():
    # A shot filmed again in a later recording (a re-take) replaces the earlier one.
    owner = {}
    for rec in sys.argv[1:]:
        for s in json.load(open(os.path.join(rec, "shots.json"), encoding="utf-8"))["shots"]:
            owner[s["name"]] = rec
    rows = []
    for rec in sys.argv[1:]:
        rows += [r for r in json.load(open(os.path.join(rec, "legibility.json"), encoding="utf-8"))
                 if owner.get(r["shot"], rec) == rec]
    merged = {}
    for r in sorted(rows, key=lambda r: r["first"]):
        if (r["kind"] in SKIP or (r["kind"] == "title" and r["shot"] == "end")
                or (r["kind"] == "end_line" and r["shot"] == "title") or "[decoding]" in r["text"]
                # the game behind the title and end cards, which cover it
                or (r["shot"] in ("title", "end") and r["kind"] in ("banner", "showdown"))):
            continue
        key = (r["shot"], r["kind"], norm(r["kind"], r["text"]))
        m = merged.get(key)
        if m and r["first"] <= m["last"] + 0.12:
            m["last"] = max(m["last"], r["last"])
        else:
            merged[key] = {**r, "text": key[2], "first": r["first"], "last": r["last"]}
    out = []
    typed_last = {}
    for (shot, kind, text), m in merged.items():
        if kind == "typed":
            # Only the finished sentence counts; it was being read as it arrived.
            if shot not in typed_last or len(text) > len(typed_last[shot][0]):
                typed_last[shot] = (text, m)
            continue
        out.append((shot, kind, text, m))
    for shot, (text, m) in typed_last.items():
        out.append((shot, "typed", text, m))
    out.sort(key=lambda x: x[3]["first"])
    print("| Text on screen | What | Appears | Fully on | Gone | Held | Words | Needs | Meets |")
    print("|---|---|---|---|---|---|---|---|---|")
    fails = 0
    for shot, kind, text, m in out:
        land = LAND.get(kind, 0.3)
        on = m["first"] + land
        held = m["last"] - on
        if held < 0.6:
            continue  # a transient (a card mid-change, a row mid-decode), not text to read
        n = words(text)
        need = 1.5 + 0.3 * n
        ok = held + 1e-6 >= need
        fails += 0 if ok else 1
        label = {"card": "text card", "banner": "game banner", "showdown": "showdown row", "typed": "typed spell",
                 "title": "title card", "end_line": "end card line", "end_cta": "end card button",
                 "end_fine": "end card small print"}.get(kind, kind)
        print(f"| {text} | {label} | {m['first']:.2f} | {on:.2f} | {m['last']:.2f} | {held:.2f} s | {n} | {need:.1f} s | {'yes' if ok else 'NO'} |")
    print(f"\n{len(out)} elements measured, {fails} short of the rule.", file=sys.stderr)


if __name__ == "__main__":
    main()
