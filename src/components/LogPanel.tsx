import { memo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { LogEntry, PlayerView } from '@shared/types';
import { SCHOOLS } from '@shared/sigils';
import { ENTER } from '@/styles/motion';

function LogPanelBase({ entries, players }: {
  entries: LogEntry[];
  players: PlayerView[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
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
            {e.tone === 'impossible' ? <span className="log-mark">⧉</span> : null}
            {e.tone === 'magic' && !accent ? <span className="log-mark">✦</span> : null}
            {e.text}
          </motion.p>
        );
      })}
    </div>
  );
}

export default memo(LogPanelBase);
