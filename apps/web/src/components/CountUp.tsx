import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';

/**
 * Animates a number from 0 to `value` on mount / value change.
 * Renders the final value as static text under prefers-reduced-motion
 * (and before the animation starts), so the count is always correct.
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.textContent = value.toLocaleString();
      return;
    }
    const controls = animate(0, value, {
      duration: Math.min(0.5 + value / 5000, 1.2),
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = Math.round(v).toLocaleString();
      },
    });
    return () => controls.stop();
  }, [value, reduced]);

  return (
    <span ref={ref} className={className}>
      {value.toLocaleString()}
    </span>
  );
}
