import { useGSAP } from '@gsap/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DictionaryEntryDetail, ReviewCard, ReviewRating } from '@vocabahn/shared';
import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { useDrag } from '@use-gesture/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchDictionaryEntry, fetchDueCards, submitReview } from '../api';
import { AudioButton, EntryBody } from './DictionaryCard';

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
  AGAIN: 'border-red-400/40 text-red-400 hover:bg-red-400/10',
  HARD: 'border-amber-300/40 text-amber-300 hover:bg-amber-300/10',
  GOOD: 'border-emerald-400/40 text-emerald-400 hover:bg-emerald-400/10',
  EASY: 'border-sky-400/40 text-sky-400 hover:bg-sky-400/10',
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

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function CardFront({ entry }: { entry: CardEntry }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      {entry.imageUrl && (
        <img src={entry.imageUrl} alt="" className="mb-2 size-24 rounded-xl object-cover" />
      )}
      {entry.emoji && <span className="text-5xl">{entry.emoji}</span>}
      <p className="text-2xl font-medium" lang="de">
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
      <div className="border-t border-neutral-800 pt-4 text-left">
        <EntryBody entry={detail} onSelectWord={onSelectWord} />
      </div>
    );
  }

  const example = entry.examples[0];
  return (
    <div className="space-y-3 border-t border-neutral-800 py-6 pt-4 text-center">
      <p className="text-xl">{entry.translation ?? '—'}</p>
      {example && (
        <div className="rounded-xl bg-neutral-950 p-3 text-left text-sm">
          <p lang="de">
            {example.de}
            {example.audioUrl && (
              <span className="ml-2">
                <AudioButton src={example.audioUrl} label="Play example sentence" />
              </span>
            )}
          </p>
          <p className="mt-1 text-neutral-400">{example.en}</p>
        </div>
      )}
    </div>
  );
}

function SessionSummary({
  stats,
  onReviewMore,
}: {
  stats: Record<ReviewRating, number>;
  onReviewMore: () => void;
}) {
  const total = RATINGS.reduce((sum, r) => sum + stats[r], 0);
  return (
    <section aria-label="Session summary" className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center shadow-lg shadow-black/20">
      <h2 className="text-lg font-medium">Session complete</h2>
      <p className="mt-1 text-neutral-400">{total} card{total === 1 ? '' : 's'} reviewed</p>
      <ul className="mt-4 grid grid-cols-4 gap-2 text-sm">
        {RATINGS.map((r) => (
          <li key={r} className={`rounded-xl border px-2 py-3 ${RATING_COLORS[r]}`}>
            <p className="text-lg font-semibold">{stats[r]}</p>
            <p>{RATING_LABELS[r]}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex justify-center gap-2">
        <Link
          to="/courses"
          className="min-h-11 rounded-xl border border-neutral-700 px-4 py-2.5 text-sm font-medium transition-colors hover:border-neutral-600 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Back to courses
        </Link>
        <button
          type="button"
          onClick={onReviewMore}
          className="min-h-11 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Review more
        </button>
      </div>
    </section>
  );
}

export function ReviewSession() {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get('courseId');
  const queryClient = useQueryClient();

  const { data: queue, isPending, isError } = useQuery({
    queryKey: ['due-cards', courseId],
    queryFn: () => fetchDueCards(courseId ?? undefined),
  });

  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState<Record<ReviewRating, number>>({ AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 });
  const revealedAt = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const autoplayRef = useRef<HTMLAudioElement>(null);

  const card = queue?.[index];

  const { data: detail } = useQuery({
    queryKey: ['dictionary-entry', card?.entry.word],
    queryFn: () => fetchDictionaryEntry(card!.entry.word),
    enabled: !!card,
    // Poll while the background pipeline enriches the entry (PRD §4.2)
    refetchInterval: (q) => {
      const status = q.state.data?.enrichmentStatus;
      return status === 'PENDING' || status === 'ENRICHING' ? 4000 : false;
    },
  });

  const entry: CardEntry | undefined = card && { ...card.entry, ...detail };

  const reviewMutation = useMutation({
    mutationFn: (vars: { cardId: string; rating: ReviewRating; latencyMs?: number }) =>
      submitReview(vars.cardId, { rating: vars.rating, latencyMs: vars.latencyMs }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['courses'] }),
  });

  useGSAP(
    () => {
      if (!cardRef.current) return;
      gsap.set(cardRef.current, { x: 0, y: 0, rotation: 0, opacity: 1 });
      if (!prefersReducedMotion()) {
        gsap.from(cardRef.current, { opacity: 0, y: 16, duration: 0.25, ease: 'power2.out' });
      }
    },
    { dependencies: [index, revealed], scope: cardRef },
  );

  const advance = (rating: ReviewRating, current: ReviewCard) => {
    reviewMutation.mutate({
      cardId: current.id,
      rating,
      latencyMs: revealedAt.current ? Date.now() - revealedAt.current : undefined,
    });
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

  const bindDrag = useDrag(
    ({ down, movement: [mx, my], last, cancel }) => {
      if (!revealed || !cardRef.current) return;
      if (!down) {
        const absX = Math.abs(mx);
        const absY = Math.abs(my);
        if (last && (absX > SWIPE_THRESHOLD || absY > SWIPE_THRESHOLD)) {
          const rating: ReviewRating = absX > absY ? (mx < 0 ? 'AGAIN' : 'GOOD') : my < 0 ? 'EASY' : 'HARD';
          cancel?.();
          rate(rating);
          return;
        }
        // Spring back when released without crossing the threshold.
        gsap.to(cardRef.current, { x: 0, y: 0, rotation: 0, duration: prefersReducedMotion() ? 0 : 0.3 });
        return;
      }
      if (prefersReducedMotion()) return;
      gsap.set(cardRef.current, { x: mx, y: my, rotation: mx / 20 });
    },
    {
      // Without this, touch browsers treat the drag as a page scroll
      // gesture alongside (or instead of) the card's own movement.
      eventOptions: { passive: false },
      preventScroll: true,
    },
  );

  const reveal = () => {
    revealedAt.current = Date.now();
    setRevealed(true);
  };

  // Auto-play the word's pronunciation as soon as a new card is shown.
  useEffect(() => {
    const el = autoplayRef.current;
    if (!el || !entry?.audioUrl) return;
    el.src = entry.audioUrl;
    void el.play().catch(() => {});
  }, [index, entry?.audioUrl]);

  // Keyboard shortcuts: Space/Enter reveals the answer; arrow keys mirror the
  // swipe gestures (← Again · → Good · ↑ Easy · ↓ Hard).
  useEffect(() => {
    if (!card) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (!revealed) {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          reveal();
        }
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
    <section aria-label="Review session" className="space-y-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-400">Review</h2>

      {isPending && <p aria-live="polite">Loading due cards…</p>}
      {isError && <p aria-live="polite" className="text-red-400">Couldn't load due cards.</p>}

      {queue && queue.length === 0 && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center shadow-lg shadow-black/20">
          <p>All caught up — nothing due right now.</p>
          <Link
            to="/courses"
            className="mt-4 inline-block min-h-11 rounded-xl border border-neutral-700 px-4 py-2.5 text-sm font-medium transition-colors hover:border-neutral-600 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Back to courses
          </Link>
        </div>
      )}

      {queue && queue.length > 0 && !card && (
        <SessionSummary
          stats={stats}
          onReviewMore={() => {
            setIndex(0);
            setStats({ AGAIN: 0, HARD: 0, GOOD: 0, EASY: 0 });
            void queryClient.invalidateQueries({ queryKey: ['due-cards', courseId] });
          }}
        />
      )}

      {queue && card && entry && (
        <>
          <p className="text-center text-sm text-neutral-500">
            {index + 1} / {queue.length}
          </p>

          {/* eslint-disable-next-line jsx-a11y/media-has-caption -- pronunciation autoplay, no spoken content beyond the word */}
          <audio ref={autoplayRef} className="hidden" />

          <div
            {...bindDrag()}
            ref={cardRef}
            role="group"
            aria-label="Flashcard"
            className="touch-none select-none rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-lg shadow-black/20"
          >
            <CardFront entry={entry} />
            {revealed && (
              <CardBack
                entry={entry}
                detail={detail}
                onSelectWord={(w) => navigate(`/word/${encodeURIComponent(w)}`)}
              />
            )}
          </div>

          {!revealed && (
            <button
              type="button"
              onClick={reveal}
              className="min-h-11 w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Show answer
            </button>
          )}

          {!revealed && (
            <p className="text-center text-xs text-neutral-500">Press Space or Enter to reveal</p>
          )}

          {revealed && (
            <div className="grid grid-cols-4 gap-2">
              {RATINGS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => rate(r)}
                  className={`min-h-11 rounded-xl border px-2 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${RATING_COLORS[r]}`}
                >
                  {RATING_LABELS[r]}
                </button>
              ))}
            </div>
          )}

          {revealed && (
            <p className="text-center text-xs text-neutral-500">
              Swipe or press arrow keys: ← Again · → Good · ↑ Easy · ↓ Hard
            </p>
          )}
        </>
      )}
    </section>
  );
}
