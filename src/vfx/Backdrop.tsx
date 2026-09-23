/* ===========================================================================
   HEXHOLD — the backdrop
   ---------------------------------------------------------------------------
   One fullscreen quad, one fragment shader, sitting behind everything the
   game draws. It replaces a pair of static CSS gradients with something that
   moves: slow violet weather, a drifting field of motes, and a ripple the
   game itself can push into it when a sigil resolves.

   Why raw WebGL and not a library. This is a single quad with a single
   shader. OGL — the lightest thing worth considering — is 24kb for scene
   graph, math and geometry helpers that a quad does not have. Pixi and Three
   are heavier still and would sit alongside the DOM renderer the whole game
   is actually built from rather than replacing anything. So: about a hundred
   lines, no dependency, and nothing to keep in sync with a framework.

   Three rules it has to obey, because this thing is always on screen:

     1. **It is never load-bearing.** No GL context, a lost context, a
        compile failure, a machine that hates us — every one of those paths
        ends with the CSS gradient underneath showing through and the game
        carrying on. Nothing here is allowed to throw upward.
     2. **It is cheap.** Rendered at a fraction of device resolution and
        upscaled, because a soft nebula has no detail to lose, and capped
        well under display rate. The reference machine for this is a Steam
        Deck, not a desktop GPU — and the test harness renders through
        SwiftShader on a CPU, which is a decent proxy for the worst case.
     3. **It respects reduced motion.** It draws one frame and stops, rather
        than vanishing. The look stays; the movement goes.
   =========================================================================== */

import { useEffect, useRef } from 'react';
import './backdrop.css';

// ---------------------------------------------------------------------------
// Shader
// ---------------------------------------------------------------------------

const VERT = `#version 100
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

/**
 * Value noise and a two-octave fbm, which is all the detail a background this
 * soft can actually show. Written against WebGL 1 / GLSL ES 100 on purpose:
 * it is the widest net, and there is nothing here that WebGL 2 would do
 * better.
 */
const FRAG = `#version 100
precision mediump float;

uniform vec2 uRes;
uniform float uTime;
/** Centre of the last ripple, in pixels, y down. */
uniform vec2 uPulse;
/** Seconds since that ripple started. Large means "no ripple". */
uniform float uPulseAge;
/** The ripple's colour, from the school that caused it. */
uniform vec3 uPulseTint;
/** 0 at the menu, 1 at the table — the table sits warmer and closer. */
uniform float uAtTable;

float hash(vec2 v) {
  return fract(sin(dot(v, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 v) {
  vec2 i = floor(v);
  vec2 f = fract(v);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 v) {
  return noise(v) * 0.62 + noise(v * 2.17 + 3.7) * 0.31;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  // Aspect-corrected coordinates centred on the screen, so the weather does
  // not stretch into bands on an ultrawide.
  vec2 q = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  float t = uTime * 0.016;

  // Two slow layers drifting against each other. The counter-drift is what
  // stops it reading as a texture being panned.
  float a = fbm(q * 1.9 + vec2(t, t * 0.63));
  float b = fbm(q * 3.1 - vec2(t * 0.72, t * 0.41) + 11.0);
  float weather = a * 0.65 + b * 0.35;

  // The palette, straight off tokens.css: ink, a warm charcoal, and the dark
  // bottle green the felt is cut from. There is deliberately no violet in
  // here any more — an ambient purple wash over everything was most of what
  // made the whole interface read as generated rather than designed. The only
  // colour that enters this shader now is the school tint on a cast, which
  // means something.
  vec3 ink = vec3(0.040, 0.036, 0.033);
  vec3 ash = vec3(0.094, 0.086, 0.079);
  vec3 bottle = vec3(0.070, 0.140, 0.118);

  vec3 col = mix(ink, ash, smoothstep(0.22, 0.95, weather));
  col = mix(col, bottle, smoothstep(0.58, 1.0, weather) * (0.30 + 0.34 * uAtTable));

  // The lamp over the table. Brass-warm rather than blue, and only really
  // present once you are at the felt.
  float centre = 1.0 - smoothstep(0.0, 0.95, length(q * vec2(1.0, 1.25)));
  col += vec3(0.086, 0.070, 0.040) * centre * (0.45 + 0.95 * uAtTable);

  // Dust in the lamplight. Warm, sparse, never bright enough to be mistaken
  // for a card.
  vec2 g = q * 5.5;
  g.y += t * 1.7;
  vec2 cell = floor(g);
  float m = hash(cell);
  if (m > 0.976) {
    vec2 c = fract(g) - 0.5;
    float d = length(c);
    float twinkle = 0.55 + 0.45 * sin(uTime * 0.0013 + m * 90.0);
    col += vec3(0.46, 0.40, 0.28) * smoothstep(0.24, 0.0, d) * 0.42 * twinkle;
  }

  // The ripple a resolving sigil pushes out. One expanding ring that fades
  // over about a second and a half.
  if (uPulseAge < 1.6) {
    vec2 pq = (uPulse - 0.5 * uRes) / uRes.y;
    pq.y = -pq.y;
    float d = length(q - pq);
    float r = uPulseAge * 0.95;
    float ring = smoothstep(0.07, 0.0, abs(d - r));
    col += uPulseTint * ring * (1.0 - uPulseAge / 1.6) * 0.5;
  }

  // Vignette, so the edges of the screen stay out of the way of the UI.
  float vig = smoothstep(1.38, 0.28, length((uv - 0.5) * vec2(1.05, 1.0)) * 1.55);
  col *= 0.42 + 0.58 * vig;

  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Controller — how the rest of the game talks to it
// ---------------------------------------------------------------------------

interface PulseRequest {
  x: number;
  y: number;
  tint: [number, number, number];
  at: number;
}

let pending: PulseRequest | null = null;
let atTable = 0;

/**
 * Push a ripple out from a point on screen. Safe to call whether or not a
 * backdrop is mounted, or GL ever started — it is a decoration request, not
 * a command.
 */
export function backdropPulse(x: number, y: number, tint: [number, number, number]): void {
  pending = { x, y, tint, at: performance.now() };
}

/** 0 for the menu, 1 for the table. Eased toward, never snapped. */
export function backdropScene(table: boolean): void {
  atTable = table ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Never render more often than this. A background has no need of 120Hz. */
const TARGET_FPS = 30;
/**
 * Fraction of CSS pixels actually rasterised. A soft nebula upscaled from
 * half resolution is indistinguishable and a quarter of the fill cost.
 */
const RES_SCALE = 0.5;

export default function Backdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = (canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' })
        ?? canvas.getContext('experimental-webgl', { alpha: false })) as WebGLRenderingContext | null;
    } catch {
      gl = null;
    }
    // No GL, or a browser that refuses: the CSS gradient underneath is the
    // whole fallback, and it already looks like the game.
    if (!gl || gl.isContextLost()) return;

    // A canvas hands back the *same* context every time, so anything this
    // effect does on teardown is done to the context the next mount will get.
    // React's StrictMode mounts effects twice in development, which is
    // exactly the remount this has to survive.
    // `.app` paints an opaque gradient of its own, which is the fallback and
    // is also what would cover this canvas. The flag on <html> is how the two
    // hand over: no GL and the gradient stays exactly as it always was;
    // GL, and it steps aside for the shader.
    const markLive = (on: boolean): void => {
      canvas.classList.toggle('is-live', on);
      try {
        if (on) document.documentElement.setAttribute('data-backdrop', '1');
        else document.documentElement.removeAttribute('data-backdrop');
      } catch { /* not a browser; nothing to mark */ }
    };

    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl!.createShader(type);
      if (!sh) return null;
      gl!.shaderSource(sh, src);
      gl!.compileShader(sh);
      if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) {
        if (import.meta.env?.DEV) console.warn('[backdrop]', gl!.getShaderInfoLog(sh));
        gl!.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = vs && fs ? gl.createProgram() : null;
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(prog, 'uRes'),
      time: gl.getUniformLocation(prog, 'uTime'),
      pulse: gl.getUniformLocation(prog, 'uPulse'),
      pulseAge: gl.getUniformLocation(prog, 'uPulseAge'),
      pulseTint: gl.getUniformLocation(prog, 'uPulseTint'),
      atTable: gl.getUniformLocation(prog, 'uAtTable'),
    };

    let w = 0;
    let h = 0;
    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nw = Math.max(1, Math.round(window.innerWidth * dpr * RES_SCALE));
      const nh = Math.max(1, Math.round(window.innerHeight * dpr * RES_SCALE));
      if (nw === w && nh === h) return;
      w = nw; h = nh;
      canvas.width = w;
      canvas.height = h;
      gl!.viewport(0, 0, w, h);
      gl!.uniform2f(u.res, w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    const reduced = (): boolean => {
      try {
        return document.documentElement.getAttribute('data-reduced-motion') === '1'
          || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch { return false; }
    };

    let raf = 0;
    let last = 0;
    let pulseAt = -1e9;
    let tint: [number, number, number] = [0.5, 0.3, 0.9];
    let scene = 0;
    const started = performance.now();
    const minFrame = 1000 / TARGET_FPS;
    let drewStill = false;

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);

      // Reduced motion: one frame, then hold it. The look survives; the
      // movement does not.
      if (reduced()) {
        if (drewStill) return;
        drewStill = true;
      } else {
        drewStill = false;
        if (now - last < minFrame) return;
      }
      last = now;

      if (pending) {
        pulseAt = pending.at;
        tint = pending.tint;
        // The pulse arrives in CSS pixels with y down; the shader wants the
        // same space the canvas is rasterised in.
        const dpr = Math.min(window.devicePixelRatio || 1, 2) * RES_SCALE;
        gl!.uniform2f(u.pulse, pending.x * dpr, h - pending.y * dpr);
        gl!.uniform3f(u.pulseTint, tint[0], tint[1], tint[2]);
        pending = null;
      }

      scene += (atTable - scene) * 0.05;

      gl!.uniform1f(u.time, reduced() ? 8000 : now - started);
      gl!.uniform1f(u.pulseAge, (now - pulseAt) / 1000);
      gl!.uniform1f(u.atTable, scene);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);

    // A lost context is routine on laptops that switch GPUs. Stop cleanly and
    // let the gradient take over rather than spinning on a dead context.
    const onLost = (e: Event): void => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      canvas.classList.remove('is-live');
    };
    canvas.addEventListener('webglcontextlost', onLost);

    markLive(true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', onLost);
      // Deliberately does NOT call loseContext(): the context belongs to the
      // canvas, not to this effect, and killing it here left the next mount
      // compiling shaders against a dead context — a blank canvas still
      // wearing its "live" class. Dropping the program and buffer is enough;
      // the context goes when the canvas does.
      markLive(false);
      try {
        gl!.deleteProgram(prog);
        gl!.deleteShader(vs);
        gl!.deleteShader(fs);
        gl!.deleteBuffer(buf);
      } catch { /* tearing down; nothing here is worth a crash */ }
    };
  }, []);

  return <canvas ref={ref} className="backdrop" aria-hidden />;
}
