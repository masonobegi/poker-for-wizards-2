import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useGame } from '@/store/net';
import { EMOTES } from '@shared/protocol';
import { playSfx } from '@/lib/sound';
import './chat.css';
import { ENTER } from '@/styles/motion';

export default function ChatBox({ className = '', compact }: {
  className?: string;
  compact?: boolean;
}) {
  const chat = useGame((s) => s.chat);
  const say = useGame((s) => s.say);
  const emote = useGame((s) => s.emote);
  const youId = useGame((s) => s.view?.youId);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.length]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    say(t);
    setText('');
    playSfx('ui_click', { vol: 0.5 });
  };

  return (
    <section className={`chat panel ${compact ? 'is-compact' : ''} ${className}`}>
      {!compact ? (
        <div className="panel-head"><span className="panel-title">Table Talk</span></div>
      ) : null}

      <div className="chat-list" ref={listRef}>
        {chat.length === 0 ? (
          <p className="chat-empty">Nobody has said anything yet.</p>
        ) : null}
        {chat.map((m) => (
          <motion.p
            key={m.id}
            className={`chat-msg ${m.system ? 'is-system' : ''} ${m.playerId === youId ? 'is-you' : ''}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={ENTER}
          >
            {!m.system ? <span className="chat-who">{m.name}</span> : null}
            <span className="chat-text">{m.text}</span>
          </motion.p>
        ))}
      </div>

      <div className="chat-emotes">
        {EMOTES.map((e) => (
          <button
            key={e.id}
            className="chat-emote"
            title={e.label}
            aria-label={e.label}
            onClick={() => { emote(e.id); playSfx('ui_hover'); }}
          >
            {e.glyph}
          </button>
        ))}
      </div>

      <form
        className="chat-form"
        onSubmit={(e) => { e.preventDefault(); send(); }}
      >
        <input
          className="chat-input"
          value={text}
          maxLength={200}
          placeholder="Say something…"
          onChange={(e) => setText(e.target.value)}
          aria-label="Chat message"
        />
        <button className="chat-send" type="submit" disabled={!text.trim()} aria-label="Send">
          &rarr;
        </button>
      </form>
    </section>
  );
}
