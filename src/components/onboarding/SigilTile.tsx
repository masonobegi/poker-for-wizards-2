/**
 * A sigil, drawn for the onboarding flow.
 *
 * This intentionally does not import the real `SigilCard` from
 * `src/components/table/SigilCard.tsx` — that component's styles live in
 * `src/scenes/table.css`, which is only loaded once `GameTable` mounts. A
 * first-time player sees the intro from the menu, before any table has ever
 * loaded, so reusing it verbatim would render unstyled. This matches its look
 * instead (glyph, school accent, cost, the "impossible" line) with its own
 * self-contained styles in `onboarding.css`.
 */
import type { SigilDef } from '@shared/sigils';
import { SCHOOLS, RARITY_COLOR } from '@shared/sigils';
import type { StyleVars } from '@/components/card/Card';
import { Mark } from '@/art/marks';

export default function SigilTile({ def, compact, order }: {
  def: SigilDef;
  compact?: boolean;
  order?: string;
}) {
  const school = SCHOOLS[def.school];
  const vars: StyleVars = {
    '--school': school.accent,
    '--school-deep': school.glow,
    '--rarity': RARITY_COLOR[def.rarity],
  };

  return (
    <div className="intro-sigil" style={vars}>
      <header className="intro-sigil__head">
        <span className="intro-sigil__cost mono">{def.cost}</span>
        <span className="intro-sigil__school">{school.name}</span>
      </header>
      <div className="intro-sigil__glyph" aria-hidden="true"><Mark kind="sigil" id={def.id} fallback={def.glyph} /></div>
      <h4 className="intro-sigil__name">{def.name}</h4>
      {!compact ? <p className="intro-sigil__text">{def.text}</p> : null}
      <p className="intro-sigil__impossible">
        <Mark kind="ui" id="impossible" /> {def.impossible}
      </p>
      <span className="intro-sigil__rarity">{def.rarity}</span>
      {order ? <span className="intro-sigil__order">{order}</span> : null}
    </div>
  );
}
