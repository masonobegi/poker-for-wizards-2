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
  elementForCard, elementForSeat, flash, shake, timeRipple, vignette,
} from '@/lib/visuals';

const screenCentre = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

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
          window.setTimeout(() => playSfx('card_deal', { pitch: 0.96 + Math.random() * 0.08 }),
            i * (e.stagger ?? 70));
        });
        break;

      case 'flip':
        e.cardIds.forEach((_, i) => {
          window.setTimeout(() => playSfx('card_flip'), i * 60);
        });
        break;

      case 'chips': {
        const el = elementForSeat(e.playerId);
        burstAt('chips', el, { amount: e.amount });
        if (e.allIn) { shake(0.45); vignette('#f4576f', 900); }
        break;
      }

      case 'pot_to': {
        const el = elementForSeat(e.playerId);
        const target = centerOf(el);
        burst('potCollect', screenCentre(), target ? { target } : undefined);
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
        flash('#6ec8ff', 0.5);
        shake(0.5);
        chromatic(260);
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
        shake(0.35);
        break;

      case 'seal':
        flash('#6ec8ff', 0.35);
        shake(0.4);
        break;

      case 'rewind': {
        const at = e.cardId ? centerOf(elementForCard(e.cardId)) : null;
        timeRipple(at ?? screenCentre());
        chromatic(500);
        break;
      }

      case 'shake':
        shake(e.power);
        break;

      case 'flash':
        flash(e.color, e.power);
        break;

      case 'win': {
        const el = elementForSeat(e.playerId);
        if (e.impossible) {
          burst('impossible', centerOf(el) ?? screenCentre());
          shake(0.9);
          flash('#f0c465', 0.55);
          confetti();
        } else {
          burstAt('chips', el, { amount: e.amount });
        }
        break;
      }

      case 'eliminate':
        burstAt('eliminate', elementForSeat(e.playerId));
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
