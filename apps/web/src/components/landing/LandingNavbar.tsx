import { useEffect, useRef, useState } from "react";
import { useRoute } from "../../router";
import { ChevronDownIcon, ArrowRightIcon, MenuIcon, CloseIcon } from "../../icons";

type NavKey = "features" | "how-it-works" | "hear-the-difference" | "made-for-hinglish";

interface NavEntry {
  label: string;
  /** A section anchor on this page — every one of these ids exists on a landing section. */
  href: string;
}

/**
 * The bar's four items. An item either drops down a short list of section anchors, or is itself
 * a single anchor ("Made for Hinglish").
 *
 * These used to open panels of standalone marketing copy that pointed nowhere. The page now has
 * stable section ids, so every entry here is a real destination on it.
 */
const NAV_ITEMS: { key: NavKey; label: string; href?: string; entries?: NavEntry[] }[] = [
  {
    key: "features",
    label: "Features",
    entries: [
      { label: "Tone aware captions", href: "#showcase" },
      { label: "Edit by voice", href: "#edit-by-voice" },
      { label: "Hear the difference", href: "#hear-the-difference" },
    ],
  },
  {
    key: "how-it-works",
    label: "How It Works",
    entries: [
      { label: "Under the hood", href: "#under-the-hood" },
      { label: "How it works", href: "#how-it-works" },
    ],
  },
  {
    key: "hear-the-difference",
    label: "Hear the difference",
    entries: [
      { label: "Tone aware captions", href: "#showcase" },
      { label: "Hear the difference", href: "#hear-the-difference" },
    ],
  },
  { key: "made-for-hinglish", label: "Made for Hinglish", href: "#made-for-hinglish" },
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

// A dropdown's body: real anchors, one per section, so they are keyboard-reachable and the
// browser does the scrolling (smooth, and offset by each section's own scroll-margin-top).
function PanelContent({
  entries,
  motionSafe,
  onNavigate,
}: {
  entries: NavEntry[];
  motionSafe: boolean;
  onNavigate: () => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {entries.map((entry, i) => (
        <li key={entry.label} className={motionSafe ? "animate-fade-up" : ""} style={staggerStyle(motionSafe, i)}>
          <a
            href={entry.href}
            onClick={onNavigate}
            className={`block rounded-lg px-3 py-2.5 text-body-sm text-ink-secondary transition-colors duration-200 hover:bg-surface-raised hover:text-ink-primary ${FOCUS_RING}`}
          >
            {entry.label}
          </a>
        </li>
      ))}
    </ul>
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
  // The panel is a sibling of <nav>, not a descendant, so the nav's own blur check would call a
  // Tab into the panel "focus left the menu" and close it before its links could be reached.
  const panelRef = useRef<HTMLDivElement>(null);
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
            const next = e.relatedTarget as Node | null;
            if (!e.currentTarget.contains(next) && !panelRef.current?.contains(next)) closeNow();
          }}
        >
          {NAV_ITEMS.map((item) => {
            const triggerClass = `relative inline-flex items-center gap-1 rounded-full px-4 py-2 text-body-sm transition-colors duration-200 ease-out-expo after:absolute after:-bottom-0.5 after:left-4 after:right-4 after:h-px after:origin-left after:scale-x-0 after:bg-signal after:transition-transform after:duration-300 after:ease-out-expo after:content-[''] hover:after:scale-x-100 ${FOCUS_RING} ${
              activeMenu === item.key ? "bg-surface-raised text-ink-primary" : "text-ink-secondary hover:text-ink-primary"
            }`;
            // No dropdown: the item is the link. Hovering it still dismisses whichever panel is
            // open, so moving along the bar never leaves a stale one behind.
            if (!item.entries) {
              return (
                <div key={item.key} onMouseEnter={closeNow}>
                  <a href={item.href} onFocus={closeNow} className={triggerClass}>
                    {item.label}
                  </a>
                </div>
              );
            }
            return (
              <div key={item.key} onMouseEnter={() => openMenu(item.key)} onMouseLeave={scheduleClose}>
                <button
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={activeMenu === item.key}
                  aria-controls={`nav-panel-${item.key}`}
                  onFocus={() => openMenu(item.key)}
                  onClick={() => openMenu(item.key)}
                  className={triggerClass}
                >
                  {item.label}
                  <ChevronDownIcon
                    className={`h-3 w-3 transition-transform duration-200 ${activeMenu === item.key ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
            );
          })}
        </nav>

        <div className="flex items-center justify-self-end gap-2">
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
            ref={panelRef}
            onMouseEnter={clearTimers}
            onMouseLeave={scheduleClose}
            onBlur={(e) => {
              const next = e.relatedTarget as Node | null;
              if (!e.currentTarget.contains(next) && !navRef.current?.contains(next)) closeNow();
            }}
            // Narrower than the old copy panels: it holds two or three links now, not a grid of
            // marketing blurbs. Still centred under the bar, as before.
            className={`absolute left-1/2 top-full hidden w-[min(320px,92vw)] -translate-x-1/2 pt-2 transition-all duration-200 ease-out-expo lg:block ${
              panelVisible ? "translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-1 scale-[0.98] opacity-0"
            }`}
          >
            <div
              id={`nav-panel-${panelKey}`}
              role="group"
              aria-label={NAV_ITEMS.find((i) => i.key === panelKey)?.label}
              className="rounded-2xl border border-line-subtle bg-surface p-2 shadow-soft"
            >
              <PanelContent
                key={openSession}
                entries={NAV_ITEMS.find((i) => i.key === panelKey)?.entries ?? []}
                motionSafe={motionSafe}
                onNavigate={closeNow}
              />
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
          {NAV_ITEMS.map((item) =>
            item.entries ? (
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
                  <div className="pb-2">
                    <PanelContent entries={item.entries} motionSafe={motionSafe} onNavigate={() => setMobileOpen(false)} />
                  </div>
                )}
              </div>
            ) : (
              <div key={item.key} className="border-b border-line-subtle py-1">
                <a
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block rounded-md py-3 text-body-lg text-ink-primary ${FOCUS_RING}`}
                >
                  {item.label}
                </a>
              </div>
            ),
          )}

          <div className="mt-4 flex flex-col gap-3">
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
