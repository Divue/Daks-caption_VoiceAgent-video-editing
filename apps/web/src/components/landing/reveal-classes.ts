/*
 * Child entrances that run off the nearest AnimatedSection (`group/reveal`) trigger. Put
 * one on an element inside an AnimatedSection and stagger siblings with
 * `style={{ transitionDelay }}`. Transform/opacity only; instant under reduced motion
 * (index.css). Class strings are written out in full so Tailwind can find them.
 */

const EASE = 'duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]'

/** Rise 12px and fade in. */
export const RISE = `translate-y-3 opacity-0 transition-[translate,opacity] ${EASE} group-data-[inview=true]/reveal:translate-y-0 group-data-[inview=true]/reveal:opacity-100`

/** Pop from 85% scale — for chips and small tokens. */
export const POP = `scale-[0.85] opacity-0 transition-[scale,opacity] ${EASE} group-data-[inview=true]/reveal:scale-100 group-data-[inview=true]/reveal:opacity-100`

/** Grow up from the bottom edge — for signal/waveform bars. */
export const GROW_Y = `origin-bottom scale-y-0 transition-[scale] duration-900 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[inview=true]/reveal:scale-y-100`

/** Fill from the left edge — for progress bars. */
export const GROW_X = `origin-left scale-x-0 transition-[scale] duration-1200 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[inview=true]/reveal:scale-x-100`

/** Draw out from the centre — for hairlines. */
export const DRAW_X = `scale-x-0 transition-[scale] duration-1200 ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[inview=true]/reveal:scale-x-100`

/** Stagger helper: `style={stagger(i, 80, 200)}` -> transitionDelay = 200 + i * 80 ms. */
export function stagger(index: number, step = 80, base = 0) {
  return { transitionDelay: `${base + index * step}ms` }
}
