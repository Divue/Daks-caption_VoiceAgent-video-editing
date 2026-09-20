import { useEffect, useRef, useState } from "react";
import { useRoute } from "../../router";
import { ChevronDownIcon, ArrowRightIcon, MenuIcon, CloseIcon } from "../../icons";

type NavKey = "features" | "how-it-works" | "voice-editing" | "for-creators";

const NAV_ITEMS: { key: NavKey; label: string }[] = [
  { key: "features", label: "Features" },
  { key: "how-it-works", label: "How It Works" },
  { key: "voice-editing", label: "Voice Editing" },
  { key: "for-creators", label: "For Creators" },
];

const FEATURES = [
  { title: "Voice Editing", description: "Edit your video using natural voice commands." },
  { title: "Smart Captions", description: "Generate and refine captions without manual timeline work." },
  { title: "Creator Controls", description: "Use intuitive voice-driven controls to shape your video." },
  { title: "Audio-Responsive Experience", description: "Interact naturally with a visual interface that responds to your voice." },
];

const FLOW_CARDS = [
  { from: "Voice", to: "Edit" },
  { from: "Speak", to: "Create" },
  { from: "Social", to: "Share" },
];

const STEPS = [
  { n: "01", title: "Speak", description: "Tell the editor what you want." },
  { n: "02", title: "Edit", description: "Your voice becomes editing instructions." },
  { n: "03", title: "Refine", description: "Adjust the result naturally through voice." },
  { n: "04", title: "Share", description: "Create content ready for your social platform." },
];

const VOICE_POINTS = [
  { title: "Speak Naturally", description: "Use your own words instead of hunting through a timeline." },
  { title: "Control Your Edit", description: "Navigate and modify your video through voice." },
  { title: "Create Without Friction", description: "Stay focused on the story instead of the interface." },
];

const WAVEFORM_BARS = [6, 14, 9, 20, 12, 18, 8, 15];

const CREATOR_CATEGORIES = [
  { title: "Short-Form", items: ["Reels", "Shorts", "TikTok-style vertical content"] },
  { title: "Long-Form", items: ["YouTube", "Podcasts", "Video essays"] },
  { title: "Workflow", items: ["Voice-first editing", "Captions", "Fast content iteration"] },
];

// A small ring of dots standing in for the hero's particle sphere, rather
// than a generic sparkle/star mark — computed once, not per render.
const BRAND_RING = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2;
  return { cx: 12 + Math.cos(angle) * 9, cy: 12 + Math.sin(angle) * 9, bright: i % 3 === 0 };
});

export function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
      {BRAND_RING.map((p, i) => (
        <circle key={i} cx={p.cx} cy={p.cy} r={p.bright ? 1.6 : 1} fill="currentColor" opacity={p.bright ? 1 : 0.4} />
      ))}
      <circle cx="12" cy="12" r="1.5" className="fill-signal" />
    </svg>
  );
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// Subtle per-item stagger for a freshly opened panel (see openSession in
// LandingNavbar): the container's own opacity/transform transition runs
// first, these items settle in just after — "container, then headings,
// then items" — via a short base offset plus a per-index step.
function staggerStyle(motionSafe: boolean, index: number, baseMs = 70, stepMs = 40) {
  return motionSafe ? { animationDelay: `${baseMs + index * stepMs}ms` } : undefined;
}

function PanelContent({ menuKey, motionSafe }: { menuKey: NavKey; motionSafe: boolean }) {
  const itemClass = motionSafe ? "animate-fade-up" : "";

  if (menuKey === "features") {
    return (
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-[1fr_auto]">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {FEATURES.map((f, i) => (
            <div key={f.title} className={itemClass} style={staggerStyle(motionSafe, i)}>
              <p className="text-body-sm font-medium text-ink-primary">{f.title}</p>
              <p className="mt-1 text-body-sm text-ink-tertiary">{f.description}</p>
            </div>
          ))}
        </div>
        <div
          className={`hidden w-44 shrink-0 flex-col gap-2 border-l border-line-subtle pl-8 sm:flex ${itemClass}`}
          style={staggerStyle(motionSafe, FEATURES.length)}
        >
          {FLOW_CARDS.map((c) => (
            <div key={c.from} className="rounded-lg border border-line-subtle bg-surface-raised px-3 py-2.5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-ink-tertiary">{c.from}</p>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-ink-primary">&rarr; {c.to}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (menuKey === "how-it-works") {
    return (
      <div className="relative grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
        <div className="pointer-events-none absolute inset-x-0 top-[10px] hidden border-t border-dashed border-line-default sm:block" aria-hidden="true" />
        {STEPS.map((s, i) => (
          <div key={s.n} className={`relative bg-surface ${itemClass}`} style={staggerStyle(motionSafe, i)}>
            <p className="font-mono text-heading-md text-ink-tertiary">{s.n}</p>
            <p className="mt-2 text-body-sm font-medium text-ink-primary">{s.title}</p>
            <p className="mt-1 text-body-sm text-ink-tertiary">{s.description}</p>
          </div>
        ))}
      </div>
    );
  }

  if (menuKey === "voice-editing") {
    return (
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-[1fr_auto]">
        <div className="grid grid-cols-1 gap-5">
          {VOICE_POINTS.map((p, i) => (
            <div key={p.title} className={itemClass} style={staggerStyle(motionSafe, i)}>
              <p className="text-body-sm font-medium text-ink-primary">{p.title}</p>
              <p className="mt-1 text-body-sm text-ink-tertiary">{p.description}</p>
            </div>
          ))}
        </div>
        <div
          className={`hidden w-36 shrink-0 items-end gap-1 border-l border-line-subtle pl-8 sm:flex ${itemClass}`}
          style={staggerStyle(motionSafe, VOICE_POINTS.length)}
        >
          {WAVEFORM_BARS.map((h, i) => (
            <span
              key={i}
              className="w-1.5 animate-pulse rounded-full bg-signal/50"
              style={{ height: `${h}px`, animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
      {CREATOR_CATEGORIES.map((cat, i) => (
        <div key={cat.title} className={itemClass} style={staggerStyle(motionSafe, i)}>
          <p className="font-mono text-[11px] uppercase tracking-widest text-ink-tertiary">{cat.title}</p>
          <ul className="mt-3 space-y-2">
            {cat.items.map((item) => (
              <li key={item} className="text-body-sm text-ink-secondary">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function LandingNavbar() {
  const { navigate } = useRoute();
  const [motionSafe] = useState(() => !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [scrolled, setScrolled] = useState(false);
  const [activeMenu, setActiveMenu] = useState<NavKey | null>(null);
  const [panelKey, setPanelKey] = useState<NavKey | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  // Bumped only on a fresh open (from fully closed), never when swapping
  // between already-open items — used as PanelContent's key so a first
  // open remounts it (retriggering the inner stagger below) while hovering
  // from item to item keeps the same instance and just swaps props, with
  // no remount flicker.
  const [openSession, setOpenSession] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<NavKey | null>(null);

  const navRef = useRef<HTMLElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const unmountTimerRef = useRef<number | null>(null);

  function clearTimers() {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (unmountTimerRef.current) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
  }

  function openMenu(key: NavKey) {
    clearTimers();
    setActiveMenu(key);
    setPanelKey(key);
    // Only a fresh open (from fully closed) needs the next-frame flip that
    // makes the opacity/transform transition actually run; swapping between
    // already-open items just updates content in place, panel stays visible.
    if (!panelVisible) {
      setOpenSession((s) => s + 1);
      requestAnimationFrame(() => setPanelVisible(true));
    }
  }

  function closeNow() {
    clearTimers();
    setActiveMenu(null);
    setPanelVisible(false);
    unmountTimerRef.current = window.setTimeout(() => setPanelKey(null), 200);
  }

  function scheduleClose() {
    clearTimers();
    closeTimerRef.current = window.setTimeout(closeNow, 150);
  }

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
      // Page scroll progress for the hairline under the bar — a CSS variable, not React state.
      const max = document.documentElement.scrollHeight - window.innerHeight;
      navRef.current?.style.setProperty("--page-p", max > 0 ? (window.scrollY / max).toFixed(4) : "0");
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (activeMenu && navRef.current && !navRef.current.contains(e.target as Node)) {
        closeNow();
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (activeMenu) closeNow();
      if (mobileOpen) setMobileOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMenu, mobileOpen]);

  useEffect(() => () => clearTimers(), []);

  function handleStartCreating() {
    setMobileOpen(false);
    navigate("/editor");
  }

  return (
    <header
      ref={navRef}
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color] duration-500 ${
        scrolled ? "border-b border-line-subtle bg-canvas" : "border-b border-transparent bg-transparent"
      } ${motionSafe ? "animate-navbar-enter" : ""}`}
    >
      {/* Scroll progress hairline, in the signal colour, along the bar's bottom edge. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 -bottom-px h-px origin-left bg-gradient-to-r from-signal/0 via-signal to-signal/60 transition-opacity duration-500 ${scrolled ? "opacity-100" : "opacity-0"}`}
        style={{ transform: "scaleX(var(--page-p, 0))" }}
      />
      <div
        className={`relative mx-auto grid max-w-[1200px] grid-cols-[auto_1fr_auto] items-center gap-4 px-4 transition-[height] duration-500 ease-out-expo sm:px-8 ${scrolled ? "h-14" : "h-[72px]"}`}
      >
        <a href="#top" className={`flex items-center gap-2 rounded-md text-ink-primary ${FOCUS_RING}`}>
          <BrandMark />
          <span className="font-display text-heading-md">Expressive Captions</span>
        </a>

        <nav
          className="hidden justify-self-center lg:flex lg:items-center lg:gap-1"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) closeNow();
          }}
        >
          {NAV_ITEMS.map((item) => (
            <div key={item.key} onMouseEnter={() => openMenu(item.key)} onMouseLeave={scheduleClose}>
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={activeMenu === item.key}
                aria-controls={`nav-panel-${item.key}`}
                onFocus={() => openMenu(item.key)}
                onClick={() => openMenu(item.key)}
                className={`relative inline-flex items-center gap-1 rounded-full px-4 py-2 text-body-sm transition-colors duration-200 ease-out-expo after:absolute after:-bottom-0.5 after:left-4 after:right-4 after:h-px after:origin-left after:scale-x-0 after:bg-signal after:transition-transform after:duration-300 after:ease-out-expo after:content-[''] hover:after:scale-x-100 ${FOCUS_RING} ${
                  activeMenu === item.key ? "bg-surface-raised text-ink-primary" : "text-ink-secondary hover:text-ink-primary"
                }`}
              >
                {item.label}
                <ChevronDownIcon
                  className={`h-3 w-3 transition-transform duration-200 ${activeMenu === item.key ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          ))}
        </nav>

        <div className="flex items-center justify-self-end gap-2">
          <button type="button" className={`hidden rounded-md px-1 text-body-sm text-ink-secondary transition-colors duration-200 hover:text-ink-primary lg:inline-block ${FOCUS_RING}`}>
            Sign In
          </button>
          <button
            type="button"
            onClick={handleStartCreating}
            className={`group relative hidden items-center gap-1.5 overflow-hidden rounded-full bg-signal px-4 py-2 text-body-sm font-medium text-canvas shadow-[0_0_0_rgba(255,107,74,0)] transition-all duration-200 ease-out-expo hover:-translate-y-0.5 hover:scale-[1.02] hover:brightness-110 hover:shadow-[0_10px_28px_-6px_rgba(255,107,74,0.4),0_0_36px_-10px_rgba(255,107,74,0.3)] lg:inline-flex ${FOCUS_RING}`}
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
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary transition-colors hover:text-ink-primary lg:hidden ${FOCUS_RING}`}
          >
            {mobileOpen ? <CloseIcon className="h-4 w-4" /> : <MenuIcon className="h-4 w-4" />}
          </button>
        </div>

        {panelKey && (
          <div
            onMouseEnter={clearTimers}
            onMouseLeave={scheduleClose}
            className={`absolute left-1/2 top-full hidden w-[min(880px,92vw)] -translate-x-1/2 pt-2 transition-all duration-200 ease-out-expo lg:block ${
              panelVisible ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0"
            }`}
          >
            <div
              id={`nav-panel-${panelKey}`}
              role="group"
              aria-label={NAV_ITEMS.find((i) => i.key === panelKey)?.label}
              className="rounded-2xl border border-line-subtle bg-surface p-8 shadow-soft"
            >
              <PanelContent key={openSession} menuKey={panelKey} motionSafe={motionSafe} />
            </div>
          </div>
        )}
      </div>

      <div
        className={`fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-canvas/98 backdrop-blur-md transition-opacity duration-200 ease-out-expo lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="flex flex-col gap-1 px-4 py-6">
          {NAV_ITEMS.map((item) => (
            <div key={item.key} className="border-b border-line-subtle py-1">
              <button
                type="button"
                aria-expanded={mobileExpanded === item.key}
                onClick={() => setMobileExpanded((k) => (k === item.key ? null : item.key))}
                className={`flex w-full items-center justify-between rounded-md py-3 text-left text-body-lg text-ink-primary ${FOCUS_RING}`}
              >
                {item.label}
                <ChevronDownIcon
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${mobileExpanded === item.key ? "rotate-180" : ""}`}
                />
              </button>
              {mobileExpanded === item.key && (
                <div className="pb-4">
                  <PanelContent menuKey={item.key} motionSafe={motionSafe} />
                </div>
              )}
            </div>
          ))}

          <div className="mt-4 flex flex-col gap-3">
            <button type="button" className={`rounded-md py-2 text-left text-body-md text-ink-secondary ${FOCUS_RING}`}>
              Sign In
            </button>
            <button
              type="button"
              onClick={handleStartCreating}
              className={`group inline-flex items-center justify-center gap-1.5 rounded-full bg-signal px-4 py-3 text-body-sm font-medium text-canvas transition-all duration-200 ease-out-expo hover:brightness-110 ${FOCUS_RING}`}
            >
              Start Creating
              <ArrowRightIcon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
