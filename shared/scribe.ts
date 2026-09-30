/**
 * Scribing — writing your own sigil in plain English.
 *
 * A player types what they want ("burn the river and read the chip leader's
 * cards") and this turns it into a sigil the engine already knows how to run.
 * There is no language model anywhere in it. It is the same shape as the Ask
 * box on the sports sites: clean the text, split it into clauses, match each
 * clause against ordered rule tables (specific phrases before general ones,
 * consumed words blanked so nothing is read twice), and resolve what is left
 * into a small structured spell. Every guess is said out loud, every word the
 * reader did not use is reported, and anything it cannot read is refused with
 * a sentence and a way forward — never quietly turned into something nearby.
 *
 * What a scribed sigil is:
 *   - one to three CLAUSES, each an existing sigil's effect;
 *   - with targets written as DESCRIPTIONS ("the chip leader", "whoever raised
 *     last", "my worst card", "the river"), worked out when the spell resolves,
 *     not when it was written;
 *   - optionally aimed at EVERY opponent at once.
 *
 * That is where the power is, and it is deliberate: a fixed sigil makes you
 * pick one target in one window and costs a slot for one effect. A scribed one
 * finds the right target by itself, bundles effects into one cast, and can hit
 * the whole table. The price is set by formula from the effects it contains —
 * never from the wording — so no phrasing can buy more than it pays for. And a
 * bundle rides one stack entry: one Nullify eats all of it.
 *
 * This module is pure and shared, so the Market shows a live reading as you
 * type and the server re-reads the same text to decide what you actually get.
 */
import { MARKS, type MarkId, type Rank, type Suit, RANK_NAME } from './cards';
import { SIGIL_BY_ID, type School, type SigilDef, type Timing } from './sigils';

// ---------------------------------------------------------------------------
// The spell
// ---------------------------------------------------------------------------

/** A player, described rather than named where the description is the point. */
export type Who =
  | { k: 'me' }
  | { k: 'player'; id: string; name: string }
  /** Most chips among live opponents. */
  | { k: 'leader' }
  /** Fewest chips among live opponents. */
  | { k: 'short' }
  /** Whoever last bet or raised this street, if it was an opponent. */
  | { k: 'aggressor' }
  /** Most unspent mana among live opponents. */
  | { k: 'mana' }
  /** Every live opponent, one resolution each. */
  | { k: 'each' };

export type HolePick = 'best' | 'worst' | 'first' | 'second';
export type BoardPick = 'last' | 'river' | 'turn' | 'flop1' | 'flop2' | 'flop3' | 'best' | 'worst';

export type CardRef =
  /** `rank`, when set, picks the hole card of that rank ("my 2") ahead of `pick`. */
  | { k: 'hole'; who: Who; pick: HolePick; rank?: Rank }
  | { k: 'board'; pick: BoardPick };

export interface Clause {
  /** The sigil whose effect this clause is. */
  sigil: string;
  who?: Who;
  cards?: CardRef[];
  rank?: Rank;
  suit?: Suit;
  mark?: MarkId;
}

export interface Scribed {
  /** What the player typed, trimmed. Shown to its owner. */
  text: string;
  clauses: Clause[];
  /** Mana to cast. */
  cost: number;
  /** Shards to scribe, before any hex. */
  price: number;
  /** Streets it can be cast on: the overlap of its clauses. */
  timing: Timing[];
  school: School;
  name: string;
  /** The compiled reading, as rules text. What opponents see. */
  rules: string;
}

export interface ScribeRead {
  ok: boolean;
  spell?: Scribed;
  /** One chip per clause: what the reader understood. */
  understood: string[];
  /** Guesses, defaults and ignored words, said out loud. */
  notes: string[];
  /** Why it could not be read, when `ok` is false. */
  error?: string;
}

export interface Roster {
  /** The player doing the writing. */
  selfId: string;
  players: Array<{ id: string; name: string }>;
}

export const MAX_CLAUSES = 3;
/** No mana pool the game can build holds more than this in practice. */
export const MAX_COST = 10;
export const MAX_TEXT = 160;

// ---------------------------------------------------------------------------
// Pricing — the balance, in one place
// ---------------------------------------------------------------------------

/**
 * The price of a spell comes from what it does, never from how it was worded.
 *
 * Anchored on the fixed sigils: one clause that is exactly a sigil costs that
 * sigil's mana, so "burn the river" is Burn at Burn's price. What scribing
 * adds is paid for here:
 *
 *   - every extra clause is +1 mana on top of its own cost. It saves a hand
 *     slot and an action window, so it is worth something; it is also one
 *     stack entry, so a single counter takes the whole bundle, which is why it
 *     is not worth more.
 *   - aiming a clause at every opponent doubles that clause. At a four-handed
 *     table that is three effects for the price of two; heads-up it is a tax.
 *     The writer chooses.
 *   - smart targets are free. Finding the chip leader by yourself is the
 *     reason to write a spell at all.
 *
 * Shards: the sigils' own shop prices, the same surcharges, and 2 for the
 * ink — so writing out a sigil the Market already sells is always a little
 * worse than buying it, and scribing only pays when you use what it adds.
 */
export const COMBO_MANA = 1;
export const EACH_MULT = 2;
export const COMBO_SHARDS = 3;
export const INK_SHARDS = 2;

export function priceOf(clauses: Clause[]): { cost: number; price: number } {
  let cost = 0;
  let price = INK_SHARDS;
  for (const c of clauses) {
    const def = SIGIL_BY_ID[c.sigil];
    if (!def) continue;
    const each = isEach(c) ? EACH_MULT : 1;
    cost += def.cost * each;
    price += Math.round(def.price * (each > 1 ? 1.6 : 1));
  }
  const extra = Math.max(0, clauses.length - 1);
  return { cost: cost + extra * COMBO_MANA, price: price + extra * COMBO_SHARDS };
}

const isEach = (c: Clause): boolean =>
  c.who?.k === 'each' || (c.cards ?? []).some((r) => r.k === 'hole' && r.who.k === 'each');

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

type Need = 'none' | 'player' | 'rank' | 'suit' | 'hole' | 'board' | 'card' | 'two' | 'card+suit';

interface Effect {
  id: string;
  /** Any of these, anywhere in the clause, reads as this effect. */
  re: RegExp;
  need: Need;
  /** Where a card target lands when the text does not say. */
  home?: CardRef;
}

const MINE = (pick: HolePick): CardRef => ({ k: 'hole', who: { k: 'me' }, pick });
const BOARD = (pick: BoardPick): CardRef => ({ k: 'board', pick });

/*
 * Ordered. The first entry whose pattern matches wins, so the specific phrase
 * sits above the general one: "every undecided card lands on its worst face"
 * is Decohere before it can be Collapse; "inscribe wild" is a permanent mark
 * before it can be a one-hand Wild Rite; "see the river" is Foresight before
 * "see ... cards" can be Cold Read. Each sigil also answers to its own name.
 */
const EFFECTS: Effect[] = [
  // --- whole-table and very specific phrasings first
  { id: 'schrodinger', re: /\bschr[oö]e?dinger|\b(whole|entire) flop\b.*\bundecided|\bundecided flop\b/, need: 'none' },
  { id: 'probability_storm', re: /\bprobability storm|\b(split|superpose)s?\b.*\b(every|all|whole)\b.*\b(community|board)\b/, need: 'none' },
  { id: 'decohere', re: /\bdecohere|\b(every|all) undecided\b.*\bworst\b/, need: 'none' },
  { id: 'cascade', re: /\bcascade|\b(every|all) undecided\b.*\b(highest|best)\b/, need: 'none' },
  { id: 'observer_effect', re: /\bobserver effect|\bkindest face|\b(every|all) undecided\b.*\bkind|\b(collapse|settle) (everything|all|every card)\b/, need: 'none' },
  { id: 'decay', re: /\bdecay|\bundecided cards?\b.*\blose\b/, need: 'none' },
  { id: 'salt_the_earth', re: /\bsalt the earth|\bscour|\b(strip|wipe|remove)\b.*\bevery mark/, need: 'none' },
  { id: 'conflagration', re: /\bconflagration|\beveryone (burns|redraws)|\ball players (burn|redraw)/, need: 'none' },
  { id: 'tithe', re: /\btithe|\b(everyone|everybody|all of them)( else)? pays? me|\bpay me\b|\btax\b/, need: 'none' },
  { id: 'nightfall', re: /\bnightfall|\b(table|board) goes dark|\bdarken the (board|table)|\bnobody (can )?sees? the board|\b(board|table)\b.*\binvisible|\bhide the board/, need: 'none' },
  { id: 'reweave', re: /\breweave|\b(redeal|reshuffle|replace) the (whole |entire )?board\b|\bnew board\b/, need: 'none' },
  { id: 'chain', re: /\bchain\b|\bpass(es)? .*\bleft\b/, need: 'none' },
  { id: 'echo_hand', re: /\becho of a hand|\brun the river twice|\bsecond timeline/, need: 'none' },
  { id: 'stutter', re: /\bstutter|\bstreet happens twice|\breplay (this|the) street/, need: 'none' },
  { id: 'stall', re: /\bstall\b|\b(extra|another|one more) (round of )?betting|\bone more round\b/, need: 'none' },
  { id: 'long_memory', re: /\blong memory|\bcards remember/, need: 'none' },
  { id: 'borrowed_time', re: /\bborrowed time|\bborrow (four |4 )?mana|\b(take|get|gain) (four|4) mana|\b(give me|get|gain) (more|extra|some) mana/, need: 'none' },
  { id: 'second_wind', re: /\bsecond wind|\bdraw (two |2 )?(more |extra )?sigils?\b|\b(more|extra) sigils\b/, need: 'none' },
  { id: 'first_draft', re: /\bfirst draft|\bnext card\b.*\bwild\b/, need: 'none' },
  { id: 'sixth_card', re: /\bsixth card|\b(deal|add) (an? )?(extra|sixth|another|more) (community |board )?(card|river)/, need: 'none' },
  { id: 'ashes', re: /\bashes\b|\b(bring|return|put) back the (burn(ed|t)|destroyed)|\bunburn/, need: 'none' },
  { id: 'resonance', re: /\bresonance|\b(match|take) the suit of the (first )?(community |board )?card/, need: 'none' },
  { id: 'tessellate', re: /\btessellate|\b(swap|trade) (my )?(the )?ranks/, need: 'none' },
  { id: 'graft', re: /\bgraft\b|\bsame card twice|\bmy (one )?card .*\bcopy of my other/, need: 'none' },
  { id: 'gloaming', re: /\bgloaming|\b(hide|protect|shield|ward) (my )?(hole )?(cards|hand)\b/, need: 'none' },
  { id: 'veiled_wager', re: /\bveiled wager|\b(hide|conceal|mask) my (next )?bet/, need: 'none' },
  { id: 'second_sight', re: /\bsecond sight|\b(look|peek|see|read|check)( at)? (the )?(next|top) ((three|3) )?cards?|\b(look|peek|see)( at)? (the top of )?the deck\b/, need: 'none' },
  { id: 'foresight', re: /\bforesight|\b(see|look at|peek at|read|know) the river\b/, need: 'none' },
  { id: 'rewind', re: /\brewind|\b(redeal|re-deal|redraw|undo|take back|deal again)\b|\bnew (river|turn)\b/, need: 'none' },
  { id: 'conjure', re: /\bconjure|\b(create|summon|make|invent) a (new |brand new )?card|\bthird (hole )?card|\b(give me|get|deal me) (an? )?(extra|another|new|fresh) (hole )?card/, need: 'none' },

  // --- aimed at players
  { id: 'the_ledger_sigil', re: /\bledger\b|\bread the room|\b(see|look at|read|peek at|reveal)\b.*\bsigils\b/, need: 'player' },
  { id: 'false_face', re: /\bfalse face|\b(lie to|trick|fool|deceive)\b/, need: 'player' },
  { id: 'mirror_mask', re: /\bmirror mask|\b(fake|phantom|imaginary) card|\bcard that is not there/, need: 'player' },
  { id: 'unkind_eye', re: /\bunkind eye|\bsettle\b.*\b(worst)\b/, need: 'player' },
  { id: 'blind_spot', re: /\bblind spot|\bblind\b|\bcan'?t see the board/, need: 'player' },
  { id: 'doppelganger', re: /\bdoppel|\b(copy|clone|duplicate)\b.*\b(their|his|her|opponent'?s?)\b.*\bcard/, need: 'player' },
  { id: 'sympathy', re: /\bsympathy|\bshare (hole )?cards/, need: 'player' },
  { id: 'yoke', re: /\byoke\b|\b(swap|trade|exchange)\b(?!.*\bdeck\b).*\bwith\b/, need: 'player' },
  { id: 'larceny', re: /\blarceny|\bsteal\b.*\bsigil|\bsteal from|\b(take|grab|swipe|pinch) (a |one |their )?sigil/, need: 'player' },
  { id: 'blight', re: /\bblight|\b(rot|destroy|delete|ruin)\b.*\bsigil/, need: 'player' },
  { id: 'sever', re: /\bsever|\b(drain|take|steal|remove|empty|burn)\b.*\bmana\b|\bno (more )?mana\b/, need: 'player' },
  { id: 'hex', re: /\bhex\b|\bcurse\b|\bone category lower|\b(weaken|downgrade)\b|\bworse\b/, need: 'player' },
  { id: 'cold_read', re: /\bcold read|\b(see|look at|peek at|read|reveal|show me|spy on)\b.*\b(cards?|hands?)\b|\bsee what\b|\bwhat\b.*\b(has|have|holding|hold|got)\b/, need: 'player' },

  // --- ranks and suits
  { id: 'sealed_rank', re: /\bseal(ed)?\b|\bface ?down\b/, need: 'rank' },
  { id: 'premonition', re: /\bpremonition/, need: 'rank' },
  { id: 'loom', re: /\bloom\b|\bweave\b.*\bnext\b/, need: 'rank' },
  { id: 'unmake', re: /\bunmake|\bstrike\b|\b(ban|kill|remove|delete)\b.*\b(aces|kings|queens|jacks|tens|nines|eights|sevens|sixes|fives|fours|threes|twos)\b/, need: 'rank' },

  // --- cards
  { id: 'inscribe', re: /\binscribe|\b(permanent(ly)?|forever)\b/, need: 'card', home: MINE('best') },
  { id: 'wild_rite', re: /\bwild rite|\bwild\b/, need: 'hole', home: MINE('worst') },
  { id: 'transmute', re: /\btransmute|\bchange\b.*\bsuit|\b(make|turn|change)\b.*\b(hearts?|spades?|diamonds?|clubs?)\b/, need: 'card+suit', home: MINE('worst') },
  { id: 'gild', re: /\bgild|\bevery suit|\ball suits/, need: 'board', home: BOARD('last') },
  { id: 'counterfeit', re: /\bcounterfeit|\b(copy|take)\b.*\b(river|turn|community|board)\b.*\binto my hand/, need: 'board', home: BOARD('best') },
  { id: 'twin', re: /\btwin\b|\b(copy|put) my\b.*\bon(to)? the board/, need: 'hole', home: MINE('best') },
  { id: 'weld', re: /\bweld|\b(merge|fuse)\b/, need: 'two' },
  { id: 'mirror', re: /\bmirror\b|\b(copy|duplicate)\b|\bcopy of\b|\bmatch\b/, need: 'two' },
  { id: 'entangle', re: /\bentangle|\bbind\b|\blink\b|\btie\b/, need: 'two' },
  { id: 'erase', re: /\berase|\bremove\b.*\bfrom the game|\bnever printed/, need: 'card', home: BOARD('best') },
  { id: 'palimpsest', re: /\bpalimpsest|\b(replace|rewrite)\b.*\btwice/, need: 'board', home: BOARD('last') },
  { id: 'divergence', re: /\bdivergen|\bdiverge|\bdifferent (card|face) (to|for) (me|everyone)/, need: 'board', home: BOARD('last') },
  { id: 'burn', re: /\bburn|\bdestroy|\bnuke|\bblow up|\bget rid of|\btrash|\bwipe out|\b(remove|kill|delete)\b.*\b(river|turn|community|board|flop)\b/, need: 'board', home: BOARD('last') },
  { id: 'unweave', re: /\bunweave|\b(strip|remove|wipe)\b.*\bmarks?\b/, need: 'card', home: BOARD('last') },
  { id: 'amber', re: /\bamber|\b(protect|freeze|lock|shield|save|guard)\b/, need: 'card', home: MINE('best') },
  { id: 'fracture', re: /\bfracture|\binto three|\bthree (possible )?faces/, need: 'card', home: MINE('worst') },
  { id: 'unsettle', re: /\bunsettle|\bundecided again/, need: 'card', home: BOARD('last') },
  { id: 'quantum_leap', re: /\bquantum leap|\b(swap|trade|switch|exchange)\b.*\bdeck\b/, need: 'hole', home: MINE('worst') },
  { id: 'collapse', re: /\bcollapse|\bsettle\b|\bforce\b.*\b(decide|settle)/, need: 'card', home: BOARD('last') },
  { id: 'superpose', re: /\bsuperpose|\bsplit\b|\b(two cards|two faces|both) at once|\bundecided\b/, need: 'card', home: MINE('worst') },
];

/** Things people will type that no sigil does, each with a way forward. */
const REFUSALS: Array<[RegExp, string]> = [
  [/\b(win|wins|winning) the (pot|hand|game)|\bi win\b|\bgive me the pot|\btake the pot/,
    'No sigil can decide a pot — the cards still have to win it. Try making your cards better: "make my worst card wild".'],
  [/\b(chips|money|cash|coins)\b/,
    'No sigil moves chips. Mana is the currency magic trades in: try "drain the chip leader\'s mana".'],
  [/\b(eliminate|kill|knock out|bust)\b/,
    'No sigil removes a player. Hit their hand instead: try "hex the chip leader".'],
  [/\bcounter(spell)?\b|\bnullify\b|\bredirect\b|\breflect\b|\btoll\b/,
    'Answers to other spells cannot be scribed; they have to be held ready. Nullify is sold in the Market.'],
];

/**
 * Refusals that win even when an effect's words also appear, because the
 * nearby effect would do something the player did not ask for.
 */
const HARD_REFUSALS: Array<[RegExp, string]> = [
  [/\b(every|all)\b.*\b(hearts?|spades?|diamonds?|clubs?)\b.*\b(hearts?|spades?|diamonds?|clubs?)\b/,
    'No sigil changes a whole suit. Transmute changes one card: try "make my worst card a spade".'],
  [/\b(make|turn|change)\b.*\bcards?\b.*\b(into|to|an?)\b\s*(an? )?(aces?|kings?|queens?|jacks?|tens?|nines?|eights?|sevens?|sixes|six|fives?|fours?|threes?|twos?|deuces?)\b/,
    'No sigil names a card\'s rank outright. A Wild counts as any rank: try "make my worst card wild".'],
];

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

const FILLER_OPEN = /^(ok(ay)?|so|um+|hey|please|pls|i (want|would like|wanna) to|i('d| would) like to|can (you|i)|could (you|i)|let me|let'?s|i cast|cast|a spell (that|to)|spell (that|to)|this spell|my spell)\b[\s,:]*/;
const FILLER_CLOSE = /[\s,]*(please|pls|thanks|thank you|lol|haha|!+|\?+|\.+)$/;

function normalize(raw: string): string {
  let s = raw.toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(FILLER_OPEN, '').replace(FILLER_CLOSE, '').trim();
    if (s === before) break;
  }
  return s;
}

/** Split on the obvious joins, then on "and" only where a new effect starts. */
function clausesOf(s: string): string[] {
  const hard = s.split(/\s*(?:[,;.]|\band then\b|\bthen\b|\balso\b|\bplus\b|\bafter that\b)\s*/).filter(Boolean);
  const out: string[] = [];
  for (const part of hard) {
    const pieces = part.split(/\s+and\s+/);
    let acc = pieces[0];
    for (const p of pieces.slice(1)) {
      // "burn the river and the turn" is one clause; "burn the river and see
      // her cards" is two. The difference is whether the piece names an effect.
      if (matchEffect(p)) { out.push(acc); acc = p; } else acc = `${acc} and ${p}`;
    }
    out.push(acc);
  }
  return out.map((c) => c.trim()).filter(Boolean);
}

function matchEffect(clause: string): { fx: Effect; m: RegExpMatchArray } | null {
  for (const fx of EFFECTS) {
    const m = clause.match(fx.re);
    if (m) return { fx, m };
  }
  return null;
}

const blank = (s: string, m: RegExpMatchArray | null | undefined): string =>
  m && m.index !== undefined ? s.slice(0, m.index) + ' '.repeat(m[0].length) + s.slice(m.index + m[0].length) : s;

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Damerau-free Levenshtein with an early exit; names are short. */
function distance(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, row[j]);
    }
    if (best > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length];
}

const WHO_PATTERNS: Array<[RegExp, Who]> = [
  [/\b(every ?one|every ?body|each (opponent|player)|every (opponent|player)|all (my |the )?(opponents|players|of them)|the (whole )?table|all of the opponents)('?s)?( else)?\b/, { k: 'each' }],
  [/\b(the )?(chip ?leader|leader|richest( player)?|big(gest)? stack|whoever('s| is) (winning|ahead)|whoever has the most chips)\b/, { k: 'leader' }],
  [/\b(the )?(short ?stack|poorest( player)?|smallest stack|whoever('s| is) (losing|behind)|whoever has the fewest chips)\b/, { k: 'short' }],
  [/\b(whoever|who(ever)? last|the (last )?(player|one) (who|that)) (bet|raised|raises|bets)( last)?\b|\bthe (last )?(raiser|bettor|aggressor)\b/, { k: 'aggressor' }],
  [/\b(whoever has )?the most mana\b|\bmana leader\b/, { k: 'mana' }],
];

interface WhoHit { who: Who; at: number; guessed?: string }

/** Every player mentioned in the clause, in the order written. Consumes what it reads. */
function findWho(text: string, roster: Roster): { hits: WhoHit[]; rest: string } {
  let rest = text;
  const hits: WhoHit[] = [];
  for (const [re, who] of WHO_PATTERNS) {
    const m = rest.match(re);
    if (m) { hits.push({ who, at: m.index ?? 0 }); rest = blank(rest, m); }
  }
  // Names, longest first so "Ash" does not take a bite out of "Ashgrave".
  const others = roster.players.filter((p) => p.id !== roster.selfId)
    .sort((a, b) => b.name.length - a.name.length);
  for (const p of others) {
    const re = new RegExp(`\\b${escapeRe(p.name.toLowerCase())}('s|s'|s)?\\b`);
    const m = rest.match(re);
    if (m) { hits.push({ who: { k: 'player', id: p.id, name: p.name }, at: m.index ?? 0 }); rest = blank(rest, m); }
  }
  // A misspelt name, as a last resort and only for names long enough that one
  // letter off is still clearly them. Said out loud when used.
  if (!hits.some((h) => h.who.k === 'player')) {
    for (const w of rest.matchAll(/\b([a-z]{5,})('s)?\b/g)) {
      if (COMMON.has(w[1])) continue;
      const near = others.filter((p) => p.name.length >= 5 && distance(w[1], p.name.toLowerCase(), 1) <= 1);
      if (near.length === 1) {
        hits.push({ who: { k: 'player', id: near[0].id, name: near[0].name }, at: w.index ?? 0, guessed: w[1] });
        rest = blank(rest, w as RegExpMatchArray);
        break;
      }
    }
  }
  const me = rest.match(/\b(me|my|mine|myself)\b/);
  if (me) hits.push({ who: { k: 'me' }, at: me.index ?? 0 });
  hits.sort((a, b) => a.at - b.at);
  return { hits, rest };
}

/** Words that are never a misspelt name. */
const COMMON = new Set([
  'river', 'cards', 'board', 'first', 'second', 'third', 'worst', 'lowest', 'highest', 'every', 'their',
  'whoever', 'player', 'players', 'opponent', 'opponents', 'sigil', 'sigils', 'community', 'undecided',
  'hearts', 'spades', 'clubs', 'diamonds', 'queens', 'kings', 'jacks', 'aces', 'sevens', 'eights', 'nines',
  'threes', 'raised', 'always', 'forever', 'permanently', 'strongest', 'weakest', 'newest', 'latest', 'table',
]);

const RANK_WORDS: Array<[RegExp, Rank]> = [
  [/\baces?\b/, 14], [/\bkings?\b/, 13], [/\bqueens?\b/, 12], [/\bjacks?\b/, 11],
  [/\btens?\b|\b10'?s?\b/, 10], [/\bnines?\b|\b9'?s\b/, 9], [/\beights?\b|\b8'?s\b/, 8],
  [/\bsevens?\b|\b7'?s\b/, 7], [/\bsix(es)?\b|\b6'?s\b/, 6], [/\bfives?\b|\b5'?s\b/, 5],
  [/\bfours?\b|\b4'?s\b/, 4], [/\bthrees?\b|\b3'?s\b/, 3], [/\b(twos?|deuces?)\b|\b2'?s\b/, 2],
];
const SUIT_WORDS: Array<[RegExp, Suit]> = [
  [/\bhearts?\b/, 'H'], [/\bspades?\b/, 'S'], [/\bdiamonds?\b/, 'D'], [/\bclubs?\b/, 'C'],
];
const SUIT_NAME: Record<Suit, string> = { H: 'Hearts', S: 'Spades', D: 'Diamonds', C: 'Clubs' };

const BOARD_PATTERNS: Array<[RegExp, BoardPick]> = [
  [/\b(the )?river\b/, 'river'],
  // "turn" is also a verb ("turn my card wild"), so it needs "the" or to sit
  // in a list of streets ("the turn and river", "river and turn").
  [/\bthe turn\b|\b(and|&) turn\b|\bturn (?=(and|&) (the )?river)/, 'turn'],
  [/\b(the )?first flop card\b|\bflop'?s first\b/, 'flop1'],
  [/\b(the )?second flop card\b|\bflop'?s second\b/, 'flop2'],
  [/\b(the )?third flop card\b|\bflop'?s third\b/, 'flop3'],
  [/\b(the )?(highest|best|top|strongest) (community |board )?card on the board\b|\b(the )?(highest|best|top|strongest) (community|board) card\b|\bboard'?s (highest|best)\b/, 'best'],
  [/\b(the )?(lowest|worst|weakest) (community |board )?card on the board\b|\b(the )?(lowest|worst|weakest) (community|board) card\b|\bboard'?s (lowest|worst)\b/, 'worst'],
  [/\b(the )?(last|newest|latest|most recent) (community |board )?card\b/, 'last'],
  [/\b(a|one|any|the) (community|board) card\b|\bthe board\b|\bthe flop\b/, 'last'],
];
const PICK_WORDS: Array<[RegExp, HolePick]> = [
  [/\b(best|highest|top|strongest|biggest)\b/, 'best'],
  [/\b(worst|lowest|weakest|smallest)\b/, 'worst'],
  [/\b(first|left)\b/, 'first'],
  [/\b(second|other|right)\b/, 'second'],
];

/** Every card mentioned, in written order. */
function findCards(text: string, whoHits: WhoHit[]): { refs: Array<{ ref: CardRef; at: number }>; rest: string } {
  let rest = text;
  const refs: Array<{ ref: CardRef; at: number }> = [];
  for (const [re, pick] of BOARD_PATTERNS) {
    for (;;) {
      const m = rest.match(re);
      if (!m) break;
      refs.push({ ref: BOARD(pick), at: m.index ?? 0 });
      rest = blank(rest, m);
    }
  }
  // "my 2", "my king": a hole card chosen by what it is, not where it sits.
  // The "my" it used is spent, so "turn my 2 into a wild card" is one card.
  const spent = new Set<number>();
  for (;;) {
    const m = rest.match(/\bmy (aces?|kings?|queens?|jacks?|tens?|nines?|eights?|sevens?|six(es)?|fives?|fours?|threes?|twos?|deuces?|10|[2-9])\b/);
    if (!m) break;
    const rank = /^\d+$/.test(m[1]) ? Number(m[1]) : RANK_WORDS.find(([re]) => re.test(m[1]))?.[1];
    if (rank) {
      refs.push({ ref: { k: 'hole', who: { k: 'me' }, pick: 'best', rank }, at: m.index ?? 0 });
      spent.add(m.index ?? 0);
    }
    rest = blank(rest, m);
  }
  // Hole cards belong to whoever is named next to the word "card".
  const picks: Array<[number, number]> = [];
  const holeWord = /\b(hole )?(cards?|hands?)\b/g;
  for (const m of rest.matchAll(holeWord)) {
    const at = m.index ?? 0;
    const owner = [...whoHits].reverse().find((h) => h.at <= at) ?? whoHits[0];
    if (!owner || spent.has(owner.at)) continue;
    const from = Math.max(0, at - 24);
    const window = rest.slice(from, at);
    const hit = PICK_WORDS.find(([re]) => re.test(window));
    if (hit) {
      const pm = window.match(hit[0])!;
      picks.push([from + (pm.index ?? 0), pm[0].length]);
    }
    // "my cards", "both my cards": every one of them, not the best one.
    const plural = /s$/.test(m[2]) || /\bboth\b/.test(window);
    if (!hit && plural && owner.who.k !== 'each') {
      refs.push({ ref: { k: 'hole', who: owner.who, pick: 'first' }, at });
      refs.push({ ref: { k: 'hole', who: owner.who, pick: 'second' }, at: at + 0.5 });
    } else {
      refs.push({ ref: { k: 'hole', who: owner.who, pick: hit?.[1] ?? 'best' }, at });
    }
  }
  rest = rest.replace(holeWord, (w) => ' '.repeat(w.length));
  for (const [at, len] of picks) rest = rest.slice(0, at) + ' '.repeat(len) + rest.slice(at + len);
  refs.sort((a, b) => a.at - b.at);
  return { refs, rest };
}

const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'on', 'at', 'into', 'onto', 'in', 'with', 'and', 'for', 'from', 'it', 'its',
  'that', 'this', 'their', 'his', 'her', 'them', 'they', 'him', 'is', 'be', 'so', 'card', 'cards', 'one',
  'all', 'every', 'each', 'make', 'turn', 'become', 'becomes', 'now', 'just', 'then', 'up', 'out', 'over',
  'i', 'me', 'my', 'mine', 'let', 'can', 'will', 'as', 'who', 'whoever', 'has', 'have', 'else', 'hand',
  'hole', 'too', 'also', 'both', 'by', 'same', 'right', 'away', 'off', 'which', 'what',
  'permanently', 'forever', 'again', 'mana', 'sigil', 'sigils', 'cast', 'spell',
  'put', 'mark', 'game', 'face', 'faces', 'land', 'lands', 'give', 'get', 'take', 'please', 'there', 'some',
]);

function leftovers(rest: string): string[] {
  return rest.split(/[^a-z0-9']+/).filter((w) => w && !STOP.has(w) && !/^'?s$/.test(w));
}

// ---------------------------------------------------------------------------
// Describing
// ---------------------------------------------------------------------------

export function whoLabel(w: Who): string {
  switch (w.k) {
    case 'me': return 'you';
    case 'player': return w.name;
    case 'leader': return 'the chip leader';
    case 'short': return 'the short stack';
    case 'aggressor': return 'whoever bet last';
    case 'mana': return 'whoever holds the most mana';
    case 'each': return 'every opponent';
  }
}

const BOARD_LABEL: Record<BoardPick, string> = {
  last: 'the newest community card', river: 'the river', turn: 'the turn',
  flop1: 'the first flop card', flop2: 'the second flop card', flop3: 'the third flop card',
  best: 'the highest community card', worst: 'the lowest community card',
};

export function cardLabel(r: CardRef): string {
  if (r.k === 'board') return BOARD_LABEL[r.pick];
  const whose = r.who.k === 'me' ? 'your' : r.who.k === 'player' ? `${r.who.name}'s` : `${whoLabel(r.who)}'s`;
  if (r.rank) return `${whose} ${RANK_NAME[r.rank]}`;
  const pick = { best: 'best', worst: 'worst', first: 'first', second: 'second' }[r.pick];
  return `${whose} ${pick} card`;
}

export function clauseLabel(c: Clause): string {
  const def = SIGIL_BY_ID[c.sigil];
  const bits: string[] = [];
  if (c.who) bits.push(whoLabel(c.who));
  for (const r of c.cards ?? []) bits.push(cardLabel(r));
  if (c.rank) bits.push(`${RANK_NAME[c.rank]}s`);
  if (c.suit) bits.push(SUIT_NAME[c.suit]);
  if (c.mark) bits.push(MARKS[c.mark]?.name ?? c.mark);
  return `${def?.name ?? c.sigil}${bits.length ? ` → ${bits.join(', ')}` : ''}`;
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

const STREETS: Timing[] = ['preflop', 'flop', 'turn', 'river'];
const expand = (t: Timing[]): Timing[] => (t.includes('any') ? [...new Set([...STREETS, ...t.filter((x) => x !== 'any')])] : t);

function overlap(defs: SigilDef[]): Timing[] {
  let set = expand(defs[0].timing);
  for (const d of defs.slice(1)) {
    const next = expand(d.timing);
    set = set.filter((x) => next.includes(x));
  }
  return set;
}

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

const TRY_AGAIN = 'Type it again in different words, or pick one of the ready-made spells below.';

export function readSpell(raw: string, roster: Roster): ScribeRead {
  const notes: string[] = [];
  const understood: string[] = [];
  const fail = (error: string): ScribeRead => ({ ok: false, understood, notes, error });

  const text = (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_TEXT);
  const s = normalize(text);
  if (!s) return fail(`Write what the sigil should do. ${TRY_AGAIN}`);

  const parts = clausesOf(s);
  if (parts.length > MAX_CLAUSES) {
    return fail(`That is ${parts.length} effects. A sigil holds at most ${MAX_CLAUSES}. Cut one and try again.`);
  }

  const clauses: Clause[] = [];
  let lastWho: Who | undefined;
  let lastCards: CardRef[] | undefined;
  for (const part of parts) {
    const hard = HARD_REFUSALS.find(([re]) => re.test(part));
    if (hard) return fail(hard[1]);
    const hit = matchEffect(part);
    if (!hit) {
      const refusal = REFUSALS.find(([re]) => re.test(part));
      if (refusal) return fail(refusal[1]);
      return fail(`Couldn't read "${part}" as something a sigil can do. ${TRY_AGAIN}`);
    }
    const { fx } = hit;
    const def = SIGIL_BY_ID[fx.id];
    // Targets are read from the whole clause, because an effect pattern like
    // "see ... cards" spans the target words too. The effect's own words are
    // blanked only afterwards, for the ignored-words report.
    let rest = part;

    const found = findWho(rest, roster);
    rest = found.rest;
    for (const h of found.hits) if (h.guessed) notes.push(`Read "${h.guessed}" as ${whoLabel(h.who)}.`);
    // "their", "his", "her" point back at whoever the last clause named.
    const pronoun = /\b(their|his|her|them|him)\b/.test(rest) && lastWho;
    const whoHits = found.hits.length ? found.hits : pronoun ? [{ who: lastWho!, at: 0 }] : [];

    const clause: Clause = { sigil: fx.id };
    const needsCards = fx.need === 'card' || fx.need === 'hole' || fx.need === 'board' || fx.need === 'two' || fx.need === 'card+suit';
    let cardRefs: Array<{ ref: CardRef; at: number }> = [];
    if (needsCards) {
      const c = findCards(rest, whoHits);
      cardRefs = c.refs;
      rest = c.rest;
      // "make my worst card wild and protect it": "it" is the last card named.
      if (!cardRefs.length && lastCards && /\b(it|them)\b/.test(rest)) {
        cardRefs = lastCards.map((ref, i) => ({ ref, at: i }));
      }
      // A single-card effect takes only the kind of card it can act on; the
      // rest are extra clauses below, never silently kept or dropped.
      if (fx.need === 'hole') cardRefs = cardRefs.filter((r) => r.ref.k === 'hole');
      if (fx.need === 'board') cardRefs = cardRefs.filter((r) => r.ref.k === 'board');
    }
    let extraWho: Who[] = [];

    switch (fx.need) {
      case 'player': {
        const targets = whoHits.filter((h) => h.who.k !== 'me').map((h) => h.who);
        const target = targets[0];
        // "hex wren and sable": one clause per player named.
        extraWho = targets.slice(1);
        if (!target) {
          if (whoHits.some((h) => h.who.k === 'me')) {
            return fail(`${def.name} has to be aimed at an opponent, not at you. Name one, or say "the chip leader".`);
          }
          clause.who = { k: 'leader' };
          notes.push(`No player named for ${def.name} — aimed at the chip leader.`);
        } else clause.who = target;
        break;
      }
      case 'rank': {
        const r = RANK_WORDS.find(([re]) => re.test(rest));
        if (!r) return fail(`${def.name} needs a rank. Say which, e.g. "${def.name.toLowerCase()} kings".`);
        clause.rank = r[1];
        rest = blank(rest, rest.match(r[0]));
        break;
      }
      case 'hole': case 'board': case 'card': case 'card+suit': {
        let ref: CardRef | undefined = cardRefs[0]?.ref;
        if (ref && fx.need === 'hole' && ref.k !== 'hole') ref = undefined;
        if (ref && fx.need === 'board' && ref.k !== 'board') ref = undefined;
        if (!ref && fx.need === 'hole') {
          const pw = PICK_WORDS.find(([re]) => re.test(rest));
          if (pw) { ref = MINE(pw[1]); rest = blank(rest, rest.match(pw[0])); }
        }
        if (!ref && fx.need !== 'board') {
          // "fracture wren" with no word "card": that player's best card.
          const named = whoHits.find((h) => h.who.k !== 'me');
          if (named && fx.need !== 'hole') ref = { k: 'hole', who: named.who, pick: 'best' };
        }
        if (fx.need === 'hole' && ref?.k === 'hole' && ref.who.k !== 'me') {
          return fail(`${def.name} only works on your own hole cards.`);
        }
        if (!ref) {
          ref = fx.home ?? BOARD('last');
          notes.push(`No card named for ${def.name} — read as ${cardLabel(ref)}.`);
        }
        clause.cards = [ref];
        if (fx.need === 'card+suit') {
          // The suit the card becomes is the last one named: "turn my heart
          // into a spade" is Spades.
          let sw: { suit: Suit; at: number; len: number } | undefined;
          for (const [re, suit] of SUIT_WORDS) {
            const m = rest.match(new RegExp(re.source, 'g'));
            if (!m) continue;
            const at = rest.lastIndexOf(m[m.length - 1]);
            if (!sw || at > sw.at) sw = { suit, at, len: m[m.length - 1].length };
          }
          if (!sw) return fail(`${def.name} needs a suit. Say which, e.g. "make my worst card hearts".`);
          clause.suit = sw.suit;
          for (const [re] of SUIT_WORDS) rest = rest.replace(new RegExp(re.source, 'g'), (w) => ' '.repeat(w.length));
        }
        if (fx.id === 'inscribe') {
          const mk = (Object.keys(MARKS) as MarkId[]).find((k) => new RegExp(`\\b${k}\\b`).test(rest));
          clause.mark = mk ?? 'blooded';
          if (!mk) notes.push('No mark named — inscribing Blooded (+1 rank). Say "wild" or "prism" for another.');
          else rest = rest.replace(new RegExp(`\\b${mk}\\b`), ' ');
        }
        break;
      }
      case 'two': {
        // "duplicate my best card": one of your own cards, copied onto the
        // other, is Graft — the only copy a single card can make.
        if (fx.id === 'mirror' && cardRefs.length === 1 && cardRefs[0].ref.k === 'hole' && cardRefs[0].ref.who.k === 'me') {
          clause.sigil = 'graft';
          notes.push('One card named — read as Graft: your other card becomes a copy of it.');
          break;
        }
        if (cardRefs.length < 2) {
          return fail(`${def.name} needs two cards, e.g. "${def.name.toLowerCase()} the river and my best card".`);
        }
        clause.cards = [cardRefs[0].ref, cardRefs[1].ref];
        // "make my card a copy of the river": the card before "copy of" is the
        // one that changes, and the engine wants the source first.
        const of = part.search(/\b((copy|duplicate|twin|clone) of|match(es)?)\b/);
        if (of >= 0 && cardRefs[0].at < of && cardRefs[1].at > of) clause.cards.reverse();
        break;
      }
      default:
        break;
    }

    // Two-card effects only make sense on cards that exist to everyone.
    if (clause.cards?.some((r) => r.k === 'hole' && r.who.k === 'each') && fx.need === 'two') {
      return fail(`${def.name} needs two exact cards, not everyone's.`);
    }

    rest = blank(rest, hit.m);
    const unused = leftovers(rest).filter((w) => !RANK_WORDS.some(([re]) => re.test(w)) || fx.need !== 'rank');
    if (unused.length) notes.push(`Ignored "${unused.join(' ')}" in "${part}".`);

    if (clause.cards?.length) lastCards = clause.cards;
    clause.who && (lastWho = clause.who);
    const holeOwner = clause.cards?.find((r) => r.k === 'hole');
    if (holeOwner?.k === 'hole' && holeOwner.who.k !== 'me') lastWho = holeOwner.who;
    clauses.push(clause);
    understood.push(clauseLabel(clause));

    // "burn the river and the turn": one effect, two cards. Each extra card is
    // its own clause, priced as one, rather than a word silently dropped.
    for (const who of extraWho) {
      const copy: Clause = { ...clause, who };
      clauses.push(copy);
      understood.push(clauseLabel(copy));
    }
    const single = fx.need === 'card' || fx.need === 'hole' || fx.need === 'board' || fx.need === 'card+suit';
    if (single) {
      for (const extra of cardRefs.slice(1)) {
        const copy: Clause = { ...clause, cards: [extra.ref] };
        clauses.push(copy);
        understood.push(clauseLabel(copy));
      }
    }
  }
  if (clauses.length > MAX_CLAUSES) {
    return fail(`That is ${clauses.length} effects. A sigil holds at most ${MAX_CLAUSES}. Cut one and try again.`);
  }

  const defs = clauses.map((c) => SIGIL_BY_ID[c.sigil]);
  const timing = overlap(defs);
  if (timing.length === 0) {
    const when = defs.map((d) => `${d.name}: ${expand(d.timing).join('/')}`).join('; ');
    return fail(`Those effects are never castable on the same street (${when}). Split them into two sigils.`);
  }

  const { cost, price } = priceOf(clauses);
  if (cost > MAX_COST) {
    return fail(`That sigil would cost ${cost} mana, and no pool holds more than ${MAX_COST}. Drop an effect or "every opponent".`);
  }

  const school = [...defs].sort((a, b) => b.cost - a.cost)[0].school;
  const words = text.replace(/\s+/g, ' ');
  const name = words.length > 26 ? `${words.slice(0, 25).trimEnd()}…` : words;
  const spell: Scribed = {
    text: words,
    clauses,
    cost,
    price,
    timing,
    school,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    rules: `${clauses.map(clauseLabel).join('. ')}.`,
  };
  return { ok: true, spell, understood, notes };
}

// ---------------------------------------------------------------------------
// The ready-made spells
// ---------------------------------------------------------------------------

/**
 * One tap, no typing. They go through the same reader as typed text, so they
 * are also the first line of the reader's tests, and they show a new player
 * what kind of sentence works.
 */
export const SCRIBE_PRESETS: ReadonlyArray<{ label: string; text: string }> = [
  { label: "Read the leader's hand", text: "see the chip leader's cards" },
  { label: 'Burn the newest card', text: 'burn the newest card' },
  { label: 'Wild worst card', text: 'make my worst card wild' },
  { label: 'Hex the raiser', text: 'hex whoever raised last' },
  { label: 'Drain the table', text: "drain everyone's mana" },
  { label: 'Burn and peek', text: 'burn the river and look at the next three cards' },
  { label: 'Split my worst, read theirs', text: "split my worst card, then see the chip leader's cards" },
];
