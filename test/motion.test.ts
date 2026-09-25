/**
 * Motion invariants that are easy to break and hard to see.
 *
 * These are not "does it look nice" tests. They encode the mistakes that were
 * actually made in this codebase, each more than once, each invisible until
 * someone with reduced motion enabled opened the game:
 *
 *   1. Stopping an animation without pinning a resting state. `animation: none`
 *      returns an element to its BASE rule, which is frequently not a sane
 *      place to sit — invisible (the animation was fading it in), brighter than
 *      the animation ever made it (the animation was keeping it subdued), or
 *      flat (the animation was holding it up). Turning motion down must never
 *      delete a cue, turn one up, or drop one on the floor.
 *   2. A CSS `transform` on an element framer-motion animates. framer writes
 *      `transform` to the style attribute — including the literal
 *      `transform: none` once its keys are at rest — and an inline declaration
 *      outranks any stylesheet rule, `:hover` included. Centring and state
 *      transforms have to use the `translate` longhand or they are discarded.
 *   3. `transition: all`, which sweeps in layout properties nobody intended.
 *   4. A `whileHover` that is not gated on both a fine pointer and reduced
 *      motion. Touch fires a hover on tap that sticks, and a hover lift is
 *      movement like any other.
 *
 * Two notes on the matching, both of which were learned by getting it wrong:
 *
 * A reduced-motion rule almost never names the same selector as the animation
 * it stops — the stop is on a base class (`.hx-fx`) while the animation is on a
 * modifier (`.hx-fx--burning`) or a descendant (`.is-winning .hx-card__lift`).
 * An earlier version compared selector strings for equality and so asserted on
 * 2 of 26 targets while three real defects sat in the repo.
 *
 * And a class harvested from a `<motion.*>` className is only evidence that
 * framer owns that element if it is the element's IDENTITY class. Taking every
 * token swept up shared utilities like `.mono`, which would fail this test in
 * files that have nothing to do with framer — the kind of false positive that
 * gets a guard test deleted rather than obeyed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '..', 'src');

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

const cssFiles = walk(SRC, '.css');
const tsxFiles = walk(SRC, '.tsx');
const rel = (p: string) => path.relative(SRC, p).replace(/\\/g, '/');

interface Rule { selector: string; body: string; atRule: string }

/** Every rule in a stylesheet, with its enclosing at-rule preserved. */
function rules(css: string): Rule[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Rule[] = [];
  const AT = /@(?:media|supports|container)([^{]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g;

  for (const m of bare.matchAll(AT)) {
    for (const r of m[2].matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      out.push({ selector: r[1].trim(), body: r[2], atRule: m[0].slice(0, m[0].indexOf('{')).trim() });
    }
  }
  for (const r of bare.replace(AT, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = r[1].trim();
    if (!sel.startsWith('@')) out.push({ selector: sel, body: r[2], atRule: '' });
  }
  return out;
}

/**
 * Balanced-brace parse rather than a regex. A `(?:[^{}]|\{[^{}]*\})*` body
 * pattern silently truncates the moment a keyframe's own stops nest the way
 * real ones do, and a truncated body reads as "this animation touches no
 * transform" — which is exactly the check this file exists to run.
 */
function keyframes(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const HEAD = /@keyframes\s+([\w-]+)\s*\{/g;
  for (let m = HEAD.exec(css); m !== null; m = HEAD.exec(css)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    out[m[1]] = css.slice(start, i - 1);
    HEAD.lastIndex = i;
  }
  return out;
}

function isReducedMotion(sel: string, atRule: string): boolean {
  return /\[data-reduced-motion\s*[~|^$*]?=\s*["']?1["']?\]/.test(sel)
    || /prefers-reduced-motion\s*:\s*reduce/.test(atRule);
}

const stripReduced = (sel: string) =>
  sel.replace(/^[\w:]*\[data-reduced-motion\s*[~|^$*]?=\s*["']?1["']?\]\s*/, '').trim();

/** The classes and pseudo-element of a selector's rightmost compound. */
function finalCompound(sel: string): { classes: Set<string>; pseudo: string } {
  const last = sel.trim().split(/\s*[>+~]\s*|\s+/).pop() ?? '';
  const pseudo = /::[\w-]+/.exec(last)?.[0] ?? '';
  const classes = new Set<string>();
  for (const m of last.matchAll(/\.([\w-]+)/g)) {
    classes.add(m[1]);
    // BEM: an element carrying `x--mod` also carries `x`.
    const base = /^(.*?)--[\w-]+$/.exec(m[1]);
    if (base) classes.add(base[1]);
  }
  return { classes, pseudo };
}

/** Would a rule written as `stop` also match the elements `target` matches? */
function covers(stop: string, target: string): boolean {
  const a = finalCompound(stop);
  const b = finalCompound(target);
  if (a.pseudo !== b.pseudo) return false;
  // A compound with no class — `.vfx-pulse i` — cannot be compared by class.
  // Fall back to selector identity so it is still covered, not dropped.
  if (a.classes.size === 0 || b.classes.size === 0) {
    return stop.replace(/\s+/g, ' ') === target.replace(/\s+/g, ' ');
  }
  for (const c of a.classes) if (!b.classes.has(c)) return false;
  return true;
}

const NON_NAME = /^(?:[\d.]+m?s|infinite|alternate(?:-reverse)?|reverse|forwards|backwards|both|normal|none|paused|running|linear|ease(?:-in)?(?:-out)?|step-(?:start|end)|\d+)$/;

/** Every animation name a rule declares, across a top-level comma list. */
function animationNames(body: string): string[] {
  const src = /animation-name:\s*([^;}]+)/.exec(body)?.[1]
    ?? /animation:\s*([^;}]+)/.exec(body)?.[1];
  if (!src) return [];
  const out: string[] = [];
  for (const entry of src.split(/,(?![^()]*\))/)) {
    for (const tok of entry.trim().split(/\s+/)) {
      if (NON_NAME.test(tok) || /^(?:cubic-bezier|steps|var|calc)\(/.test(tok)) continue;
      if (/^[a-zA-Z][\w-]*$/.test(tok)) { out.push(tok); break; }
    }
  }
  return out.filter((n) => n !== 'none');
}

/** A numeric opacity, or null when it is a var()/calc() we cannot evaluate. */
function opacityOf(body: string): number | null {
  const m = /(?<!-)\bopacity:\s*([^;}]+)/.exec(body);
  if (!m) return null;
  const v = m[1].trim();
  return /^[\d.]+$/.test(v) ? Number(v) : null;
}
const declaresOpacity = (body: string) => /(?<!-)\bopacity:/.test(body);
const declaresTransform = (body: string) => /(?<!-)\b(?:transform|translate|scale|rotate):/.test(body);


/**
 * Does this keyframe animate a transform whose range never passes through the
 * identity value? `translateY(-4.5%) -> translateY(-9%)` does (identity 0 is
 * outside the range), so stopping it loses the offset. `scale(0.965) ->
 * scale(1.045)` does not (identity 1 is inside), so stopping it lands
 * somewhere sensible and needs no pin.
 */
function excludesIdentity(kfBody: string): boolean {
  const fns = new Map<string, number[]>();

  // Balanced-paren scan rather than a regex: the real values here look like
  // `translateY(calc(var(--hx-h, 112px) * -0.045))`, which is nested two deep
  // and defeats any non-recursive pattern.
  const NAME = /\b(translate3d|translate[XYZ]?|scale[XY]?|rotate[XYZ]?)\(/g;
  for (let m = NAME.exec(kfBody); m !== null; m = NAME.exec(kfBody)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < kfBody.length && depth > 0; i++) {
      if (kfBody[i] === '(') depth++;
      else if (kfBody[i] === ')') depth--;
    }
    // A `var(--x, 112px)` FALLBACK is not part of the animated range; letting
    // it in made this span -0.09..112 and so appear to cross zero.
    const arg = kfBody.slice(m.index + m[0].length, i - 1).replace(/var\([^()]*\)/g, '');
    const nums = [...arg.matchAll(/-?[\d.]+/g)].map((n) => Number(n[0]));
    if (nums.length === 0) continue;
    const key = m[1].replace(/3d$|[XYZ]$/, '');
    fns.set(key, (fns.get(key) ?? []).concat(nums));
  }

  for (const [fn, values] of fns) {
    const identity = fn === 'scale' ? 1 : 0;
    if (identity < Math.min(...values) - 1e-4 || identity > Math.max(...values) + 1e-4) return true;
  }
  return false;
}

test('an animation stopped under reduced motion rests somewhere sane', () => {
  const problems: string[] = [];

  for (const file of cssFiles) {
    const css = readFileSync(file, 'utf8');
    const kf = keyframes(css);
    const all = rules(css);

    const stops: string[] = [];
    const pins: Array<{ sel: string; body: string }> = [];
    for (const { selector, body, atRule } of all) {
      for (const part of selector.split(',')) {
        const s = part.trim();
        if (!isReducedMotion(s, atRule)) continue;
        const bare = stripReduced(s);
        if (/animation(?:-name)?:\s*none/.test(body)) stops.push(bare);
        if (declaresOpacity(body) || declaresTransform(body)) pins.push({ sel: bare, body });
      }
    }
    if (stops.length === 0) continue;

    for (const { selector, body, atRule } of all) {
      if (isReducedMotion(selector, atRule)) continue;
      for (const anim of animationNames(body)) {
        if (!kf[anim]) continue;
        const stopsIt = stops.filter((s) => covers(s, selector));
        if (stopsIt.length === 0) continue;

        const pin = pins.find((p) => covers(p.sel, selector));
        const where = `${rel(file)}: \`${selector.trim()}\` (stopped by \`${stopsIt[0]}\`)`;

        // --- opacity -------------------------------------------------------
        // `declaresOpacity` rather than a digit match: a keyframe that varies
        // opacity through var()/calc() still needs a resting state, and only
        // the ">= peak" comparison depends on the values being literal.
        if (declaresOpacity(kf[anim])) {
          const resting = pin && declaresOpacity(pin.body) ? opacityOf(pin.body) : opacityOf(body) ?? 1;
          const pinned = !!(pin && declaresOpacity(pin.body));
          if (resting === 0) {
            problems.push(`${where} rests at opacity 0, so the cue disappears instead of calming. Pin a visible resting opacity.`);
          } else if (!pinned && resting !== null) {
            const lits = [...kf[anim].matchAll(/opacity:\s*([\d.]+)/g)].map((m) => Number(m[1]));
            // Only compare when EVERY stop is literal — a mixed var()/literal
            // keyframe would otherwise report a peak of 0 and demand the very
            // defect this test exists to prevent.
            const varStops = (kf[anim].match(/(?<!-)\bopacity:/g) ?? []).length !== lits.length;
            if (!varStops && lits.length > 0 && resting > Math.max(...lits) + 0.001) {
              problems.push(`${where} rests at opacity ${resting}, but \`${anim}\` never exceeds ${Math.max(...lits)} — reducing motion would make this cue LOUDER. Pin it at ${Math.max(...lits)}.`);
            }
          }
        }

        // --- transform -----------------------------------------------------
        // Stopping a transform loop snaps the element to identity. That is
        // correct for the many loops that pass through identity anyway — a
        // drift from translate3d(0,0,0), a spin from rotate(0deg), a breathe
        // that crosses scale(1). It is wrong when the whole animation happens
        // somewhere else: `hx-float` holds a winning card between -4.5% and
        // -9%, so snapping to 0 drops it flat and the card stops reading as
        // "this card scored". The test is therefore whether identity falls
        // INSIDE the animated range, not whether a transform is mentioned.
        if (/(?<!-)\btransform:/.test(kf[anim])
          && !declaresTransform(body)
          && !(pin && declaresTransform(pin.body))
          && excludesIdentity(kf[anim])) {
          problems.push(`${where} animates \`${anim}\` entirely away from its resting transform, so stopping it snaps the element back to identity and the state it was signalling is lost. Pin a resting transform.`);
        }
      }
    }
  }

  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});

test('nothing framer-motion animates relies on a CSS transform', () => {
  // Only classes DEFINED in a stylesheet can be the subject of a CSS rule, so
  // anything else harvested from a className expression is an interpolated
  // variable, not a class.
  const definedClasses = new Set<string>();
  for (const file of cssFiles) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\.([a-zA-Z][\w-]*)/g)) definedClasses.add(m[1]);
  }

  const motionClasses = new Set<string>();
  for (const file of tsxFiles) {
    const src = readFileSync(file, 'utf8');
    for (const tag of src.matchAll(/<motion\.\w+([\s\S]*?)\/?>/g)) {
      const cn = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([\w.]+)\}|\{\[([\s\S]*?)\])/.exec(tag[1]);
      if (!cn) continue;
      let text = cn[1] ?? cn[2] ?? cn[4] ?? '';
      if (cn[3]) {
        // `className={classes}` — resolve the identifier in this file.
        // `;\r?\n`, because every source file here is CRLF.
        const decl = new RegExp(`(?:const|let)\\s+${cn[3]}\\s*(?::[^=]+)?=([\\s\\S]*?);\\r?\\n`).exec(src);
        if (decl) text = [...decl[1].matchAll(/['"`]([^'"`]*)['"`]/g)].map((m) => m[1]).join(' ');
      }
      // The IDENTITY class only — the first real class token. Taking every
      // token sweeps up shared utilities like `.mono` and fails this test in
      // files that never touch framer.
      for (const tok of text.split(/[\s${}?:'"`,[\]()]+/)) {
        if (!/^[a-z][\w-]*$/i.test(tok)) continue;
        if (/^(is|has)-/.test(tok)) continue;      // shared state flags
        if (!definedClasses.has(tok)) continue;    // an interpolated variable
        motionClasses.add(tok);
        break;
      }
    }
  }

  const problems: string[] = [];
  for (const file of cssFiles) {
    for (const { selector, body } of rules(readFileSync(file, 'utf8'))) {
      if (!/(?<!-)\btransform:/.test(body)) continue;
      for (const part of selector.split(',')) {
        // A pseudo-element is genuinely exempt: framer writes the element's own
        // style attribute, which cannot reach a ::before or ::after box.
        const { classes, pseudo } = finalCompound(part);
        if (pseudo) continue;
        const hit = [...classes].find((c) => motionClasses.has(c));
        if (!hit) continue;
        problems.push(
          `${rel(file)}: \`${part.trim()}\` sets \`transform\`, but \`.${hit}\` is a framer-motion `
          + `element — framer writes transform inline (including \`transform: none\` at rest) and will `
          + `discard this. Use the \`translate\` longhand.`,
        );
      }
    }
  }

  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});

test('every whileHover is gated on a fine pointer and on reduced motion', () => {
  const problems: string[] = [];
  for (const file of tsxFiles) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/whileHover=\{([\s\S]*?)\}\s*\n/g)) {
      const expr = m[1];
      const line = src.slice(0, m.index).split('\n').length;
      if (!/finePointer/.test(expr)) {
        problems.push(`${rel(file)}:${line} whileHover is not gated on \`finePointer\` — on a touchscreen a tap leaves the hover stuck.`);
      }
      if (!/reduced/.test(expr)) {
        problems.push(`${rel(file)}:${line} whileHover is not gated on \`reduced\` — a hover lift is movement like any other.`);
      }
    }
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
});

test('nothing transitions `all`', () => {
  const hits: string[] = [];
  const bad = /transition(?:-property)?:\s*[^;}]*(?:^|[\s,:])all(?:[\s,;}]|$)/;
  for (const file of [...cssFiles, ...tsxFiles]) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (bad.test(line)) hits.push(`${rel(file)}:${i + 1}  ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, [], `\n${hits.join('\n')}\n`);
});
