/**
 * Turns the server's `fx` stream into sound and light.
 *
 * The server says what happened ("this card collapsed", "this pot went there").
 * Everything about how that *looks* is decided here, in one place, so the rest
 * of the UI can stay declarative and never has to reach for a particle system.
 */
import { onFx } from '@/store/net';
import { playSfx, setMusic, duckMusic } from '@/lib/sound';
import {
  SCHOOL_COLOR, burst, burstAt, centerOf, chromatic, confetti,
  elementForCard, elementForSeat, flash, shake, slowmo, timeRipple, vignette,
} from '@/lib/visuals';

const screenCentre = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

/** Where the pot lives on screen — tagged by Board.tsx with `data-fx-pot`. */
function elementForPot(): Element | null {
  return document.querySelector('[data-fx-pot]');
}

/**
 * The server's generic `{ t: 'shake', power }` events (and a few internal
 * calls below) carry a 0..1 intensity, but `vfx.shake(power, ms)` wants
 * pixels of travel — 4 reads as a tap, 26 reads as the table is genuinely
 * unhappy. Remapping a bare 0..1 straight through (as this bridge used to)
 * produced a shake of a fraction of a pixel: present in the code, invisible
 * on screen. This is the one place that conversion happens.
 */
function shakePx(intensity: number): number {
  const k = intensity < 0 ? 0 : intensity > 1 ? 1 : intensity;
  return 2 + k * 24;
}

/** Cards animate in as they arrive, so a burst has to wait for the element. */
function whenCard(id: string, fn: (el: Element) => void, tries = 12): void {
  const el = elementForCard(id);
  if (el) { fn(el); return; }
  if (tries <= 0) return;
  requestAnimationFrame(() => whenCard(id, fn, tries - 1));
}

export function installFxBridge(): () => void {
  return onFx((e) => {
    switch (e.t) {
      case 'sfx':
        playSfx(e.name, { vol: e.vol, pitch: e.pitch });
        break;

      case 'music':
        setMusic(e.mood);
        break;

      case 'deal':
        e.cardIds.forEach((id, i) => {
          window.setTimeout(() => {
            playSfx('card_deal', { pitch: 0.96 + Math.random() * 0.08 });
            whenCard(id, (el) => burstAt('sparkleTrail', el, { count: 4 }));
          }, i * (e.stagger ?? 70));
        });
        break;

      case 'flip':
        e.cardIds.forEach((id, i) => {
          window.setTimeout(() => {
            playSfx('card_flip');
            whenCard(id, (el) => burstAt('sparkleTrail', el, { count: 3 }));
          }, i * 60);
        });
        break;

      case 'chips': {
        const seatEl = elementForSeat(e.playerId);
        const potPt = centerOf(elementForPot());
        if (potPt) burstAt('chipsToPot', seatEl, { amount: e.amount, target: potPt });
        else burstAt('chips', seatEl, { amount: e.amount });
        if (e.allIn) { shake(shakePx(0.42), 280); vignette('#f4576f', 900); }
        break;
      }

      case 'pot_to': {
        const potPt = centerOf(elementForPot()) ?? screenCentre();
        const seatPt = centerOf(elementForSeat(e.playerId));
        burst('potCollect', potPt, seatPt ? { target: seatPt } : undefined);
        playSfx('pot_collect');
        break;
      }

      case 'cast': {
        const colour = SCHOOL_COLOR[e.school] ?? '#b98cff';
        const ids = e.targetIds ?? [];
        if (ids.length) ids.forEach((id) => whenCard(id, (el) => burstAt('cast', el, { school: e.school })));
        else burst('cast', screenCentre(), { school: e.school });
        vignette(colour, 700);
        duckMusic(0.5, 600);
        break;
      }

      case 'counter':
        flash('#6ec8ff', 0.55);
        shake(shakePx(0.62), 260);
        chromatic(280);
        break;

      case 'fizzle':
        playSfx('spell_fizzle');
        break;

      case 'collapse':
        whenCard(e.cardId, (el) => burstAt('collapse', el));
        break;

      case 'superpose':
        whenCard(e.cardId, (el) => burstAt('superpose', el));
        playSfx('superpose');
        break;

      case 'diverge':
        whenCard(e.cardId, (el) => burstAt('cast', el, { school: 'veil' }));
        chromatic(340);
        break;

      case 'entangle':
        e.cardIds.forEach((id) => whenCard(id, (el) => burstAt('cast', el, { school: 'bind' })));
        break;

      case 'inscribe':
        whenCard(e.cardId, (el) => burstAt('cast', el, { school: 'weave' }));
        break;

      case 'burn':
        whenCard(e.cardId, (el) => burstAt('burn', el));
        shake(shakePx(0.32), 200);
        break;

      case 'seal':
        flash('#6ec8ff', 0.35);
        shake(shakePx(0.36), 220);
        break;

      case 'rewind': {
        const at = e.cardId ? centerOf(elementForCard(e.cardId)) : null;
        timeRipple(at ?? screenCentre());
        chromatic(500);
        break;
      }

      case 'shake':
        shake(shakePx(e.power));
        break;

      case 'flash':
        flash(e.color, e.power);
        break;

      case 'win': {
        const seatEl = elementForSeat(e.playerId);
        const seatPt = centerOf(seatEl);
        if (e.impossible) {
          burst('impossible', seatPt ?? screenCentre());
          shake(shakePx(1), 700);
          flash('#f0c465', 0.6);
          chromatic(420);
          slowmo(0.42, 900);
          confetti(seatPt);
        } else {
          const potPt = centerOf(elementForPot());
          if (potPt && seatPt) burst('potCollect', potPt, { target: seatPt });
          else burstAt('chips', seatEl, { amount: e.amount });
        }
        break;
      }

      case 'eliminate':
        burstAt('eliminate', elementForSeat(e.playerId));
        shake(shakePx(0.4), 320);
        vignette('#f4576f', 1400);
        break;

      case 'banner':
      case 'reveal':
        // Handled declaratively by the banner layer and the seat components.
        break;

      default:
        break;
    }
  });
}
