import type { StoryTarget } from '@vocabahn/shared';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AudioButton } from './DictionaryCard';

/**
 * One studied word inside a story, plus the popover describing it.
 *
 * Deliberately **not** `FollowTooltip`: that primitive is read-only, carries
 * `pointer-events: none` and never traps focus. This one holds an audio button,
 * a link into the dictionary and a "didn't land" toggle, so it needs
 * `role="dialog"` semantics and has to be reachable with the keyboard.
 *
 * Two things shape the implementation:
 *
 * - **Everything it shows already arrived with the story.** `StoryTarget` now
 *   carries the entry's part of speech, level, gloss, example and audio, read
 *   straight off the persisted `DictionaryEntry`. Fetching the entry on hover
 *   would trigger lazy enrichment and let a reader spend their whole daily
 *   quota by running the mouse across a paragraph.
 * - **The surface is a DOM sibling of the trigger**, not a portal, so Tab moves
 *   from the word straight into the popover's controls. It is positioned
 *   `absolute` against the word's own wrapper rather than `fixed`, because the
 *   story container carries a GSAP transform, which would re-root a fixed
 *   descendant.
 *
 * Looking is separated from marking: opening this changes no comprehension
 * signal, and `StoryTarget.understood` only moves when the toggle inside is
 * pressed.
 */

/** Long enough that skimming a paragraph doesn't strobe popovers open. */
const OPEN_DELAY_MS = 150;
/** Short grace so the pointer can cross the gap from the word to the surface. */
const CLOSE_DELAY_MS = 150;
/** Keeps the surface clear of the viewport edge when it is shifted back in. */
const VIEWPORT_MARGIN = 8;

const POPOVER_ACTION =
  'inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

export function StoryWord({
  target,
  text,
  open,
  onOpenChange,
  marked,
  onToggleMark,
  markable,
  markedNoteId,
}: {
  target: StoryTarget;
  /** The inflected form as it appears in the text — the word the reader sees. */
  text: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marked: boolean;
  onToggleMark: () => void;
  /** False once the story is finished: the answer is already recorded. */
  markable: boolean;
  /** Id of the shared visually-hidden note describing the marked state. */
  markedNoteId: string;
}) {
  const popoverId = useId();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pressing the word focuses it first, and focus opens the popover. Without
  // remembering the state from before the press, every tap would open and then
  // immediately close again.
  const openBeforePress = useRef(false);
  // Escape hands focus back to the word, and focus opens the popover — without
  // this the dismissed popover would reopen on the way out.
  const suppressFocusOpen = useRef(false);
  const [shift, setShift] = useState(0);
  const [side, setSide] = useState<'top' | 'bottom'>('bottom');

  const cancelTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => cancelTimer, []);

  const openLater = () => {
    cancelTimer();
    if (open) return;
    timer.current = setTimeout(() => onOpenChange(true), OPEN_DELAY_MS);
  };

  const closeLater = () => {
    cancelTimer();
    if (!open) return;
    timer.current = setTimeout(() => {
      // Hover left, but the keyboard is still in here — closing would strand
      // focus on a control that just disappeared.
      if (wrapperRef.current?.contains(document.activeElement)) return;
      onOpenChange(false);
    }, CLOSE_DELAY_MS);
  };

  /** Escape closes and hands focus back to the word, wherever it was. */
  const closeAndRefocus = () => {
    cancelTimer();
    onOpenChange(false);
    const trigger = triggerRef.current;
    if (!trigger || document.activeElement === trigger) return;
    suppressFocusOpen.current = true;
    trigger.focus();
    suppressFocusOpen.current = false;
  };

  // Bound on the window rather than the wrapper so a popover opened by hover,
  // with focus somewhere else entirely, is still dismissable. Re-bound every
  // render so it always closes the popover that is actually open.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeAndRefocus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Pressing anywhere else dismisses it. On touch there is no mouseleave, and a
  // tap on plain text does not move focus, so neither of the other two close
  // paths fires.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      cancelTimer();
      onOpenChange(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  });

  // Keep the surface inside the viewport: shift it back horizontally, and flip
  // it above the word when there is no room underneath. Target words sit inline
  // in a paragraph, so at 375 px the first and last word of a line both need it.
  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      setSide('bottom');
      return;
    }
    const surface = surfaceRef.current;
    const trigger = triggerRef.current;
    if (!surface || !trigger) return;

    const place = () => {
      const rect = surface.getBoundingClientRect();
      const anchor = trigger.getBoundingClientRect();

      setShift((current) => {
        // The measurement already includes whatever shift is applied; take it
        // back off to find where the surface would sit unaided.
        const left = rect.left - current;
        const right = rect.right - current;
        const spillLeft = VIEWPORT_MARGIN - left;
        const spillRight = right - (window.innerWidth - VIEWPORT_MARGIN);
        if (spillLeft > 0) return Math.round(spillLeft);
        if (spillRight > 0) return Math.round(-spillRight);
        return 0;
      });

      const needed = rect.height + VIEWPORT_MARGIN;
      const fitsBelow = window.innerHeight - anchor.bottom > needed;
      const fitsAbove = anchor.top > needed;
      setSide(!fitsBelow && fitsAbove ? 'top' : 'bottom');
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const meaning = target.translation ?? target.gloss;
  // A second wording only earns its line when it says something different.
  const extraGloss =
    target.gloss && target.gloss.toLowerCase() !== meaning?.toLowerCase() ? target.gloss : null;

  return (
    <span
      ref={wrapperRef}
      className="relative inline-block"
      onMouseEnter={openLater}
      onMouseLeave={closeLater}
      onBlur={(event) => {
        // Focus leaving the whole word — trigger and popover both — closes it.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        cancelTimer();
        onOpenChange(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        lang="de"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        // The accessible name stays the German surface form. The marked state
        // is a description, so it cannot displace it.
        aria-describedby={marked ? markedNoteId : undefined}
        onFocus={() => {
          cancelTimer();
          if (suppressFocusOpen.current) {
            suppressFocusOpen.current = false;
            return;
          }
          onOpenChange(true);
        }}
        onPointerDown={() => {
          openBeforePress.current = open;
        }}
        onKeyDown={(event) => {
          // Focus already opened it, so activating the word closes it again.
          if (event.key === 'Enter' || event.key === ' ') openBeforePress.current = open;
        }}
        onClick={() => {
          cancelTimer();
          onOpenChange(!openBeforePress.current);
        }}
        className={`rounded underline decoration-dotted underline-offset-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
          marked
            ? 'bg-accent-amber/20 text-accent-amber decoration-accent-amber'
            : 'decoration-surface-500 hover:bg-surface-800'
        }`}
      >
        {text}
      </button>

      {open && (
        <span
          ref={surfaceRef}
          id={popoverId}
          role="dialog"
          aria-label={`About ${target.word}`}
          // The story paragraph is lang="de"; everything here is English unless
          // it is explicitly marked otherwise.
          lang="en"
          style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
          className={`absolute left-1/2 z-40 block w-64 max-w-[calc(100vw-1rem)] ${
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
        >
          {/* The outer span owns the positioning transform; this one owns the
              entrance animation, so the two never fight. */}
          <span className="vb-word-popover block rounded-xl border border-surface-700 bg-surface-950 p-3 text-left text-surface-200 shadow-2xl">
            <span className="flex items-center gap-2">
              {target.emoji && <span aria-hidden="true">{target.emoji}</span>}
              <span lang="de" className="flex-1 font-medium">
                {target.word}
              </span>
              {target.audioUrl && (
                <AudioButton src={target.audioUrl} label={`Pronounce ${target.word}`} />
              )}
            </span>

            {(target.pos || target.cefrLevel) && (
              <span className="mt-1 flex items-center gap-2 text-xs text-surface-500">
                {target.pos && <span>{target.pos}</span>}
                {target.cefrLevel && (
                  <span className="rounded bg-surface-800 px-1.5 py-0.5 text-surface-300">
                    {target.cefrLevel}
                  </span>
                )}
              </span>
            )}

            {meaning && <span className="mt-2 block text-sm">{meaning}</span>}
            {extraGloss && (
              <span className="mt-0.5 block text-xs text-surface-400">{extraGloss}</span>
            )}

            {target.example && (
              <span className="mt-2 block border-l-2 border-surface-800 pl-2 text-xs">
                <span lang="de" className="block text-surface-300">
                  {target.example.de}
                </span>
                <span className="mt-0.5 block text-surface-500">{target.example.en}</span>
              </span>
            )}

            {/* An unenriched entry still gets a usable popover: the headword
                above, and these two controls. */}
            <span className="mt-3 flex flex-wrap items-center gap-2">
              {markable && (
                <button
                  type="button"
                  aria-pressed={marked}
                  onClick={onToggleMark}
                  className={`${POPOVER_ACTION} ${
                    marked
                      ? 'border-accent-amber/60 bg-accent-amber/20 text-accent-amber'
                      : 'border-surface-700 text-surface-300 hover:bg-surface-800'
                  }`}
                >
                  Didn't land
                </button>
              )}
              <Link
                to={`/word/${encodeURIComponent(target.word)}`}
                className={`${POPOVER_ACTION} border-surface-700 text-accent-indigo hover:bg-surface-800`}
              >
                Open in dictionary
              </Link>
            </span>
          </span>
        </span>
      )}
    </span>
  );
}
