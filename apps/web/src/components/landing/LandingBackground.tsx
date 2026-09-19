import { AmbientDust } from "../VoiceSphere";

// Black grid + dots hero background — restores the look the hero used before
// the cosmic nebula/orbit redesign (see git history: the old inline
// bg-grid-texture/bg-grid classes in LandingPage.tsx, and .landing-grid
// below). Two static decorative layers only: a faint technical grid and the
// existing ambient dust dots (AmbientDust, owned by VoiceSphere.tsx and left
// untouched — reused here rather than duplicated). No stars, blobs, or orbit
// SVG: this is a backdrop for the sphere/typography, not a visual centerpiece.
export function LandingBackground({ motionSafe }: { motionSafe: boolean }) {
  return (
    <div aria-hidden="true" className="landing-background-root pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className={`landing-grid absolute inset-0 ${motionSafe ? "animate-landing-enter" : ""}`}
        style={motionSafe ? { animationDuration: "1.2s" } : undefined}
      />
      <AmbientDust />
      <div className="landing-vignette absolute inset-0" />
    </div>
  );
}
