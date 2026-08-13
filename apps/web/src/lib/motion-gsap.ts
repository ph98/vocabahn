/**
 * The GSAP-backed entrance hooks.
 *
 * Split out of `motion.ts` so that importing `prefersReducedMotion()` — which
 * the app shell does — cannot drag GSAP into the entry chunk. Import from here
 * only from a lazily-loaded route; anything on the landing page's critical path
 * should use the CSS entrances in `index.css` (`.vb-fade-in`, `.vb-rise-in`)
 * instead.
 */
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { RefObject } from 'react';
import { prefersReducedMotion } from './motion';

/** Fades and slides an element in on mount/dependency change. No-op under prefers-reduced-motion. */
export function useFadeIn(ref: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useGSAP(
    () => {
      if (!ref.current || prefersReducedMotion()) return;
      gsap.from(ref.current, { opacity: 0, y: 16, duration: 0.25, ease: 'power2.out' });
    },
    { dependencies: deps, scope: ref },
  );
}

/** Staggers the entrance of a container's children matching `selector`. No-op under prefers-reduced-motion. */
export function useStaggerIn(ref: RefObject<HTMLElement | null>, selector: string, deps: unknown[] = []) {
  useGSAP(
    () => {
      if (!ref.current || prefersReducedMotion()) return;
      const items = ref.current.querySelectorAll(selector);
      if (!items.length) return;
      gsap.from(items, { opacity: 0, y: 12, duration: 0.3, ease: 'power2.out', stagger: 0.06 });
    },
    { dependencies: deps, scope: ref },
  );
}
