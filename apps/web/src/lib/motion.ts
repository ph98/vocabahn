/**
 * The motion contract, deliberately free of any animation library.
 *
 * `prefersReducedMotion()` is checked by the app shell, the error states and
 * every GSAP call site, so anything imported here lands in the entry chunk. A
 * single `import gsap from 'gsap'` in this file is enough to put ~230 kB of
 * animation library on the critical path of a page that may not animate at all
 * — which is exactly what it used to do. The GSAP-backed hooks therefore live
 * in `motion-gsap.ts`, reachable only from the lazy routes that use them.
 */

/** Every animation needs a prefers-reduced-motion variant. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Shared spring presets so Motion animations feel consistent app-wide. */
export const spring = { type: 'spring', stiffness: 380, damping: 30 } as const;
export const springSoft = { type: 'spring', stiffness: 170, damping: 26 } as const;
export const springSnappy = { type: 'spring', stiffness: 500, damping: 32 } as const;
