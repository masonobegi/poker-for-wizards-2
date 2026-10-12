#!/usr/bin/env python3
"""Offline renderer for the HEXHOLD trailer score and the director's one-shots.

An original ~58 s cue in D minor at 120 BPM, synthesised entirely with numpy
(no samples, no loops, nothing licensed): a sub drone and a ticking clock for
the cold open, trailer impacts (sub boom, taiko, crash) on every reveal, a
driving arpeggiated groove under the spells, a formant choir for the
impossible hands, a count of four rising stabs into the Flush Five, and a
resolved outro under the end card. Then a convolution reverb, a limiter and
a loudness-targeted master (about -16 LUFS, the SFX sit on top in the mux).

The picture is cut to this grid (tools/trailer/record_trailer.mjs, EDIT):
one beat = 0.5 s, one bar = 2 s, and every shot starts on a beat.

The filters, envelopes, reverb, loudness meter, limiter and mixer are adapted
from the Bootleggers trailer (lords-of-vegas/tools/trailer/render_music.py).
The instruments and the music are HEXHOLD's own.

Usage:
    python tools/trailer/render_music.py              # music + one-shots
    python tools/trailer/render_music.py --only sfx

Output (48 kHz, 16-bit stereo WAV) in tools/trailer/out/:
    music.wav, tr_slam.wav, tr_key.wav, tr_boom.wav
"""

import argparse
import math
import os
import wave

import numpy as np

SR = 48000
TAU = 2.0 * math.pi
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "out")

DUR = 58.0
N = int(round(DUR * SR))
BEAT = 0.5
BAR = 2.0

# Hit points the picture is cut to (edit seconds; see EDIT in record_trailer.mjs).
FIVE_KINGS = 4.0     # the banner: FIVE OF A KIND
TITLE = 6.0
UNDO = 10.5          # the Rewind cast
THEIR_SPELL = 14.0
CANCEL = 16.0
WRITE = 18.0
WRITE_CAST = 22.5
NEW_RULE = 27.0
BUY = 31.0
DEAL3 = 32.5
WORST_WINS = 34.5
ONE_KING = 39.0
COUNT = [41.0, 42.0, 43.0, 44.0]
FLUSH_FIVE = 46.0
END = 50.0


# ---------------------------------------------------------------------------
# Pitch / time helpers
# ---------------------------------------------------------------------------

NOTE_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def nm(name):
    letter, rest = name[0], name[1:]
    acc = 0
    if rest and rest[0] in "#b":
        acc = 1 if rest[0] == "#" else -1
        rest = rest[1:]
    return 12 * (int(rest) + 1) + NOTE_PC[letter] + acc


def mtof(m):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


def secs(n):
    return np.arange(n) / SR


# ---------------------------------------------------------------------------
# Filters (FFT based), envelopes, panning  (adapted from Bootleggers)
# ---------------------------------------------------------------------------


def fft_filter(x, gain_fn, pad=8192):
    n = x.shape[-1]
    m = n + pad
    X = np.fft.rfft(x, m)
    f = np.fft.rfftfreq(m, 1.0 / SR)
    y = np.fft.irfft(X * gain_fn(np.maximum(f, 1e-3)), m)
    return y[..., :n]


def lp_gain(fc, order=2):
    return lambda f: 1.0 / np.sqrt(1.0 + (f / fc) ** (2 * order))


def hp_gain(fc, order=2):
    return lambda f: 1.0 / np.sqrt(1.0 + (fc / f) ** (2 * order))


def bp_gain(fc, bw_oct=1.0):
    return lambda f: np.exp(-0.5 * (np.log2(f / fc) / bw_oct) ** 2)


def lowpass(x, fc, order=2):
    return fft_filter(x, lp_gain(fc, order))


def highpass(x, fc, order=2):
    return fft_filter(x, hp_gain(fc, order))


def bandpass(x, fc, bw_oct=1.0):
    return fft_filter(x, bp_gain(fc, bw_oct))


def env_ar(n, a, r, hold=None):
    """Attack, optional hold, exponential release to the end of n samples."""
    e = np.ones(n)
    ai = max(1, min(n, int(a * SR)))
    e[:ai] = np.linspace(0, 1, ai)
    hi = n if hold is None else min(n, ai + int(hold * SR))
    if hi < n:
        t = secs(n - hi)
        e[hi:] = np.exp(-t / max(1e-3, r))
    return e


def fade(x, fin=0.002, fout=0.01):
    n = x.shape[-1]
    a, b = min(n, int(fin * SR)), min(n, int(fout * SR))
    if a:
        x[..., :a] *= np.linspace(0, 1, a)
    if b:
        x[..., n - b:] *= np.linspace(1, 0, b)
    return x


def pan_st(x, pan):
    th = (pan + 1.0) * math.pi / 4.0
    return np.stack([x * math.cos(th), x * math.sin(th)]) * math.sqrt(2.0)


def norm(x):
    return x / (np.max(np.abs(x)) + 1e-12)


# ---------------------------------------------------------------------------
# Oscillators and instruments  (mono unless noted)
# ---------------------------------------------------------------------------


def saw_wave(freq, n, rng, detune_cents=0.0, glide=None):
    f = freq * 2 ** (detune_cents / 1200.0)
    if glide is not None:
        f = f * glide
        ph = np.cumsum(np.broadcast_to(f, (n,))) / SR
    else:
        ph = f * secs(n)
    ph = ph + rng.uniform(0, 1)
    return 2.0 * (ph % 1.0) - 1.0


def pad(midis, dur, rng, cutoff=1900.0, a=0.5, r=1.2, voices=3, spread=11.0):
    """Detuned saw stack, low-passed: the bed under the hook and the outro."""
    n = int((dur + r * 3) * SR)
    x = np.zeros(n)
    for m in midis:
        f = mtof(m)
        for v in range(voices):
            d = (v - (voices - 1) / 2) * spread
            x += saw_wave(f, n, rng, d) / voices
    x = lowpass(x, cutoff, 2)
    return fade(x * env_ar(n, a, r, hold=dur), 0.002, 0.2) / max(1, len(midis)) ** 0.5


VOWEL_A = ((730.0, 0.6, 1.0), (1090.0, 0.45, 0.55), (2440.0, 0.35, 0.3), (3300.0, 0.3, 0.12))


def choir(midis, dur, rng, a=0.35, r=1.6, bright=1.0):
    """Saw voices through 'ah' formants with a slow vibrato: the impossible hands."""
    n = int((dur + r * 3) * SR)
    t = secs(n)
    out = np.zeros(n)
    for m in midis:
        for v in range(4):
            vib = 1.0 + 0.0045 * np.sin(TAU * (4.6 + 0.4 * v) * t + rng.uniform(0, TAU)) * np.clip(t / 0.6, 0, 1)
            f = mtof(m) * 2 ** ((v - 1.5) * 6.0 / 1200.0) * vib
            ph = np.cumsum(f) / SR + rng.uniform(0, 1)
            out += 2.0 * (ph % 1.0) - 1.0
    y = np.zeros(n)
    for fc, bw, g in VOWEL_A:
        y += bandpass(out, fc * bright, bw) * g
    y = lowpass(y, 5200.0)
    return fade(y * env_ar(n, a, r, hold=dur), 0.002, 0.25) / (len(midis) * 2.0)


def pluck(midi, dur, vel, rng, bright=1.0):
    """Harp/celesta pluck: a few stretched partials, upper ones die first."""
    f = mtof(midi)
    n = int((dur + 1.4) * SR)
    t = secs(n)
    x = np.zeros(n)
    for k in range(1, 9):
        fk = k * f * (1 + 0.0008 * k * k)
        if fk > 15000:
            break
        amp = (1.0 / k ** (1.35 - 0.3 * bright)) * (0.6 + 0.4 * vel)
        x += amp * np.sin(TAU * fk * t + rng.uniform(0, TAU)) * np.exp(-t * (2.2 + 1.6 * k))
    x += np.sin(TAU * 2 * f * t) * np.exp(-t * 60.0) * 0.25  # the pick
    return fade(x * vel, 0.0008, 0.05)


def bell(midi, dur, vel, rng):
    """FM bell (celesta-like): a decaying modulation index gives the shimmer."""
    f = mtof(midi)
    n = int((dur + 2.5) * SR)
    t = secs(n)
    idx = 3.2 * np.exp(-t * 3.5) + 0.4
    mod = np.sin(TAU * f * 3.51 * t) * idx
    x = np.sin(TAU * f * t + mod) * np.exp(-t * 1.6)
    x += 0.3 * np.sin(TAU * f * 2.0 * t) * np.exp(-t * 3.0)
    return fade(x * vel, 0.0005, 0.1)


def bass_note(midi, dur, vel, rng, cutoff=420.0):
    """Saw plus a sine sub, through a plucky low-pass: the groove's ostinato."""
    f = mtof(midi)
    n = int((dur + 0.15) * SR)
    t = secs(n)
    x = saw_wave(f, n, rng) * 0.6 + np.sin(TAU * f * t) * 0.9
    # A crude filter envelope: two low-passes crossfaded on a decaying curve.
    bright = lowpass(x, cutoff * 3.2)
    dark = lowpass(x, cutoff)
    k = np.exp(-t * 16.0)
    y = bright * k + dark * (1 - k)
    y = np.tanh(1.5 * y)
    return fade(y * env_ar(n, 0.004, 0.08, hold=dur) * vel, 0.001, 0.02)


def sub_drone(midi, dur, rng):
    n = int(dur * SR)
    t = secs(n)
    f = mtof(midi)
    x = np.sin(TAU * f * t) + 0.25 * np.sin(TAU * 2 * f * t + 0.3)
    x *= 1.0 + 0.08 * np.sin(TAU * 0.25 * t)
    return fade(x, 0.8, 0.8)


def brass_stab(midis, dur, vel, rng, cutoff=2600.0):
    """Saw stack with a fast filter snap and saturation: the hits' bite."""
    n = int((dur + 0.6) * SR)
    t = secs(n)
    x = np.zeros(n)
    for m in midis:
        for v in range(3):
            x += saw_wave(mtof(m), n, rng, (v - 1) * 9.0)
    bright = lowpass(x, cutoff, 2)
    dark = lowpass(x, cutoff * 0.28, 2)
    k = np.exp(-t * 7.0)
    y = np.tanh(0.6 * (bright * k + dark * (1 - k)))
    return fade(y * env_ar(n, 0.006, 0.35, hold=dur) * vel / len(midis) ** 0.5, 0.001, 0.08)


# ---------------------------------------------------------------------------
# Percussion and trailer FX
# ---------------------------------------------------------------------------


def metal_bank(n, rng, lo, hi, count, dec_base, dec_slope):
    t = secs(n)
    out = np.zeros(n)
    for fr in np.exp(rng.uniform(math.log(lo), math.log(hi), count)):
        out += np.sin(TAU * fr * t + rng.uniform(0, TAU)) * np.exp(-t * (dec_base + fr / dec_slope)) / math.sqrt(fr / lo)
    return out


def crash(rng, length=3.6):
    n = int(length * SR)
    t = secs(n)
    nz = norm(highpass(rng.standard_normal(n), 2200.0))
    metal = norm(metal_bank(n, rng, 300.0, 8000.0, 50, 0.9, 3000.0))
    burst = norm(bandpass(rng.standard_normal(n), 6000.0, 1.0) * np.exp(-t * 25.0))
    x = (0.7 * nz + 0.5 * metal) * np.exp(-t * 1.15) + 0.6 * burst
    return fade(norm(x), 0.0008, 0.3)


def kick(rng, deep=False):
    n = int((0.7 if deep else 0.42) * SR)
    t = secs(n)
    f = (40.0 if deep else 48.0) + (110.0 if deep else 95.0) * np.exp(-t * (22.0 if deep else 30.0))
    x = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t * (4.5 if deep else 8.0))
    x += lowpass(rng.standard_normal(n), 2500.0) * np.exp(-t * 260.0) * 0.35
    return fade(np.tanh(1.8 * x) / np.tanh(1.8), 0.0005, 0.05)


def clap(rng):
    n = int(0.42 * SR)
    t = secs(n)
    env = np.zeros(n)
    for k, o in enumerate((0.0, 0.009, 0.019, 0.031)):
        i = int(o * SR)
        env[i:] += np.exp(-t[: n - i] * (180.0 if k < 3 else 16.0)) * (0.8 if k < 3 else 1.0)
    x = bandpass(rng.standard_normal(n), 1350.0, 0.9) * env
    body = np.sin(TAU * 190.0 * t) * np.exp(-t * 35.0) * 0.4
    return fade(norm(x + body), 0.0005, 0.05)


def hat(rng, open_=False):
    n = int((0.32 if open_ else 0.07) * SR)
    t = secs(n)
    x = highpass(rng.standard_normal(n), 7500.0) * np.exp(-t * (10.0 if open_ else 70.0))
    x += norm(metal_bank(n, rng, 5000.0, 12000.0, 12, 30.0, 4000.0)) * 0.3 * np.exp(-t * 40)
    return fade(norm(x), 0.0003, 0.02)


def snare(rng):
    n = int(0.3 * SR)
    t = secs(n)
    tone = np.sin(TAU * np.cumsum(200.0 + 60.0 * np.exp(-t * 40.0)) / SR) * np.exp(-t * 22.0)
    nz = norm(bandpass(rng.standard_normal(n), 3600.0, 1.4) * np.exp(-t * 16.0))
    return fade(norm(tone * 0.6 + nz), 0.0005, 0.03)


def taiko(rng, pitch=1.0):
    n = int(1.4 * SR)
    t = secs(n)
    f = (62.0 + 40.0 * np.exp(-t * 18.0)) * pitch
    x = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t * 3.6)
    x += lowpass(rng.standard_normal(n), 700.0) * np.exp(-t * 28.0) * 0.8
    x += bandpass(rng.standard_normal(n), 2400.0, 0.8) * np.exp(-t * 90.0) * 0.35
    return fade(np.tanh(1.6 * norm(x)), 0.0005, 0.1)


def timpani(midi, vel, rng, length=2.6):
    f = mtof(midi)
    n = int(length * SR)
    t = secs(n)
    glide = 1.0 + 0.025 * np.exp(-t * 8.0)
    x = np.zeros(n)
    for r, a, d in ((1.0, 1.0, 1.3), (1.504, 0.55, 1.9), (1.742, 0.35, 2.4), (2.0, 0.3, 2.8), (0.5, 0.25, 6.0)):
        x += a * np.sin(TAU * np.cumsum(f * r * glide) / SR + rng.uniform(0, TAU)) * np.exp(-t * d)
    x += lowpass(rng.standard_normal(n), 900.0) * np.exp(-t * 45.0) * 0.6
    return fade(norm(np.tanh(1.3 * x)) * vel, 0.001, 0.2)


def boom(rng, length=3.2):
    """Sub drop: the trailer 'braam' floor under every reveal."""
    n = int(length * SR)
    t = secs(n)
    f = 28.0 + 62.0 * np.exp(-t * 3.2)
    x = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t * 1.1)
    x += lowpass(rng.standard_normal(n), 220.0) * np.exp(-t * 2.5) * 0.8
    x += lowpass(rng.standard_normal(n), 3000.0) * np.exp(-t * 40.0) * 0.5
    return fade(np.tanh(1.4 * norm(x)), 0.0005, 0.4)


def riser(rng, length):
    """Noise swell and a gliding saw cluster, peaking at the end."""
    n = int(length * SR)
    t = secs(n)
    u = t / length
    nz = rng.standard_normal(n)
    lo = highpass(nz, 600.0)
    hi = highpass(nz, 4000.0)
    noise = lo * (1 - u) + hi * u
    glide = 2 ** (u * 1.0)
    tone = sum(saw_wave(mtof(m), n, rng, 0.0, glide) for m in (nm("D3"), nm("A3"), nm("D4")))
    tone = lowpass(tone, 3000.0)
    x = (0.6 * norm(noise) + 0.5 * norm(tone)) * u ** 2.2
    return fade(x, 0.01, 0.004)


def reverse_crash(rng, length=1.6):
    c = crash(rng, length + 0.4)[: int(length * SR)][::-1].copy()
    return fade(c, 0.05, 0.002)


def tick(rng, hi=True):
    n = int(0.03 * SR)
    t = secs(n)
    x = bandpass(rng.standard_normal(n), 3800.0 if hi else 2600.0, 0.5) * np.exp(-t * 260.0)
    x += np.sin(TAU * (1900.0 if hi else 1400.0) * t) * np.exp(-t * 300.0) * 0.6
    return fade(norm(x), 0.0002, 0.005)


def whoosh(rng, length=0.38):
    n = int(length * SR)
    t = secs(n)
    u = t / length
    x = bandpass(rng.standard_normal(n), 900.0, 1.2) * (1 - u) + bandpass(rng.standard_normal(n), 3800.0, 1.0) * u
    return fade(norm(x) * np.sin(np.pi * u) ** 1.5, 0.002, 0.01)


# ---------------------------------------------------------------------------
# Reverb, loudness, limiting, output  (adapted from Bootleggers)
# ---------------------------------------------------------------------------


def reverb_ir(seconds, seed=3, damp=5200.0):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = secs(n)
    pre = int(0.02 * SR)
    ir = np.zeros((2, n))
    for ch in range(2):
        nz = lowpass(rng.standard_normal(n), damp)
        e = np.exp(-t * 6.9 / seconds)
        er = np.zeros(n)
        for _ in range(18):
            er[int(rng.uniform(0.004, 0.08) * SR)] += rng.uniform(-0.5, 0.5)
        ir[ch] = np.concatenate([np.zeros(pre), nz * e * 0.5 + er])[:n]
    ir /= np.sqrt(np.sum(ir ** 2) / 2.0)
    return ir


def reverb(x, seconds, seed=3, damp=5200.0):
    ir = reverb_ir(seconds, seed, damp)
    if x.ndim == 1:
        x = np.stack([x, x])
    n = x.shape[-1]
    m = n + ir.shape[1]
    out = np.zeros_like(x)
    for ch in range(2):
        out[ch] = np.fft.irfft(np.fft.rfft(x[ch], m) * np.fft.rfft(ir[ch], m), m)[:n]
    return out


def k_weight(f):
    hp = 1.0 / np.sqrt(1.0 + (38.0 / f) ** 4)
    shelf = 1.0 + (10 ** (4.0 / 20.0) - 1.0) * (f ** 2 / (f ** 2 + 1500.0 ** 2))
    return hp * shelf


def lufs(x):
    """Approximate BS.1770 integrated loudness."""
    y = fft_filter(x, k_weight)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    c = np.concatenate([[0.0], np.cumsum(np.sum(y ** 2, axis=0))])
    starts = np.arange(0, y.shape[1] - blk, hop)
    z = (c[starts + blk] - c[starts]) / blk
    z = z[z > 0]
    lk = -0.691 + 10 * np.log10(z)
    z = z[lk > -70.0]
    rel = -0.691 + 10 * math.log10(np.mean(z)) - 10.0
    z = z[(-0.691 + 10 * np.log10(z)) > rel]
    return -0.691 + 10 * math.log10(np.mean(z))


def running_min(g, half):
    w = 2 * half + 1
    gp = np.pad(g, (half, half + w), mode="edge")
    nb = gp.size // w
    gp = gp[: nb * w].reshape(nb, w)
    pre = np.minimum.accumulate(gp, axis=1).ravel()
    suf = np.minimum.accumulate(gp[:, ::-1], axis=1)[:, ::-1].ravel()
    idx = np.arange(g.size)
    return np.minimum(suf[idx], pre[idx + w - 1])


def limiter(x, ceiling_db=-1.0, hold=0.006, smooth=0.005):
    c = 10 ** (ceiling_db / 20.0)
    peak = np.max(np.abs(x), axis=0)
    g = np.minimum(1.0, c / np.maximum(peak, 1e-9))
    half = int(hold * SR)
    gm = running_min(g, half)
    L = min(int(smooth * SR), half)
    kern = np.hanning(L + 2)[1:-1]
    kern /= kern.sum()
    return x * np.convolve(gm, kern, mode="same")


def write_wav(path, x):
    x = np.atleast_2d(x)
    if x.shape[0] == 1:
        x = np.vstack([x, x])
    pcm = (np.clip(x, -1.0, 1.0) * 32767.0).round().astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.T.tobytes())


class Mix:
    def __init__(self, n):
        self.n = n
        self.buses = {}

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((2, self.n))
        return self.buses[name]

    def add(self, name, t, x, gain=1.0, pan=0.0):
        b = self.bus(name)
        st = pan_st(x, pan) if x.ndim == 1 else x
        i0 = int(round(t * SR))
        s0, s1 = max(0, i0), min(self.n, i0 + st.shape[1])
        if s1 > s0:
            b[:, s0:s1] += gain * st[:, s0 - i0:s1 - i0]


# ---------------------------------------------------------------------------
# The score
# ---------------------------------------------------------------------------

# Chords as (bass midi, voicing midis). D minor, with a Picardy D major for
# the Flush Five.
CH = {
    "Dm": (nm("D2"), [nm("D3"), nm("F3"), nm("A3"), nm("D4")]),
    "Bb": (nm("Bb1"), [nm("D3"), nm("F3"), nm("Bb3"), nm("D4")]),
    "Gm": (nm("G1"), [nm("D3"), nm("G3"), nm("Bb3"), nm("D4")]),
    "A": (nm("A1"), [nm("C#3"), nm("E3"), nm("A3"), nm("C#4")]),
    "A7": (nm("A1"), [nm("C#3"), nm("G3"), nm("A3"), nm("E4")]),
    "Eb": (nm("Eb2"), [nm("Eb3"), nm("G3"), nm("Bb3"), nm("Eb4")]),
    "C": (nm("C2"), [nm("E3"), nm("G3"), nm("C4"), nm("E4")]),
    "F": (nm("F1"), [nm("C3"), nm("F3"), nm("A3"), nm("C4")]),
    "D": (nm("D2"), [nm("D3"), nm("F#3"), nm("A3"), nm("D4")]),
    "Dm9": (nm("D2"), [nm("F3"), nm("A3"), nm("C4"), nm("E4")]),
}

# Where the harmony sits: (start, end, chord).
HARMONY = [
    (0.0, 4.0, "Dm"), (4.0, 6.0, "Dm"), (6.0, 8.0, "Bb"), (8.0, 9.0, "A"),
    (9.0, 10.0, "Dm"), (10.0, 12.0, "Bb"), (12.0, 14.0, "Gm"), (14.0, 16.0, "A"), (16.0, 18.0, "Dm"),
    (18.0, 20.0, "Bb"), (20.0, 22.0, "Gm"), (22.0, 24.0, "A"), (24.0, 26.0, "Dm"), (26.0, 27.0, "Bb"),
    (27.0, 30.0, "Eb"), (30.0, 32.0, "Gm"), (32.0, 34.0, "Eb"), (34.0, 36.0, "Bb"), (36.0, 39.0, "A"),
    (39.0, 41.0, "A"), (41.0, 42.0, "Dm"), (42.0, 43.0, "Bb"), (43.0, 44.0, "C"), (44.0, 46.0, "A7"),
    (46.0, 50.0, "D"), (50.0, 54.0, "Dm9"), (54.0, 58.0, "Dm"),
]


def chord_at(t):
    for a, b, c in HARMONY:
        if a <= t < b:
            return c
    return "Dm"


# The HEXHOLD motif: D, A, F, E, D, a hexagon's worth of a turn.
MOTIF = [(0.0, "D5", 0.5), (0.5, "A4", 0.5), (1.0, "F5", 0.5), (1.5, "E5", 0.25), (1.75, "D5", 0.75)]


def compose(rng):
    mix = Mix(N)
    kits = {
        "kick": [kick(rng) for _ in range(3)],
        "kick_deep": kick(rng, deep=True),
        "clap": [clap(rng) for _ in range(3)],
        "hat": [hat(rng) for _ in range(4)],
        "ohat": hat(rng, True),
        "snare": [snare(rng) for _ in range(3)],
        "crash": crash(rng),
        "rcrash": reverse_crash(rng),
        "boom": boom(rng),
        "taiko": [taiko(rng, p) for p in (1.0, 0.86, 1.18)],
        "tick_hi": tick(rng, True),
        "tick_lo": tick(rng, False),
    }
    pick = lambda arr: arr[int(rng.integers(0, len(arr)))]

    def impact(t, big=1.0, chord=None, choir_dur=None):
        mix.add("fx", t, kits["boom"], 0.95 * big)
        mix.add("drums", t, kits["taiko"][0], 0.9 * big)
        mix.add("drums", t + 0.004, kits["kick_deep"], 0.8 * big)
        mix.add("cym", t, kits["crash"], 0.55 * big, 0.25)
        if chord:
            bass, voices = CH[chord]
            mix.add("brass", t, brass_stab([bass + 12] + voices, 0.55, 0.9 * big, rng), 0.7)
            if choir_dur:
                mix.add("choir", t, choir([v + 12 for v in voices[1:]] + [bass + 24], choir_dur, rng, a=0.05, r=1.4), 0.9 * big)

    def riser_into(t, length, gain=0.5):
        mix.add("fx", t - length, riser(rng, length), gain)
        rc = kits["rcrash"]
        mix.add("cym", t - rc.shape[-1] / SR, rc, 0.35 * gain / 0.5)

    def groove(t0, t1, density=1.0, clap_on=True, kick_on=True, hats=True):
        b = t0
        while b < t1 - 1e-6:
            beat_in_bar = int(round((b % BAR) / BEAT)) % 4
            if kick_on:
                mix.add("drums", b, pick(kits["kick"]), 0.85)
            if clap_on and beat_in_bar in (1, 3):
                mix.add("drums", b, pick(kits["clap"]), 0.45)
            if hats:
                for s in range(4 if density >= 1 else 2):
                    ht = b + s * BEAT / (4 if density >= 1 else 2)
                    if ht >= t1:
                        break
                    accent = 0.55 if s == 2 else 0.3
                    mix.add("hats", ht, pick(kits["hat"]), accent * density, 0.3 if s % 2 else -0.2)
                if beat_in_bar == 3 and density >= 1:
                    mix.add("hats", b + BEAT / 2, kits["ohat"], 0.18, 0.4)
            b += BEAT

    def bassline(t0, t1, gain=0.7):
        """Eighths on the root with an octave pop: the engine of the groove."""
        t = t0
        k = 0
        while t < t1 - 1e-6:
            root = CH[chord_at(t + 1e-3)][0]
            m = root + (12 if k % 4 == 3 else 0)
            mix.add("bass", t, bass_note(m, BEAT / 2 * 0.9, 0.95 if k % 2 == 0 else 0.7, rng), gain)
            t += BEAT / 2
            k += 1

    def arps(t0, t1, gain=0.33, octave=24, pattern=(0, 1, 2, 3, 2, 1, 2, 3)):
        t = t0
        k = 0
        while t < t1 - 1e-6:
            voices = CH[chord_at(t + 1e-3)][1]
            m = voices[pattern[k % len(pattern)] % len(voices)] + octave
            mix.add("arp", t, pluck(m, 0.25, 0.85 if k % 4 == 0 else 0.6, rng), gain, 0.35 if k % 2 else -0.35)
            t += BEAT / 4
            k += 1

    def pads(t0, t1, gain=0.22, cutoff=1700.0):
        for a, b, c in HARMONY:
            s, e = max(a, t0), min(b, t1)
            if e - s <= 0.05:
                continue
            mix.add("pad", s, pad(CH[c][1], e - s, rng, cutoff=cutoff, a=0.25, r=0.5), gain)

    def motif(t0, gain=0.5, octave=0):
        for dt, note, d in MOTIF:
            mix.add("bell", t0 + dt, bell(nm(note) + octave, d, 0.9, rng), gain, 0.15)

    # ── 0-4: the cold open. A drone, a clock, a held breath. ────────────────
    mix.add("pad", 0.0, sub_drone(nm("D1"), 4.3, rng), 0.38)
    mix.add("pad", 0.0, pad([nm("D3"), nm("A3")], 4.0, rng, cutoff=900.0, a=0.6, r=0.6), 0.28)
    for i in range(8):
        mix.add("drums", i * BEAT, kits["tick_hi" if i % 2 == 0 else "tick_lo"], 0.25)
    for i in range(8, 16):
        mix.add("drums", i * BEAT / 2 + 2.0, kits["tick_hi" if i % 2 == 0 else "tick_lo"], 0.3)
    # The first frame lands on a hit: a scroller hears it before they read it.
    mix.add("fx", 0.0, kits["boom"], 0.55)
    mix.add("drums", 0.0, kits["taiko"][1], 0.7)
    mix.add("cym", 0.0, kits["crash"], 0.22, -0.3)
    mix.add("drums", 0.0, kits["kick_deep"], 0.7)
    mix.add("drums", 1.0, kits["kick_deep"], 0.5)
    mix.add("drums", 1.25, kits["kick_deep"], 0.35)
    for k, note in enumerate(("A4", "D5", "F5", "A5")):   # the typing insert
        mix.add("bell", 1.35 + k * 0.3, bell(nm(note), 0.4, 0.6, rng), 0.32)
    riser_into(FIVE_KINGS, 1.3, 0.55)

    # ── 4: FIVE OF A KIND ────────────────────────────────────────────────────
    impact(FIVE_KINGS, 1.0, "Dm", choir_dur=1.8)
    mix.add("pad", FIVE_KINGS, sub_drone(nm("D1"), 2.2, rng), 0.32)

    # ── 6: the title ─────────────────────────────────────────────────────────
    impact(TITLE, 0.85, "Bb", choir_dur=None)
    motif(TITLE + 0.5, 0.55)
    pads(TITLE, 9.0, 0.24, 1400.0)
    mix.add("bass", TITLE, sub_drone(nm("Bb0"), 2.0, rng), 0.45)
    arps(7.0, 9.0, 0.22)
    for i in range(4):
        mix.add("drums", 8.0 + i * 0.25, pick(kits["snare"]), 0.18 + 0.08 * i)
    riser_into(9.0, 1.0, 0.35)

    # ── 9-18: the groove. Undo, then their spell, then yours. ────────────────
    # It builds: hats and kick first, the backbeat joins at 11.
    groove(9.0, 11.0, density=0.5, clap_on=False)
    groove(11.0, 18.0)
    bassline(9.0, 18.0)
    arps(9.0, 18.0)
    pads(9.0, 18.0, 0.16)
    mix.add("cym", 9.0, kits["crash"], 0.35)
    mix.add("fx", UNDO - 0.38, whoosh(rng), 0.35)
    mix.add("brass", 12.0, brass_stab(CH["Gm"][1], 0.3, 0.6, rng), 0.35)
    impact(THEIR_SPELL, 0.55, "A")
    impact(CANCEL, 0.7, "Dm")
    motif(CANCEL + 0.5, 0.35, 12)

    # ── 18-22.5: the blank page. The beat drops to the clock. ───────────────
    pads(18.0, 22.5, 0.24, 1500.0)
    arps(18.0, 22.5, 0.26, 24, (0, 2, 1, 3))
    bassline(18.0, 22.0, 0.45)
    for i in range(int(4.0 / (BEAT / 2))):
        mix.add("drums", 18.0 + i * BEAT / 2, kits["tick_hi" if i % 2 == 0 else "tick_lo"], 0.22)
    for i in range(8):
        mix.add("drums", 21.5 + i * 0.0625, pick(kits["snare"]), 0.12 + 0.05 * i)
    riser_into(WRITE_CAST, 1.0, 0.4)

    # ── 22.5-27: it does what you wrote ─────────────────────────────────────
    mix.add("cym", WRITE_CAST, kits["crash"], 0.45)
    mix.add("drums", WRITE_CAST, kits["taiko"][2], 0.6)
    groove(WRITE_CAST, 27.0)
    bassline(WRITE_CAST, 27.0)
    arps(WRITE_CAST, 27.0, 0.36, 24, (0, 1, 2, 3, 3, 2, 1, 0))
    pads(WRITE_CAST, 27.0, 0.17)
    mix.add("brass", 24.75, brass_stab(CH["Dm"][1], 0.35, 0.6, rng), 0.35)

    # ── 27: a new rule. Half time, darker. ──────────────────────────────────
    impact(NEW_RULE, 0.9, "Eb", choir_dur=2.4)
    for i, t in enumerate((28.0, 28.5, 29.0, 29.25, 29.5, 29.75)):
        mix.add("drums", t, kits["taiko"][i % 3], 0.45 + 0.05 * i)
    mix.add("bass", NEW_RULE, sub_drone(nm("Eb1"), 3.0, rng), 0.5)
    arps(28.0, 30.0, 0.2, 24, (0, 2))

    # ── 30-39: buy your own, three cards, the worst hand wins ────────────────
    mix.add("cym", 30.0, kits["crash"], 0.4)
    groove(30.0, 39.0)
    bassline(30.0, 39.0)
    arps(30.0, 39.0, 0.34)
    pads(30.0, 39.0, 0.16)
    mix.add("brass", BUY, brass_stab(CH["Gm"][1], 0.3, 0.75, rng), 0.45)
    mix.add("fx", DEAL3 - 0.38, whoosh(rng), 0.3)
    impact(WORST_WINS, 0.6, "Bb")
    # A falling bell run: the joke lands.
    for k, note in enumerate(("A5", "F5", "D5", "A4", "F4")):
        mix.add("bell", 36.5 + k * 0.125, bell(nm(note), 0.3, 0.7, rng), 0.3)
    for i in range(8):
        mix.add("drums", 38.5 + i * 0.0625, pick(kits["snare"]), 0.15 + 0.05 * i)

    # ── 39-46: one King of Spades, then four ────────────────────────────────
    mix.add("pad", ONE_KING, sub_drone(nm("A0"), 2.2, rng), 0.55)
    mix.add("pad", ONE_KING, pad([nm("A3"), nm("E4"), nm("A4")], 2.0, rng, cutoff=1200.0, a=0.4, r=0.4), 0.22)
    for i in range(4):
        mix.add("drums", ONE_KING + i * BEAT, kits["kick_deep"], 0.55 if i % 2 == 0 else 0.35)
        mix.add("drums", ONE_KING + i * BEAT, kits["tick_hi"], 0.25)
    rising = ["Dm", "Bb", "C", "A7"]
    for k, (t, c) in enumerate(zip(COUNT, rising)):
        g = 0.55 + 0.15 * k
        mix.add("drums", t, kits["taiko"][k % 3], g)
        mix.add("drums", t, timpani(CH[c][0] + 12, 0.9, rng), 0.5 + 0.1 * k)
        mix.add("brass", t, brass_stab([CH[c][0] + 12] + CH[c][1], 0.45, 0.8, rng, cutoff=2400.0 + 500 * k), 0.5 + 0.1 * k)
        mix.add("choir", t, choir([v + 12 for v in CH[c][1][1:]], 0.8, rng, a=0.03, r=0.35), 0.45 + 0.12 * k)
        mix.add("cym", t, kits["crash"], 0.15 + 0.08 * k)
        mix.add("bell", t, bell(CH[c][1][-1] + 24, 0.4, 0.8, rng), 0.3)
    for i in range(16):
        mix.add("drums", 44.0 + i * 0.125, pick(kits["snare"]), 0.12 + 0.03 * i)
    mix.add("bass", 44.0, sub_drone(nm("A0"), 2.0, rng), 0.5)
    riser_into(FLUSH_FIVE, 2.0, 0.7)

    # ── 46: FLUSH FIVE. D major, everything at once, then it rings. ─────────
    impact(FLUSH_FIVE, 1.25, "D", choir_dur=3.6)
    mix.add("pad", FLUSH_FIVE, pad(CH["D"][1] + [nm("F#4"), nm("A4")], 3.6, rng, cutoff=2400.0, a=0.05, r=1.0), 0.3)
    mix.add("pad", FLUSH_FIVE, sub_drone(nm("D1"), 4.0, rng), 0.4)
    for k, note in enumerate(("D5", "F#5", "A5", "D6", "A5", "F#5", "D6")):
        mix.add("bell", FLUSH_FIVE + 0.4 + k * 0.33, bell(nm(note), 0.5, 0.7, rng), 0.26, 0.3 if k % 2 else -0.3)

    # ── 50-58: the end card ─────────────────────────────────────────────────
    impact(END, 0.75, "Dm9", choir_dur=None)
    motif(END + 0.5, 0.6)
    motif(END + 2.5, 0.38, -12)
    mix.add("pad", END, pad(CH["Dm9"][1], 4.0, rng, cutoff=1500.0, a=0.3, r=1.5), 0.26)
    mix.add("pad", 54.0, pad(CH["Dm"][1], 4.0, rng, cutoff=1100.0, a=0.6, r=2.0), 0.24)
    mix.add("pad", END, sub_drone(nm("D1"), 8.0, rng), 0.3)
    arps(51.0, 55.0, 0.18, 24, (0, 2, 1, 3))
    for i in range(8):
        mix.add("drums", 51.0 + i * BEAT, kits["kick_deep"], 0.3 if i % 2 == 0 else 0.0)
    return mix


BUS_GAIN = {"drums": 0.8, "hats": 0.55, "cym": 0.75, "fx": 0.95, "bass": 0.58, "arp": 0.72, "pad": 0.66,
            "brass": 0.8, "choir": 0.95, "bell": 0.75}
SENDS = {"drums": 0.12, "hats": 0.08, "cym": 0.15, "fx": 0.18, "bass": 0.03, "arp": 0.3, "pad": 0.35,
         "brass": 0.25, "choir": 0.5, "bell": 0.45}


def sidechain(x, kicks, depth=0.45, rel=0.18):
    """Duck the bed under each groove kick, the way a pumping mix breathes."""
    g = np.ones(x.shape[-1])
    n = int(rel * 3 * SR)
    curve = 1.0 - depth * np.exp(-secs(n) / rel)
    for t in kicks:
        i = int(t * SR)
        j = min(g.size, i + n)
        if i < g.size:
            g[i:j] = np.minimum(g[i:j], curve[: j - i])
    return x * g


def render_music():
    rng = np.random.default_rng(20261011)
    mix = compose(rng)
    kicks = [t for a, b in ((9.0, 18.0), (22.5, 27.0), (30.0, 39.0)) for t in np.arange(a, b, BEAT)]
    dry = np.zeros((2, N))
    wet_in = np.zeros((2, N))
    for name, b in mix.buses.items():
        x = b * BUS_GAIN.get(name, 0.7)
        if name in ("pad", "arp", "bass", "choir"):
            x = sidechain(x, kicks, 0.35 if name != "bass" else 0.25)
        dry += x
        wet_in += x * SENDS.get(name, 0.2)
    wet = reverb(wet_in, 2.6, seed=7)
    out = dry + wet * 0.55
    out = highpass(out, 32.0)
    out = np.tanh(out * 0.9) / 0.9
    # Level: the music bed sits at about -16 LUFS; the mux puts the game on top.
    gain = 10 ** ((-16.0 - lufs(out)) / 20.0)
    out = limiter(out * gain, -1.5)
    fade_n = int(2.5 * SR)
    out[:, -fade_n:] *= np.linspace(1, 0, fade_n) ** 1.5
    return out


def render_oneshots():
    rng = np.random.default_rng(7)
    shots = {}
    # A caption landing: a short air swell into a soft thump.
    w = whoosh(rng, 0.22)
    th = kick(rng) * 0.6
    x = np.zeros(int(0.6 * SR))
    x[: w.size] += w * 0.5
    i = int(0.16 * SR)
    x[i:i + th.size] += th[: x.size - i]
    shots["tr_slam"] = reverb(fade(norm(x), 0.002, 0.05), 0.8, seed=5) * 0.25 + pan_st(norm(x), 0) * 0.7
    # A key on a quiet keyboard.
    n = int(0.06 * SR)
    t = secs(n)
    k = bandpass(rng.standard_normal(n), 2600.0, 0.7) * np.exp(-t * 180.0) + np.sin(TAU * 520.0 * t) * np.exp(-t * 120.0) * 0.3
    shots["tr_key"] = pan_st(fade(norm(k), 0.0003, 0.01), 0.1)
    # The title and end card floor.
    b = boom(rng, 3.4) + np.concatenate([crash(rng, 3.4)[: int(3.4 * SR)] * 0.35, np.zeros(0)])
    shots["tr_boom"] = reverb(norm(b), 2.4, seed=9) * 0.3 + pan_st(norm(b), 0) * 0.8
    return shots


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["music", "sfx"])
    a = ap.parse_args()
    os.makedirs(OUT_DIR, exist_ok=True)
    if a.only != "sfx":
        m = render_music()
        write_wav(os.path.join(OUT_DIR, "music.wav"), m)
        print(f"music.wav  {DUR:.1f}s  {lufs(m):.1f} LUFS  peak {20 * math.log10(np.max(np.abs(m))):.1f} dBFS")
    if a.only != "music":
        # The title and end-card boom sits under the score's own hit there, so it
        # is the quietest: the loudest moment of the cut must be the Flush Five.
        level = {"tr_boom": 0.4}
        for name, x in render_oneshots().items():
            write_wav(os.path.join(OUT_DIR, f"{name}.wav"), x / (np.max(np.abs(x)) + 1e-9) * level.get(name, 0.9))
            print(f"{name}.wav")


if __name__ == "__main__":
    main()
