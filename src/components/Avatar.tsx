/**
 * Procedural seat portraits: a hooded sigil-bearer drawn from the seed, so
 * every player is visually distinct with no image assets in the build.
 */
import { memo } from 'react';

const PALETTES: Array<[string, string, string]> = [
  ['#7c3aed', '#b98cff', '#1a0f2e'],
  ['#0369a1', '#6ec8ff', '#06202f'],
  ['#b45309', '#ffc861', '#2a1705'],
  ['#0f766e', '#5eead4', '#052824'],
  ['#9f1239', '#ff7a8a', '#2c0712'],
  ['#4d7c0f', '#a8e063', '#152105'],
  ['#6d28d9', '#c4b5fd', '#180b30'],
  ['#075985', '#7dd3fc', '#04202e'],
  ['#a16207', '#fde68a', '#2a1d04'],
  ['#115e59', '#99f6e4', '#042521'],
  ['#be123c', '#fda4af', '#2e0812'],
  ['#3f6212', '#bef264', '#111c04'],
];

const GLYPHS = ['✦', '⟁', '◉', '⧉', '☾', '∞', '⬢', '✶', '⋔', '◈', '⟆', '✺'];

export interface AvatarProps {
  seed: number;
  size?: number;
  bot?: boolean;
  dim?: boolean;
  className?: string;
}

function AvatarBase({ seed, size = 40, bot, dim, className = '' }: AvatarProps) {
  const i = ((seed % PALETTES.length) + PALETTES.length) % PALETTES.length;
  const [deep, bright, dark] = PALETTES[i];
  const glyph = GLYPHS[i];
  const id = `av${i}`;

  return (
    <div
      className={`avatar ${className}`}
      style={{
        width: size,
        height: size,
        opacity: dim ? 0.4 : 1,
        filter: dim ? 'grayscale(0.7)' : undefined,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 48 48" width={size} height={size}>
        <defs>
          <radialGradient id={`${id}bg`} cx="50%" cy="34%" r="72%">
            <stop offset="0%" stopColor={deep} />
            <stop offset="100%" stopColor={dark} />
          </radialGradient>
          <linearGradient id={`${id}hood`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={bright} stopOpacity=".55" />
            <stop offset="100%" stopColor={deep} stopOpacity=".12" />
          </linearGradient>
        </defs>

        <circle cx="24" cy="24" r="23" fill={`url(#${id}bg)`} />
        <circle cx="24" cy="24" r="23" fill="none" stroke={bright} strokeWidth="1" opacity=".38" />

        {/* hood */}
        <path
          d="M24 9c-8 0-13 6.2-13 14.5 0 6 2.2 10.6 5 13.5h16c2.8-2.9 5-7.5 5-13.5C37 15.2 32 9 24 9Z"
          fill={`url(#${id}hood)`}
        />
        {/* the dark under the hood */}
        <ellipse cx="24" cy="25" rx="7.6" ry="9" fill={dark} opacity=".92" />
        {/* eyes */}
        <circle cx="21" cy="24" r="1.5" fill={bright} opacity=".95" />
        <circle cx="27" cy="24" r="1.5" fill={bright} opacity=".95" />

        <text
          x="24" y="41"
          textAnchor="middle"
          fontSize="9"
          fill={bright}
          opacity=".8"
          fontFamily="serif"
        >
          {glyph}
        </text>

        {bot ? (
          <g opacity=".9">
            <circle cx="39" cy="10" r="7" fill={dark} stroke={bright} strokeWidth="1" />
            <text x="39" y="13.5" textAnchor="middle" fontSize="8" fill={bright}
              fontFamily="ui-monospace, monospace" fontWeight="700">
              AI
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

export default memo(AvatarBase);
