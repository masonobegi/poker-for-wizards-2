/**
 * DecodeText — a line that arrives as arcane glyphs and resolves, letter by
 * letter, into readable words.
 *
 * Used for the one line in the game that most deserves a beat: the winning
 * hand at showdown. "Flush, King high" appearing instantly is information;
 * the same words surfacing out of the same runes that flew off the spell is
 * the game telling you something was decided.
 *
 * Three decisions worth keeping:
 *
 *  - Each character sits in a slot sized by its FINAL character, with the
 *    live glyph laid over it. Runes are not the width of letters, so without
 *    this the line's width jitters for the whole animation and drags whatever
 *    sits beside it around. The slot never changes size, so nothing reflows.
 *  - Glyphs change on a 50ms clock, not per frame. At 144Hz a per-frame
 *    scramble is a grey blur; at 50ms you can see individual runes, which is
 *    the point.
 *  - The loop writes to the DOM through refs instead of React state. It runs
 *    about twenty times a second for a second, and re-rendering a showdown
 *    row that often to change one character is work for nothing.
 *
 * The readable text is always in the accessibility tree — the glyph slots are
 * `aria-hidden` and a visually-hidden copy carries the real words, so a
 * screen reader never reads out a stream of runes.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
// Straight from the particle module, not the `@/vfx` barrel: the barrel
// statically re-exports VfxLayer and would pull the whole (deliberately
// code-split) particle engine in behind it. Same reasoning as SpellFlight.
import { RUNE_GLYPHS } from '@/vfx/particles';
import './DecodeText.css';

export interface DecodeTextProps {
  text: string;
  className?: string;
  /** Milliseconds between one character settling and the next. */
  step?: number;
  /** Milliseconds of scramble before the first character settles. */
  lead?: number;
}

const GLYPH_MS = 50;

export function DecodeText({ text, className, step = 45, lead = 120 }: DecodeTextProps) {
  const reduced = useReducedMotionPref();
  const rootRef = useRef<HTMLSpanElement>(null);
  const chars = [...text];

  // Seed the slots with runes in the same commit that mounts them, so the
  // readable text is never visible for a frame before the scramble starts.
  useLayoutEffect(() => {
    if (reduced || !rootRef.current) return;
    for (const el of rootRef.current.querySelectorAll<HTMLElement>('[data-decode-live]')) {
      if (el.dataset.decodeLive === ' ') continue;
      el.textContent = RUNE_GLYPHS[(Math.random() * RUNE_GLYPHS.length) | 0];
      el.classList.add('is-scrambling');
    }
  }, [text, reduced]);

  useEffect(() => {
    const root = rootRef.current;
    if (reduced || !root) return;

    const live = [...root.querySelectorAll<HTMLElement>('[data-decode-live]')];
    const total = lead + live.length * step;
    const t0 = performance.now();
    let lastTick = -1;
    let raf = 0;

    const settle = (el: HTMLElement): void => {
      const want = el.dataset.decodeLive ?? '';
      if (el.textContent === want) return;
      el.textContent = want;
      el.classList.remove('is-scrambling');
    };

    const frame = (now: number): void => {
      const t = now - t0;
      const tick = Math.floor(t / GLYPH_MS);
      const fresh = tick !== lastTick;
      lastTick = tick;

      live.forEach((el, i) => {
        if (el.dataset.decodeLive === ' ') return;
        if (t >= lead + i * step) settle(el);
        else if (fresh) el.textContent = RUNE_GLYPHS[(Math.random() * RUNE_GLYPHS.length) | 0];
      });

      if (t < total) raf = requestAnimationFrame(frame);
      else live.forEach(settle);
    };

    raf = requestAnimationFrame(frame);
    // Unmounting mid-scramble must leave the slots readable, because the
    // element can persist (React reuses it when only `text` changed) and a
    // cancelled run would otherwise strand it showing runes.
    return () => {
      cancelAnimationFrame(raf);
      live.forEach(settle);
    };
  }, [text, reduced, step, lead]);

  return (
    <span className={['hx-decode', className ?? ''].filter(Boolean).join(' ')}>
      <span className="sr-only">{text}</span>
      <span className="hx-decode__slots" aria-hidden="true" ref={rootRef}>
        {chars.map((c, i) => (
          // Index keys: the slots are positional by definition, and a new
          // `text` replaces the whole run anyway.
          <span className="hx-decode__ch" key={i}>
            <i className="hx-decode__size">{c === ' ' ? ' ' : c}</i>
            <b className="hx-decode__live" data-decode-live={c}>
              {c === ' ' ? ' ' : c}
            </b>
          </span>
        ))}
      </span>
    </span>
  );
}

export default DecodeText;
