import { useGSAP } from '@gsap/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DictionaryEntryDetail, ReviewCard, ReviewRating } from '@vocabahn/shared';
import gsap from 'gsap';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useDrag } from '@use-gesture/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchDictionaryEntry, fetchDueCards, submitReview } from '../api';
import { useSettings } from '../hooks/useSettings';
import { enqueueReview, flushQueue, getQueueCount } from '../offline/queue';
import { useOnlineStatus } from '../offline/useOnlineStatus';
import { prefersReducedMotion, spring, springSnappy } from '../lib/motion';
import { trackEvent } from '../lib/telemetry';
import { AudioButton, EntryBody } from './DictionaryCard';
import { CountUp } from './CountUp';

/** Card entry merged with the full dictionary entry once it's fetched. */
type CardEntry = ReviewCard['entry'] & Partial<DictionaryEntryDetail>;

const RATINGS: ReviewRating[] = ['AGAIN', 'HARD', 'GOOD', 'EASY'];

const RATING_LABELS: Record<ReviewRating, string> = {
  AGAIN: 'Again',
  HARD: 'Hard',
  GOOD: 'Good',
  EASY: 'Easy',
};

const RATING_COLORS: Record<ReviewRating, string> = {
  AGAIN: 'border-red-400/40 bg-red-500/10 text-accent-red hover:bg-red-500/15',
  HARD: 'border-amber-400/40 bg-amber-400/10 text-accent-amber hover:bg-amber-400/15',
  GOOD: 'border-emerald-400/40 bg-emerald-500/10 text-accent-emerald hover:bg-emerald-500/15',
  EASY: 'border-sky-400/40 bg-sky-500/10 text-accent-sky hover:bg-sky-500/15',
};

const RATING_BADGE_COLORS: Record<ReviewRating, string> = {
  AGAIN: 'border border-red-400/40 bg-red-400/20 text-accent-red',
  HARD: 'border border-amber-300/40 bg-amber-300/20 text-accent-amber',
  GOOD: 'border border-emerald-400/40 bg-emerald-400/20 text-accent-emerald',
  EASY: 'border border-sky-400/40 bg-sky-400/20 text-accent-sky',
};

/** Keyboard/swipe direction hint shown inside each rating button. */
const RATING_KEY_HINTS: Record<ReviewRating, string> = {
  AGAIN: '←',
  HARD: '↓',
  GOOD: '→',
  EASY: '↑',
};

// Swipe direction each rating flies off toward (used for both the drag
// gesture mapping and the button-triggered fly-off animation).
const RATING_OFFSET: Record<ReviewRating, { x: number; y: number }> = {
  AGAIN: { x: -1, y: 0 },
  GOOD: { x: 1, y: 0 },
  EASY: { x: 0, y: -1 },
  HARD: { x: 0, y: 1 },
};

const SWIPE_THRESHOLD = 100;
const FLY_DISTANCE = 500;

function CardFront({ entry, revealed }: { entry: CardEntry; revealed: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 text-center transition-[padding] duration-300 ${revealed ? 'py-10' : 'py-16 sm:py-20'}`}
    >
      {entry.pos && (
        <span className="rounded-full border border-surface-800 bg-surface-950/60 px-3 py-1 text-xs font-medium uppercase tracking-widest text-surface-400">
          {entry.pos}
        </span>
      )}
      <p className="text-4xl font-semibold tracking-tight text-surface-100 sm:text-5xl" lang="de">
        {entry.word}
      </p>
      {entry.audioUrl && <AudioButton src={entry.audioUrl} label={`Play pronunciation of ${entry.word}`} />}
    </div>
  );
}

/** The answer side shows the full dictionary entry — same content as the dictionary page. */
function CardBack({
  entry,
  detail,
  onSelectWord,
}: {
  entry: CardEntry;
  detail?: DictionaryEntryDetail;
  onSelectWord: (word: string) => void;
}) {
  if (detail) {
    return (
      <div className="border-t border-surface-800 pt-4 text-left">
        <EntryBody entry={detail} onSelectWord={onSelectWord} />
      </div>
    );
  }

  const example = entry.examples[0];
  return (
    <div className="space-y-3 border-t border-surface-800 py-6 pt-4 text-center">
      {entry.imageUrl && (
        <img src={entry.imageUrl} alt="" loading="lazy" className="mx-auto mb-2 size-24 rounded-xl object-cover" />
      )}
      {entry.emoji && <span className="text-5xl block">{entry.emoji}</span>}
      <p className="text-xl">{entry.translation ?? '—'}</p>
      {example && (
        <div className="rounded-xl bg-surface-950 p-3 text-left text-sm">
          <p lang="de">
            {example.de}
            {example.audioUrl && (
              <span className="ml-2">
                <AudioButton src={example.audioUrl} label="Play example sentence" />
              </span>
            )}
          </p>
          <p className="mt-1 text-surface-400">{example.en}</p>
        </div>
      )}
    </div>
  );
}

function SessionSummary({
  stats,
  onReviewMore,
  deckId,
}: {
  stats: Record<ReviewRating, number>;
  onReviewMore: () => void;
  deckId?: string | null;
}) {
  const total = RATINGS.reduce((sum, r) => sum + stats[r], 0);
  const recalled = stats.GOOD + stats.EASY;
  const accuracy = total > 0 ? Math.round((recalled / total) * 100) : 0;

  useEffect(() => {
    trackEvent('review_session_complete', {
      total_cards: total,
      accuracy_rate: accuracy,
      deck_id: deckId ?? undefined,
    });
  }, [total, accuracy, deckId]);

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.94, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={spring}
      aria-label="Session summary"
      className="relative overflow-hidden rounded-3xl border border-surface-800 bg-surface-900 p-8 text-center shadow-xl"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-emerald-400/10 blur-3xl"
      />
      <svg viewBox="0 0 52 52" aria-hidden="true" className="mx-auto size-16 text-accent-emerald">
        <motion.circle
          cx="26"
          cy="26"
          r="23"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
        <motion.path
          d="M15.5 27.5l7 7 14-15"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.35, delay: 0.4, ease: 'easeOut' }}
        />
      </svg>
      <h2 className="mt-4 text-2xl font-semibold tracking-tight">Session complete</h2>
      <p className="mt-1 text-surface-400">
        <CountUp value={total} className="font-semibold text-surface-200" /> card{total === 1 ? '' : 's'} reviewed
        {total > 0 && <> · {accuracy}% recalled</>}
      </p>
      <ul className="mt-6 grid grid-cols-4 gap-2 text-sm">
        {RATINGS.map((r, i) => (
          <motion.li
            key={r}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springSnappy, delay: 0.25 + i * 0.06 }}
            className={`rounded-2xl border px-2 py-3 ${RATING_COLORS[r]}`}
          >
            <p className="text-xl font-semibold tabular-nums">{stats[r]}</p>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">{RATING_LABELS[r]}</p>
          </motion.li>
        ))}
      </ul>
      <div className="mt-8 flex justify-center gap-2">
        <Link
          to={deckId ? '/decks' : '/courses'}
          className="min-h-11 content-center rounded-xl border border-surface-700 px-4 py-2.5 text-sm font-medium transition-colors hover:border-surface-600 hover:bg-surface-800 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {deckId ? 'Back to decks' : 'Back to courses'}
        </Link>
        <button
          type="button"
          onClick={onReviewMore}
          className="min-h-11 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-950/50 transition-[background-color,transform] hover:bg-indigo-400 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Review more
        </button>
      </div>
    </motion.section>
  );
}

export function ReviewSession() {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId');
  const deckId = searchParams.get('deckId');
  const queryClient = useQueryClient();

  const { data: queue, isPending, isError } = useQuery({
    queryKey: ['due-cards', courseId, deckId],
    queryFn: () => fetchDueCards(courseId ?? undefined, deckId ?? undefined),
  });

  const navigate = useNavigate();
  const { settings } = useSettings();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState<Record<ReviewRating, number>>({ AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 });
  const revealedAt = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const autoplayRef = useRef<HTMLAudioElement>(null);
  const hintRefs = useRef<Partial<Record<ReviewRating, HTMLDivElement | null>>>({});

  const card = queue?.[index];

  const { data: detail } = useQuery({
    queryKey: ['dictionary-entry', card?.entry.word],
    queryFn: () => fetchDictionaryEntry(card!.entry.word),
    enabled: !!card && revealed,
    // Poll while the background pipeline enriches the entry
    refetchInterval: (q) => {
      const status = q.state.data?.enrichmentStatus;
      return status === 'PENDING' || status === 'ENRICHING' ? 4000 : false;
    },
  });

  const entry: CardEntry | undefined = card && { ...card.entry, ...detail };

  const [autoGraduatedCount, setAutoGraduatedCount] = useState(0);
  const isOnline = useOnlineStatus();
  const [queuedCount, setQueuedCount] = useState(0);

  const refreshQueuedCount = () => {
    void getQueueCount().then(setQueuedCount);
  };

  // Sync any reviews queued while offline as soon as we're back online.
  useEffect(() => {
    refreshQueuedCount();
    if (!isOnline) return;
    void flushQueue().then((synced) => {
      if (synced === 0) return;
      refreshQueuedCount();
      void queryClient.invalidateQueries({ queryKey: ['due-cards'] });
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['known-words'] });
    });
  }, [isOnline, queryClient]);

  const reviewMutation = useMutation({
    mutationFn: (vars: { cardId: string; rating: ReviewRating; latencyMs?: number; reviewedAt: string }) =>
      submitReview(vars.cardId, { rating: vars.rating, latencyMs: vars.latencyMs }),
    onSuccess: ({ autoGraduated }) => {
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
      if (autoGraduated && autoGraduated.count > 0) {
        setAutoGraduatedCount((n) => n + autoGraduated.count);
      }
    },
    // Offline (or a flaky connection): queue the review for sync on reconnect
    // rather than losing it.
    onError: async (_error, vars) => {
      await enqueueReview({
        cardId: vars.cardId,
        rating: vars.rating,
        latencyMs: vars.latencyMs,
        reviewedAt: vars.reviewedAt,
      });
      refreshQueuedCount();
    },
  });

  // New-card entrance animation (index change only).
  useGSAP(
    () => {
      if (!cardRef.current) return;
      gsap.set(cardRef.current, { x: 0, y: 0, rotation: 0, opacity: 1 });
      if (!prefersReducedMotion()) {
        gsap.from(cardRef.current, { opacity: 0, y: 16, duration: 0.25, ease: 'power2.out' });
      }
    },
    { dependencies: [index], scope: cardRef },
  );

  const advance = (rating: ReviewRating, current: ReviewCard) => {
    lastRatingRef.current = rating;
    const latencyMs = revealedAt.current ? Date.now() - revealedAt.current : undefined;
    const reviewedAt = new Date().toISOString();
    if (isOnline) {
      reviewMutation.mutate({ cardId: current.id, rating, latencyMs, reviewedAt });
    } else {
      void enqueueReview({ cardId: current.id, rating, latencyMs, reviewedAt }).then(refreshQueuedCount);
    }
    setStats((s) => ({ ...s, [rating]: s[rating] + 1 }));
    setRevealed(false);
    revealedAt.current = null;
    setIndex((i) => i + 1);
  };

  const rate = (rating: ReviewRating) => {
    if (!card) return;
    const el = cardRef.current;
    if (!el || prefersReducedMotion()) {
      advance(rating, card);
      return;
    }
    const { x, y } = RATING_OFFSET[rating];
    gsap.to(el, {
      x: x * FLY_DISTANCE,
      y: y * FLY_DISTANCE,
      opacity: 0,
      rotation: x * 15,
      duration: 0.3,
      ease: 'power1.in',
      onComplete: () => advance(rating, card),
    });
  };

  const clearHints = (animate = true) => {
    RATINGS.forEach((r) => {
      const el = hintRefs.current[r];
      if (!el) return;
      if (animate) gsap.to(el, { opacity: 0, duration: 0.15 });
      else gsap.set(el, { opacity: 0 });
    });
  };

  const bindDrag = useDrag(
    ({ down, movement: [mx], velocity: [vx], last, cancel }) => {
      if (!cardRef.current) return;
      if (!down) {
        const absX = Math.abs(mx);
        // Trigger on threshold distance OR on fast flick (velocity > 0.5 px/ms).
        const fastFlick = Math.abs(vx) > 0.5;
        if (last && (absX > SWIPE_THRESHOLD || fastFlick)) {
          const rating: ReviewRating = mx < 0 ? 'AGAIN' : 'GOOD';
          cancel?.();
          clearHints(false);
          rate(rating);
          return;
        }
        // Spring back with duration proportional to how far the card traveled.
        const springDuration = prefersReducedMotion() ? 0 : Math.min(0.15 + absX / 600, 0.4);
        gsap.to(cardRef.current, { x: 0, y: 0, rotation: 0, duration: springDuration, ease: 'back.out(1.4)' });
        clearHints();
        return;
      }
      if (prefersReducedMotion()) return;
      gsap.set(cardRef.current, { x: mx, y: 0, rotation: mx / 20 });

      // Show directional affordance hint (AGAIN for left drag, GOOD for right drag).
      const absX = Math.abs(mx);
      const hintRating: ReviewRating = mx < 0 ? 'AGAIN' : 'GOOD';
      const hintOpacity = Math.min(Math.max((absX - 20) / (SWIPE_THRESHOLD - 20), 0), 0.92);
      RATINGS.forEach((r) => {
        const el = hintRefs.current[r];
        if (!el) return;
        gsap.set(el, { opacity: r === hintRating && absX > 20 ? hintOpacity : 0 });
      });
    },
    {
      axis: 'x',
      touchAction: 'pan-y',
    },
  );

  // Screen-reader-only announcements for card transitions and review
  // results.
  const [announcement, setAnnouncement] = useState('');
  const lastRatingRef = useRef<ReviewRating | null>(null);

  useEffect(() => {
    if (!queue) return;
    const prefix = lastRatingRef.current ? `Rated ${RATING_LABELS[lastRatingRef.current]}. ` : '';
    lastRatingRef.current = null;
    if (card) {
      setAnnouncement(`${prefix}Card ${index + 1} of ${queue.length}: ${card.entry.word}.`);
    } else if (queue.length > 0) {
      setAnnouncement(`${prefix}Session complete. ${queue.length} card${queue.length === 1 ? '' : 's'} reviewed.`);
    }
  }, [queue, card, index]);

  const reveal = () => {
    revealedAt.current = Date.now();
    if (cardRef.current) gsap.set(cardRef.current, { x: 0, y: 0, rotation: 0 });
    setRevealed(true);
    setAnnouncement('Answer revealed.');
  };

  // Auto-play the word's pronunciation as soon as a new card is shown.
  useEffect(() => {
    const el = autoplayRef.current;
    if (!el || !entry?.audioUrl) return;
    el.src = entry.audioUrl;
    if (settings.autoplayAudio) {
      void el.play().catch(() => {});
    }
  }, [index, entry?.audioUrl, settings.autoplayAudio]);

  // Keyboard shortcuts: Space/Enter reveals the answer; arrow keys rate the
  // card (← Again · → Good · ↑ Easy · ↓ Hard), with or without revealing it.
  useEffect(() => {
    if (!card) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (!revealed && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        reveal();
        return;
      }
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          rate('AGAIN');
          break;
        case 'ArrowRight':
          e.preventDefault();
          rate('GOOD');
          break;
        case 'ArrowUp':
          e.preventDefault();
          rate('EASY');
          break;
        case 'ArrowDown':
          e.preventDefault();
          rate('HARD');
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [card, revealed]);

  return (
    <MotionConfig reducedMotion="user">
    <section aria-label="Review session" className="space-y-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-surface-400">Review</h2>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {(!isOnline || queuedCount > 0) && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2.5 text-sm text-accent-amber"
        >
          {!isOnline ? "You're offline — reviews are saved on this device" : 'Syncing offline reviews…'}
          {queuedCount > 0 && ` (${queuedCount} queued)`}
        </div>
      )}

      {autoGraduatedCount > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-sm text-accent-emerald"
        >
          <p>
            {autoGraduatedCount} word{autoGraduatedCount === 1 ? '' : 's'} auto-marked as known
          </p>
          <div className="flex items-center gap-2">
            <Link
              to="/known-words"
              className="min-h-11 content-center rounded-lg px-2 font-medium underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Review / undo
            </Link>
            <button
              type="button"
              onClick={() => setAutoGraduatedCount(0)}
              aria-label="Dismiss"
              className="min-h-11 min-w-11 rounded-lg text-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {isPending && <p aria-live="polite">Loading due cards…</p>}
      {isError && <p aria-live="polite" className="text-accent-red">Couldn't load due cards.</p>}

      {queue && queue.length === 0 && (
        <div className="rounded-3xl border border-surface-800 bg-surface-900 p-8 text-center shadow-xl">
          <p>All caught up — nothing due right now.</p>
          <Link
            to={deckId ? '/decks' : '/courses'}
            className="mt-4 inline-block min-h-11 rounded-xl border border-surface-700 px-4 py-2.5 text-sm font-medium transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {deckId ? 'Back to decks' : 'Back to courses'}
          </Link>
        </div>
      )}

      {queue && queue.length > 0 && !card && (
        <SessionSummary
          stats={stats}
          deckId={deckId}
          onReviewMore={() => {
            setIndex(0);
            setStats({ AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 });
            void queryClient.invalidateQueries({ queryKey: ['due-cards', courseId, deckId] });
          }}
        />
      )}

      {queue && card && entry && (
        <>
          <div className="flex items-center gap-3 px-1">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-800" aria-hidden="true">
              <motion.div
                className="h-full rounded-full bg-indigo-500"
                initial={false}
                animate={{ width: `${(index / queue.length) * 100}%` }}
                transition={spring}
              />
            </div>
            <p className="text-xs font-medium tabular-nums text-surface-400">
              {index + 1} / {queue.length}
            </p>
          </div>

          {(entry.enrichmentStatus === 'PENDING' || entry.enrichmentStatus === 'ENRICHING') && (
            <p
              role="status"
              className="mt-2 mx-auto max-w-[fit-content] flex items-center justify-center gap-2 rounded-lg bg-accent-amber/10 px-3 py-1.5 text-xs font-medium text-accent-amber"
            >
              <span
                aria-hidden="true"
                className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none rounded-full border-[1.5px] border-accent-amber/30 border-t-accent-amber"
              />
              Enriching in background…
            </p>
          )}

          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- pronunciation autoplay, no spoken content beyond the word */}
          <audio ref={autoplayRef} className="hidden" />

          <div
            {...bindDrag()}
            ref={cardRef}
            role="group"
            aria-label="Flashcard"
            className="relative touch-pan-y select-none rounded-3xl border border-surface-800 bg-surface-900 p-6 shadow-xl"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent"
            />
            {RATINGS.map((r) => (
              <div
                key={r}
                ref={(el) => { hintRefs.current[r] = el; }}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-3xl opacity-0"
              >
                <span className={`rounded-xl px-5 py-2 text-2xl font-bold backdrop-blur-sm ${RATING_BADGE_COLORS[r]}`}>
                  {RATING_LABELS[r]}
                </span>
              </div>
            ))}
            <CardFront entry={entry} revealed={revealed} />
            {revealed && (
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring}
              >
                <CardBack
                  entry={entry}
                  detail={detail}
                  onSelectWord={(w) => navigate(`/word/${encodeURIComponent(w)}`)}
                />
              </motion.div>
            )}
          </div>

          <div className="min-h-[4.75rem]">
            <AnimatePresence mode="popLayout" initial={false}>
              {!revealed ? (
                <motion.div
                  key="show-answer"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={springSnappy}
                  className="space-y-2"
                >
                  <motion.button
                    type="button"
                    onClick={reveal}
                    whileTap={{ scale: 0.97 }}
                    className="min-h-12 w-full rounded-2xl bg-indigo-500 px-4 py-3 text-base font-semibold text-white shadow-lg shadow-indigo-500/25 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    Show answer
                  </motion.button>
                  <p className="text-center text-xs text-surface-500">Press Space or Enter to reveal</p>
                </motion.div>
              ) : (
                <motion.div key="ratings" className="space-y-2">
                  <div className="grid grid-cols-4 gap-2">
                    {RATINGS.map((r, i) => (
                      <motion.button
                        key={r}
                        type="button"
                        onClick={() => rate(r)}
                        initial={{ opacity: 0, y: 14, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ ...springSnappy, delay: i * 0.045 }}
                        whileTap={{ scale: 0.93 }}
                        className={`flex min-h-12 flex-col items-center justify-center rounded-2xl border px-2 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${RATING_COLORS[r]}`}
                      >
                        {RATING_LABELS[r]}
                        <span aria-hidden="true" className="mt-0.5 hidden text-[10px] font-normal opacity-60 sm:block">
                          {RATING_KEY_HINTS[r]}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                  <p className="text-center text-xs text-surface-500">
                    Swipe or press arrow keys: ← Again · → Good · ↑ Easy · ↓ Hard
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </section>
    </MotionConfig>
  );
}
