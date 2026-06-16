import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../lib/motion';

interface PullToRefreshProps {
  onRefresh: () => void;
}

const PULL_THRESHOLD = 72;
const PULL_MAX = 100;

/**
 * Mounts window touch-event listeners and shows a spinner when the user
 * pulls down from the top of the page. Fires onRefresh once the drag
 * crosses the threshold. Does nothing when scrollY > 0 (mid-page) or
 * prefers-reduced-motion is set.
 */
export function PullToRefresh({ onRefresh }: PullToRefreshProps) {
  const [refreshing, setRefreshing] = useState(false);
  const indicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let startY = 0;
    let active = false;
    let triggered = false;

    const show = (progress: number) => {
      if (!indicatorRef.current || prefersReducedMotion()) return;
      const scale = 0.4 + 0.6 * Math.min(progress, 1);
      const ty = -40 + Math.min(progress, 1) * 56;
      gsap.set(indicatorRef.current, { y: ty, scale, opacity: Math.min(progress * 1.5, 1) });
    };

    const hide = () => {
      if (!indicatorRef.current) return;
      gsap.to(indicatorRef.current, { y: -40, scale: 0.4, opacity: 0, duration: 0.25 });
    };

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch || window.scrollY > 4) return;
      startY = touch.clientY;
      active = true;
      triggered = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dy = touch.clientY - startY;
      if (dy < 0) { active = false; return; }
      show(dy / PULL_MAX);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!active || triggered) { hide(); active = false; return; }
      active = false;
      const touch = e.changedTouches[0];
      if (!touch) { hide(); return; }
      const dy = touch.clientY - startY;
      if (dy >= PULL_THRESHOLD) {
        triggered = true;
        setRefreshing(true);
        onRefresh();
        setTimeout(() => {
          setRefreshing(false);
          hide();
        }, 1200);
      } else {
        hide();
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh]);

  return (
    <div
      ref={indicatorRef}
      aria-hidden="true"
      className="pointer-events-none fixed left-1/2 top-0 z-50 -translate-x-1/2 -translate-y-10 opacity-0"
    >
      <div className={`flex size-10 items-center justify-center rounded-full bg-surface-900 shadow-lg ring-1 ring-surface-800 ${refreshing ? 'animate-spin' : ''}`}>
        <svg viewBox="0 0 24 24" className="size-5 text-accent-indigo" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </div>
    </div>
  );
}
