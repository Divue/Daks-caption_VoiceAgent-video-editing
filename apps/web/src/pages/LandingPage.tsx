import { Fragment, useState } from "react";
import { VoiceSphere, SphereCornerCaptions } from "../components/VoiceSphere";
import { LandingNavbar } from "../components/landing/LandingNavbar";
import { LandingBackground } from "../components/landing/LandingBackground";

// Two deliberate lines rather than one run-on sentence with an em dash: line
// one is the primary statement, line two reads as its continuation/emphasis.
// Word-reveal stagger continues across both lines (see HeroHeadline below),
// so the two-line layout doesn't change the animation language.
const HEADLINE_LINES = [
  ["Create,", "Caption,", "and", "Edit"],
  ["All", "With", "Your", "Voice"],
];
const HEADLINE_STAGGER_BASE_MS = 220;
const HEADLINE_STAGGER_STEP_MS = 45;

interface HeroInfoItem {
  n: string;
  title: string;
  description: string;
  animate: string;
  delay: number;
}

// Left-of-sphere product info (see hero section below): each item uses a
// distinct reveal direction per design spec, not one repeated fade, and the
// delays start only once the headline/eyebrow have mostly settled.
const HERO_INFO_ITEMS: HeroInfoItem[] = [
  {
    n: "01",
    title: "Voice-First Editing",
    description: "Control your edits naturally with your voice.",
    animate: "animate-info-reveal-left",
    delay: 640,
  },
  {
    n: "02",
    title: "Smart Captions",
    description: "Create polished captions without manual editing.",
    animate: "animate-info-reveal-up",
    delay: 760,
  },
  {
    n: "03",
    title: "Short-Form Ready",
    description: "Turn your ideas into content made for social media.",
    animate: "animate-info-reveal-fade",
    delay: 880,
  },
];

// Renders HEADLINE_LINES as two lines, each word individually staggered with
// the existing word-reveal animation — the stagger index keeps counting up
// across the line break so the reveal still reads as one continuous sweep.
function HeroHeadline({ motionSafe }: { motionSafe: boolean }) {
  let wordIndex = 0;
  return (
    <h1 className="font-display text-heading-lg text-ink-primary sm:text-display-md">
      {HEADLINE_LINES.map((line, lineIdx) => (
        <span key={lineIdx} className="block">
          {line.map((word, i) => {
            const delay = HEADLINE_STAGGER_BASE_MS + wordIndex * HEADLINE_STAGGER_STEP_MS;
            wordIndex += 1;
            return (
              // The separator space is a plain sibling text node, not part of
              // the inline-block span's own content — an inline-block box
              // lays out its content as its own isolated line, so a trailing
              // space placed inside it sits at that line's end and gets
              // collapsed away by ordinary CSS whitespace rules, silently
              // gluing every word together.
              <Fragment key={word}>
                <span
                  className={`inline-block ${motionSafe ? "animate-word-reveal" : ""}`}
                  style={motionSafe ? { animationDelay: `${delay}ms` } : undefined}
                >
                  {word}
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

function HeroProductInfo({ motionSafe }: { motionSafe: boolean }) {
  return (
    <div className="absolute left-6 top-[46%] hidden w-40 -translate-y-1/2 flex-col gap-7 xl:left-8 xl:flex 2xl:left-16 2xl:w-56">
      {HERO_INFO_ITEMS.map((item) => (
        <div
          key={item.n}
          className={`group ${motionSafe ? item.animate : ""}`}
          style={motionSafe ? { animationDelay: `${item.delay}ms` } : undefined}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-ink-tertiary transition-colors duration-200 group-hover:text-signal">
              {item.n}
            </span>
            <span className="h-px w-4 bg-line-subtle transition-all duration-200 group-hover:w-6 group-hover:bg-signal/50" />
          </div>
          <p className="mt-2 text-body-sm font-medium uppercase leading-snug tracking-wide text-ink-secondary transition-colors duration-200 group-hover:text-ink-primary">
            {item.title}
          </p>
          <p className="mt-1.5 text-body-sm leading-snug text-ink-tertiary transition-colors duration-200 group-hover:text-ink-secondary">
            {item.description}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function LandingPage() {
  const [motionSafe] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  return (
    <div className="min-h-screen bg-canvas text-ink-primary">
      <LandingNavbar />

      {/* Landing centerpiece — the sphere is the entire visual content here, deliberately */}
      <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden px-4 py-20 sm:px-8">
        <LandingBackground motionSafe={motionSafe} />
        {/* Atmospheric glow, behind the sphere: placed here (before the content
            column below) purely by DOM order, so it paints underneath the
            sphere/controls/text with no z-index needed. Sized/positioned off
            the section itself rather than the sphere's own box, since the
            sphere's rendered footprint includes its status text/mic button
            below the stage — anchoring to that would pull the glow's visual
            center lower than the sphere's actual optical center. */}
        <div
          aria-hidden="true"
          className={`hero-glow pointer-events-none absolute left-1/2 top-[44%] aspect-[3/4] w-[85vw] max-w-[420px] -translate-x-1/2 -translate-y-1/2 opacity-50 sm:w-[65vw] sm:max-w-[600px] sm:opacity-75 xl:w-[720px] xl:opacity-100 ${motionSafe ? "animate-hero-glow-breathe" : ""}`}
        />
        <div className="relative mx-auto flex w-full max-w-[1200px] flex-col items-center justify-center">
          <div className="mb-8 flex max-w-2xl flex-col items-center gap-3 text-center sm:mb-10">
            <p
              className={`font-mono text-[11px] uppercase tracking-widest text-ink-tertiary ${motionSafe ? "animate-eyebrow-reveal" : ""}`}
              style={motionSafe ? { animationDelay: "120ms" } : undefined}
            >
              Voice-Powered Video Editing
            </p>
            <HeroHeadline motionSafe={motionSafe} />
            <p
              className={`text-body-sm text-ink-secondary sm:text-body-md ${motionSafe ? "animate-subtitle-reveal" : ""}`}
              style={motionSafe ? { animationDelay: "640ms" } : undefined}
            >
              Turn your ideas into polished, share-ready short-form content.
            </p>
          </div>
          <VoiceSphere />
        </div>
        <HeroProductInfo motionSafe={motionSafe} />
        <SphereCornerCaptions motionSafe={motionSafe} />
      </section>
    </div>
  );
}
