import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { TableView } from '@shared/types';
import { Button } from '@/components/ui/kit';
import { useGame, useIsHost } from '@/store/net';
import Avatar from '@/components/Avatar';
import { RELIC_BY_ID } from '@shared/relics';
import { OMEN_BY_ID } from '@shared/omens';
import { RANK_NAME } from '@shared/cards';
import { bannerBusyMs } from '@/components/BannerLayer';
import { EASE_OUT, ENTER, ENTER_PANEL, SPRING_PLAYFUL, T_REDUCED } from '@/styles/motion';
// From the lazy-loading shim, not the `@/vfx` barrel — see SpellFlight.tsx.
import { centerOf, confetti, elementForSeat, flash, slowmo, vignette } from '@/lib/visuals';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { Mark } from '@/art/marks';
import { HEXES, MAX_HEX } from '@shared/hexes';
import { COVENS, covenOf } from '@shared/covens';
import { SIGILS } from '@shared/sigils';
import { RELICS } from '@shared/relics';
import { OMENS } from '@shared/omens';
import { openWishlist } from '@/lib/demo';
import { CountUp } from '@/components/fx/CountUp';

/** However long a banner claims, the panel is never held back further. */
const MAX_WAIT_MS = 4500;

export default function GameOver({ view }: { view: TableView }) {
  const isHost = useIsHost();
  const { startGame, leave } = useGame();
  const reduced = useReducedMotionPref();

  // Let the end-of-run banner have the screen first, then take it. Polled
  // rather than read once, because the banner's fx event and this phase change
  // arrive together and either can land first.
  const [bannerDone, setBannerDone] = useState(false);
  useEffect(() => {
    if (bannerDone) return;
    const giveUpAt = Date.now() + MAX_WAIT_MS;
    const id = window.setInterval(() => {
      if (bannerBusyMs() === 0 || Date.now() > giveUpAt) {
        window.clearInterval(id);
        setBannerDone(true);
      }
    }, 150);
    return () => window.clearInterval(id);
  }, [bannerDone]);

  const winner = view.players.find((p) => p.id === view.winnerId);
  const board = [...view.players].sort((a, b) => b.chips - a.chips || b.handsWon - a.handsWon);

  // The run you just played, from the table you just played it at. A roguelike
  // ends by showing you the thing you built, and this one's version of that is
  // the rulebook: by ante six nobody sat down to the game you finished, and
  // naming it back is most of what makes a player start another.
  const me = view.players.find((p) => p.isYou);
  const myRelics = (me?.relics ?? []).map((id) => RELIC_BY_ID[id]).filter(Boolean);

  /*
   * The end of a whole run is the rarest moment the game has, and it used to
   * get a panel spring and a list fade while a single mid-run impossible hand
   * got shake + flash + chromatic + slow-mo + confetti. The delight budget was
   * spent on the frequent moment and withheld from the rare one.
   *
   * There is no `gameover` event on the wire, so this fires from the component
   * rather than from fxbridge. Deliberately a *different shape* from the
   * impossible-hand hit: no shake and no chromatic split. That one is a shock —
   * instant, loud, over in under a second. This is a settle: the vignette
   * closes in and holds while the panel arrives, then the celebration lands on
   * top of it rather than into the same frame.
   *
   * It runs on the banner too, before the panel is allowed to mount: this is
   * a hook, and the early return below would otherwise skip it on exactly the
   * frames where the run is ending.
   */
  const winnerId = view.winnerId;
  useEffect(() => {
    if (reduced || !bannerDone) return undefined;
    vignette('var(--gold)', 1600);
    slowmo(0.55, 1200);
    const t = window.setTimeout(() => {
      const at = centerOf(elementForSeat(winnerId ?? '')) ?? undefined;
      confetti(at);
      flash('#f0c465', 0.35);
    }, 420);
    return () => window.clearTimeout(t);
  }, [winnerId, reduced, bannerDone]);

  if (!bannerDone) return null;

  // A demo table (the server sets demoAntes) ends on the wishlist screen,
  // whether the run was cut off after its last ante or ended in a bust.
  const demo = !!view.config.demoAntes;
  const busted = me?.bustedBy;

  const standings = (
    <ul className="gameover-board">
      {board.map((p, i) => (
        <motion.li
          key={p.id}
          className={p.id === view.winnerId ? 'is-first' : ''}
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...ENTER, delay: 0.5 + Math.min(i * 0.06, 0.3) }}
        >
          <span className="gameover-rank mono">{i + 1}</span>
          <Avatar seed={p.avatar} size={28} bot={p.isBot} dim={p.eliminated} />
          <span className="gameover-name">{p.name}</span>
          <span className="gameover-relics">
            {p.relics.map((id) => {
              const r = RELIC_BY_ID[id];
              return r ? <Mark key={id} kind="relic" id={id} fallback={r.glyph} title={r.name} /> : null;
            })}
          </span>
          <span className="gameover-stat mono">{p.handsWon} won</span>
          <span className="gameover-chips mono">{p.chips.toLocaleString()}</span>
        </motion.li>
      ))}
    </ul>
  );

  return (
    <motion.div
      className="gameover"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={ENTER_PANEL}
    >
      <motion.div
        className="gameover-panel"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduced ? { duration: T_REDUCED, ease: EASE_OUT } : SPRING_PLAYFUL}
      >
        <span className="eyebrow">
          {view.demoComplete ? 'The demo ends here' : 'The table is closed'}
        </span>

        {view.demoComplete ? (
          <motion.div
            className="gameover-winner"
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...SPRING_PLAYFUL, delay: 0.25 }}
          >
            <h2>You survived {view.ante} antes</h2>
            <p>The full game keeps dealing: a new omen every ante, until one player holds every chip.</p>
          </motion.div>
        ) : null}

        {winner ? (
          <motion.div
            className="gameover-winner"
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...SPRING_PLAYFUL, delay: 0.25 }}
          >
            <Avatar seed={winner.avatar} size={82} bot={winner.isBot} />
            <h2>{winner.name}</h2>
            {/* A run also ends the hand the last human goes out, with bots
                still holding chips; the chip leader takes the table then. */}
            <p>
              {view.players.some((p) => p.id !== winner.id && p.chips > 0)
                ? `led with ${winner.chips.toLocaleString()} chips when the last player went out`
                : 'took every chip on the table'}
            </p>
          </motion.div>
        ) : null}

        {me ? (
          <motion.div
            className="gameover-run"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.38 }}
          >
            <span className="eyebrow">
              Your run
              {view.config.seed?.startsWith('daily:') ? ' · Daily Rite' : ''}
              {(view.config.hex ?? 1) > 1 ? ` · ${HEXES[(view.config.hex ?? 1) - 1].name}` : ''}
            </span>

            {/* What the win bought. Stated as what is open rather than as
                news, because a replayed win at the same hex is still true. */}
            {view.winnerId === me.id && !view.config.seed && (view.config.hex ?? 1) < MAX_HEX ? (
              <p className="gameover-unlock">
                {HEXES[view.config.hex ?? 1].name} is open for {covenOf(me.coven).name}.
              </p>
            ) : null}

            {/* The run, totted up: each figure counts up in turn and lands
                with a pop, the basketball roguelike's reward screen. The
                buttons below are live the whole time; nothing waits on it. */}
            <div className="gameover-runstats">
              <span><strong><CountUp value={view.ante} delay={520} duration={500} /></strong> antes</span>
              <span><strong><CountUp value={me.handsWon} delay={680} duration={600} /></strong> hands won</span>
              {me.biggestPot > 0 ? (
                <span>biggest pot <strong><CountUp value={me.biggestPot} delay={840} duration={900} /></strong></span>
              ) : null}
            </div>

            {/* What ended it, in poker words. A run that ends without the
                player being told why reads as the game cheating. */}
            {busted ? (
              <p className="gameover-bust">
                Knocked out on hand {busted.hand}, ante {busted.ante}, by {busted.name}&rsquo;s{' '}
                <strong>{busted.handName === 'Uncontested' ? 'bet' : busted.handName}</strong>
                {busted.yourHand ? <> against your {busted.yourHand}</> : null}.
              </p>
            ) : null}
            {me.revived ? (
              <p className="gameover-bust">
                Your phylactery broke on hand {me.revived.hand}, to {me.revived.name}&rsquo;s{' '}
                <strong>{me.revived.handName === 'Uncontested' ? 'bet' : me.revived.handName}</strong>.
              </p>
            ) : null}

            {view.omens.length ? (
              <>
                <p className="gameover-runlabel">The rules you finished under</p>
                <ul className="gameover-omens">
                  {view.omens.map((o) => {
                    const def = OMEN_BY_ID[o.id];
                    if (!def) return null;
                    return (
                      <li key={o.id} title={def.text}>
                        <span className="gameover-omenglyph">{def.glyph}</span>
                        {def.name}
                        {o.rank ? ` — ${RANK_NAME[o.rank]}` : ''}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}

            {myRelics.length ? (
              <>
                <p className="gameover-runlabel">What you were carrying</p>
                <ul className="gameover-relicrow">
                  {myRelics.map((r) => (
                    <li key={r.id} title={r.text}>
                      <span className="gameover-omenglyph">{r.glyph}</span>
                      {r.name}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </motion.div>
        ) : null}

        {demo ? null : standings}

        {demo ? (
          <motion.div
            className="gameover-fullgame"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <p className="gameover-runlabel">In the full game</p>
            <ul>
              <li>The run goes on, ante after ante, under a rulebook that keeps growing.</li>
              <li>All {COVENS.length} covens, each with {MAX_HEX} hexes to climb, and a Daily Rite.</li>
              <li>{SIGILS.length} sigils, {RELICS.length} relics and {OMENS.length} omens.</li>
              <li>Five of a Kind, Flush House and Flush Five: hands a real deck can&rsquo;t make.</li>
            </ul>
          </motion.div>
        ) : null}

        <div className="gameover-actions">
          {demo ? (
            <Button tone="primary" size="lg" display block onClick={openWishlist}>
              Wishlist on Steam
            </Button>
          ) : null}
          {isHost ? (
            <Button tone={demo ? 'default' : 'primary'} size={demo ? 'md' : 'lg'} display={!demo} block onClick={startGame}>
              {demo ? 'Play the demo again' : 'Deal again'}
            </Button>
          ) : (
            <p className="dim" style={{ textAlign: 'center', fontSize: 'var(--fs-sm)' }}>
              Waiting on the host to deal again…
            </p>
          )}
          <Button tone="ghost" block onClick={leave}>Leave table</Button>
        </div>

        {/* A demo ends on its pitch and the wishlist button, which have to be
            on screen without scrolling at 1280x800; the standings follow. */}
        {demo ? standings : null}
      </motion.div>
    </motion.div>
  );
}
