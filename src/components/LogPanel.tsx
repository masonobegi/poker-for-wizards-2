import { memo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { LogEntry, PlayerView } from '@shared/types';
import { SCHOOLS } from '@shared/sigils';
import { ENTER } from '@/styles/motion';
import { Mark } from '@/art/marks';

function LogPanelBase({ entries, players }: {
  entries: LogEntry[];
  players: PlayerView[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** Whether the reader was at the bottom before this entry arrived. */
  const pinned = useRef(true);

  /*
   * Follow the ledger, unless the reader has gone looking.
   *
   * It used to jump to the bottom on every entry, full stop — so scrolling up
   * to re-read what a sigil did threw you back down the moment the next line
   * landed, and at a four-handed table that is every second or so. "I gotta
   * scroll but it scrolls weird."
   *
   * So it only follows while you are already at the bottom, which is what
   * every chat window does and what this panel is: a running record you
   * usually want the end of, and sometimes want the middle of.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = (): void => {
      // A couple of pixels of slack: fractional layout means an element
      // scrolled fully down is rarely exactly at scrollHeight.
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !pinned.current) return;
    /* After a frame: a new line enters with a motion transition, and reading
       scrollHeight in the same tick lands short of the line that triggered
       it — which is how the last entry ended up half off the bottom. */
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [entries.length]);

  const seatOf = (id?: string) =>
    id ? players.find((p) => p.id === id)?.avatar : undefined;

  return (
    <div className="log panel" ref={ref}>
      {entries.length === 0 ? (
        <p className="log-empty">The ledger is empty.</p>
      ) : null}

      {entries.map((e) => {
        const accent = e.school
          ? SCHOOLS[e.school as keyof typeof SCHOOLS]?.accent
          : undefined;
        return (
          <motion.p
            key={e.id}
            className={`log-line is-${e.tone}`}
            style={accent ? { ['--accent' as string]: accent } : undefined}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={ENTER}
            data-avatar={seatOf(e.playerId)}
          >
            {e.tone === 'impossible' ? <span className="log-mark"><Mark kind="ui" id="impossible" /></span> : null}
            {e.tone === 'magic' && !accent ? <span className="log-mark">✦</span> : null}
            {e.text}
          </motion.p>
        );
      })}
    </div>
  );
}

export default memo(LogPanelBase);
