import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { createProgram, generateSphereBuffers, rotationMat3 } from "../lib/webgl";
import { smoothTowards, clamp } from "../lib/smoothing";
import { useMicAnalyser } from "../hooks/useMicAnalyser";
import { MicIcon, ShakeIcon, StretchIcon, ScaleUpIcon, GlowIcon, ChevronDownIcon } from "../icons";

const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute float aSeed;
attribute float aTint;
attribute float aShell;

uniform float uTime;
uniform mat3 uRotation;
uniform float uScale;
uniform float uStretch;
uniform float uDisplacement;
uniform float uAudioLevel;
uniform float uAudioBass;
uniform float uAudioMid;
uniform float uAudioTreble;
uniform float uShake;
uniform float uPixelRatio;
uniform float uAspect;
uniform float uSizeBase;
uniform float uRenderScale;
uniform vec2 uPointerNDC;

varying float vBrightness;
varying float vTint;

/* Classic 3D simplex noise (Ashima Arts / Ian McEwan, webgl-noise —
   public-domain-style reference implementation, no texture lookups,
   commonly inlined directly in shaders like this rather than pulled in
   as a library). Used below for spatially-coherent particle displacement:
   nearby particles sample nearby noise values and move together, so the
   sphere bulges in clusters instead of moving as one rigid body or as
   fully independent random dots. */
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

void main() {
  vec3 n = normalize(aPosition);

  /* Idle micro-sparkle: tiny, cosmetic, always-on surface shimmer along
     each particle's own direction. This is NOT the deformation mechanism —
     just a small resting-state texture, same role as before. */
  float a1 = aPosition.x * 3.1 + uTime * 0.5 + aSeed * 6.28318;
  float a2 = aPosition.y * 4.3 - uTime * 0.38 + aSeed * 6.28318;
  float a3 = aPosition.z * 5.1 + uTime * 0.34 + aSeed * 6.28318;
  float idleSparkle = (sin(a1) + sin(a2) + sin(a3)) / 3.0;

  float shellRadius = mix(1.0, 0.66, aShell);
  vec3 basePos = n * (shellRadius + idleSparkle * uDisplacement);

  /* Primary voice/shake/cursor reaction: a genuine 3D coherent VECTOR flow
     field, not a radial scale. Earlier versions multiplied a scalar noise
     value onto each particle's own fixed direction (radius = base + k; pos
     = n * radius) — every particle's angular position was permanently
     frozen, so no matter how large k got, the result still read as "an
     invisible sphere being inflated." That is exactly the artifact this
     rewrite removes: there is no radius variable and no per-particle
     direction constraint anywhere below. Each axis of the flow is sampled
     from an independent noise channel, so displacement can point sideways
     /tangentially just as easily as in or out — regions can bulge while a
     neighboring region pulls inward or sideways, and the silhouette itself
     reshapes asymmetrically, matching the reference video. Particles are
     free to travel however far this field takes them; they simply relax
     back toward basePos as the driving energy fades (see uAudio* uniforms,
     which are already smoothed/sprung in JS) — there is no maximum-radius
     clamp, bounding sphere, or clipping of any kind here or anywhere else
     in this file. */
  vec3 lowFlow = vec3(
    snoise(n * 1.1 + vec3(0.0, 0.0, uTime * 0.09)),
    snoise(n * 1.1 + vec3(31.7, 6.0, uTime * 0.09)),
    snoise(n * 1.1 + vec3(6.0, 57.3, uTime * 0.09))
  );
  vec3 highFlow = vec3(
    snoise(n * 3.4 + vec3(11.0, 4.0, uTime * 0.3)),
    snoise(n * 3.4 + vec3(4.0, 23.0, uTime * 0.3)),
    snoise(n * 3.4 + vec3(23.0, 11.0, uTime * 0.3))
  );

  float particleVariance = 0.7 + 0.6 * aSeed;
  vec3 voiceFlow = (
    lowFlow * (uAudioBass * 0.55 + uAudioLevel * 0.22) +
    highFlow * (uAudioTreble + uAudioMid * 0.6) * 0.34 +
    highFlow * uShake * 0.4
  ) * particleVariance;

  vec3 displaced = basePos + voiceFlow;
  vec3 rotated = uRotation * displaced;

  vec3 world = rotated * uScale;
  world.x *= (1.0 + uStretch);
  world.y *= (1.0 - uStretch * 0.55);

  float cameraDistance = 2.6;
  float focal = 2.1;

  float viewZ0 = world.z + cameraDistance;
  float perspective0 = focal / viewZ0;
  /* uRenderScale shrinks only the on-screen position, not perspective/depth
     itself (that stays below, unscaled, for gl_PointSize/vBrightness) — see
     JS side for why: the canvas is now much bigger than the sphere's visual
     footprint so displaced particles have room before hitting its edge, and
     this puts the sphere back to its original apparent size within it. */
  vec2 screen0 = world.xy * perspective0 * uRenderScale;
  screen0.x *= uAspect;

  float pointerDist = distance(screen0, uPointerNDC);
  float pointerProx = smoothstep(0.4, 0.0, pointerDist);
  /* Cursor uses the same flow-field principle as voice — a local push along
     the coherent noise direction, not a fixed radial or axis-aligned nudge —
     plus a small toward-camera pull for a tactile parallax cue. */
  world += highFlow * pointerProx * 0.09;
  world.z -= pointerProx * 0.16;

  float viewZ = world.z + cameraDistance;
  float perspective = focal / viewZ;
  vec2 screen = world.xy * perspective * uRenderScale;
  screen.x *= uAspect;
  gl_Position = vec4(screen, 0.0, 1.0);

  float depthFactor = clamp((perspective - 0.55) / 0.5, 0.0, 1.0);
  float sizeVariance = 0.6 + aSeed * 0.8;
  float sparkle = 1.0 + uAudioTreble * aSeed * 0.9;
  float sizeAudio = 1.0 + uAudioLevel * 0.5;
  gl_PointSize = uSizeBase * sizeVariance * depthFactor * perspective * uPixelRatio * sparkle * sizeAudio;

  float shellDim = mix(1.0, 0.6, aShell);
  float brightnessAudio = 1.0 + uAudioLevel * 0.4 + pointerProx * 0.25;
  vBrightness = (0.4 + depthFactor * 0.75) * shellDim * brightnessAudio;
  vTint = aTint;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying float vBrightness;
varying float vTint;
uniform float uGlobalAlpha;
uniform vec3 uColorNeutral;
uniform vec3 uColorAccent;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  float falloff = smoothstep(0.5, 0.0, dist);
  if (falloff <= 0.001) discard;

  // uColorAccent is a brighter warm-white highlight, not a different hue —
  // reference sphere is monochrome ivory with a few brighter "hero" dots.
  vec3 color = vTint > 0.85 ? uColorAccent : uColorNeutral;
  float alpha = falloff * vBrightness * uGlobalAlpha;
  gl_FragColor = vec4(color * vBrightness, alpha);
}
`;

const OUTER_COUNT = 3200;
const INNER_COUNT = 700;
const BASE_POINT_SIZE = 8.8;

// The canvas element is CANVAS_FRACTION of the stage width (see JSX below);
// the sphere is tuned to visually fill roughly SPHERE_FRACTION of the stage.
// RENDER_SCALE shrinks the projected position (not perspective/depth) so
// the resting sphere keeps that same apparent size inside the now much
// larger, mostly-empty canvas — the extra room is what displaced particles
// move into instead of hitting the canvas's own rectangular edge.
const CANVAS_FRACTION = 0.58;
const SPHERE_FRACTION = 0.3;
const RENDER_SCALE = SPHERE_FRACTION / CANVAS_FRACTION;

// Reference sphere reads as a bright, warm-white/ivory particle field, not
// the project's orange signal accent — the sphere is a deliberate exception,
// kept monochrome so it doesn't compete with the four hero controls' colors.
// Standard alpha blending (see draw call below) means brightness here comes
// straight from these values, not from a workaround dim/glow multiplier.
const COLOR_NEUTRAL: [number, number, number] = [0.92, 0.88, 0.79];
const COLOR_ACCENT: [number, number, number] = [1.0, 0.97, 0.88];

const MIC_ACCENT = "#8B98F0"; // matches STRETCH — reference's mic ring is the same blue-violet

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type EffectKey = "shake" | "stretch" | "scaleUp" | "glow";

const EFFECT_RELEASE: Record<EffectKey, number> = {
  shake: 0.5,
  stretch: 0.55,
  scaleUp: 0.6,
  glow: 0.75,
};

interface ControlSpec {
  label: string;
  effect: EffectKey;
  icon: (props: { className?: string }) => ReactElement;
  color: string;
  css: string;
  anchor: { x: number; y: number };
  enterDelay: number;
}

// Sphere sits slightly above the stage's vertical center, matching the
// reference composition — controls curve their connector trails toward it.
const SPHERE_CENTER = { x: 50, y: 44 };

const CONTROLS: ControlSpec[] = [
  { label: "SHAKE", effect: "shake", icon: ShakeIcon, color: "#FF6B4A", css: "top-[8%] left-[2%] sm:left-[5%]", anchor: { x: 20, y: 15 }, enterDelay: 260 },
  { label: "STRETCH", effect: "stretch", icon: StretchIcon, color: "#8B98F0", css: "top-[4%] right-[2%] sm:right-[5%]", anchor: { x: 80, y: 13 }, enterDelay: 340 },
  { label: "SCALE UP", effect: "scaleUp", icon: ScaleUpIcon, color: "#A78BFA", css: "bottom-[10%] left-0 sm:left-[3%]", anchor: { x: 18, y: 82 }, enterDelay: 420 },
  { label: "GLOW", effect: "glow", icon: GlowIcon, color: "#F2618B", css: "bottom-[6%] right-0 sm:right-[3%]", anchor: { x: 82, y: 84 }, enterDelay: 500 },
];

function ConnectorField() {
  const paths = useMemo(
    () =>
      CONTROLS.map((c) => {
        const t = 0.66;
        const endX = c.anchor.x + (SPHERE_CENTER.x - c.anchor.x) * t;
        const endY = c.anchor.y + (SPHERE_CENTER.y - c.anchor.y) * t;
        const midX = (c.anchor.x + endX) / 2;
        const midY = (c.anchor.y + endY) / 2;
        const bow = c.anchor.x < 50 ? -5 : 5;
        return {
          key: c.label,
          color: c.color,
          d: `M ${c.anchor.x} ${c.anchor.y} Q ${midX + bow} ${midY} ${endX} ${endY}`,
          startX: c.anchor.x,
          startY: c.anchor.y,
          endX,
          endY,
        };
      }),
    []
  );
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {paths.map((p) => (
        <g key={p.key}>
          <path d={p.d} fill="none" stroke={p.color} strokeOpacity={0.45} strokeWidth={0.28} strokeDasharray="0.3 1.6" strokeLinecap="round" />
          <circle cx={p.startX} cy={p.startY} r={0.55} fill={p.color} fillOpacity={0.7} />
          <circle cx={p.endX} cy={p.endY} r={0.4} fill={p.color} fillOpacity={0.6} />
        </g>
      ))}
    </svg>
  );
}

const DUST = Array.from({ length: 44 }, () => ({
  left: Math.random() * 100,
  top: Math.random() * 100,
  size: 1 + Math.random() * 1.4,
  delay: Math.random() * 3,
  duration: 2.6 + Math.random() * 2.4,
  opacity: 0.15 + Math.random() * 0.35,
}));

export function AmbientDust() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {DUST.map((d, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-ink-primary animate-twinkle"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: `${d.size}px`,
            height: `${d.size}px`,
            opacity: d.opacity,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

function ControlButton({
  spec,
  active,
  motionSafe,
  onTrigger,
}: {
  spec: ControlSpec;
  active: boolean;
  motionSafe: boolean;
  onTrigger: () => void;
}) {
  const Icon = spec.icon;
  return (
    <button
      type="button"
      onClick={onTrigger}
      className={`${motionSafe ? "animate-landing-enter" : ""} pointer-events-auto group inline-flex cursor-pointer select-none items-center gap-2.5 rounded-full border bg-surface/60 py-2 pl-2 pr-4 backdrop-blur-md transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:brightness-125 active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas`}
      style={{
        borderColor: hexToRgba(spec.color, active ? 0.6 : 0.32),
        boxShadow: active ? `0 0 16px -6px ${hexToRgba(spec.color, 0.55)}` : undefined,
        animationDelay: motionSafe ? `${spec.enterDelay}ms` : undefined,
        // @ts-expect-error -- custom property for focus ring color
        "--tw-ring-color": hexToRgba(spec.color, 0.5),
      }}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: hexToRgba(spec.color, 0.14), color: spec.color }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="font-mono text-[11px] uppercase tracking-wide text-ink-secondary group-hover:text-ink-primary">
        {spec.label}
      </span>
    </button>
  );
}

const statusLabel: Record<string, string> = {
  idle: "SPEAK TO INTERACT",
  requesting: "REQUESTING MICROPHONE…",
  listening: "LISTENING…",
  denied: "MICROPHONE DENIED — TAP TO RETRY",
  unsupported: "VOICE INPUT NOT SUPPORTED",
};

export function VoiceSphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const { status, start, stop, sample } = useMicAnalyser();
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const activeTimeoutRef = useRef<number | null>(null);
  const [motionSafe] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const effectsRef = useRef<Record<EffectKey, number>>({ shake: 0, stretch: 0, scaleUp: 0, glow: 0 });
  // Underdamped spring on top of the hook's smoothed level: lets the field
  // settle back past resting by a touch (a slight "contract") before it
  // comes to rest, instead of a flat exponential decay to zero.
  const levelSpring = useRef({ pos: 0, vel: 0 });
  const pointerTiltTarget = useRef({ x: 0, y: 0 });
  const pointerTilt = useRef({ x: 0, y: 0 });
  const pointerNdcTarget = useRef({ x: 10, y: 10 });
  const pointerNdcSmooth = useRef({ x: 10, y: 10 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const gl = canvas.getContext("webgl", {
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    }) as WebGLRenderingContext | null;

    if (!gl) return;

    const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    const { positions, seeds, tints, shells, count } = generateSphereBuffers(OUTER_COUNT, INNER_COUNT);

    function makeBuffer(data: Float32Array) {
      const buffer = gl!.createBuffer();
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buffer);
      gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
      return buffer;
    }

    const positionBuffer = makeBuffer(positions);
    const seedBuffer = makeBuffer(seeds);
    const tintBuffer = makeBuffer(tints);
    const shellBuffer = makeBuffer(shells);

    const aPosition = gl.getAttribLocation(program, "aPosition");
    const aSeed = gl.getAttribLocation(program, "aSeed");
    const aTint = gl.getAttribLocation(program, "aTint");
    const aShell = gl.getAttribLocation(program, "aShell");

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuffer);
    gl.enableVertexAttribArray(aSeed);
    gl.vertexAttribPointer(aSeed, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, tintBuffer);
    gl.enableVertexAttribArray(aTint);
    gl.vertexAttribPointer(aTint, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, shellBuffer);
    gl.enableVertexAttribArray(aShell);
    gl.vertexAttribPointer(aShell, 1, gl.FLOAT, false, 0, 0);

    const uniforms = {
      time: gl.getUniformLocation(program, "uTime"),
      rotation: gl.getUniformLocation(program, "uRotation"),
      scale: gl.getUniformLocation(program, "uScale"),
      stretch: gl.getUniformLocation(program, "uStretch"),
      displacement: gl.getUniformLocation(program, "uDisplacement"),
      audioLevel: gl.getUniformLocation(program, "uAudioLevel"),
      audioBass: gl.getUniformLocation(program, "uAudioBass"),
      audioMid: gl.getUniformLocation(program, "uAudioMid"),
      audioTreble: gl.getUniformLocation(program, "uAudioTreble"),
      shake: gl.getUniformLocation(program, "uShake"),
      pixelRatio: gl.getUniformLocation(program, "uPixelRatio"),
      aspect: gl.getUniformLocation(program, "uAspect"),
      sizeBase: gl.getUniformLocation(program, "uSizeBase"),
      renderScale: gl.getUniformLocation(program, "uRenderScale"),
      pointerNDC: gl.getUniformLocation(program, "uPointerNDC"),
      globalAlpha: gl.getUniformLocation(program, "uGlobalAlpha"),
      colorNeutral: gl.getUniformLocation(program, "uColorNeutral"),
      colorAccent: gl.getUniformLocation(program, "uColorAccent"),
    };

    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const rect = parent!.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas!.width !== width || canvas!.height !== height) {
        canvas!.width = width;
        canvas!.height = height;
      }
      gl!.viewport(0, 0, width, height);
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(parent);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const prefersCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

    function handlePointerMove(e: PointerEvent) {
      const rect = parent!.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const tiltDivisor = Math.max(rect.width, rect.height) * 2.2;
      pointerTiltTarget.current.x = clamp((e.clientX - cx) / tiltDivisor, -1, 1);
      pointerTiltTarget.current.y = clamp((e.clientY - cy) / tiltDivisor, -1, 1);

      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdcTarget.current.x = ndcX;
      pointerNdcTarget.current.y = ndcY;
    }
    if (!prefersCoarsePointer) {
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
    }

    let rafId = 0;
    let lastTime = performance.now();
    let rotY = 0;

    function frame(now: number) {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const levels = sample();

      // Critically-underdamped spring: stiffness > (damping^2)/4 so it can
      // briefly overshoot past the target on the way down, giving the field
      // a slight "contract" beat after speech stops, then settle — rather
      // than a flat one-directional decay.
      const spring = levelSpring.current;
      spring.vel += ((levels.level - spring.pos) * 90 - spring.vel * 11) * dt;
      spring.pos += spring.vel * dt;
      const springLevel = clamp(spring.pos, -0.25, 1.3);

      (Object.keys(effectsRef.current) as EffectKey[]).forEach((key) => {
        effectsRef.current[key] = smoothTowards(effectsRef.current[key], 0, dt, 0.05, EFFECT_RELEASE[key]);
      });

      pointerTilt.current.x = smoothTowards(pointerTilt.current.x, pointerTiltTarget.current.x, dt, 0.25, 0.35);
      pointerTilt.current.y = smoothTowards(pointerTilt.current.y, pointerTiltTarget.current.y, dt, 0.25, 0.35);
      pointerNdcSmooth.current.x = smoothTowards(pointerNdcSmooth.current.x, pointerNdcTarget.current.x, dt, 0.1, 0.18);
      pointerNdcSmooth.current.y = smoothTowards(pointerNdcSmooth.current.y, pointerNdcTarget.current.y, dt, 0.1, 0.18);

      // Cheap, listener-free scroll response: read this element's own
      // viewport offset each frame rather than attaching a scroll handler.
      const rect = parent!.getBoundingClientRect();
      const viewportCenterOffset = rect.top + rect.height / 2 - window.innerHeight / 2;
      const scrollFactor = clamp(viewportCenterOffset / window.innerHeight, -1, 1);

      const effects = effectsRef.current;

      const idleBreath = prefersReducedMotion ? 0 : Math.sin(now * 0.0006) * 0.012;
      const scale = 1 + idleBreath + springLevel * 0.03 + effects.scaleUp * 0.26;
      // Idle cosmetic shimmer only — SHAKE now drives real 3D flow-field
      // turbulence (uShake below), not this scalar radial ripple.
      const displacement = 0.01 + idleBreath * 0.4;
      const stretch = effects.stretch * 0.2;

      const rotSpeed = (prefersReducedMotion ? 0.012 : 0.08) + levels.bass * 0.1;
      rotY += rotSpeed * dt;
      const tiltYaw = pointerTilt.current.x * -0.2 + scrollFactor * 0.12;
      const tiltPitch = pointerTilt.current.y * 0.14;
      const rotX = (prefersReducedMotion ? 0 : Math.sin(now * 0.0003) * 0.03) + levels.treble * 0.04 + tiltPitch;

      gl!.useProgram(program);
      gl!.uniform1f(uniforms.time, now * 0.001);
      gl!.uniformMatrix3fv(uniforms.rotation, false, rotationMat3(rotX, rotY + tiltYaw));
      gl!.uniform1f(uniforms.scale, scale);
      gl!.uniform1f(uniforms.stretch, stretch);
      gl!.uniform1f(uniforms.displacement, displacement);
      gl!.uniform1f(uniforms.audioLevel, springLevel);
      gl!.uniform1f(uniforms.audioBass, levels.bass);
      gl!.uniform1f(uniforms.audioMid, levels.mid);
      gl!.uniform1f(uniforms.audioTreble, levels.treble);
      gl!.uniform1f(uniforms.shake, effects.shake);
      gl!.uniform1f(uniforms.pixelRatio, dpr);
      gl!.uniform1f(uniforms.aspect, canvas!.height / canvas!.width);
      gl!.uniform1f(uniforms.sizeBase, BASE_POINT_SIZE);
      gl!.uniform1f(uniforms.renderScale, RENDER_SCALE);
      gl!.uniform2f(uniforms.pointerNDC, pointerNdcSmooth.current.x, pointerNdcSmooth.current.y);
      gl!.uniform1f(uniforms.globalAlpha, 0.55 + springLevel * 0.08 + effects.glow * 0.12);
      gl!.uniform3fv(uniforms.colorNeutral, COLOR_NEUTRAL);
      gl!.uniform3fv(uniforms.colorAccent, COLOR_ACCENT);

      if (glowRef.current) {
        glowRef.current.style.opacity = String(0.028 + springLevel * 0.025 + effects.glow * 0.07);
      }

      gl!.clearColor(0, 0, 0, 0);
      gl!.clear(gl!.COLOR_BUFFER_BIT);
      gl!.enable(gl!.BLEND);
      gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);
      gl!.disable(gl!.DEPTH_TEST);
      gl!.drawArrays(gl!.POINTS, 0, count);

      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      if (!prefersCoarsePointer) {
        window.removeEventListener("pointermove", handlePointerMove);
      }
      gl.deleteProgram(program);
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(seedBuffer);
      gl.deleteBuffer(tintBuffer);
      gl.deleteBuffer(shellBuffer);
    };
  }, [sample]);

  useEffect(() => {
    return () => {
      stop();
      if (activeTimeoutRef.current) window.clearTimeout(activeTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isListening = status === "listening";
  const isBusy = status === "requesting";

  function handleMicToggle() {
    if (status === "listening") {
      stop();
    } else if (status !== "requesting") {
      start();
    }
  }

  function handleControlClick(spec: ControlSpec) {
    effectsRef.current[spec.effect] = 1;
    setActiveLabel(spec.label);
    if (activeTimeoutRef.current) window.clearTimeout(activeTimeoutRef.current);
    activeTimeoutRef.current = window.setTimeout(() => setActiveLabel(null), 900);
  }

  return (
    <div className="relative mx-auto flex w-full max-w-[860px] flex-col items-center">
      {/* Stage: a wide, bounded box so every control position (0-100%) is
          guaranteed to stay inside the viewport with margin to spare. */}
      <div className="relative aspect-[3/2] w-full">
        <div
          ref={glowRef}
          className="pointer-events-none absolute left-1/2 top-[44%] h-[60%] w-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F3E7D2] blur-[64px]"
          style={{ opacity: 0.045 }}
          aria-hidden="true"
        />
        <div
          className={`pointer-events-none absolute left-1/2 top-[44%] aspect-square w-[36%] -translate-x-1/2 -translate-y-1/2 rounded-full border transition-opacity duration-500 ${
            isListening ? "border-signal/20 opacity-100 animate-pulse-ring" : "opacity-0"
          }`}
          aria-hidden="true"
        />

        <ConnectorField />

        {/* Canvas is deliberately much larger than the resting sphere's
            visual footprint (compensated via RENDER_SCALE below) so the
            now-unbounded voice/cursor displacement has room to move into
            before it reaches the canvas's own edge. WebGL always hard-clips
            geometry outside the ±1 NDC range — that clip region is an
            axis-aligned rectangle by definition of how the GPU rasterizes,
            so a canvas sized tightly around the sphere turns that incidental
            edge into a visible "square" the moment particles travel far
            enough to reach it. This is not a containment boundary we added;
            it's removing one that was accidentally too tight. */}
        <div
          className="absolute left-1/2 top-[44%] aspect-square -translate-x-1/2 -translate-y-1/2"
          style={{ width: `${CANVAS_FRACTION * 100}%` }}
        >
          <canvas
            ref={canvasRef}
            className={`h-full w-full ${motionSafe ? "animate-landing-enter" : ""}`}
            style={motionSafe ? { animationDelay: "80ms" } : undefined}
          />
        </div>

        {CONTROLS.map((spec) => (
          <div key={spec.label} className={`absolute z-10 hidden sm:block ${spec.css}`}>
            <ControlButton
              spec={spec}
              active={activeLabel === spec.label}
              motionSafe={motionSafe}
              onTrigger={() => handleControlClick(spec)}
            />
          </div>
        ))}
      </div>

      {/* Mobile: controls reflow to a row below the stage instead of floating around it */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:hidden">
        {CONTROLS.map((spec) => (
          <ControlButton
            key={spec.label}
            spec={spec}
            active={activeLabel === spec.label}
            motionSafe={false}
            onTrigger={() => handleControlClick(spec)}
          />
        ))}
      </div>

      <div
        className={`mt-8 flex flex-col items-center gap-4 ${motionSafe ? "animate-landing-enter" : ""}`}
        style={motionSafe ? { animationDelay: "560ms" } : undefined}
      >
        <p className={`text-label uppercase tracking-widest ${status === "denied" ? "text-danger" : "text-ink-tertiary"}`}>
          {statusLabel[status]}
        </p>
        <button
          type="button"
          onClick={handleMicToggle}
          disabled={isBusy}
          aria-label={isListening ? "Stop voice interaction" : "Start voice interaction"}
          className="relative flex h-14 w-14 items-center justify-center rounded-full border bg-surface/70 text-ink-secondary backdrop-blur-md transition-all duration-200 ease-out-expo hover:text-ink-primary hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-wait"
          style={{ borderColor: hexToRgba(MIC_ACCENT, isListening ? 0.55 : 0.28) }}
        >
          {isListening && (
            <span
              className="absolute inset-[-4px] rounded-full border animate-pulse-ring"
              style={{ borderColor: hexToRgba(MIC_ACCENT, 0.35) }}
              aria-hidden="true"
            />
          )}
          <span style={{ color: isListening ? MIC_ACCENT : undefined }}>
            <MicIcon className="h-5 w-5" />
          </span>
        </button>
        <p className="text-body-sm text-ink-secondary">Your voice brings it to life</p>
      </div>
    </div>
  );
}

export function SphereCornerCaptions({ motionSafe }: { motionSafe: boolean }) {
  return (
    <>
      <div
        className={`absolute bottom-8 left-4 flex items-start gap-3 sm:left-8 ${motionSafe ? "animate-landing-enter" : ""}`}
        style={motionSafe ? { animationDelay: "700ms" } : undefined}
      >
        <span className="mt-0.5 h-10 w-px bg-line-default" aria-hidden="true" />
        <p className="font-mono text-[11px] uppercase leading-relaxed tracking-widest text-ink-tertiary">
          Voice
          <br />
          Creativity
          <br />
          Without limits
        </p>
      </div>
      <div
        className={`absolute bottom-8 right-4 flex items-start gap-3 sm:right-8 ${motionSafe ? "animate-landing-enter" : ""}`}
        style={motionSafe ? { animationDelay: "760ms" } : undefined}
      >
        <span className="mt-0.5 h-10 w-px bg-line-default" aria-hidden="true" />
        <div className="flex flex-col items-start gap-1.5">
          <span className="font-mono text-[11px] tracking-widest text-ink-tertiary">SCROLL TO EXPLORE</span>
          <ChevronDownIcon className="h-3.5 w-3.5 text-ink-tertiary animate-scroll-bounce" />
        </div>
      </div>
    </>
  );
}
