# 027 — Make winning sound different from losing

- **Status**: DONE
- **Severity**: MEDIUM (it is the moment the whole game is built around)
- **Category**: audio
- **Scope**: `src/audio/sfx.ts`, `test/audio.mjs`

## Problem

`npm run audio` proved every sound rendered, none clipped, none carried a DC
thump. It had no opinion about whether fifty sounds were *fifty* sounds.

So a distinctness pass was added — each pair compared on the four axes already
being measured — and it immediately named two:

```
~ showdown / win_big — alike on every axis (widest gap: rms 9.8%)
~ win_big / eliminate — alike on every axis (widest gap: durationSec 8.8%)
```

Reading the whole table explained it. Every big moment in the game sat in the
same narrow band:

| sound | centroid |
| --- | --- |
| victory | 153 Hz |
| win_impossible | 178 Hz |
| showdown | 237 Hz |
| eliminate | 238 Hz |
| win_big | 258 Hz |

`win_impossible` — the game's name, its headline, the thing a player will clip
and post — was **the darkest sound in the set**, and `win_big` was eight
percent brighter than being knocked out of the run. The notes are completely
different; F major add9 across three octaves is not a detuned FM bell in D.
But the mix has no emotional contrast at the moments that need one, because
the sub layers underneath were doing most of the talking.

## What was done

**`win_big`**: the thump went from 0.45 to 0.17, the chip cascade from 2000Hz
to 4400Hz, the saw stack's filter sweep from 2600Hz to 4400Hz, and the F6 bell
from 0.07 to 0.16 with a second bell above it.

**`win_impossible`**: the F1 at the bottom of its twelve-note chord was
dropped — it contributed almost nothing anybody hears as pitch and most of
what pulled the centroid down — the sub sweep went from 0.43 to 0.18, the
filter opens to 6200Hz, and the shimmer and chord carry the weight the sub
used to. It is still the largest sound in the game by `peak × rms`; it is now
the largest sound *upward*.

Result: `win_big` ~620Hz and `win_impossible` ~480Hz against `eliminate` at
~185Hz. Two new checks hold that line.

## The measurement was the harder half

The first version of the brightness check read the existing `spectralHz`,
which is a single Hann window centred on the **loudest sample**. That is the
right question for "what does the attack sound like" and the wrong one for "is
this bright" — and several of these synths randomise their shimmer, so which
bell happens to land on the peak sample moved the number across more than two
octaves between renders of identical code:

```
win_impossible   610Hz → 393Hz → 285Hz     (same source, three renders)
```

A check built on that passes or fails on the dice, and a flaky check is worse
than no check — it is the one everybody learns to re-run until it goes green.

`meanCentroid` walks the sound in overlapping windows and weights each by its
own energy, so it answers for the sound rather than for one instant of it.
Three consecutive runs: 468, 499, 502 Hz. The brightness comparison and the
distinctness axis both use it now; the peak-instant figure stays in the table,
where it is the right number.

## What this still is not

Measuring is not hearing, and the plan file for this should not pretend
otherwise. What these checks establish is that the big positive moments are no
longer spectrally identical to the negative ones, and that no two sounds in
the set measure alike on length, brightness, loudness and attack. Whether
`win_impossible` is *good* is a question for ears, and the near-twin list
exists to tell somebody with ears exactly which four minutes to spend.
