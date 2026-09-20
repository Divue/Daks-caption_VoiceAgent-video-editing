import { Fragment, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { VoiceSphere } from "../components/VoiceSphere";
import { LandingNavbar } from "../components/landing/LandingNavbar";
import { LandingBackground } from "../components/landing/LandingBackground";
import { CaptionShowcaseSection } from "../components/landing/CaptionShowcaseSection";
import { ToneSection } from "../components/landing/ToneSection";
import { SignalsSection } from "../components/landing/SignalsSection";
import { TalkToEditSection } from "../components/landing/TalkToEditSection";
import { HinglishSection } from "../components/landing/HinglishSection";
import { StepsSection } from "../components/landing/StepsSection";
import { ClosingSection } from "../components/landing/ClosingSection";
import { LandingFooter } from "../components/landing/dark/LandingFooter";
import { LandingScrollbar } from "../components/landing/LandingScrollbar";
import { useScrollVar } from "../components/landing/caption-demo";
import { useRoute } from "@/router";
import { ArrowRightIcon } from "@/icons";

// Two deliberate lines rather than one run-on sentence with an em dash: line
// one is the primary statement, line two reads as its continuation/emphasis.
// Word-reveal stagger continues across both lines (see HeroHeadline below),
// so the two-line layout doesn't change the animation language.
const HEADLINE_LINES = [
  ["Create,", "Caption,", "and", "Edit"],
  ["All", "With", "Your", "Voice"],
];
const HEADLINE_STAGGER_BASE_MS = 250;
const HEADLINE_STAGGER_STEP_MS = 75;

// The hero's old left-of-sphere info block, folded into one mono bullet row under the CTAs.
const HERO_POINTS = ["Voice-first editing", "Tone-aware captions", "Hinglish-first", "Short-form ready"];

// Scroll split: as the hero scrolls away, line one slides off to the left and line two to the
// right (driven by --hero-p, 0..1, from useScrollVar — no re-render per frame).
const LINE_SPLIT: CSSProperties[] = [
  { transform: "translate3d(calc(var(--hero-p, 0) * -24vw), 0, 0)", opacity: "calc(1 - var(--hero-p, 0) * 1.15)" },
  { transform: "translate3d(calc(var(--hero-p, 0) * 24vw), 0, 0)", opacity: "calc(1 - var(--hero-p, 0) * 1.15)" },
];

// Renders HEADLINE_LINES as two lines, each word individually staggered with
// the existing word-reveal animation — the stagger index keeps counting up
// across the line break so the reveal still reads as one continuous sweep.
function HeroHeadline({ motionSafe }: { motionSafe: boolean }) {
  return (
    <h1 className="font-display text-[clamp(1.7rem,7.4vw,2.6rem)] font-bold leading-[1.02] tracking-[-0.035em] text-ink-primary lg:text-[min(4.1vw,3.5rem)]">
      {HEADLINE_LINES.map((line, lineIdx) => (
        <span
          key={lineIdx}
          className={`block whitespace-nowrap will-change-transform ${lineIdx === 1 ? "text-signal" : ""}`}
          style={motionSafe ? LINE_SPLIT[lineIdx] : undefined}
        >
          {line.map((word, i) => {
            const delay = HEADLINE_STAGGER_BASE_MS + (lineIdx * HEADLINE_LINES[0].length + i) * HEADLINE_STAGGER_STEP_MS;
            return (
              // The separator space is a plain sibling text node, not part of
              // the inline-block span's own content — an inline-block box
              // lays out its content as its own isolated line, so a trailing
              // space placed inside it sits at that line's end and gets
              // collapsed away by ordinary CSS whitespace rules, silently
              // gluing every word together.
              // Outer span is the mask (clips the word while it rises; the padding/negative margin
              // keep descenders inside it), inner span is the word that rises and tips upright.
              <Fragment key={word}>
                <span className="-mb-[0.14em] inline-block overflow-hidden pb-[0.14em] align-bottom">
                  <span
                    className={`inline-block origin-bottom-left ${motionSafe ? "animate-mask-up" : ""}`}
                    style={motionSafe ? { animationDelay: `${delay}ms` } : undefined}
                  >
                    {word}
                  </span>
                </span>
                {i < line.length - 1 ? " " : ""}
              </Fragment>
            );
          })}
        </span>
      ))}
    </h1>
  );
}

function ScrollCue({ motionSafe }: { motionSafe: boolean }) {
  return (
    <div aria-hidden="true" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 sm:block" style={{ opacity: "calc(1 - var(--hero-p, 0) * 4)" }}>
      <div
        className={`flex h-8 w-5 justify-center rounded-full border border-line-default pt-1.5 ${motionSafe ? "animate-text-materialize" : ""}`}
        style={motionSafe ? { animationDelay: "1800ms" } : undefined}
      >
        <span className={`h-1.5 w-0.5 rounded-full bg-ink-secondary ${motionSafe ? "animate-scroll-wheel" : ""}`} />
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [motionSafe] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  // Load intro (VoiceSphere's `intro`): only the background and the sphere show until it lands.
  // The scroll reset runs here, during the first render, because the sphere measures its own
  // position in a layout effect that fires before any effect of this component.
  const [introDone, setIntroDone] = useState(() => {
    if (!motionSafe) return true;
    window.history.scrollRestoration = "manual";
    // 'instant', not the default 'auto': html now has scroll-behavior:smooth for the navbar's
    // anchor links (index.css), and the intro's reset must be a jump — the sphere measures where
    // it lands immediately after this, and an animated scroll would still be in flight.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    // Scroll is locked for the whole intro (owner's call). Locked here, not in an effect, so the
    // scrollbar is already gone when the sphere measures where it will land.
    document.documentElement.style.overflow = "hidden";
    return false;
  });
  // The page draws its own scrollbar (LandingScrollbar); the native one is hidden while the landing
  // page is mounted so it can't pop in, and shift the layout, when the intro's lock lifts.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("landing-native-scrollbar-hidden");
    return () => {
      root.classList.remove("landing-native-scrollbar-hidden");
      // The intro turned restoration off so every load starts at the top; hand it back so the
      // editor's back/forward navigation restores scroll as normal.
      window.history.scrollRestoration = "auto";
    };
  }, []);
  // Keeps the lock in step with the intro, and never leaves it on when the page unmounts.
  useEffect(() => {
    document.documentElement.style.overflow = introDone ? "" : "hidden";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [introDone]);
  const { navigate } = useRoute();
  const heroRef = useRef<HTMLElement>(null);
  // 0 while the hero's top is at the top of the viewport, 1 once it has scrolled 2.2 screens.
  //
  // This is the hero's SCROLL-LINKED animation: --hero-p is a 0..1 progress value written from a
  // scroll listener, and everything that moves on scroll (LINE_SPLIT's 24vw title split and its
  // opacity, fadeOnScroll, the sphere's drift/scale, ScrollCue) reads it through calc(). It is not
  // a transition or a one-shot animation, so duration and easing don't apply — the only thing that
  // controls how fast it reads is how much scroll maps to that 0..1 range.
  //
  // Widened from 1.2 screens to 2.2 (~1.8x) because the old range made it twitchy: the title lines
  // were fully transparent by p≈0.87 (opacity is `1 - p * 1.15`) and everything under them by
  // p≈0.63 (`1 - p * 1.6`), so roughly a single screen of scroll consumed the whole gesture and a
  // small wheel movement threw the lines a long way apart. Same motion, spread over more scroll.
  useScrollVar(heroRef, "--hero-p", 0, -2.2, motionSafe);

  const reveal = (delay: number): { className: string; style?: CSSProperties } =>
    motionSafe ? { className: "animate-rise", style: { animationDelay: `${delay}ms` } } : { className: "" };
  // Everything under the headline eases out a little faster than the split lines.
  const fadeOnScroll: CSSProperties = motionSafe ? { opacity: "calc(1 - var(--hero-p, 0) * 1.6)" } : {};

  return (
    <div id="top" className="min-h-screen overflow-x-clip bg-canvas text-ink-primary">
      {introDone && <LandingNavbar />}
      <LandingScrollbar visible={introDone} />

      <section ref={heroRef} className="relative flex min-h-[100svh] items-center overflow-hidden px-4 pb-20 pt-28 sm:px-8 lg:pb-16 lg:pt-24">
        <LandingBackground motionSafe={motionSafe} />

        <div className="relative mx-auto grid w-full max-w-[1200px] items-center gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-6">
          {/* Holds its place during the intro (so the sphere's destination is final), and is
              remounted when the intro ends so the reveal animations play then. */}
          <div
            key={introDone ? "copy" : "copy-waiting"}
            className={`flex flex-col items-center text-center lg:items-start lg:text-left ${introDone ? "" : "invisible"}`}
          >
            {/* Wrapper carries the scroll fade: the reveal animation (fill: both) owns the pill's own opacity. */}
            <div style={fadeOnScroll}>
              <p
                className={`inline-flex items-center gap-2 rounded-full border border-line-subtle bg-surface/80 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-ink-secondary backdrop-blur-sm ${motionSafe ? "animate-rise" : ""}`}
                style={motionSafe ? { animationDelay: "80ms" } : undefined}
              >
                <span className="relative flex h-2 w-2">
                  {motionSafe && <span className="absolute inset-0 rounded-full bg-signal/60 animate-pulse-ring" />}
                  <span className="relative h-2 w-2 rounded-full bg-signal" />
                </span>
                Voice-Powered Video Editing
              </p>
            </div>

            <div className="mt-6">
              <HeroHeadline motionSafe={motionSafe} />
            </div>

            <div style={fadeOnScroll} className="flex flex-col items-center lg:items-start">
              <p
                className={`mt-6 max-w-[34rem] text-body-md text-ink-secondary sm:text-body-lg ${reveal(950).className}`}
                style={reveal(950).style}
              >
                Turn your ideas into polished, share-ready short-form content. Captions that catch how you said
                it, in an editor you just talk to.
              </p>

              <div className={`mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start ${reveal(1100).className}`} style={reveal(1100).style}>
                <button
                  type="button"
                  onClick={() => navigate("/editor")}
                  className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-signal px-6 py-3 text-body-sm font-semibold text-canvas transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_10px_28px_-6px_rgba(255,107,74,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  {motionSafe && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/35 to-transparent animate-shine"
                    />
                  )}
                  <span className="relative">Start Creating</span>
                  <ArrowRightIcon className="relative h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById("showcase")?.scrollIntoView({ behavior: motionSafe ? "smooth" : "auto" })}
                  className="inline-flex items-center rounded-full border border-line-default px-6 py-3 text-body-sm font-semibold text-ink-primary transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-ink-secondary hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-secondary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  See it in action
                </button>
              </div>

              <ul
                className={`mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-wide text-ink-tertiary lg:justify-start ${reveal(1250).className}`}
                style={reveal(1250).style}
              >
                {HERO_POINTS.map((point) => (
                  <li key={point} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* The sphere: drifts down and back a little as the hero scrolls away. */}
          <div
            className="relative"
            style={motionSafe ? { transform: "translate3d(0, calc(var(--hero-p, 0) * 70px), 0) scale(calc(1 - var(--hero-p, 0) * 0.1))" } : undefined}
          >
            {/* Atmospheric glow, behind the sphere by DOM order (no z-index needed). */}
            {/* Outer layer fades the glow in slowly after the intro; the inner one breathes (its own
                opacity animation would otherwise override the fade). */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute left-1/2 top-[40%] aspect-[3/4] w-[90%] max-w-[560px] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-[2400ms] ease-out ${introDone ? "opacity-60 sm:opacity-80 xl:opacity-100" : "opacity-0"}`}
            >
              <div className={`hero-glow h-full w-full ${motionSafe ? "animate-hero-glow-breathe" : ""}`} />
            </div>
            <VoiceSphere intro={motionSafe} onIntroDone={() => setIntroDone(true)} />
          </div>
        </div>

        {introDone && <ScrollCue motionSafe={motionSafe} />}
      </section>

      <CaptionShowcaseSection />
      <HinglishSection />
      <ToneSection />
      <SignalsSection />
      <TalkToEditSection />
      <StepsSection />
      <ClosingSection />
      <LandingFooter />
    </div>
  );
}
