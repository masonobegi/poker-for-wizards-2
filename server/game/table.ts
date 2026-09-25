/**
 * Table construction, seat bookkeeping, pot maths, and — the important part —
 * per-player projection.
 *
 * The server holds one truth. Every connected client is handed a *different*
 * reading of it, because several sigils exist purely to make two players
 * disagree about the same card. All of that filtering happens here, once, so
 * there is exactly one place where private state could leak.
 */
import { nanoid } from 'nanoid';
import {
  type CardEntity, type CardView, type Face, type Rank,
  faceLabel, isQuantum, standardDeck, viewCard,
} from '../../shared/cards';
import { evalComplexity, evaluate, type RuleMods } from '../../shared/hand';
import { hasVision, mergeRelicMods, relicNumber } from '../../shared/relics';
import { SIGIL_BY_ID, type SigilDef, type SigilInstance } from '../../shared/sigils';
import {
  DEFAULT_CONFIG, emptyForeknowledge, isStreet,
  type HandRead, type LogEntry, type LogTone, type Phase, type Player, type PlayerView,
  type Pot, type RoomConfig, type StackEntry, type Table, type TableView,
} from '../../shared/types';
import { Rng } from '../../shared/rng';
import { omenMods, omenNumber } from '../../shared/omens';
import { DEFAULT_COVEN } from '../../shared/covens';

export const AVATARS = 12;

const BOT_NAMES = [
  'Mordent', 'Vesper', 'Kestrel', 'Nyx', 'Sable', 'Corvid',
  'Ashgrave', 'Wren', 'Thorn', 'Quill', 'Ember', 'Solenne',
];

export function createTable(code: string, hostId: string, config: Partial<RoomConfig> = {}): Table {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const cards = new Map<string, CardEntity>();
  for (const c of standardDeck()) cards.set(c.id, c);

  return {
    code,
    config: cfg,
    hostId,
    phase: 'lobby',
    handNumber: 0,
    ante: 1,
    bb: cfg.baseBlind,
    sb: Math.floor(cfg.baseBlind / 2),
    players: [],
    cards,
    deck: [],
    discard: [],
    board: [],
    burnedSlots: [],
    echoTimeline: null,
    dealerSeat: 0,
    actingId: null,
    actingUntil: null,
    lastAggressorId: null,
    actedThisStreet: new Set(),
    pot: 0,
    pots: [],
    currentBet: 0,
    minRaise: cfg.baseBlind,
    stack: null,
    mods: {},
    modNotes: [],
    sealedRanks: [],
    tempMarks: [],
    quantumFlop: false,
    omens: [],
    shop: new Map(),
    payout: null,
    log: [],
    seed: nanoid(10),
    createdAt: Date.now(),
    lastActivity: Date.now(),
    winnerId: null,
  };
}

export function createPlayer(
  id: string, name: string, seat: number, cfg: RoomConfig, isBot = false,
): Player {
  return {
    id,
    name: name.slice(0, 16) || 'Player',
    seat,
    avatar: seat % AVATARS,
    isBot,
    connected: true,
    chips: cfg.startingChips,
    bet: 0,
    committed: 0,
    betVeiled: false,
    folded: false,
    allIn: false,
    eliminated: false,
    sittingOut: false,
    mana: 3,
    // A seed only: `maxManaFor` recomputes this at the top of every hand from
    // the base, the player's relics and the table's omens, so editing it here
    // changes nothing after the first deal. (It was briefly set to 7 to tighten
    // the mana economy, which did exactly nothing for that reason — the real
    // fix was the hand-start grant in engine.ts.)
    maxMana: 8,
    sigils: [],
    relics: [],
    coven: DEFAULT_COVEN,
    shards: cfg.startingShards,
    hole: [],
    warded: false,
    severed: false,
    hexed: 0,
    blinded: false,
    foreknowledge: emptyForeknowledge(),
    shopDone: false,
    ready: isBot,
    handsWon: 0,
    biggestPot: 0,
  };
}

export function botName(table: Table, rng: Rng): string {
  const taken = new Set(table.players.map((p) => p.name));
  const free = BOT_NAMES.filter((n) => !taken.has(n));
  return free.length ? rng.pick(free) : `Bot ${table.players.length + 1}`;
}

export function freeSeat(table: Table): number {
  for (let i = 0; i < table.config.maxPlayers; i++) {
    if (!table.players.some((p) => p.seat === i)) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Seat order
// ---------------------------------------------------------------------------

export const seated = (t: Table): Player[] => [...t.players].sort((a, b) => a.seat - b.seat);
export const byId = (t: Table, id: string | null | undefined): Player | undefined =>
  id ? t.players.find((p) => p.id === id) : undefined;

/** Players still holding chips in the tournament. */
export const alive = (t: Table): Player[] => seated(t).filter((p) => !p.eliminated);
/** Players still contesting the current pot. */
export const live = (t: Table): Player[] => alive(t).filter((p) => !p.folded);
/** Players who can still make a betting decision. */
export const actable = (t: Table): Player[] => live(t).filter((p) => !p.allIn);

/** Next seat clockwise from `fromSeat` satisfying `pred`. */
export function nextSeat(t: Table, fromSeat: number, pred: (p: Player) => boolean): Player | null {
  const order = seated(t);
  if (order.length === 0) return null;
  const start = order.findIndex((p) => p.seat > fromSeat);
  const base = start === -1 ? 0 : start;
  for (let i = 0; i < order.length; i++) {
    const p = order[(base + i) % order.length];
    if (pred(p)) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pots
// ---------------------------------------------------------------------------

/**
 * Split committed chips into a main pot and as many side pots as the all-ins
 * require. Folded players' chips stay in the pot but win nothing.
 */
export function buildPots(t: Table): Pot[] {
  const contributors = alive(t).filter((p) => p.committed > 0);
  if (contributors.length === 0) return [];

  const levels = [...new Set(contributors.map((p) => p.committed))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;

  for (const level of levels) {
    const slice = level - prev;
    if (slice <= 0) { prev = level; continue; }
    const inThis = contributors.filter((p) => p.committed >= level);
    const amount = slice * inThis.length;
    const eligible = inThis.filter((p) => !p.folded).map((p) => p.id);
    if (amount > 0 && eligible.length > 0) {
      const last = pots[pots.length - 1];
      const sameField = last && last.eligible.length === eligible.length
        && last.eligible.every((id) => eligible.includes(id));
      if (sameField) last.amount += amount;
      else pots.push({ amount, eligible });
    } else if (amount > 0 && pots.length) {
      // Everyone at this level folded; the chips roll into the previous pot.
      pots[pots.length - 1].amount += amount;
    }
    prev = level;
  }

  pots.forEach((p, i) => { p.label = i === 0 ? 'Main Pot' : `Side Pot ${i}`; });
  return pots;
}

export const totalPot = (t: Table): number =>
  t.pot + t.players.reduce((a, p) => a + p.bet, 0);

// ---------------------------------------------------------------------------
// Rules in force
// ---------------------------------------------------------------------------

/** Table-wide sigil rules plus this player's relics plus any curse on them. */
export function modsFor(t: Table, p: Player): RuleMods {
  const relic = mergeRelicMods(p.relics);
  const omen = omenMods(t.omens);
  const m: RuleMods = { ...t.mods };

  // Omens are table-wide and permanent; they merge in under the same rules as
  // a relic, except that nobody chose them.
  if (omen.mergedColors) m.mergedColors = true;
  if (omen.wheelWrap) m.wheelWrap = true;
  if (omen.facesAreKings) m.facesAreKings = true;
  if (omen.lowWins) m.lowWins = true;
  if (omen.memoryBonus) m.memoryBonus = true;
  if (omen.flushSize !== undefined) m.flushSize = Math.min(m.flushSize ?? 5, omen.flushSize);
  if (omen.deadRanks?.length) {
    m.deadRanks = [...new Set([...(m.deadRanks ?? []), ...omen.deadRanks])];
  }
  if (omen.categoryShift) m.categoryShift = (m.categoryShift ?? 0) + omen.categoryShift;

  if (relic.mergedColors) m.mergedColors = true;
  if (relic.wheelWrap) m.wheelWrap = true;
  if (relic.facesAreKings) m.facesAreKings = true;
  if (relic.lowWins) m.lowWins = true;
  if (relic.flushSize !== undefined) m.flushSize = Math.min(m.flushSize ?? 5, relic.flushSize);
  if (relic.straightSize !== undefined) m.straightSize = Math.min(m.straightSize ?? 5, relic.straightSize);

  const shift = (m.categoryShift ?? 0) + (relic.categoryShift ?? 0) - p.hexed;
  if (shift !== 0) m.categoryShift = shift;

  return m;
}

export const maxManaFor = (p: Player, t?: Table): number =>
  8 + relicNumber(p.relics, (r) => r.mana?.max)
    + (t ? omenNumber(t.omens, (o) => o.mana?.max) : 0);

export const sigilHandSize = (p: Player): number =>
  4 + relicNumber(p.relics, (r) => r.sigils?.handSize);

export function manaCost(p: Player, def: SigilDef, t?: Table): number {
  const delta = relicNumber(p.relics, (r) => r.sigils?.costDelta)
    + (t ? omenNumber(t.omens, (o) => o.sigilCost) : 0);
  return Math.max(1, def.cost + delta);
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export function log(t: Table, text: string, tone: LogTone = 'plain', extra: Partial<LogEntry> = {}): void {
  t.log.push({ id: nanoid(8), at: Date.now(), tone, text, ...extra });
  if (t.log.length > 200) t.log.splice(0, t.log.length - 200);
}

// ---------------------------------------------------------------------------
// Card visibility
// ---------------------------------------------------------------------------

export const card = (t: Table, id: string): CardEntity | undefined => t.cards.get(id);
export const cardsOf = (t: Table, ids: string[]): CardEntity[] =>
  ids.map((id) => t.cards.get(id)).filter((c): c is CardEntity => !!c);

/** Hole cards a player scores from, folding in Sympathy's shared pool. */
export function scoringHole(t: Table, p: Player): string[] {
  if (!p.sharedWith) return p.hole;
  const other = byId(t, p.sharedWith);
  return other ? [...p.hole, ...other.hole] : p.hole;
}

/** Every card a player's hand is built from. */
export function handCards(t: Table, p: Player): CardEntity[] {
  return cardsOf(t, [...scoringHole(t, p), ...t.board]);
}

interface ProjectOpts {
  viewer: Player;
  /** Cards this viewer may read fully. */
  reveal: boolean;
  showdown: boolean;
}

/** Project one entity through one viewer's eyes, including lies told to them. */
function project(t: Table, id: string, o: ProjectOpts): CardView {
  const c = t.cards.get(id);
  if (!c) return { id, state: 'facedown', face: null, marks: [], memory: 0 };

  const seesClouds = hasVision(o.viewer.relics, 'quantum_clouds');
  const v = viewCard(c, {
    viewerId: o.viewer.id,
    reveal: o.reveal || (seesClouds && isQuantum(c)),
    showdown: o.showdown,
  });

  // False Face: this viewer has been shown something that is not there.
  const lie = o.viewer.foreknowledge.lies[id];
  if (lie && !o.showdown) {
    return { ...v, state: 'faceup', face: lie, possible: undefined, diverged: false };
  }

  // Leaked by a sigil — this viewer alone gets to read it.
  if (!o.reveal && o.viewer.foreknowledge.seenHole.includes(id) && c.veil !== 'sealed') {
    return viewCard(c, { viewerId: o.viewer.id, reveal: true, showdown: o.showdown });
  }

  return v;
}

/** Does `viewer` get to read `owner`'s hole cards right now? */
function canReadHole(t: Table, viewer: Player, owner: Player, showdown: boolean): boolean {
  if (viewer.id === owner.id) return true;
  if (viewer.sharedWith === owner.id) return true;
  if (showdown && !owner.folded) return true;
  return false;
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

export function castableSigils(t: Table, p: Player): string[] {
  if (!t.config.magicEnabled) return [];
  const out: string[] = [];
  for (const s of p.sigils) {
    if (canCast(t, p, s).ok) out.push(s.uid);
  }
  return out;
}

export interface CastCheck { ok: boolean; reason?: string }

export function canCast(t: Table, p: Player, inst: SigilInstance): CastCheck {
  const def = SIGIL_BY_ID[inst.defId];
  if (!def) return { ok: false, reason: 'Unknown sigil' };
  if (!t.config.magicEnabled) return { ok: false, reason: 'Magic is disabled at this table' };
  if (p.folded || p.eliminated) return { ok: false, reason: 'You are out of the hand' };
  if (p.mana < manaCost(p, def, t)) return { ok: false, reason: 'Not enough mana' };

  const responding = !!t.stack;
  const isResponse = def.timing.includes('response');

  if (responding) {
    if (!isResponse) return { ok: false, reason: 'Only a response can be cast onto the stack' };
    if (!t.stack!.pending.includes(p.id)) return { ok: false, reason: 'You have already responded' };
    return { ok: true };
  }

  if (isResponse && def.timing.length === 1) {
    return { ok: false, reason: 'Nothing is being cast' };
  }

  if (def.timing.includes('any') && isStreet(t.phase)) return { ok: true };
  if (def.timing.includes(t.phase as never)) return { ok: true };
  return { ok: false, reason: `Cannot be cast during ${phaseLabel(t.phase)}` };
}

export function phaseLabel(p: Phase): string {
  switch (p) {
    case 'lobby': return 'the lobby';
    case 'ante_intro': return 'the ante break';
    case 'deal': return 'the deal';
    case 'preflop': return 'pre-flop';
    case 'flop': return 'the flop';
    case 'turn': return 'the turn';
    case 'river': return 'the river';
    case 'showdown': return 'the showdown';
    case 'payout': return 'the payout';
    case 'shop': return 'the market';
    default: return 'this phase';
  }
}

export function stackEntryView(t: Table, e: StackEntry) {
  const def = SIGIL_BY_ID[e.sigilId];
  const caster = byId(t, e.casterId);
  return {
    ...e,
    sigilName: def?.name ?? e.sigilId,
    casterName: caster?.name ?? '???',
    school: def?.school ?? 'veil',
  };
}

/**
 * What the player is currently holding, in words.
 *
 * A poker client that does not tell you your own hand is missing the most
 * basic thing it does, and here it is worse than that: a card opposite you can
 * be two ranks at once, a rank can be struck from the game mid-street, and a
 * relic can quietly bump your whole hand a category. Naming the result as it
 * changes is how any of that becomes legible — the line reading "Pair of
 * Kings" turning into "Three of a Kind" the instant a sigil resolves is the
 * spell layer explaining itself.
 *
 * It has to come from the same `evaluate` the showdown scores with, or it
 * would eventually disagree with the pot, and a readout that lies is worse
 * than none. That is expensive: see `evalComplexity`. So it is computed at
 * most once per actual change, for humans only, and it declines rather than
 * stalls the table if a board ever gets pathological.
 */

/** ~2.2µs per reading measured, so this is about a fifth of a second. Nothing
 *  in normal play comes close — a full board with one wild is under 800 — and
 *  it exists so a freak table declines to answer instead of stopping. */
const READ_BUDGET = 100_000;

interface CachedRead {
  sig: string;
  read: HandRead | undefined;
}

/** Keyed by table so it dies with the table and never reaches persistence. */
const readCache = new WeakMap<Table, Map<string, CachedRead>>();

/**
 * Everything that can change the answer, cheaply. Card ids alone are not
 * enough — the same five cards read differently once one collapses, gains a
 * mark, or starts showing this viewer a different face.
 */
function readSignature(t: Table, p: Player, cards: CardEntity[], mods: RuleMods): string {
  const parts: string[] = [t.phase];
  for (const c of cards) {
    const d = c.divergent?.[p.id];
    parts.push(
      `${c.id}:${c.collapsed ?? 'q'}:${c.marks.join('')}:${c.veil}:${c.memory}` +
      (d ? `:${d.rank}${d.suit}` : ''),
    );
  }
  // RuleMods is a flat bag of primitives and one small array.
  parts.push(JSON.stringify(mods));
  return parts.join('|');
}

function handReadFor(t: Table, p: Player): HandRead | undefined {
  // Before the flop there are not five cards to read, and the two in front of
  // you speak for themselves.
  if (t.board.length < 3 || p.folded || p.eliminated) return undefined;

  const cards = handCards(t, p);
  const mods = modsFor(t, p);
  const sig = readSignature(t, p, cards, mods);

  let byPlayer = readCache.get(t);
  if (!byPlayer) { byPlayer = new Map(); readCache.set(t, byPlayer); }
  const hit = byPlayer.get(p.id);
  if (hit && hit.sig === sig) return hit.read;

  let read: HandRead | undefined;
  if (evalComplexity({ cards, viewerId: p.id, mods }) <= READ_BUDGET) {
    const r = evaluate({ cards, viewerId: p.id, mods });
    if (r.score >= 0) {
      read = { name: r.name, cat: r.cat, usedIds: r.usedIds, impossible: r.impossible };
    }
  }

  byPlayer.set(p.id, { sig, read });
  return read;
}

export function viewFor(t: Table, viewerId: string): TableView {
  const viewer = byId(t, viewerId) ?? createPlayer(viewerId, 'Spectator', -1, t.config);
  const showdown = t.phase === 'showdown' || t.phase === 'payout';
  const seesMana = hasVision(viewer.relics, 'all_mana');

  const players: PlayerView[] = seated(t).map((p) => {
    const readable = canReadHole(t, viewer, p, showdown);
    const isYou = p.id === viewer.id;
    return {
      id: p.id,
      name: p.name,
      seat: p.seat,
      avatar: p.avatar,
      isBot: p.isBot,
      connected: p.connected,
      chips: p.chips,
      bet: p.bet,
      committed: p.committed,
      betVeiled: p.betVeiled && !isYou && !showdown,
      folded: p.folded,
      allIn: p.allIn,
      eliminated: p.eliminated,
      mana: isYou || seesMana || p.isBot ? p.mana : p.mana,
      maxMana: p.maxMana,
      sigils: isYou || viewer.foreknowledge.seenSigils.includes(p.id) ? p.sigils : null,
      sigilCount: p.sigils.length,
      relics: p.relics,
      coven: p.coven,
      shards: isYou ? p.shards : p.shards,
      hole: p.hole.map((id) => project(t, id, { viewer, reveal: readable, showdown })),
      warded: p.warded,
      severed: p.severed,
      hexed: p.hexed,
      blinded: p.blinded,
      lastAction: p.lastAction,
      isYou,
      ready: p.ready,
      shopDone: p.shopDone,
      handsWon: p.handsWon,
      biggestPot: p.biggestPot,
      // Yours only. It is derived from your own hole cards and your own
      // reading of the board, so it must never travel to another seat.
      handRead: isYou && !p.isBot ? handReadFor(t, p) : undefined,
      result: t.payout?.entries.find((e) => e.playerId === p.id),
    };
  });

  // Blind Spot takes the board away from one player and leaves it for
  // everyone else. They still score from it; they just cannot look.
  const board = t.board.map((id) =>
    project(t, id, { viewer, reveal: !viewer.blinded || showdown, showdown }));
  const acting = byId(t, t.actingId);
  const toCall = Math.max(0, t.currentBet - viewer.bet);

  const deckTop = hasVision(viewer.relics, 'deck_top') && t.deck.length
    ? project(t, t.deck[0], { viewer, reveal: true, showdown: false })
    : null;

  const peeked = viewer.foreknowledge.deckPeek
    .filter((id) => t.cards.has(id))
    .map((id) => project(t, id, { viewer, reveal: true, showdown: false }));

  return {
    code: t.code,
    config: t.config,
    phase: t.phase,
    handNumber: t.handNumber,
    ante: t.ante,
    bb: t.bb,
    sb: t.sb,
    handsUntilAnte: Math.max(0, t.config.handsPerAnte - ((t.handNumber - 1) % t.config.handsPerAnte) - 1),
    players,
    youId: viewer.id,
    dealerSeat: t.dealerSeat,
    actingId: t.actingId,
    actingUntil: t.actingUntil,
    board,
    burnedSlots: t.burnedSlots,
    deckCount: t.deck.length,
    deckTop,
    peeked,
    pot: totalPot(t),
    pots: t.pots,
    currentBet: t.currentBet,
    minRaise: t.minRaise,
    toCall: Math.min(toCall, viewer.chips),
    canCheck: toCall === 0,
    stack: t.stack,
    stackEntries: t.stack ? t.stack.entries.map((e) => stackEntryView(t, e)) : [],
    activeMods: t.mods,
    modNotes: t.modNotes,
    omens: t.omens,
    newOmen: t.omens.length && t.omens[t.omens.length - 1].ante === t.ante
      ? t.omens[t.omens.length - 1]
      : null,
    shop: t.shop.get(viewer.id) ?? null,
    payout: t.payout,
    log: t.log.slice(-60),
    yourTurn: acting?.id === viewer.id && !t.stack,
    castable: castableSigils(t, viewer),
    hostId: t.hostId,
    winnerId: t.winnerId,
  };
}

/** Compact label used in log lines. */
export function describeCard(t: Table, id: string): string {
  const c = t.cards.get(id);
  if (!c) return '??';
  if (isQuantum(c)) return c.faces.map(faceLabel).join('/');
  if (c.veil === 'sealed') return 'a sealed card';
  const f: Face | null = c.collapsed !== null ? c.faces[c.collapsed] : null;
  return f ? faceLabel(f) : '??';
}

export const rankList: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
