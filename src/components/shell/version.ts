/**
 * The build's version string.
 *
 * `__HEXHOLD_VERSION__` is substituted by Vite (see vite.config.ts). The
 * components that read it are also mounted by test/render.test.tsx under
 * plain Node, where no substitution has happened and the identifier does not
 * exist, so this must never be referenced bare at module scope — the same
 * mistake `import.meta.env` caused three times before.
 */
declare const __HEXHOLD_VERSION__: string | undefined;

export function appVersion(): string {
  try {
    return typeof __HEXHOLD_VERSION__ === 'string' ? __HEXHOLD_VERSION__ : 'dev';
  } catch {
    return 'dev';
  }
}
