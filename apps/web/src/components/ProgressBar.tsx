import type { Progress } from '@vocabahn/shared';
import { FollowTooltip, useFollowTooltip } from './FollowTooltip';

type BucketKey = keyof Progress;

interface Bucket {
  key: BucketKey;
  label: string;
  /** What the bucket means, shown in the tooltip. Says out loud where lapsed words go. */
  definition: string;
  segment: string;
  swatch: string;
}

const BUCKETS: Bucket[] = [
  {
    key: 'learned',
    label: 'Learned',
    definition: 'Answered well enough to graduate, or marked as known. Not scheduled again.',
    segment: 'bg-gradient-to-r from-emerald-500 to-emerald-400',
    swatch: 'bg-emerald-400',
  },
  {
    key: 'inProgress',
    label: 'In progress',
    definition: 'Being studied now — including words you lapsed on and are relearning.',
    segment: 'bg-gradient-to-r from-amber-400 to-amber-300',
    swatch: 'bg-amber-300',
  },
  {
    key: 'notStarted',
    label: 'Not started',
    definition: 'Never shown to you yet.',
    segment: 'bg-surface-700',
    swatch: 'bg-surface-600',
  },
];

interface Slice extends Bucket {
  count: number;
  /** Percentage of the collection, rounded so the three always sum to exactly 100. */
  percent: number;
  remainder: number;
}

/** Largest-remainder rounding: three percentages that add up to 100, so the legend never reads 101%. */
function toSlices(progress: Progress, total: number): Slice[] {
  const slices = BUCKETS.map((bucket) => {
    const count = progress[bucket.key];
    const raw = (count / total) * 100;
    return { ...bucket, count, percent: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });

  let leftover = 100 - slices.reduce((sum, s) => sum + s.percent, 0);
  for (const slice of [...slices].sort((a, b) => b.remainder - a.remainder)) {
    if (leftover <= 0) break;
    slice.percent += 1;
    leftover -= 1;
  }

  return slices;
}

/**
 * Stacked progress bar with the counts spelled out beside it. The numbers and
 * the legend are always visible — the tooltip only adds what each bucket means.
 *
 * `progress === null` (an unenrolled course) renders a distinct "not tracked"
 * placeholder, so "no data" never looks like "0% complete".
 */
export function ProgressBar({
  progress,
  emptyLabel = 'Progress is tracked once you enrol.',
}: {
  progress: Progress | null;
  emptyLabel?: string;
}) {
  const tooltip = useFollowTooltip<Slice>();

  if (!progress) {
    return (
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded-full border border-dashed border-surface-700 bg-transparent" />
        <p className="text-xs text-surface-500">{emptyLabel}</p>
      </div>
    );
  }

  const total = progress.learned + progress.inProgress + progress.notStarted;
  if (total === 0) {
    return (
      <div className="space-y-1.5">
        <div className="h-3 w-full rounded-full border border-dashed border-surface-700 bg-transparent" />
        <p className="text-xs text-surface-500">No words in here yet.</p>
      </div>
    );
  }

  const slices = toSlices(progress, total);

  return (
    <div className="space-y-2">
      <div
        role="img"
        aria-label={`${progress.learned} learned, ${progress.inProgress} in progress, ${progress.notStarted} not started`}
        className="flex h-3 w-full overflow-hidden rounded-full bg-surface-800 p-0.5"
      >
        {slices.map(
          (slice) =>
            slice.count > 0 && (
              <span
                key={slice.key}
                aria-hidden="true"
                className={`relative h-full overflow-hidden rounded-full ${slice.segment}`}
                style={{ width: `${(slice.count / total) * 100}%` }}
                onMouseMove={(e) => tooltip.showAtPointer(e, slice.key, slice)}
                onMouseLeave={tooltip.hide}
              >
                {slice.key !== 'notStarted' && (
                  <span className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)] motion-reduce:hidden motion-reduce:animate-none" />
                )}
              </span>
            ),
        )}
      </div>

      <ul className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
        {slices.map((slice) => (
          <li key={slice.key}>
            {/*
              A focusable trigger so the tooltip is keyboard-reachable. It has no
              click action by design: every number it reveals is already on screen,
              and the tooltip is presentation only.
            */}
            <button
              type="button"
              aria-describedby={tooltip.openKey === slice.key ? tooltip.id : undefined}
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs transition-colors hover:bg-surface-800/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onMouseMove={(e) => tooltip.showAtPointer(e, slice.key, slice)}
              onMouseLeave={tooltip.hide}
              onFocus={(e) => tooltip.showAtElement(e.currentTarget, slice.key, slice)}
              onBlur={tooltip.hide}
            >
              <span className={`size-2.5 shrink-0 rounded-full ${slice.swatch}`} aria-hidden="true" />
              <span className="text-surface-400">{slice.label}</span>
              <span className="font-semibold tabular-nums text-surface-200">{slice.count}</span>
              <span className="tabular-nums text-surface-500">{slice.percent}%</span>
            </button>
          </li>
        ))}
      </ul>

      <FollowTooltip controller={tooltip} className="max-w-[15rem]">
        {tooltip.value && (
          <>
            {/* The counts are already the trigger's accessible name — don't say them twice. */}
            <div aria-hidden="true" className="font-bold text-surface-100">
              {tooltip.value.label}: {tooltip.value.count} word{tooltip.value.count !== 1 && 's'} ({tooltip.value.percent}%)
            </div>
            <div className="mt-0.5 text-surface-400">{tooltip.value.definition}</div>
          </>
        )}
      </FollowTooltip>
    </div>
  );
}
