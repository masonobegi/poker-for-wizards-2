/**
 * The Next Fest demo, and the line that says what ended a run.
 *
 * A demo run must end after DEMO_ANTES antes, on the wishlist screen, with no
 * winner declared (nothing a win unlocks is unlocked); a run that busts first
 * ends the ordinary way. The server, not the page, decides that a table is a
 * demo table. And whoever goes out is told by whom, and with what hand.
 */
import { strict as assert } from 'node:assert';
import { mock, test } from 'node:test';

import { Engine } from '../server/game/engine';
import { DEFAULT_CONFIG } from '../shared/types';
import { DEMO_ANTES, DEMO_COVENS, demoCoven, wishlistUrl } from '../shared/demo';

const STEP_MS = 120;

function quiet<T>(fn: () => T): T {
  const warn = console.warn; const err = console.error;
  console.warn = () => {}; console.error = () => {};
  try { return fn(); } finally { console.warn = warn; console.error = err; }
}

/** Plays a solo table to game over; `shove` decides how the player bets. */
function playSolo(seed: string, cfg: Partial<typeof DEFAULT_CONFIG>, shove: boolean, capMs = 90 * 60_000) {
  const e = new Engine('DEMO', 'host', { ...DEFAULT_CONFIG, ...cfg, seed }, () => {}, () => {});
  try {
    e.addPlayer('host', 'host');
    for (let i = 0; i < 3; i++) e.addBot();
    assert.ok(e.start().ok);
    const t = e.table;
    let waited = 0;
    while (t.phase !== 'gameover' && waited < capMs) {
      if (t.phase === 'shop') e.shopDone('host');
      if (t.stack?.pending.includes('host')) e.pass('host');
      if (t.actingId === 'host' && !t.stack) {
        if (shove) e.act('host', { kind: 'allin' });
        else if (!e.act('host', { kind: 'check' }).ok) e.act('host', { kind: 'fold' });
      }
      mock.timers.tick(STEP_MS);
      waited += STEP_MS;
    }
    const me = t.players.find((p) => p.id === 'host')!;
    return {
      phase: t.phase, ante: t.ante, hands: t.handNumber, demoComplete: !!t.demoComplete,
      winnerId: t.winnerId, eliminated: me.eliminated, bustedBy: me.bustedBy,
    };
  } finally {
    e.dispose();
  }
}

test('a demo run ends after its last ante, with no winner declared', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: Date.UTC(2026, 9, 9, 12) });
  try {
    quiet(() => {
      let survived = 0;
      for (let n = 0; n < 4; n++) {
        const r = playSolo(`demo-${n}`, { demoAntes: DEMO_ANTES }, false);
        assert.equal(r.phase, 'gameover', `demo-${n} never ended`);
        if (r.eliminated) {
          // A bust ends a demo run the ordinary way, before the cap.
          assert.equal(r.demoComplete, false);
          continue;
        }
        survived++;
        assert.equal(r.demoComplete, true, `demo-${n}: survived but not marked complete`);
        assert.equal(r.ante, DEMO_ANTES, `demo-${n}: ended at ante ${r.ante}`);
        assert.equal(r.hands, DEMO_ANTES * DEFAULT_CONFIG.handsPerAnte, `demo-${n}: ${r.hands} hands`);
        assert.equal(r.winnerId, null, 'a demo cut-off declares no winner, so it unlocks nothing');
      }
      // Checking and folding cannot bust in nine hands from 100 big blinds.
      assert.ok(survived >= 3, `only ${survived} of 4 cautious demo runs survived to the cap`);
    });
  } finally {
    mock.timers.reset();
  }
});

test('a full-game table is not capped', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: Date.UTC(2026, 9, 9, 12) });
  try {
    quiet(() => {
      // Ten minutes of check-and-fold passes ante 3 without a demo cap firing.
      const r = playSolo('full-0', {}, false, 10 * 60_000);
      assert.equal(r.demoComplete, false);
      assert.ok(r.ante > DEMO_ANTES || r.phase === 'gameover', `stopped at ante ${r.ante}`);
    });
  } finally {
    mock.timers.reset();
  }
});

test('whoever is knocked out is told by whom and with what', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: Date.UTC(2026, 9, 9, 12) });
  try {
    quiet(() => {
      let busts = 0;
      for (let n = 0; n < 6 && busts < 2; n++) {
        const r = playSolo(`bust-${n}`, {}, true);
        if (!r.eliminated) continue;
        busts++;
        assert.ok(r.bustedBy, `bust-${n}: eliminated with no bustedBy`);
        assert.ok(r.bustedBy!.name.length > 0);
        assert.ok(r.bustedBy!.handName.length > 0);
        assert.ok(r.bustedBy!.ante >= 1 && r.bustedBy!.hand >= 1);
      }
      assert.ok(busts >= 1, 'shoving every hand never busted: the probe proves nothing');
    });
  } finally {
    mock.timers.reset();
  }
});

test('the demo opens three covens and falls back to the first', () => {
  assert.equal(DEMO_COVENS.length, 3);
  for (const id of DEMO_COVENS) assert.equal(demoCoven(id), id);
  assert.equal(demoCoven('loom'), DEMO_COVENS[0]);
  assert.equal(demoCoven('nonsense'), DEMO_COVENS[0]);
  assert.match(wishlistUrl(0), /^https:\/\/store\.steampowered\.com\//);
  assert.equal(wishlistUrl(123), 'https://store.steampowered.com/app/123/HEXHOLD/');
});

test('a demo server decides the demo, whatever the page asks for', async () => {
  const { sanitizeConfig } = await import('../server/net/io');
  const asked = { hex: 5, seed: 'daily:2026-10-09', botSkill: 'master', demoAntes: 99 };
  const prev = process.env.HEXHOLD_DEMO;
  try {
    delete process.env.HEXHOLD_DEMO;
    const full = sanitizeConfig(asked);
    assert.equal(full.hex, 5);
    assert.equal(full.seed, 'daily:2026-10-09');
    assert.equal(full.demoAntes, undefined, 'a client can never set the demo cap itself');

    process.env.HEXHOLD_DEMO = '1';
    const demo = sanitizeConfig(asked);
    assert.equal(demo.hex, 1);
    assert.equal(demo.seed, undefined, 'no Daily Rite in the demo');
    assert.equal(demo.demoAntes, DEMO_ANTES);
    assert.equal(demo.botSkill, 'master', 'the opponents are still the player\'s choice');
  } finally {
    if (prev === undefined) delete process.env.HEXHOLD_DEMO; else process.env.HEXHOLD_DEMO = prev;
  }
});
