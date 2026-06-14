import type { CourseSummary } from '@vocabahn/shared';

export function ProgressBar({ progress, wordCount }: { progress: CourseSummary['progress']; wordCount: number }) {
  if (!progress || wordCount === 0) return null;
  const pct = (n: number) => `${(n / wordCount) * 100}%`;
  return (
    <div
      role="img"
      aria-label={`${progress.learned} learned, ${progress.inProgress} in progress, ${progress.notStarted} not started`}
      className="flex h-2 w-full overflow-hidden rounded-full bg-neutral-800"
    >
      <span className="bg-emerald-400" style={{ width: pct(progress.learned) }} />
      <span className="bg-amber-300" style={{ width: pct(progress.inProgress) }} />
    </div>
  );
}
