import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { RefObject } from 'react';

/** Every GSAP animation needs a prefers-reduced-motion variant. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Shared spring presets so Motion animations feel consistent app-wide. */
export const spring = { type: 'spring', stiffness: 380, damping: 30 } as const;
export const springSoft = { type: 'spring', stiffness: 170, damping: 26 } as const;
export const springSnappy = { type: 'spring', stiffness: 500, damping: 32 } as const;

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
