import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, MicIcon } from "../icons";
import { VoiceSphere, SphereCornerCaptions, AmbientDust } from "../components/VoiceSphere";

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="mb-10 max-w-2xl">
      <p className="text-label uppercase text-precision mb-3">{eyebrow}</p>
      <h2 className="font-display text-display-md text-ink-primary mb-3">{title}</h2>
      {description && <p className="text-body-md text-ink-secondary">{description}</p>}
    </div>
  );
}

function Swatch({ name, token, hex, textOn = "light" }: { name: string; token: string; hex: string; textOn?: "light" | "dark" }) {
  return (
    <div className="rounded-md overflow-hidden border border-line-subtle">
      <div
        className="h-20 flex items-end p-3"
        style={{ backgroundColor: hex }}
      >
        <span
          className={`text-body-sm font-medium ${textOn === "light" ? "text-ink-primary" : "text-canvas"}`}
        >
          {name}
        </span>
      </div>
      <div className="bg-surface px-3 py-2 flex items-center justify-between">
        <span className="text-mono-sm font-mono text-ink-tertiary">{token}</span>
        <span className="text-mono-sm font-mono text-ink-secondary">{hex}</span>
      </div>
    </div>
  );
}

function Badge({ tone, label }: { tone: "signal" | "precision" | "success" | "warning" | "danger"; label: string }) {
  const styles: Record<string, string> = {
    signal: "bg-signal-dim text-signal border-signal/30",
    precision: "bg-precision-dim text-precision border-precision/30",
    success: "bg-success/10 text-success border-success/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    danger: "bg-danger/10 text-danger border-danger/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-label uppercase ${styles[tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

type CommandState = "idle" | "listening" | "transcribed" | "confirmed";

function TranscriptDemo() {
  const [state, setState] = useState<CommandState>("idle");
  const timeouts = useRef<number[]>([]);

  useEffect(() => {
    return () => timeouts.current.forEach((t) => window.clearTimeout(t));
  }, []);

  function runDemo() {
    timeouts.current.forEach((t) => window.clearTimeout(t));
    timeouts.current = [];
    setState("listening");
    timeouts.current.push(
      window.setTimeout(() => setState("transcribed"), 1300),
      window.setTimeout(() => setState("confirmed"), 2700),
      window.setTimeout(() => setState("idle"), 4600)
    );
  }

  const isBusy = state !== "idle";

  return (
    <div className="rounded-lg border border-line-subtle bg-surface p-6 flex flex-col items-center gap-6">
      <div className="relative flex items-center justify-center h-20 w-20">
        {state === "listening" && (
          <>
            <span className="absolute inset-0 rounded-full bg-signal/40 animate-pulse-ring" />
            <span
              className="absolute inset-0 rounded-full bg-signal/40 animate-pulse-ring"
              style={{ animationDelay: "0.5s" }}
            />
          </>
        )}
        <button
          onClick={runDemo}
          disabled={isBusy}
          className="relative z-10 h-16 w-16 rounded-full bg-signal text-canvas flex items-center justify-center transition-transform duration-200 ease-out-expo hover:scale-105 disabled:cursor-default"
          aria-label="Simulate voice command"
        >
          <MicIcon className="h-6 w-6" />
        </button>
      </div>

      <div className="h-16 flex items-center justify-center w-full">
        {state === "idle" && (
          <button
            onClick={runDemo}
            className="text-body-sm text-ink-secondary underline decoration-line underline-offset-4 hover:text-ink-primary transition-colors"
          >
            Click the mic to simulate a voice command
          </button>
        )}
        {state === "listening" && (
          <p className="text-body-sm text-ink-secondary animate-fade-up">Listening…</p>
        )}
        {state === "transcribed" && (
          <span className="animate-fade-up inline-flex items-center rounded-full border border-precision/30 bg-precision-dim px-4 py-2 font-mono text-mono-sm text-precision">
            "cut the last 5 seconds"
          </span>
        )}
        {state === "confirmed" && (
          <span className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-4 py-2 font-mono text-mono-sm text-success">
            <ArrowUpRight className="h-3.5 w-3.5 rotate-45" />
            Clip trimmed
          </span>
        )}
      </div>
    </div>
  );
}

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
      <section id="sphere" className="relative flex min-h-[90vh] items-center justify-center overflow-hidden px-4 py-20 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-grid-texture bg-grid opacity-20 animate-enter" style={{ animationDuration: "1.2s" }} />
        <AmbientDust />
        <div className="relative mx-auto flex w-full max-w-[1200px] justify-center">
          <VoiceSphere />
        </div>
        <SphereCornerCaptions motionSafe={motionSafe} />
      </section>

      {/* Section-transition device */}
      <div className="relative h-px w-full bg-gradient-to-r from-transparent via-line to-transparent">
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-precision shadow-[0_0_20px_6px_rgba(74,222,222,0.5)]" />
      </div>

      <main className="mx-auto max-w-[1200px] px-4 py-24 sm:px-6" id="components">
        {/* Typography */}
        <div id="foundations">
          <SectionHeader
            eyebrow="Foundations"
            title="Typography"
            description="A distinctive display face for headlines, paired with a neutral UI face for everything functional."
          />
          <div className="mb-16 grid gap-6 sm:grid-cols-2">
            <div className="space-y-6">
              <div>
                <p className="text-label uppercase text-ink-tertiary mb-2">display-lg</p>
                <p className="font-display text-display-lg text-ink-primary">Precision, felt</p>
              </div>
              <div>
                <p className="text-label uppercase text-ink-tertiary mb-2">display-md</p>
                <p className="font-display text-display-md text-ink-primary">Precision, felt</p>
              </div>
              <div>
                <p className="text-label uppercase text-ink-tertiary mb-2">heading-lg</p>
                <p className="font-display text-heading-lg text-ink-primary">Precision, felt</p>
              </div>
              <div>
                <p className="text-label uppercase text-ink-tertiary mb-2">heading-md</p>
                <p className="font-display text-heading-md text-ink-primary">Precision, felt</p>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <p className="text-label uppercase text-ink-tertiary mb-2">body-lg</p>
                <p className="text-body-lg text-ink-secondary">
                  Editing by voice should feel as fast as the thought behind it.
                </p>
              </div>
              <div>
                <p className="text-label uppercase text-ink-tertiary mb-2">body-md</p>
                <p className="text-body-md text-ink-secondary">
                  Editing by voice should feel as fast as the thought behind it.
                </p>
              </div>
              <div>
                <p className="text-label uppercase text-ink-tertiary mb-2">body-sm</p>
                <p className="text-body-sm text-ink-secondary">
                  Editing by voice should feel as fast as the thought behind it.
                </p>
              </div>
              <div>
                <p className="text-label uppercase text-ink-tertiary mb-2">mono-sm</p>
                <p className="font-mono text-mono-sm text-precision">"trim clip two by two seconds"</p>
              </div>
            </div>
          </div>
        </div>

        {/* Colors */}
        <SectionHeader
          eyebrow="Foundations"
          title="Color system"
          description="A near-black neutral base with two deliberate accents: a warm signal for voice moments, a cool precision for technical ones."
        />
        <div className="mb-6">
          <p className="text-label uppercase text-ink-tertiary mb-4">Neutrals</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Swatch name="Canvas" token="canvas" hex="#0A0A0C" />
            <Swatch name="Surface" token="surface" hex="#111114" />
            <Swatch name="Surface Raised" token="surface-raised" hex="#18181C" />
            <Swatch name="Overlay" token="overlay" hex="#1E1E23" />
          </div>
        </div>
        <div className="mb-16">
          <p className="text-label uppercase text-ink-tertiary mb-4">Accents</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Swatch name="Signal" token="signal" hex="#FF6B4A" textOn="dark" />
            <Swatch name="Precision" token="precision" hex="#4ADEDE" textOn="dark" />
            <Swatch name="Success" token="success" hex="#5FD87A" textOn="dark" />
            <Swatch name="Warning" token="warning" hex="#F5B84A" textOn="dark" />
            <Swatch name="Danger" token="danger" hex="#F0503C" textOn="dark" />
          </div>
        </div>

        {/* Buttons */}
        <SectionHeader eyebrow="Components" title="Buttons" description="Hover and press states are live — try them." />
        <div className="mb-16 flex flex-wrap items-center gap-4">
          <button className="inline-flex items-center gap-2 rounded-full bg-signal px-6 py-3 text-body-md font-medium text-canvas transition-all duration-200 ease-out-expo hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]">
            Primary
            <ArrowUpRight className="h-4 w-4" />
          </button>
          <button className="inline-flex items-center gap-2 rounded-full border border-line px-6 py-3 text-body-md font-medium text-ink-primary transition-colors duration-200 hover:bg-overlay">
            Secondary
          </button>
          <button className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-body-md font-medium text-ink-secondary transition-colors duration-200 hover:text-ink-primary hover:bg-overlay">
            Ghost
          </button>
          <button className="inline-flex items-center gap-2 rounded-full bg-precision-dim border border-precision/30 px-6 py-3 text-body-md font-medium text-precision transition-all duration-200 hover:brightness-125">
            Precision
          </button>
          <button
            disabled
            className="inline-flex items-center gap-2 rounded-full bg-overlay px-6 py-3 text-body-md font-medium text-ink-tertiary cursor-not-allowed"
          >
            Disabled
          </button>
        </div>

        {/* Cards */}
        <SectionHeader eyebrow="Components" title="Cards & surfaces" description="Depth comes from surface-stepping and soft ambient shadow — hover to feel the lift." />
        <div className="mb-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="group rounded-lg border border-line-subtle bg-surface-raised p-6 transition-all duration-200 ease-out-expo hover:-translate-y-1 hover:shadow-soft">
            <p className="text-label uppercase text-precision mb-3">Feature</p>
            <h3 className="font-display text-heading-lg text-ink-primary mb-2">Auto-cut silence</h3>
            <p className="text-body-sm text-ink-secondary">
              Say "remove the dead air" and every silent gap over 0.4s disappears.
            </p>
          </div>

          <div className="rounded-lg border border-line-subtle bg-gradient-to-br from-surface-raised to-surface p-6 relative overflow-hidden">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-precision/10 blur-2xl" />
            <p className="text-label uppercase text-signal mb-3">Signature motif</p>
            <h3 className="font-display text-heading-lg text-ink-primary mb-4">Waveform primitive</h3>
            <div className="flex items-end gap-1 h-12">
              {[40, 65, 30, 80, 50, 90, 35, 60, 45, 70, 25, 55].map((h, i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-full bg-signal/70"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-line-subtle bg-surface p-1.5">
            <div className="relative h-40 rounded-md bg-gradient-to-br from-overlay to-canvas overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center text-ink-tertiary text-body-sm">
                video frame
              </div>
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-md border border-line-subtle bg-surface/70 px-3 py-2 backdrop-blur-md">
                <span className="font-mono text-mono-sm text-ink-secondary">00:14 / 02:31</span>
                <span className="h-2 w-2 rounded-full bg-signal animate-pulse" />
              </div>
            </div>
            <p className="px-4 py-3 text-body-sm text-ink-secondary">Glass chrome over media</p>
          </div>
        </div>

        {/* Borders & Shadows */}
        <SectionHeader eyebrow="Foundations" title="Borders, shadows & glow" />
        <div className="mb-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-line-subtle bg-surface p-6 text-center">
            <p className="text-body-sm text-ink-secondary">border-subtle</p>
          </div>
          <div className="rounded-md border border-line bg-surface p-6 text-center">
            <p className="text-body-sm text-ink-secondary">border-default</p>
          </div>
          <div className="rounded-md bg-surface-raised p-6 text-center shadow-soft">
            <p className="text-body-sm text-ink-secondary">shadow-soft</p>
          </div>
          <div className="relative rounded-md bg-surface p-6 text-center overflow-hidden">
            <div className="absolute inset-0 bg-signal/20 blur-2xl" />
            <p className="relative text-body-sm text-ink-secondary">glow</p>
          </div>
        </div>

        {/* Inputs */}
        <SectionHeader eyebrow="Components" title="Inputs" description="Click into the field to see the focus ring." />
        <div className="mb-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-2 block text-label uppercase text-ink-tertiary">Default</label>
            <input
              type="text"
              placeholder="Project name"
              className="w-full rounded-md border border-line-subtle bg-overlay px-4 py-3 text-body-md text-ink-primary placeholder:text-ink-tertiary outline-none transition-all duration-200 focus:border-signal focus:ring-2 focus:ring-signal/30"
            />
          </div>
          <div>
            <label className="mb-2 block text-label uppercase text-ink-tertiary">Disabled</label>
            <input
              type="text"
              disabled
              placeholder="Locked field"
              className="w-full rounded-md border border-line-subtle bg-surface px-4 py-3 text-body-md text-ink-tertiary placeholder:text-ink-tertiary cursor-not-allowed"
            />
          </div>
          <div>
            <label className="mb-2 block text-label uppercase text-ink-tertiary">Transcript</label>
            <div className="flex items-center rounded-md border border-precision/30 bg-precision-dim px-4 py-3">
              <span className="font-mono text-mono-sm text-precision">"add a zoom on this clip"</span>
            </div>
          </div>
        </div>

        {/* Badges */}
        <SectionHeader eyebrow="Components" title="Badges" />
        <div className="mb-16 flex flex-wrap gap-3">
          <Badge tone="signal" label="Recording" />
          <Badge tone="precision" label="Processing" />
          <Badge tone="success" label="Exported" />
          <Badge tone="warning" label="Low quality" />
          <Badge tone="danger" label="Failed" />
        </div>

        {/* Motion */}
        <div id="motion">
          <SectionHeader
            eyebrow="Motion"
            title="Micro-interactions"
            description="Voice is the product's core interaction — every state change is visible."
          />
          <div className="mb-16">
            <TranscriptDemo />
          </div>
        </div>

        {/* Responsive note */}
        <SectionHeader
          eyebrow="Layout"
          title="Responsive behavior"
          description="Resize the window — the nav collapses its links, and this grid reflows from four columns down to one."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {["Canvas", "Timeline", "Voice", "Export"].map((label) => (
            <div
              key={label}
              className="rounded-md border border-line-subtle bg-surface p-6 text-center transition-colors hover:border-line"
            >
              <p className="text-body-sm text-ink-secondary">{label}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-line-subtle px-4 py-10 sm:px-6">
        <p className="mx-auto max-w-[1200px] text-body-sm text-ink-tertiary">
          Design system preview — internal only, not a product page.
        </p>
      </footer>
    </div>
  );
}
