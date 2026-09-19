import { AmbientDust } from "../VoiceSphere";

// Black grid + dots hero background — restores the look the hero used before
// the cosmic nebula/orbit redesign (see git history: the old inline
// bg-grid-texture/bg-grid classes in LandingPage.tsx, and .landing-grid
// below). Two static decorative layers only: a faint technical grid and the
// existing ambient dust dots (AmbientDust, owned by VoiceSphere.tsx and left
// untouched — reused here rather than duplicated). No stars, blobs, or orbit
// SVG: this is a backdrop for the sphere/typography, not a visual centerpiece.
//
// Density pass: the hero read as too empty right/left of the sphere, so this
// adds a few more static/near-static layers on top of that same look —
// scattered crosshair marks, edge ruler ticks, and a second, dimmer dust
// layer (SecondaryDust below) — all new code local to this file. VoiceSphere
// itself (AmbientDust included) is untouched.

// Second dust layer: generated once at module load, same pattern as
// VoiceSphere's own DUST array. Deliberately smaller/dimmer than that layer
// and weighted toward the outer thirds of the hero (left/right), since the
// centre is already covered by the sphere, headline and the shared mask.
const SECONDARY_DUST = Array.from({ length: 60 }, () => {
  const onLeft = Math.random() < 0.5;
  const left = onLeft ? Math.random() * 32 : 68 + Math.random() * 32;
  return {
    left,
    top: Math.random() * 100,
    size: 0.6 + Math.random() * 0.6,
    opacity: 0.08 + Math.random() * 0.14,
    // Negative delay starts each dot mid-cycle so the drift reads as already
    // out-of-phase from frame one, not just staggered on first load.
    delay: -(Math.random() * 40),
    duration: 34 + Math.random() * 16,
  };
});

// Slightly smaller, dimmer, slower-drifting counterpart to VoiceSphere's
// AmbientDust — new component, not a re-parameterisation of that one.
function SecondaryDust({ motionSafe }: { motionSafe: boolean }) {
  return (
    <div
      className="landing-dust-secondary pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {SECONDARY_DUST.map((d, i) => (
        <span
          key={i}
          className={`absolute rounded-full bg-ink-primary ${motionSafe ? "animate-dust-drift" : ""}`}
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: `${d.size}px`,
            height: `${d.size}px`,
            opacity: d.opacity,
            animationDelay: motionSafe ? `${d.delay}s` : undefined,
            animationDuration: motionSafe ? `${d.duration}s` : undefined,
          }}
        />
      ))}
    </div>
  );
}

export function LandingBackground({ motionSafe }: { motionSafe: boolean }) {
  return (
    // Absolute inset-0, scoped to the hero section that renders this (its
    // only caller — LandingPage.tsx is hero-only again), not fixed to the
    // viewport. A `fixed` full-page version briefly existed for a
    // multi-section landing page and, with a `-z-10` it carried at the
    // time, caused a real regression (that negative z-index escaped past
    // every ancestor with no local stacking context and painted behind
    // <body>'s own background). Both the fixed positioning and the
    // z-index were specific to backing a page with content below the
    // hero, which no longer exists, so this reverts to the simpler
    // hero-scoped original rather than carrying that risk forward unused.
    <div aria-hidden="true" className="landing-background-root pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className={`landing-grid absolute inset-0 ${motionSafe ? "animate-landing-enter" : ""}`}
        style={motionSafe ? { animationDuration: "1.2s" } : undefined}
      />
      {/* Scattered "+" marks at grid intersections, biased to the outer
          thirds — see .landing-crosshairs for the SVG and coordinates. */}
      <div className="landing-crosshairs absolute inset-0" />
      {/* Ruler ticks + coordinate labels along the hero's own left/right
          edges, in the corner captions' visual language. */}
      <div className="landing-edge-tick-left absolute inset-y-0 left-0 w-8" />
      <div className="landing-edge-tick-right absolute inset-y-0 right-0 w-8" />
      <AmbientDust />
      <SecondaryDust motionSafe={motionSafe} />
      <div className="landing-vignette absolute inset-0" />
    </div>
  );
}
