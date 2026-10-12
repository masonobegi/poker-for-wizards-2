#!/usr/bin/env python3
"""Cut the recorded shots into the edit, mix the sound, and encode the deliverables.

    python tools/trailer/mux_trailer.py <out_dir> <rec_dir> [<rec_dir> ...]

Each <rec_dir> is what one record_trailer.mjs run wrote: frames.mp4 (its
shots, in the order the game played them), shots.json (each shot's frames
and its place in the edit), sfx.json (every sound, in edit time). Several
runs that filmed different shots (--only) are cut together as one. The score
and the director's one-shots come from tools/trailer/out/ (render_music.py);
the game's own sounds from <rec_dir>/game/ (render_sfx.mjs).

Writes to <out_dir>:
    hexhold-trailer.mp4        1920x1080 60 fps, H.264 High + AAC, faststart
    hexhold-trailer.webm       the same in VP9 + Opus
    hexhold-trailer.jpg        poster, the Flush Five
    hexhold-preview-6s.mp4     the opening, silent, ending on its own first frame (loops)
    hexhold-preview-6s.webm
"""
import json
import math
import os
import subprocess
import sys
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from render_music import SR, limiter, lufs, pan_st  # noqa: E402

AUDIO = os.path.join(HERE, "out")
GAME_GAIN = 0.62     # the game's mix ladder, under the score's level
CUE_GAIN = 0.8
THROTTLE = 0.025     # src/audio/engine.ts THROTTLE_SEC: one name, once per 25 ms
TARGET_LUFS = -14.0
POSTER_AT = 70.4     # FLUSH FIVE, KINGS, and the two Kings of Spades in your hand
# The six-second preview: two Kings of Spades under MAKE IT FIVE, then
# FIVE OF A KIND landing and held 3.4 s, then 0.4 s dissolving back to the
# first frame. The payoff gets the reading time; the loop repeats the rest.
PREVIEW = (4.0, 9.6)


def read_wav(path):
    with wave.open(path, "rb") as w:
        assert w.getframerate() == SR, path
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768.0
        ch = w.getnchannels()
    x = x.reshape(-1, ch).T
    return np.vstack([x, x]) if ch == 1 else x


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).round().astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.T.tobytes())


def owners(recs):
    """Which recording each stretch of the cut comes from: a shot filmed again
    in a later recording (a re-take) replaces the earlier one."""
    spans = {}
    for r in recs:
        meta = json.load(open(os.path.join(r, "shots.json")))
        for s in meta["shots"]:
            spans[s["name"]] = (r, s["edit"], s["edit"] + s["frames"] / meta["fps"])
    return list(spans.values())


def owned(rec, t, spans):
    return any(r == rec and a - 1e-6 <= t < b for r, a, b in spans)


def mix_audio(recs, length):
    n = int(math.ceil(length * SR))
    music = read_wav(os.path.join(AUDIO, "music.wav"))
    out = np.zeros((2, n))
    out[:, : min(n, music.shape[1])] += music[:, :n]
    spans = owners(recs)
    cues = [dict(c, rec=r) for r in recs for c in json.load(open(os.path.join(r, "sfx.json")))
            if owned(r, c["t"], spans)]
    cache = {}
    last = {}
    placed = 0
    for c in sorted(cues, key=lambda c: c["t"]):
        name = c["name"]
        if name.startswith("tr_"):
            path, gain = os.path.join(AUDIO, f"{name}.wav"), CUE_GAIN
        else:
            if c["t"] - last.get(name, -9) < THROTTLE:
                continue
            last[name] = c["t"]
            path, gain = os.path.join(c["rec"], "game", f"{name}@{float(c.get('pitch') or 1):.3f}.wav"), GAME_GAIN
        if not os.path.exists(path):
            continue
        if path not in cache:
            cache[path] = read_wav(path)
        x = cache[path] * gain * float(c.get("vol", 1))
        pan = float(c.get("pan", 0))
        if pan:
            x = pan_st(x.mean(axis=0), pan)
        i0 = int(round(c["t"] * SR))
        s1 = min(n, i0 + x.shape[1])
        if s1 > i0 >= 0:
            out[:, i0:s1] += x[:, : s1 - i0]
            placed += 1
    gain = 10 ** ((TARGET_LUFS - lufs(out)) / 20.0)
    out = limiter(out * gain, -1.0)
    fo = int(0.9 * SR)
    out[:, -fo:] *= np.linspace(1, 0, fo)
    print(f"  mix: {placed} sounds over the score, {lufs(out):.1f} LUFS, peak {20 * math.log10(np.max(np.abs(out)) + 1e-12):.1f} dBFS")
    return out


def run(cmd):
    subprocess.run(cmd, check=True)


def main():
    dst, recs = sys.argv[1], sys.argv[2:]
    os.makedirs(dst, exist_ok=True)
    work = recs[0]
    fps = None
    shots = {}
    order = []
    for k, r in enumerate(recs):
        meta = json.load(open(os.path.join(r, "shots.json")))
        fps = meta["fps"]
        order = meta["edit_all"] if "edit_all" in meta else order or meta["edit"]
        for s in meta["shots"]:
            shots[s["name"]] = dict(s, src=k)
    order = [n for n in order if n in shots]
    length = sum(shots[n]["frames"] for n in order) / fps

    mix = os.path.join(work, "mix.wav")
    write_wav(mix, mix_audio(recs, length))

    parts = []
    for i, n in enumerate(order):
        s = shots[n]
        parts.append(f"[{s['src']}:v]trim=start_frame={s['start']}:end_frame={s['start'] + s['frames']},setpts=PTS-STARTPTS[v{i}]")
    # A short fade out: the end card's small print is read to the last second.
    fade_out = length - 0.8
    graph = ";".join(parts) + ";" + "".join(f"[v{i}]" for i in range(len(order))) +         f"concat=n={len(order)}:v=1:a=0,fade=t=in:st=0:d=0.12,fade=t=out:st={fade_out:.3f}:d=0.8,format=yuv420p[v]"
    master = os.path.join(work, "master.mov")
    inputs = [a for r in recs for a in ("-i", os.path.join(r, "frames.mp4"))]
    run(["ffmpeg", "-y", "-v", "error", *inputs, "-i", mix,
         "-filter_complex", graph, "-map", "[v]", "-map", f"{len(recs)}:a", "-r", str(fps),
         "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-c:a", "pcm_s16le", master])
    print(f"  cut: {len(order)} shots, {length:.2f}s")

    mp4 = os.path.join(dst, "hexhold-trailer.mp4")
    webm = os.path.join(dst, "hexhold-trailer.webm")
    jpg = os.path.join(dst, "hexhold-trailer.jpg")
    # CRF 16 lands a little over 5 Mbps on this cut, the 5,000 kbps Valve
    # recommends for a 1080p trailer (about 55 MB for 81 s; git takes it).
    run(["ffmpeg", "-y", "-v", "error", "-i", master, "-c:v", "libx264", "-profile:v", "high", "-level", "4.2",
         "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", str(fps),
         "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", mp4])
    run(["ffmpeg", "-y", "-v", "error", "-i", master, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-row-mt", "1",
         "-cpu-used", "3", "-pix_fmt", "yuv420p", "-c:a", "libopus", "-b:a", "160k", webm])
    run(["ffmpeg", "-y", "-v", "error", "-ss", f"{min(POSTER_AT, length - 1):.2f}", "-i", mp4, "-frames:v", "1", "-q:v", "2", jpg])

    # The Steam preview: six silent seconds of the opening's payoff. Its last
    # 0.4 s dissolves into its own first frame, so a looping player never jumps.
    first = os.path.join(work, "first.png")
    a, b = PREVIEW
    run(["ffmpeg", "-y", "-v", "error", "-ss", f"{a}", "-i", master, "-frames:v", "1", first])
    loop = (f"[0:v]trim=start={a}:end={b},setpts=PTS-STARTPTS,fps={fps},format=yuv420p,settb=AVTB[a];"
            f"[1:v]loop=loop=-1:size=1:start=0,trim=0:0.8,setpts=PTS-STARTPTS,fps={fps},format=yuv420p,settb=AVTB[b];"
            f"[a][b]xfade=transition=fade:duration=0.4:offset={b - a - 0.4:.3f},trim=0:{b - a + 0.4:.3f},format=yuv420p[v]")
    pmp4 = os.path.join(dst, "hexhold-preview-6s.mp4")
    run(["ffmpeg", "-y", "-v", "error", "-i", master, "-i", first, "-filter_complex", loop, "-map", "[v]", "-an",
         "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "19", "-r", str(fps), "-movflags", "+faststart", pmp4])
    run(["ffmpeg", "-y", "-v", "error", "-i", pmp4, "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-row-mt", "1",
         "-cpu-used", "3", "-an", pmp4.replace(".mp4", ".webm")])
    for f in (mp4, webm, jpg, pmp4, pmp4.replace(".mp4", ".webm")):
        print(f"  wrote {f}  ({os.path.getsize(f) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
