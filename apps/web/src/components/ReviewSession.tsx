import { useGSAP } from '@gsap/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DictionaryEntryDetail, ReviewCard, ReviewRating } from '@vocabahn/shared';
import gsap from 'gsap';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useDrag } from '@use-gesture/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  Keyboard,
  RotateCcw,
  X,
} from 'lucide-react';
import { fetchDictionaryEntry, fetchDueCards, submitReview, undoLastReview } from '../api';
import { useSettings } from '../hooks/useSettings';
import { dequeueLatestReview, enqueueReview, flushQueue, getQueueCount } from '../offline/queue';
import { useOnlineStatus } from '../offline/useOnlineStatus';
import { prefersReducedMotion, spring, springSnappy } from '../lib/motion';
import type { ReviewScope } from '../lib/analytics-events';
import { isFirstReviewSession, trackEvent } from '../lib/telemetry';
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

const RATING_INTERVALS: Record<ReviewRating, string> = {
  AGAIN: '< 10m',
  HARD: '1d',
  GOOD: '3d',
  EASY: '7d',
};

const RATING_COLORS: Record<ReviewRating, string> = {
  AGAIN:
    'border-red-400/40 bg-red-500/10 text-accent-red hover:bg-red-500/20 active:bg-red-500/25 shadow-sm shadow-red-950/20',
  HARD:
    'border-amber-400/40 bg-amber-400/10 text-accent-amber hover:bg-amber-400/20 active:bg-amber-400/25 shadow-sm shadow-amber-950/20',
  GOOD:
    'border-emerald-400/40 bg-emerald-500/10 text-accent-emerald hover:bg-emerald-500/20 active:bg-emerald-500/25 shadow-sm shadow-emerald-950/20',
  EASY:
    'border-sky-400/40 bg-sky-500/10 text-accent-sky hover:bg-sky-500/20 active:bg-sky-500/25 shadow-sm shadow-sky-950/20',
};

const RATING_BADGE_COLORS: Record<ReviewRating, string> = {
  AGAIN: 'border-2 border-red-500/60 bg-red-500/25 text-accent-red shadow-lg shadow-red-500/20',
  HARD: 'border-2 border-amber-400/60 bg-amber-400/25 text-accent-amber shadow-lg shadow-amber-400/20',
  GOOD: 'border-2 border-emerald-400/60 bg-emerald-500/25 text-accent-emerald shadow-lg shadow-emerald-500/20',
  EASY: 'border-2 border-sky-400/60 bg-sky-500/25 text-accent-sky shadow-lg shadow-sky-500/20',
};

const RATING_NUMBER_HINTS: Record<ReviewRating, string> = {
  AGAIN: '1',
  HARD: '2',
  GOOD: '3',
  EASY: '4',
};

const ARTICLES: Record<string, string> = { m: 'der', f: 'die', n: 'das' };

function articleFor(gender: string | null | undefined): string | null {
  if (!gender) return null;
  return gender
    .split(',')
    .map((g) => ARTICLES[g.trim()])
    .filter(Boolean)
    .join('/');
}

function getArticleBadgeStyle(art: string) {
  if (art.includes('der')) {
    return 'border-sky-400/40 bg-sky-500/15 text-sky-700 dark:text-sky-400';
  }
  if (art.includes('die')) {
    return 'border-rose-400/40 bg-rose-500/15 text-rose-700 dark:text-rose-400';
  }
  if (art.includes('das')) {
    return 'border-emerald-400/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
  }
  return 'border-surface-700 bg-surface-800/80 text-surface-300';
}

// Swipe direction each rating flies off toward (used for both the drag
// gesture mapping and the button-triggered fly-off animation).
const RATING_OFFSET: Record<ReviewRating, { x: number; y: number }> = {
  AGAIN: { x: -1, y: 0 },
  GOOD: { x: 1, y: 0 },
  EASY: { x: 0, y: -1 },
  HARD: { x: 0, y: 1 },
};

const SWIPE_THRESHOLD = 90;
const FLY_DISTANCE = 500;

/**
 * The one rating a session can take back. Only the most recent rating is
 * undoable — there is no multi-step history — and it is dropped when the
 * session is left or restarted.
 */
type PendingUndo = {
  cardId: string;
  /** Queue position of the rated card, so undo can step straight back to it. */
  index: number;
  rating: ReviewRating;
  /** The review lives only in the IndexedDB queue; undoing must not call the API. */
  queuedOffline: boolean;
  /** Words this rating auto-graduated, to subtract from the session banner. */
  graduatedCount: number;
};

/** Shortcuts dialog helper modal */
function ShortcutsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close shortcuts modal"
        className="fixed inset-0 bg-surface-950/80 backdrop-blur-sm animate-fade-in cursor-default"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-surface-700 bg-surface-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-800 pb-4">
          <div className="flex items-center gap-2">
            <Keyboard className="size-5 text-indigo-400" />
            <h3 id="shortcuts-dialog-title" className="text-base font-semibold text-surface-100">
              Keyboard Shortcuts
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts guide"
            className="flex min-h-9 min-w-9 items-center justify-center rounded-xl border border-surface-700 text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-indigo"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between rounded-xl bg-surface-950/60 p-2.5">
            <span className="text-surface-300">Reveal card answer</span>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded border border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-surface-200">
                Space
              </kbd>
              <span className="text-surface-500">or</span>
              <kbd className="rounded border border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-surface-200">
                Enter
              </kbd>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-surface-950/60 p-2.5">
            <span className="text-surface-300">Rate Again (&lt; 10m)</span>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded border border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-surface-200">
                1
              </kbd>
              <span className="text-surface-500">or</span>
              <kbd className="rounded border border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-surface-200">
                ←
              </kbd>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-surface-950/60 p-2.5">
            <span className="text-surface-300">Rate Hard (1d)</span>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded border border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-surface-200">
                2
              </kbd>
              <span className="text-surface-500">or</span>
              <kbd className="rounded border border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-surface-200">
                ↓
              </kbd>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-surface-950/60 p-2.5">
            <span className="text-surface-300">Rate Good (3d)</span>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded border border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-surface-200">
                3
              </kbd>
              <span className="text-surface-500">or</span>
              <kbd className="rounded border border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-surface-200">
                →
              </kbd>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-surface-950/60 p-2.5">
            <span className="text-surface-300">Rate Easy (7d)</span>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded border border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-surface-200">
                4
              </kbd>
              <span className="text-surface-500">or</span>
              <kbd className="rounded border border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-surface-200">
                ↑
              </kbd>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-surface-950/60 p-2.5">
            <span className="text-surface-300">Replay pronunciation</span>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded border border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-surface-200">
                R
              </kbd>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-surface-950/60 p-2.5">
            <span className="text-surface-300">Undo last rating</span>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded border border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-surface-200">
                U
              </kbd>
              <span className="text-surface-500">or</span>
              <kbd className="rounded border border-surface-700 bg-surface-800 px-2 py-1 text-xs font-mono text-surface-200">
                ⌘Z
              </kbd>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 min-h-11 w-full rounded-xl bg-surface-800 text-sm font-semibold text-surface-200 transition-colors hover:bg-surface-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-indigo"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function CardFront({
  entry,
  revealed,
}: {
  entry: CardEntry;
  revealed: boolean;
}) {
  const article = articleFor(entry.gender);

  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 text-center transition-[padding] duration-300 ${
        revealed ? 'py-4 sm:py-6' : 'py-10 sm:py-16'
      }`}
    >
      {/* Top Metadata Badges */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {article && (
          <span
            className={`rounded-full border px-3 py-1 text-xs font-bold font-mono uppercase tracking-wider ${getArticleBadgeStyle(
              article,
            )}`}
          >
            {article}
          </span>
        )}
        {entry.pos && (
          <span className="rounded-full border border-surface-800 bg-surface-950/80 px-3 py-1 text-xs font-medium uppercase tracking-widest text-surface-400">
            {entry.pos}
          </span>
        )}
        {entry.cefrLevel && (
          <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-bold font-mono text-indigo-400">
            {entry.cefrLevel}
          </span>
        )}
      </div>

      {/* Main German Headword */}
      <div className="space-y-1">
        <p className="text-4xl font-bold tracking-tight text-surface-100 sm:text-5xl lg:text-6xl" lang="de">
          {entry.word}
        </p>
        {entry.ipa && (
          <p className="text-sm font-mono text-surface-400 opacity-90 tracking-wide">
            /{entry.ipa}/
          </p>
        )}
      </div>

      {/* Audio pronunciation button */}
      {entry.audioUrl && (
        <div className="mt-1 flex items-center gap-2">
          <AudioButton src={entry.audioUrl} label={`Play pronunciation of ${entry.word}`} />
        </div>
      )}
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
  onSelectWord: (word: string, pos?: string) => void;
}) {
  if (detail) {
    return (
      <div className="border-t border-surface-800/80 pt-6 text-left">
        <EntryBody entry={detail} onSelectWord={onSelectWord} />
      </div>
    );
  }

  const example = entry.examples[0];
  return (
    <div className="space-y-4 border-t border-surface-800/80 py-6 pt-5 text-center">
      {entry.imageUrl && (
        <div className="mx-auto overflow-hidden rounded-2xl border border-surface-800 bg-surface-950 shadow-md">
          <img
            src={entry.imageUrl}
            alt=""
            loading="lazy"
            className="mx-auto max-h-48 w-full object-cover sm:max-h-56"
          />
        </div>
      )}
      {entry.emoji && <span className="text-5xl block">{entry.emoji}</span>}
      <p className="text-2xl font-semibold tracking-tight text-surface-100">
        {entry.translation ?? '—'}
      </p>
      {example && (
        <div className="rounded-2xl border border-surface-800 bg-surface-950/80 p-4 text-left shadow-sm">
          <p className="text-base text-surface-200" lang="de">
            {example.de}
            {example.audioUrl && (
              <span className="ml-2 inline-block align-middle">
                <AudioButton src={example.audioUrl} label="Play example sentence" />
              </span>
            )}
          </p>
          <p className="mt-1.5 text-sm text-surface-400">{example.en}</p>
        </div>
      )}
    </div>
  );
}

function SessionSummary({
  stats,
  onReviewMore,
  deckId,
  courseId,
}: {
  stats: Record<ReviewRating, number>;
  onReviewMore: () => void;
  deckId?: string | null;
  courseId?: string | null;
}) {
  const total = RATINGS.reduce((sum, r) => sum + stats[r], 0);
  const recalled = stats.GOOD + stats.EASY;
  const accuracy = total > 0 ? Math.round((recalled / total) * 100) : 0;

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.94, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={spring}
      aria-label="Session summary"
      className="relative flex flex-1 min-h-0 flex-col justify-center overflow-y-auto overscroll-contain rounded-3xl border border-surface-800 bg-surface-900 p-6 sm:p-10 text-center shadow-2xl backdrop-blur-md vb-card-scroll"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl"
      />

      <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/30 text-accent-emerald shadow-lg shadow-emerald-950/30 shrink-0">
        <svg viewBox="0 0 52 52" aria-hidden="true" className="size-12">
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
      </div>

      <h2 className="mt-5 text-3xl font-bold tracking-tight text-surface-100 sm:text-4xl shrink-0">
        Session complete
      </h2>
      <p className="mt-2 text-base text-surface-400 shrink-0">
        <CountUp value={total} className="font-semibold text-surface-200" /> card{total === 1 ? '' : 's'} reviewed
        {total > 0 && (
          <>
            {' '}
            ·{' '}
            <span
              className={`font-semibold ${
                accuracy >= 80
                  ? 'text-accent-emerald'
                  : accuracy >= 60
                  ? 'text-accent-amber'
                  : 'text-accent-red'
              }`}
            >
              {accuracy}% recalled
            </span>
          </>
        )}
      </p>

      <ul className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm shrink-0">
        {RATINGS.map((r, i) => (
          <motion.li
            key={r}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springSnappy, delay: 0.25 + i * 0.06 }}
            className={`flex flex-col items-center justify-center rounded-2xl border p-3.5 transition-all ${RATING_COLORS[r]}`}
          >
            <p className="text-2xl font-bold tabular-nums">{stats[r]}</p>
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider opacity-85">
              {RATING_LABELS[r]}
            </p>
            <span className="mt-1 text-[11px] opacity-60">
              {total > 0 ? `${Math.round((stats[r] / total) * 100)}%` : '0%'}
            </span>
          </motion.li>
        ))}
      </ul>

      <div className="mt-10 flex flex-col-reverse sm:flex-row items-center justify-center gap-3 shrink-0">
        <Link
          to={deckId ? `/decks/${deckId}` : courseId ? `/courses/${courseId}` : '/courses'}
          className="min-h-12 w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-surface-700 px-5 py-3 text-sm font-semibold text-surface-300 transition-colors hover:border-surface-600 hover:bg-surface-800 hover:text-surface-100 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo"
        >
          {deckId ? 'Back to deck' : courseId ? 'Back to course' : 'Back to courses'}
        </Link>
        <button
          type="button"
          onClick={onReviewMore}
          className="min-h-12 w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-[background-color,transform] hover:bg-indigo-400 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo"
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoplayRef = useRef<HTMLAudioElement>(null);
  const hintRefs = useRef<Partial<Record<ReviewRating, HTMLDivElement | null>>>({});
  const [showShortcuts, setShowShortcuts] = useState(false);

  const card = queue?.[index];

  const { data: detail } = useQuery({
    queryKey: ['dictionary-entry', card?.entry.word, card?.entry.pos],
    queryFn: () => fetchDictionaryEntry(card!.entry.word, card!.entry.pos),
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

  // Scroll to top on mount so the review session sits clean in view
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  // Reset internal card scroll position whenever index changes or revealed state toggles
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [index, revealed]);

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

  const sessionScope: ReviewScope = deckId ? 'deck' : courseId ? 'course' : 'all';

  /**
   * Everything the two session-level analytics events report. A ref, not
   * state: a review session sends exactly one summary event, never one per
   * card, so these numbers only have to be readable at the two moments the
   * session ends — including from an unmount cleanup, which a state closure
   * would show stale.
   */
  const analyticsRef = useRef({
    stats: { AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 } as Record<ReviewRating, number>,
    remaining: 0,
    startedAt: Date.now(),
    /** Ratings that ended up in the IndexedDB queue instead of reaching the API. */
    offlineQueued: 0,
    completeReported: false,
    scope: sessionScope,
  });

  // Declared before the completion effect so the snapshot it reads is current.
  useEffect(() => {
    const a = analyticsRef.current;
    a.stats = stats;
    a.remaining = Math.max(0, (queue?.length ?? 0) - index);
    a.scope = sessionScope;
  });

  // Reaching the summary is the end of a session. Reported once: undoing from
  // the summary and re-rating re-enters the same session, it does not start a
  // second one. "Review more" resets the flag, because that genuinely does.
  const sessionFinished = !!queue && queue.length > 0 && !card;
  useEffect(() => {
    const a = analyticsRef.current;
    if (!sessionFinished || a.completeReported) return;
    a.completeReported = true;

    const cardCount = RATINGS.reduce((sum, r) => sum + a.stats[r], 0);
    const recalled = a.stats.GOOD + a.stats.EASY;
    trackEvent('review_session_complete', {
      card_count: cardCount,
      again_count: a.stats.AGAIN,
      hard_count: a.stats.HARD,
      good_count: a.stats.GOOD,
      easy_count: a.stats.EASY,
      accuracy_pct: cardCount > 0 ? Math.round((recalled / cardCount) * 100) : 0,
      duration_sec: Math.round((Date.now() - a.startedAt) / 1000),
      offline_queued_count: a.offlineQueued,
      session_scope: a.scope,
    });
    if (isFirstReviewSession()) {
      trackEvent('first_review_complete', { card_count: cardCount });
    }
  }, [sessionFinished]);

  // Leaving mid-session is the drop-off signal; it is the same one event per
  // session, just the other ending.
  useEffect(() => {
    const a = analyticsRef.current;
    return () => {
      if (a.completeReported) return;
      const cardCount = RATINGS.reduce((sum, r) => sum + a.stats[r], 0);
      if (cardCount === 0) return;
      trackEvent('review_session_abandon', {
        card_count: cardCount,
        remaining_count: a.remaining,
        session_scope: a.scope,
      });
    };
  }, []);

  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  // Awaited by undo so a fast tap can't run the dequeue before the enqueue it
  // is meant to cancel has actually landed in IndexedDB.
  const enqueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const reviewMutation = useMutation({
    mutationFn: (vars: { cardId: string; rating: ReviewRating; latencyMs?: number; reviewedAt: string }) =>
      submitReview(vars.cardId, { rating: vars.rating, latencyMs: vars.latencyMs }),
    onSuccess: ({ autoGraduated }, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
      if (autoGraduated && autoGraduated.count > 0) {
        setAutoGraduatedCount((n) => n + autoGraduated.count);
        // Remember how much of the banner this rating is responsible for, so
        // undoing it takes exactly that back off.
        setPendingUndo((p) =>
          p && p.cardId === vars.cardId ? { ...p, graduatedCount: p.graduatedCount + autoGraduated.count } : p,
        );
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
      analyticsRef.current.offlineQueued += 1;
      refreshQueuedCount();
      setPendingUndo((p) => (p && p.cardId === vars.cardId ? { ...p, queuedOffline: true } : p));
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (action: PendingUndo) => {
      await enqueueRef.current;
      if (action.queuedOffline) {
        // The review never reached the server — drop it from the queue so it
        // can't be resurrected by the next flush.
        const dropped = await dequeueLatestReview(action.cardId);
        refreshQueuedCount();
        if (dropped) return;
        // It was flushed between rating and undo; fall through to the API.
      }
      await undoLastReview(action.cardId);
    },
    onSettled: () => {
      // Same keys the review path touches — scheduling, progress and the
      // known-words list all move when a review is rolled back.
      void queryClient.invalidateQueries({ queryKey: ['courses'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['known-words'] });
      // Mark the queue stale without refetching: a refetch mid-session would
      // swap the cards out from under the index we just stepped back to.
      void queryClient.invalidateQueries({ queryKey: ['due-cards'], refetchType: 'none' });
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
      analyticsRef.current.offlineQueued += 1;
      enqueueRef.current = enqueueReview({ cardId: current.id, rating, latencyMs, reviewedAt }).then(
        refreshQueuedCount,
      );
    }
    setPendingUndo({ cardId: current.id, index, rating, queuedOffline: !isOnline, graduatedCount: 0 });
    setStats((s) => ({ ...s, [rating]: s[rating] + 1 }));
    setRevealed(false);
    revealedAt.current = null;
    setIndex((i) => i + 1);
  };

  // Undo stays available until the next rating; wait for an in-flight submit so
  // the rollback can't race the review it is rolling back.
  const canUndo = pendingUndo !== null && !reviewMutation.isPending && !undoMutation.isPending;

  const undoLastRating = () => {
    if (!pendingUndo || reviewMutation.isPending || undoMutation.isPending) return;
    const action = pendingUndo;
    setPendingUndo(null);
    if (action.queuedOffline) {
      analyticsRef.current.offlineQueued = Math.max(0, analyticsRef.current.offlineQueued - 1);
    }
    setStats((s) => ({ ...s, [action.rating]: Math.max(0, s[action.rating] - 1) }));
    if (action.graduatedCount > 0) {
      setAutoGraduatedCount((n) => Math.max(0, n - action.graduatedCount));
    }
    setRevealed(false);
    revealedAt.current = null;
    undoAnnouncementRef.current = `Undid ${RATING_LABELS[action.rating]}. `;
    setIndex(action.index);
    undoMutation.mutate(action);
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
      gsap.set(cardRef.current, { x: mx, y: 0, rotation: mx / 22 });

      // Show directional affordance hint (AGAIN for left drag, GOOD for right drag).
      const absX = Math.abs(mx);
      const hintRating: ReviewRating = mx < 0 ? 'AGAIN' : 'GOOD';
      const hintOpacity = Math.min(Math.max((absX - 20) / (SWIPE_THRESHOLD - 20), 0), 0.95);
      RATINGS.forEach((r) => {
        const el = hintRefs.current[r];
        if (!el) return;
        gsap.set(el, { opacity: r === hintRating && absX > 20 ? hintOpacity : 0 });
      });
    },
    {
      axis: 'x',
      // Touch-only gesture: eliminates desktop mouse dragging so text selection,
      // tab clicks, and desktop pointer interactions remain frictionless.
      pointer: { touch: true, mouse: false },
      filterTaps: true,
      touchAction: 'pan-y',
    },
  );

  // Screen-reader-only announcements for card transitions and review
  // results.
  const [announcement, setAnnouncement] = useState('');
  const lastRatingRef = useRef<ReviewRating | null>(null);
  const undoAnnouncementRef = useRef<string | null>(null);

  useEffect(() => {
    if (!queue) return;
    const prefix =
      undoAnnouncementRef.current ??
      (lastRatingRef.current ? `Rated ${RATING_LABELS[lastRatingRef.current]}. ` : '');
    undoAnnouncementRef.current = null;
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

  const playAudio = () => {
    const el = autoplayRef.current;
    if (el && entry?.audioUrl) {
      void el.play().catch(() => {});
    }
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

  // Keyboard shortcuts:
  // - Space/Enter reveals the answer
  // - 1 / ArrowLeft: Again
  // - 2 / ArrowDown: Hard
  // - 3 / ArrowRight: Good
  // - 4 / ArrowUp: Easy
  // - R: Replay audio
  // - ?: Toggle shortcuts guide
  useEffect(() => {
    if (!card) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      // Ignore shortcuts if the user is typing in an input, textarea, or contentEditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShowShortcuts((s) => !s);
        return;
      }

      if (e.key === 'Escape' && showShortcuts) {
        e.preventDefault();
        setShowShortcuts(false);
        return;
      }

      // Audio replay with 'R', 'P', or 'A'
      if (
        (e.code === 'KeyR' || e.code === 'KeyP' || e.code === 'KeyA') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        playAudio();
        return;
      }

      // Reveal with Space or Enter
      if (!revealed && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        reveal();
        return;
      }

      // Rate with Arrow keys or Number keys (1, 2, 3, 4)
      if (
        e.key === 'ArrowLeft' ||
        e.code === 'Digit1' ||
        e.code === 'Numpad1' ||
        e.key === '1'
      ) {
        e.preventDefault();
        rate('AGAIN');
        return;
      }
      if (
        e.key === 'ArrowRight' ||
        e.code === 'Digit3' ||
        e.code === 'Numpad3' ||
        e.key === '3'
      ) {
        e.preventDefault();
        rate('GOOD');
        return;
      }
      if (
        e.key === 'ArrowUp' ||
        e.code === 'Digit4' ||
        e.code === 'Numpad4' ||
        e.key === '4'
      ) {
        e.preventDefault();
        rate('EASY');
        return;
      }
      if (
        e.key === 'ArrowDown' ||
        e.code === 'Digit2' ||
        e.code === 'Numpad2' ||
        e.key === '2'
      ) {
        e.preventDefault();
        rate('HARD');
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [card, revealed, showShortcuts, entry?.audioUrl]);

  // Undo shortcut: `u`, or the platform's Cmd/Ctrl+Z. Bound separately from the
  // rating keys because it also has to work on the summary screen, where the
  // last card of the session is still undoable.
  useEffect(() => {
    if (!canUndo) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const chord = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z';
      const plainU = e.key.toLowerCase() === 'u' && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (!chord && !plainU) return;
      e.preventDefault();
      undoLastRating();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canUndo, pendingUndo]);

  return (
    <MotionConfig reducedMotion="user">
      <section
        aria-label="Review session"
        className="mx-auto flex w-full max-w-2xl flex-col h-[calc(100dvh-var(--vb-mobile-nav-height,0px)-4.5rem)] md:h-[calc(100dvh-6.5rem)] max-h-[880px] min-h-[500px] px-2 sm:px-0"
      >
        {/* Session HUD Header */}
        <div className="shrink-0 space-y-3 pb-2">
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-surface-800/80 pb-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-surface-400">
                Review
              </h2>
              {deckId && (
                <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-400">
                  Deck
                </span>
              )}
              {courseId && (
                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-accent-emerald">
                  Course
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowShortcuts(true)}
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts (?)"
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-surface-700 bg-surface-900/60 text-surface-400 transition-colors hover:border-surface-600 hover:bg-surface-800 hover:text-surface-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-indigo"
              >
                <Keyboard className="size-4" />
              </button>

              {pendingUndo !== null && (
                <button
                  type="button"
                  onClick={undoLastRating}
                  disabled={!canUndo}
                  aria-label="Undo last rating"
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-surface-700 bg-surface-900/60 px-3 py-1.5 text-sm font-medium text-surface-200 shadow-sm transition-all hover:border-surface-600 hover:bg-surface-800 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo"
                >
                  <RotateCcw className="size-3.5 text-surface-400" />
                  <span>Undo</span>
                  <kbd
                    aria-hidden="true"
                    className="ml-1 hidden rounded border border-surface-700 bg-surface-800 px-1.5 py-0.5 text-[10px] font-mono text-surface-400 sm:inline"
                  >
                    U
                  </kbd>
                </button>
              )}
            </div>
          </div>

          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>

          {/* Offline / Queued Status Banner */}
          {(!isOnline || queuedCount > 0) && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3.5 py-2 text-xs font-medium text-accent-amber shadow-sm"
            >
              <span className="size-2 rounded-full bg-accent-amber animate-pulse" aria-hidden="true" />
              {!isOnline ? "You're offline — reviews are saved locally" : 'Syncing offline reviews…'}
              {queuedCount > 0 && ` (${queuedCount} queued)`}
            </div>
          )}

          {/* Undo Error Banner */}
          {undoMutation.isError && (
            <p
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-red-400/30 bg-red-500/10 px-3.5 py-2 text-xs font-medium text-accent-red shadow-sm"
            >
              Couldn't undo that rating on the server — it may still count toward scheduling.
            </p>
          )}

          {/* Auto-Graduated Banner */}
          {autoGraduatedCount > 0 && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-2 text-xs text-accent-emerald shadow-sm"
            >
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="size-3.5 shrink-0 text-accent-emerald" />
                <p>
                  {autoGraduatedCount} word{autoGraduatedCount === 1 ? '' : 's'} auto-marked as known
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/known-words"
                  className="content-center rounded-lg px-2 font-semibold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo"
                >
                  Review / undo
                </Link>
                <button
                  type="button"
                  onClick={() => setAutoGraduatedCount(0)}
                  aria-label="Dismiss"
                  className="flex size-7 items-center justify-center rounded-lg text-lg text-surface-400 hover:text-surface-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Progress Bar & Counter */}
          {queue && card && entry && (
            <div className="flex items-center gap-3 px-1">
              <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-surface-800/80 shadow-inner"
                aria-hidden="true"
              >
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-indigo-400"
                  initial={false}
                  animate={{ width: `${(index / queue.length) * 100}%` }}
                  transition={spring}
                />
              </div>
              <p className="text-xs font-semibold tabular-nums text-surface-400">
                {index + 1} / {queue.length}
              </p>
            </div>
          )}
        </div>

        {isPending && (
          <div className="flex flex-1 items-center justify-center py-16 text-center" aria-live="polite">
            <div>
              <div className="mx-auto size-10 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <p className="mt-4 text-sm font-medium text-surface-400">Loading due cards…</p>
            </div>
          </div>
        )}

        {isError && (
          <div className="flex flex-1 items-center justify-center rounded-3xl border border-red-500/20 bg-surface-900 p-8 text-center" aria-live="polite">
            <p className="text-sm font-medium text-accent-red">Couldn't load due cards.</p>
          </div>
        )}

        {/* All Caught Up State */}
        {queue && queue.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-surface-800 bg-surface-900 p-8 sm:p-12 text-center shadow-xl backdrop-blur-md">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-accent-emerald">
              <Check className="size-8" />
            </div>
            <h3 className="mt-4 text-xl font-bold tracking-tight text-surface-100">All caught up</h3>
            <p className="mt-1 text-sm text-surface-400">
              All caught up — nothing due right now.
            </p>
            <div className="mt-6">
              <Link
                to={deckId ? `/decks/${deckId}` : courseId ? `/courses/${courseId}` : '/library'}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-surface-800 border border-surface-700 px-5 py-2.5 text-sm font-semibold text-surface-200 transition-colors hover:border-surface-600 hover:bg-surface-700 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo"
              >
                {deckId ? 'Back to decks' : 'Back to courses'}
              </Link>
            </div>
          </div>
        )}

        {/* Session Finished Summary */}
        {queue && queue.length > 0 && !card && (
          <SessionSummary
            stats={stats}
            deckId={deckId}
            courseId={courseId}
            onReviewMore={() => {
              setIndex(0);
              setStats({ AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 });
              analyticsRef.current.completeReported = false;
              analyticsRef.current.startedAt = Date.now();
              analyticsRef.current.offlineQueued = 0;
              setPendingUndo(null);
              void queryClient.invalidateQueries({ queryKey: ['due-cards', courseId, deckId] });
            }}
          />
        )}

        {/* Active Flashcard View */}
        {queue && card && entry && (
          <div className="relative flex flex-1 min-h-0 flex-col">
            {/* Background enrichment pill */}
            {(entry.enrichmentStatus === 'PENDING' || entry.enrichmentStatus === 'ENRICHING') && (
              <div className="shrink-0 pb-2">
                <p
                  role="status"
                  className="mx-auto max-w-[fit-content] flex items-center justify-center gap-2 rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs font-medium text-accent-amber"
                >
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 animate-spin motion-reduce:animate-none rounded-full border-[1.5px] border-accent-amber/30 border-t-accent-amber"
                  />
                  Enriching in background…
                </p>
              </div>
            )}

            {/* Hidden pronunciation autoplay element */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- pronunciation autoplay, no spoken content beyond the word */}
            <audio ref={autoplayRef} className="hidden" />

            {/* Tactile Flashcard Frame (Flex-1 min-h-0) */}
            <div
              {...bindDrag()}
              ref={cardRef}
              role="group"
              aria-label="Flashcard"
              className="relative flex flex-1 min-h-0 flex-col touch-pan-y select-none rounded-3xl border border-surface-800/90 bg-surface-900/95 shadow-2xl backdrop-blur-md overflow-hidden transition-shadow"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 z-30 h-px bg-gradient-to-r from-transparent via-indigo-400/40 to-transparent"
              />

              {/* Directional Overlay Hints during touch drag */}
              {RATINGS.map((r) => (
                <div
                  key={r}
                  ref={(el) => {
                    hintRefs.current[r] = el;
                  }}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-3xl opacity-0 transition-opacity"
                >
                  <span
                    className={`rounded-2xl px-6 py-2.5 text-2xl font-black backdrop-blur-md ${RATING_BADGE_COLORS[r]}`}
                  >
                    {RATING_LABELS[r]}
                  </span>
                </div>
              ))}

              {/* Internal Scrollable Card Body */}
              <div
                ref={scrollContainerRef}
                className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 sm:p-8 space-y-4 focus-visible:outline-none vb-card-scroll"
              >
                {/* Card Front */}
                <CardFront entry={entry} revealed={revealed} />

                {/* Card Back / Revealed Details */}
                {revealed && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={spring}
                  >
                    <CardBack
                      entry={entry}
                      detail={detail}
                      onSelectWord={(w: string, p?: string) => {
                        void navigate(
                          p
                            ? `/word/${encodeURIComponent(w)}?pos=${encodeURIComponent(p)}`
                            : `/word/${encodeURIComponent(w)}`,
                        );
                      }}
                    />
                  </motion.div>
                )}
              </div>

              {/* Bottom Scroll Gradient Fade (subtle visual indicator when scrollable) */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-6 bg-gradient-to-t from-surface-900/90 to-transparent"
              />
            </div>

            {/* Bottom Action / Rating Bar (Shrink-0) */}
            <div className="shrink-0 pt-3">
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
                      aria-label="Show answer"
                      whileTap={{ scale: 0.98 }}
                      className="group flex min-h-13 sm:min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-indigo-500 px-6 py-3 text-base font-semibold text-white shadow-xl shadow-indigo-500/25 transition-all hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo"
                    >
                      <span>Show answer</span>
                      <kbd
                        aria-hidden="true"
                        className="rounded-md border border-indigo-400/40 bg-indigo-600/50 px-2 py-0.5 text-xs font-mono font-medium text-white/90"
                      >
                        Space
                      </kbd>
                    </motion.button>
                    <p className="text-center text-xs text-surface-500">
                      Press Space or Enter to reveal
                    </p>
                  </motion.div>
                ) : (
                  <motion.div key="ratings" className="space-y-2">
                    <div className="grid grid-cols-4 gap-2 sm:gap-3">
                      {RATINGS.map((r, i) => (
                        <motion.button
                          key={r}
                          type="button"
                          onClick={() => rate(r)}
                          aria-label={RATING_LABELS[r]}
                          initial={{ opacity: 0, y: 12, scale: 0.94 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ ...springSnappy, delay: i * 0.03 }}
                          whileTap={{ scale: 0.94 }}
                          className={`group flex min-h-13 sm:min-h-14 flex-col items-center justify-center rounded-2xl border px-2 py-2 text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo ${RATING_COLORS[r]}`}
                        >
                          <span className="font-bold tracking-tight">{RATING_LABELS[r]}</span>
                          <div className="mt-0.5 flex items-center gap-1.5 opacity-75">
                            <span className="text-[11px] font-normal">{RATING_INTERVALS[r]}</span>
                            <span
                              aria-hidden="true"
                              className="hidden rounded bg-current/10 px-1 py-0.2 text-[9px] font-mono sm:inline"
                            >
                              {RATING_NUMBER_HINTS[r]}
                            </span>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                    <p className="text-center text-xs text-surface-500">
                      Press 1–4 or arrow keys to rate · R to replay audio
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts Modal */}
        <ShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
      </section>
    </MotionConfig>
  );
}
