import { useEffect, useState, type RefObject } from 'react';

/**
 * "There is more below."
 *
 * Every panel in this game that cannot fit its content scrolls, and not one of
 * them said so. Measured at 1280x800: the main menu's column is 1261px tall in
 * an 800px window, so Settings, the Codex, the bot setup and the footer all sat
 * under the fold with nothing on screen to suggest they existed — and the
 * Market's own panel is 92vh with the blank page sliced off at the bottom edge,
 * which reads as broken rather than as scrollable.
 *
 * This is the thing that says so: a chip pinned to the bottom of the scroller,
 * shown only while there is further to go, that scrolls a screenful when
 * clicked. It disappears at the end, so it is never decoration.
 */
export default function ScrollMore({
  target,
  className = '',
  label = 'more',
}: {
  target: RefObject<HTMLElement | null>;
  className?: string;
  label?: string;
}) {
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    // 24px of slack: a scroller one or two pixels short of its end is at its
    // end as far as a reader is concerned.
    const read = () => setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 24);
    read();
    el.addEventListener('scroll', read, { passive: true });
    // Guarded: jsdom has no ResizeObserver, and a missing one should cost the
    // chip its resize updates, not take the whole menu down with it.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read);
    ro?.observe(el);
    // The content changes without the box changing: panes swap, a pick list
    // grows. Both have to re-ask the question.
    const mo = typeof MutationObserver === 'undefined' ? null : new MutationObserver(read);
    mo?.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      el.removeEventListener('scroll', read);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [target]);

  if (!more) return null;

  return (
    <button
      type="button"
      className={`scrollmore ${className}`.trim()}
      onClick={() => {
        const el = target.current;
        el?.scrollBy({ top: Math.round(el.clientHeight * 0.8), behavior: 'smooth' });
      }}
    >
      <span className="scrollmore__arrow" aria-hidden>▼</span> {label}
    </button>
  );
}
