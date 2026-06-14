import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { prefersReducedMotion } from '../lib/motion';

/** Groups `Tab` buttons under `role="tablist"`. */
export function TabList({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="tablist" aria-label={label} className={className}>
      {children}
    </div>
  );
}

/**
 * A single tab. Implements the ARIA APG roving-tabindex keyboard pattern:
 * Left/Right/Home/End move focus *and* activate the target tab.
 */
export function Tab({
  id,
  controls,
  selected,
  onSelect,
  className,
  children,
}: {
  id: string;
  controls: string;
  selected: boolean;
  onSelect: () => void;
  className?: string;
  children: ReactNode;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tablist = e.currentTarget.closest('[role="tablist"]');
    const tabs = Array.from(tablist?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
    const currentIndex = tabs.indexOf(e.currentTarget);
    if (currentIndex === -1) return;
    e.preventDefault();
    let next = currentIndex;
    if (e.key === 'ArrowLeft') next = (currentIndex - 1 + tabs.length) % tabs.length;
    if (e.key === 'ArrowRight') next = (currentIndex + 1) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    tabs[next]?.focus();
    tabs[next]?.click();
  };

  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={selected}
      aria-controls={controls}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={className}
    >
      {children}
    </button>
  );
}

export function TabPanel({
  id,
  labelledBy,
  className,
  children,
}: {
  id: string;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Cross-fade panel content when the active tab changes.
  useGSAP(
    () => {
      if (!ref.current || prefersReducedMotion()) return;
      gsap.from(ref.current, { opacity: 0, duration: 0.15, ease: 'power1.out' });
    },
    { dependencies: [labelledBy], scope: ref },
  );

  return (
    <div ref={ref} role="tabpanel" id={id} aria-labelledby={labelledBy} tabIndex={0} className={className}>
      {children}
    </div>
  );
}
