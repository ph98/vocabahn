import type { CourseSummary } from '@vocabahn/shared';

export function ProgressBar({ progress, wordCount }: { progress: CourseSummary['progress']; wordCount: number }) {
  if (!progress || wordCount === 0) return null;
  const pct = (n: number) => `${(n / wordCount) * 100}%`;
  return (
    <div
      role="img"
      aria-label={`${progress.learned} learned, ${progress.inProgress} in progress, ${progress.notStarted} not started`}
      className="flex h-3 w-full overflow-hidden rounded-full bg-surface-800"
    >
      <span className="relative overflow-hidden bg-emerald-400" style={{ width: pct(progress.learned) }}>
        <span className="absolute inset-0 -translate-x-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)] animate-[shimmer_2s_infinite]" />
      </span>
      <span className="relative overflow-hidden bg-amber-300" style={{ width: pct(progress.inProgress) }}>
        <span className="absolute inset-0 -translate-x-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)] animate-[shimmer_2s_infinite_0.5s]" />
      </span>
    </div>
  );
}
