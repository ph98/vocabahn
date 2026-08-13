import gsap from 'gsap';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { prefersReducedMotion } from '../lib/motion';

/**
 * A lightweight, **non-interactive** hover/focus tooltip that follows the
 * pointer, or anchors above an element when opened by keyboard focus.
 *
 * Deliberately not a popover: the content is read-only text with no controls,
 * it never traps focus, and it carries `pointer-events: none`. Anything needing
 * focusable controls inside the overlay wants a real popover, not this.
 *
 * Owned by `useFollowTooltip`; rendered by `<FollowTooltip>`. One instance is
 * reused for every trigger in a component, so the returned `id` can be wired to
 * whichever trigger is currently open via `aria-describedby`.
 */

/** Gap between the pointer/anchor and the bottom edge of the tooltip, in px. */
const POINTER_OFFSET = 14;
const ANCHOR_OFFSET = 10;

export interface FollowTooltipController<T> {
  /** Element id for `aria-describedby` on whichever trigger is currently open. */
  id: string;
  /** The value the tooltip is describing, or `null` when closed. */
  value: T | null;
  /** Identifies which trigger opened it, so a trigger can decide whether to describe itself. */
  openKey: string | null;
  /** Follow the pointer. Use from `onMouseMove` / `onMouseEnter`. */
  showAtPointer: (event: { clientX: number; clientY: number }, key: string, value: T) => void;
  /** Anchor above an element. Use from `onFocus`, where there is no pointer. */
  showAtElement: (element: Element, key: string, value: T) => void;
  /** Close. Use from `onMouseLeave` / `onBlur`. Also bound to Escape. */
  hide: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
}

export function useFollowTooltip<T>(): FollowTooltipController<T> {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState<T | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const moveTo = useCallback((x: number, y: number) => {
    const el = containerRef.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      gsap.set(el, { x, y });
      return;
    }
    gsap.to(el, { x, y, duration: 0.2, ease: 'power3.out' });
  }, []);

  const showAtPointer = useCallback(
    (event: { clientX: number; clientY: number }, key: string, next: T) => {
      setValue(next);
      setOpenKey(key);
      moveTo(event.clientX, event.clientY - POINTER_OFFSET);
    },
    [moveTo],
  );

  const showAtElement = useCallback(
    (element: Element, key: string, next: T) => {
      const rect = element.getBoundingClientRect();
      setValue(next);
      setOpenKey(key);
      moveTo(rect.left + rect.width / 2, rect.top - ANCHOR_OFFSET);
    },
    [moveTo],
  );

  const hide = useCallback(() => {
    setValue(null);
    setOpenKey(null);
  }, []);

  // Escape dismisses without moving focus — the trigger keeps it.
  useEffect(() => {
    if (openKey === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openKey, hide]);

  return { id, value, openKey, showAtPointer, showAtElement, hide, containerRef };
}

/**
 * Renders the tooltip shell for a `useFollowTooltip` controller. The outer div
 * is what GSAP translates; the inner one centres the bubble above that point,
 * so the two transforms never fight.
 */
export function FollowTooltip<T>({
  controller,
  children,
  className = '',
}: {
  controller: FollowTooltipController<T>;
  children: ReactNode;
  className?: string;
}) {
  const open = controller.openKey !== null;
  return (
    <div
      ref={controller.containerRef}
      className="pointer-events-none fixed left-0 top-0 z-50"
      style={{ willChange: 'transform' }}
    >
      {/* `role="tooltip"` only while it has content — an empty tooltip node has no accessible name. */}
      <div
        id={controller.id}
        role={open ? 'tooltip' : undefined}
        className={`-translate-x-1/2 -translate-y-full rounded-xl border border-surface-800 bg-surface-950/95 px-3 py-2 text-center text-xs shadow-2xl backdrop-blur-md transition-opacity duration-200 ${
          open ? 'opacity-100' : 'opacity-0'
        } ${className}`}
      >
        {open && children}
      </div>
    </div>
  );
}
