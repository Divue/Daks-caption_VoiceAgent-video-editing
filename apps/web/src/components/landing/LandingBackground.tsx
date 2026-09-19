import { useState } from "react";

// Cinematic cosmic hero background: replaces the old flat grid. Entirely
// independent from VoiceSphere.tsx — no shared state, no imports from it —
// so it can be iterated on freely without any risk to the sphere.
//
// Painted back to front, matching .landing-background-root/.landing-blob-*/
// .landing-nebula-wash/.landing-vignette in index.css:
//   1. solid near-black base (.landing-background-root, on the root div)
//   2. blurred irregular nebula "blobs" — far layer, then mid layer
//   3. a smooth gradient wash: directional tints + the broad central aura
//   4. scattered tiny stars (this component's own — see STAR_* below)
//   5. orbit SVG: one luminous main arc (gradient + blurred glow duplicate),
//      2-3 much fainter secondary arcs, and a few small rings hugging the
//      sphere
//   6. a very subtle edge vignette
//
// Everything here is pointer-events-none and purely decorative.

interface Star {
  left: number;
  top: number;
  size: number;
  color: string;
  opacity: number;
  halo: boolean;
  delay: number;
  duration: number;
}

// Mostly dim pale white/violet, a meaningful minority violet, a few pink,
// and only a handful warm orange — matches the reference's sparse, mostly-
// cool star field rather than an even rainbow scatter.
const STAR_COLORS: { color: string; weight: number }[] = [
  { color: "#D8D4FF", weight: 60 },
  { color: "#7654FF", weight: 22 },
  { color: "#E65BC4", weight: 12 },
  { color: "#FF7048", weight: 6 },
];

function pickStarColor(): string {
  const total = STAR_COLORS.reduce((sum, c) => sum + c.weight, 0);
  let r = Math.random() * total;
  for (const c of STAR_COLORS) {
    if (r < c.weight) return c.color;
    r -= c.weight;
  }
  return STAR_COLORS[0].color;
}

// Biases stars away from the central sphere/headline/connector zone (roughly
// x:[28,72] y:[12,68] of the hero) so the product interaction stays
// uncluttered — most stars land toward the outer edges instead of an even
// scatter. A couple of resample attempts is enough; the fallback pushes
// straight to the top/bottom strip rather than looping indefinitely.
function pickStarPosition(): { left: number; top: number } {
  for (let attempt = 0; attempt < 6; attempt++) {
    const left = Math.random() * 100;
    const top = Math.random() * 100;
    const inCenter = left > 28 && left < 72 && top > 12 && top < 68;
    if (!inCenter) return { left, top };
  }
  return { left: Math.random() * 100, top: Math.random() < 0.5 ? Math.random() * 12 : 80 + Math.random() * 20 };
}

function pickStarSize(): number {
  const r = Math.random();
  if (r < 0.6) return 1;
  if (r < 0.88) return 1.5;
  return 2;
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const HALO_STAR_COUNT = 8;

function buildStars(count: number): Star[] {
  return Array.from({ length: count }, (_, i) => {
    const { left, top } = pickStarPosition();
    return {
      left,
      top,
      size: pickStarSize(),
      color: pickStarColor(),
      opacity: 0.25 + Math.random() * 0.35,
      halo: i < HALO_STAR_COUNT,
      delay: Math.random() * 6,
      duration: 4 + Math.random() * 4,
    };
  });
}

export function LandingBackground({ motionSafe }: { motionSafe: boolean }) {
  // Fewer stars on narrow viewports (per the responsive brief) — a one-time
  // read at mount, same pattern the rest of this hero already uses for
  // prefers-reduced-motion, not a resize listener.
  const [stars] = useState<Star[]>(() => {
    const count = window.innerWidth < 640 ? 28 : window.innerWidth < 1024 ? 42 : 56;
    return buildStars(count);
  });

  const driftFar = motionSafe ? "animate-nebula-drift-slow" : "";
  const driftMid = motionSafe ? "animate-nebula-drift" : "";

  return (
    <div aria-hidden="true" className="landing-background-root pointer-events-none absolute inset-0 overflow-hidden">
      {/* Nebula, far layer: largest, most-blurred blobs — slowest drift. */}
      <div className={`absolute inset-0 opacity-70 sm:opacity-85 xl:opacity-100 ${driftFar}`}>
        <span className="landing-blob landing-blob-left-far" />
        <span className="landing-blob landing-blob-right-far" />
      </div>

      {/* Nebula, mid layer: smaller, slightly more defined blobs (incl. the
          warm lower-right and the distant top-left light) — faster drift. */}
      <div className={`absolute inset-0 opacity-70 sm:opacity-85 xl:opacity-100 ${driftMid}`}>
        <span className="landing-blob landing-blob-left-mid" />
        <span className="landing-blob landing-blob-right-mid" />
        <span className="landing-blob landing-blob-warm" />
        <span className="landing-blob landing-blob-top-left" />
      </div>

      {/* Smooth wash: directional tints + the broad central aura, blending
          the blurred blobs above into one cohesive field. Static — the
          layers above already carry all the motion this background needs. */}
      <div className="landing-nebula-wash absolute inset-0" />

      {/* Scattered stars. */}
      <div className="absolute inset-0">
        {stars.map((s, i) => (
          <span
            key={i}
            className={`absolute rounded-full ${motionSafe ? "animate-twinkle" : ""}`}
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              backgroundColor: s.color,
              opacity: s.opacity,
              boxShadow: s.halo ? `0 0 ${s.size * 4}px ${hexToRgba(s.color, 0.5)}` : undefined,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}
      </div>

      {/* Orbital arcs + local rings around the sphere. */}
      <svg
        className="absolute inset-0 h-full w-full opacity-75 sm:opacity-90 xl:opacity-100"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          {/* Violet (upper-left) -> purple -> magenta -> warm orange
              (right/lower-right), matching the reference's cool-to-warm
              sweep across the main orbit. */}
          <linearGradient id="landing-orbit-main" x1="60" y1="120" x2="1140" y2="620" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(118, 84, 255, 0.65)" />
            <stop offset="30%" stopColor="rgba(91, 63, 194, 0.55)" />
            <stop offset="62%" stopColor="rgba(180, 63, 155, 0.5)" />
            <stop offset="100%" stopColor="rgba(255, 112, 72, 0.45)" />
          </linearGradient>
          <filter id="landing-orbit-blur" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Main orbit: large, tilted, mostly outside the viewport so only
            fragments of its arc read — a soft blurred glow duplicate
            underneath a thin bright core, both sharing the same gradient. */}
        <g className={motionSafe ? "animate-orbit-breathe" : ""}>
          <ellipse
            cx="600"
            cy="352"
            rx="760"
            ry="336"
            transform="rotate(-4 600 352)"
            stroke="url(#landing-orbit-main)"
            strokeWidth="10"
            filter="url(#landing-orbit-blur)"
            opacity="0.45"
          />
          <ellipse cx="600" cy="352" rx="760" ry="336" transform="rotate(-4 600 352)" stroke="url(#landing-orbit-main)" strokeWidth="1.6" />
        </g>

        {/* Secondary arcs: fainter, different angles/sizes — depth, not focus. */}
        <ellipse cx="560" cy="300" rx="950" ry="430" transform="rotate(7 560 300)" stroke="rgba(91, 63, 194, 0.12)" strokeWidth="1" />
        <ellipse cx="640" cy="400" rx="640" ry="300" transform="rotate(-10 640 400)" stroke="rgba(180, 63, 155, 0.08)" strokeWidth="1" />
        <path d="M -220 140 Q 540 -140 1430 240" stroke="rgba(118, 84, 255, 0.06)" strokeWidth="1" />

        {/* Local orbital rings hugging the sphere itself, well inside the
            connectors' own footprint but painted beneath them (this whole
            component sits earlier in the DOM than VoiceSphere). */}
        <ellipse cx="600" cy="352" rx="230" ry="150" stroke="rgba(118, 84, 255, 0.16)" strokeWidth="1" />
        <ellipse cx="600" cy="352" rx="300" ry="196" transform="rotate(6 600 352)" stroke="rgba(91, 63, 194, 0.11)" strokeWidth="1" />
        <ellipse cx="600" cy="352" rx="180" ry="116" transform="rotate(-8 600 352)" stroke="rgba(180, 63, 155, 0.09)" strokeWidth="1" />
      </svg>

      {/* Edge vignette — topmost decorative layer. */}
      <div className="landing-vignette absolute inset-0" />
    </div>
  );
}
