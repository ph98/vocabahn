import type { PodcastSegment } from '@vocabahn/shared';
import { Pause, Play, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A podcast episode: the audio, and a transcript that follows it.
 *
 * The episode is many small files rather than one long one, because that is how
 * it was synthesized — a five-minute script is far past what a text-to-speech
 * request accepts, and one file per turn also lets the two hosts use two
 * voices. Playing them as a playlist turns that constraint into the feature:
 * the transcript knows which turn is sounding without a single timestamp,
 * because the turn *is* the unit of playback. `ended` advances to the next one.
 *
 * Turns whose synthesis failed are still readable and are simply skipped by the
 * audio, exactly as a story without narration is still a story.
 */
export function PodcastPlayer({
  segments,
  renderText,
  showEnglish,
}: {
  segments: PodcastSegment[];
  /** Renders German with the studied words tappable. Owned by StoryPage. */
  renderText: (text: string, keyPrefix: string) => ReactNode;
  showEnglish: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  // Set once the learner has pressed play, so the first turn does not autoplay
  // on mount and the browser never has to block it.
  const started = useRef(false);
  const turnRefs = useRef<(HTMLLIElement | null)[]>([]);

  const playable = segments.filter((s) => s.audioUrl).length;
  const currentSrc = segments[current]?.audioUrl ?? null;

  // Advancing changes the <audio> src, which needs an explicit play() — the
  // element does not resume on its own after a source swap.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !started.current || !playing) return;
    el.play().catch(() => setFailed(true));
  }, [current, playing]);

  // Keep the sounding turn in view, but never yank the page while the learner
  // is reading somewhere else — only when playback moved it.
  useEffect(() => {
    if (!playing) return;
    turnRefs.current[current]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [current, playing]);

  /** The next turn that actually has audio, or null at the end of the episode. */
  function nextPlayable(from: number): number | null {
    for (let i = from; i < segments.length; i++) {
      if (segments[i]?.audioUrl) return i;
    }
    return null;
  }

  function toggle() {
    const el = audioRef.current;
    if (!el || failed || playable === 0) return;

    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    started.current = true;
    const target = segments[current]?.audioUrl ? current : nextPlayable(current);
    if (target === null) return;
    setCurrent(target);
    setPlaying(true);
    el.play().catch(() => setFailed(true));
  }

  function jumpTo(index: number) {
    started.current = true;
    setCurrent(index);
    if (!segments[index]?.audioUrl) {
      setPlaying(false);
      return;
    }
    setPlaying(true);
  }

  return (
    <div>
      <div className="sticky top-2 z-10 mb-5 flex items-center gap-3 rounded-2xl border border-surface-800 bg-surface-900/95 p-3 backdrop-blur">
        <button
          type="button"
          onClick={toggle}
          disabled={playable === 0 || failed}
          aria-label={playing ? 'Pause episode' : 'Play episode'}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
        >
          {playing ? (
            <Pause className="size-4" aria-hidden="true" />
          ) : (
            <Play className="size-4" aria-hidden="true" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-800"
            role="progressbar"
            aria-valuenow={current + 1}
            aria-valuemin={1}
            aria-valuemax={segments.length}
            aria-label="Episode progress"
          >
            <div
              className="h-full rounded-full bg-indigo-500 transition-[width] duration-300"
              style={{ width: `${((current + 1) / Math.max(segments.length, 1)) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-surface-500">
            {failed || playable === 0
              ? 'Audio is unavailable for this episode — the transcript is below.'
              : `Turn ${current + 1} of ${segments.length}`}
          </p>
        </div>
      </div>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the transcript is on the page */}
      <audio
        ref={audioRef}
        src={currentSrc ?? undefined}
        preload="metadata"
        onEnded={() => {
          const next = nextPlayable(current + 1);
          if (next === null) {
            setPlaying(false);
            setCurrent(0);
            return;
          }
          setCurrent(next);
        }}
        onError={() => {
          // One missing file must not end the episode — step over it.
          const next = nextPlayable(current + 1);
          if (next === null) {
            setPlaying(false);
          } else {
            setCurrent(next);
          }
        }}
      />

      <ol className="space-y-3">
        {segments.map((seg, i) => {
          const isCurrent = i === current;
          const isVocab = seg.kind === 'VOCAB';
          return (
            <li
              key={seg.order}
              ref={(el) => {
                turnRefs.current[i] = el;
              }}
              aria-current={isCurrent ? 'true' : undefined}
              className={`rounded-2xl border p-4 transition-colors ${
                isCurrent
                  ? 'border-indigo-500/50 bg-indigo-500/10'
                  : isVocab
                    ? 'border-surface-800 bg-surface-950'
                    : 'border-transparent bg-surface-900/40'
              }`}
            >
              <div className="mb-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => jumpTo(i)}
                  className="text-xs font-semibold uppercase tracking-wider text-surface-400 transition-colors hover:text-surface-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {seg.speaker === 'HOST_A' ? 'Host' : 'Co-host'}
                  <span className="sr-only"> — play from here</span>
                </button>
                {isVocab && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-300">
                    <Sparkles className="size-3 shrink-0" aria-hidden="true" />
                    {seg.focusWord ?? 'New word'}
                  </span>
                )}
              </div>

              <p lang="de" className="font-serif text-base leading-relaxed">
                {renderText(seg.text, `s${seg.order}`)}
              </p>

              {showEnglish && seg.translation && (
                <p className="mt-2 text-sm italic text-surface-400">{seg.translation}</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
