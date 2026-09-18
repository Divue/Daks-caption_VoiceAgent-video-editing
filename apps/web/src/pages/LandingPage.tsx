import { useState } from "react";
import { ArrowUpRight } from "../icons";
import { VoiceSphere, SphereCornerCaptions, AmbientDust } from "../components/VoiceSphere";

export default function LandingPage() {
  const [motionSafe] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  return (
    <div className="min-h-screen bg-canvas text-ink-primary">
      {/* Nav — [Ref] floating inset pill container */}
      <div className="sticky top-0 z-50 px-4 pt-4 sm:px-6">
        <nav className="mx-auto flex max-w-[1200px] items-center justify-between rounded-lg border border-line-subtle bg-surface/90 px-5 py-3 backdrop-blur-md">
          <span className="font-display text-heading-md text-ink-primary">Design System</span>
          <div className="hidden items-center gap-8 sm:flex">
            <a href="#foundations" className="text-body-sm text-ink-secondary hover:text-ink-primary transition-colors">
              Foundations
            </a>
            <a href="#components" className="text-body-sm text-ink-secondary hover:text-ink-primary transition-colors">
              Components
            </a>
            <a href="#motion" className="text-body-sm text-ink-secondary hover:text-ink-primary transition-colors">
              Motion
            </a>
          </div>
          <button className="inline-flex items-center gap-1.5 rounded-full bg-signal px-4 py-2 text-body-sm font-medium text-canvas transition-all duration-200 ease-out-expo hover:brightness-110 hover:scale-[1.02]">
            Preview
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </nav>
      </div>

      {/* Landing centerpiece — the sphere is the entire visual content here, deliberately */}
      <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden px-4 py-20 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-grid-texture bg-grid opacity-20 animate-landing-enter" style={{ animationDuration: "1.2s" }} />
        <AmbientDust />
        <div className="relative mx-auto flex w-full max-w-[1200px] justify-center">
          <VoiceSphere />
        </div>
        <SphereCornerCaptions motionSafe={motionSafe} />
      </section>
    </div>
  );
}
