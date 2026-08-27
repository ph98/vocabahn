import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  STORY_TOPICS,
  isPresetTopic,
  topicLabel,
  type Story,
  type PodcastAccess,
  type StoryFormat,
  type StoryQuizResultItem,
  type StoryTarget,
  type SubmitStoryQuizAnswer,
} from '@vocabahn/shared';
import { isAxiosError } from 'axios';
import { ExternalLink, Headphones, Lock, Pause, Play, Sparkles } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  completeStory,
  createStory,
  fetchLatestStory,
  fetchMe,
  fetchPodcastAccess,
  fetchStory,
  fetchStoryQuota,
  interactStoryWord,
} from '../api';
import { useFadeIn } from '../lib/motion-gsap';
import { segmentStory } from '../lib/story-text';
import { trackEvent } from '../lib/telemetry';
import { IllustrationEmptyQueue } from './Illustrations';
import { PodcastPlayer } from './PodcastPlayer';
import { StoryQuizResultsView, StoryQuizStepper } from './StoryQuiz';
import { StoryWord } from './StoryWord';
import { UnsplashCredit } from './UnsplashCredit';

// Surviving a reload matters here: every story costs a generation from the
// learner's daily quota, so losing the reference would waste one. The server's
// /stories/latest is the durable answer; this is the fast path that avoids a
// round trip on reload, and the only one that works for a story still PENDING.
const STORY_ID_KEY = 'vocabahn-story-id';

const PRIMARY_BUTTON =
  'min-h-11 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/25 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo disabled:opacity-60';
const SECONDARY_BUTTON =
  'min-h-11 rounded-xl border border-surface-700 px-4 py-2.5 text-sm font-semibold text-surface-200 transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-indigo';

/**
 * Narration of the whole story. Unlike the dictionary's one-shot `AudioButton`,
 * this runs ~40 s, so it needs pause and a sense of position.
 */
function StoryAudio({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setFailed(false);
  }, [src]);

  const toggle = async () => {
    const el = ref.current;
    if (!el || failed) return;
    if (el.paused) {
      try {
        await el.play();
      } catch {
        setFailed(true);
      }
    } else {
      el.pause();
    }
  };

  if (failed) {
    return (
      <p className="text-sm text-surface-500">Narration is unavailable for this story.</p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause narration' : 'Play narration'}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-surface-700 text-surface-200 transition-colors hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
      </button>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-800" aria-hidden="true">
        <div
          className="h-full rounded-full bg-indigo-500 transition-[width] duration-200"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the German text is on the page as the transcript */}
      <audio
        ref={ref}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration > 0) setProgress(el.currentTime / el.duration);
        }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/**
 * Attribution for the real article a story retells. Not decoration: the learner
 * is being told something factual about the world, and they are entitled to see
 * who reported it and to go read the original.
 */
function SourceCredit({ source }: { source: NonNullable<Story['source']> }) {
  const published = source.publishedAt ? new Date(source.publishedAt) : null;

  return (
    <div className="mt-5 rounded-2xl border border-surface-800 bg-surface-950 p-4">
      <p className="text-xs uppercase tracking-wide text-surface-500">
        Retold from {source.name}
      </p>
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-flex items-start gap-1.5 text-sm text-accent-indigo underline underline-offset-4"
      >
        <span lang="de">{source.title}</span>
        <ExternalLink className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      {published && (
        <p className="mt-1 text-xs text-surface-500">
          <time dateTime={source.publishedAt ?? undefined}>
            {published.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </time>
        </p>
      )}
    </div>
  );
}

/**
 * A scene to anchor on before decoding the German. The alt text deliberately
 * does not describe the photo or restate the story: reading the German is the
 * exercise, and a screen-reader user should be told this is decoration for the
 * story, not handed a second version of it.
 */
function StoryImage({ image, title }: { image: NonNullable<Story['image']>; title: string | null }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [image.url]);

  // A photo Unsplash has since removed drops out entirely rather than leaving a
  // broken-image icon and an orphan credit above the text.
  if (failed) return null;

  return (
    <figure className="mt-4">
      {/* The aspect ratio is fixed on the element itself, so the box is the
          same size before the file arrives as after — nothing below it moves. */}
      <img
        src={image.url}
        alt={title ? `Illustration for the story: ${title}` : 'Illustration for this story'}
        loading="lazy"
        onError={() => setFailed(true)}
        className="aspect-[16/9] w-full rounded-2xl bg-surface-800 object-cover"
      />
      <UnsplashCredit
        authorName={image.authorName}
        authorUrl={image.authorUrl}
        photoUrl={image.sourceUrl}
      />
    </figure>
  );
}

/**
 * What the server is actually doing right now. The wait runs 20–35 s, which is
 * long enough that an unlabelled spinner reads as a hang; naming the step also
 * makes it obvious the text is finished well before the narration is.
 */
function GeneratingCard({ story }: { story: Story }) {
  const label =
    story.status === 'PENDING'
      ? 'Queued…'
      : story.stage === 'NARRATING'
        ? 'Recording the narration…'
        : story.source
          ? 'Rewriting the article at your level…'
          : 'Writing your story…';

  return (
    <div role="status" className="rounded-3xl border border-surface-800 bg-surface-900 p-8 shadow-xl">
      <p className="flex items-center gap-2 text-sm font-medium text-accent-amber">
        <span
          aria-hidden="true"
          className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none rounded-full border-[1.5px] border-accent-amber/30 border-t-accent-amber"
        />
        {label}
      </p>

      {/* The headline is known from the moment the source is picked, so it is
          shown while the retelling is still being written. */}
      {story.source && (
        <p className="mt-3 text-sm text-surface-400">
          From {story.source.name}: <span lang="de">{story.source.title}</span>
        </p>
      )}

      <div className="mt-5 space-y-3" aria-hidden="true">
        <div className="h-4 w-3/4 rounded skeleton-shimmer" />
        <div className="h-4 w-full rounded skeleton-shimmer" />
        <div className="h-4 w-5/6 rounded skeleton-shimmer" />
        <div className="h-4 w-2/3 rounded skeleton-shimmer" />
      </div>

      <p className="mt-5 text-xs text-surface-500">
        {story.stage === 'NARRATING'
          ? 'Almost there — the text is written.'
          : 'This takes about half a minute.'}
      </p>
    </div>
  );
}

/** Subject chooser. `null` means "use my interests", which is the default. */
function TopicPicker({
  value,
  onChange,
  disabled,
  userInterests = [],
}: {
  value: string | null;
  onChange: (topic: string | null) => void;
  disabled?: boolean;
  userInterests?: string[];
}) {
  const customInterests = userInterests.filter((item) => !isPresetTopic(item));
  const chip = (active: boolean) =>
    `min-h-9 rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50 ${
      active
        ? 'border-indigo-400 bg-indigo-500/15 text-indigo-200'
        : 'border-surface-700 text-surface-300 hover:border-surface-600 hover:bg-surface-800'
    }`;

  return (
    <fieldset disabled={disabled} className="mt-5">
      <legend className="sr-only">What should the story be about?</legend>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => onChange(null)} className={chip(value === null)} aria-pressed={value === null}>
          ✨ Surprise me
        </button>
        {customInterests.map((custom) => (
          <button
            key={custom}
            type="button"
            onClick={() => onChange(custom)}
            aria-pressed={value === custom}
            className={chip(value === custom)}
          >
            <span aria-hidden="true">🏷️</span> {custom}
          </button>
        ))}
        {STORY_TOPICS.map((topic) => (
          <button
            key={topic.slug}
            type="button"
            onClick={() => onChange(topic.slug)}
            aria-pressed={value === topic.slug}
            className={chip(value === topic.slug)}
          >
            <span aria-hidden="true">{topic.emoji}</span> {topic.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * What a learner sees when episodes are still locked.
 *
 * Deliberately shows the number rather than just refusing: the requirement is
 * something they are already moving towards every time they study, so the panel
 * is framed as a distance, not a denial. The bar is the same shape as the rest
 * of the app's progress so it reads as a goal they recognise.
 */
function PodcastLockedPanel({ access }: { access: PodcastAccess }) {
  const remaining = Math.max(0, access.required - access.knownWords);
  const pct = Math.min(100, Math.round((access.knownWords / access.required) * 100));

  return (
    <div className="mt-6 rounded-2xl border border-surface-800 bg-surface-950 p-5 text-left">
      <div className="flex items-center gap-2">
        <Lock className="size-4 shrink-0 text-surface-400" aria-hidden="true" />
        <p className="text-sm font-medium text-surface-200">
          {remaining} more known {remaining === 1 ? 'word' : 'words'} to unlock episodes
        </p>
      </div>

      <p className="mt-2 text-sm text-surface-400">
        An episode is five minutes of German with nothing to read along to. That only
        works once enough words are automatic — so it opens at {access.required}.
      </p>

      <div className="mt-4">
        <div
          className="h-2 overflow-hidden rounded-full bg-surface-800"
          role="progressbar"
          aria-valuenow={access.knownWords}
          aria-valuemin={0}
          aria-valuemax={access.required}
          aria-label="Progress towards unlocking episodes"
        >
          <div
            className="h-full rounded-full bg-indigo-500 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs tabular-nums text-surface-500">
          {access.knownWords} of {access.required} words known
        </p>
      </div>

      <Link
        to="/review"
        className="mt-4 inline-flex text-sm font-medium text-accent-indigo underline underline-offset-4"
      >
        Keep reviewing
      </Link>
    </div>
  );
}

export function StoryPage() {
  const queryClient = useQueryClient();
  const [localId, setLocalId] = useState<string | null>(() =>
    localStorage.getItem(STORY_ID_KEY),
  );
  // Set when the learner has finished one story and is choosing the next, so
  // the server's "most recent unfinished story" doesn't pull them back into it.
  const [choosing, setChoosing] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);
  // Which kind of episode the chooser is about to ask for. A story already in
  // progress renders in its own format regardless — this is the next one.
  const [format, setFormat] = useState<StoryFormat>('TEXT');
  const [customPrompt, setCustomPrompt] = useState('');
  const [notUnderstood, setNotUnderstood] = useState<Set<string>>(new Set());
  // Which occurrence has its popover open — a word appearing twice is two
  // triggers sharing one target, and only one popover is ever open.
  const [openWord, setOpenWord] = useState<string | null>(null);
  const [showEnglish, setShowEnglish] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [isTakingQuiz, setIsTakingQuiz] = useState(false);
  const [quizResults, setQuizResults] = useState<StoryQuizResultItem[] | null>(null);
  const [quizScore, setQuizScore] = useState<{ correct: number; total: number } | null>(null);
  const markedNoteId = useId();

  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
  });

  const { data: podcastAccess } = useQuery({
    queryKey: ['podcast-access'],
    queryFn: fetchPodcastAccess,
    staleTime: 60_000,
  });
  const podcastLocked = podcastAccess ? !podcastAccess.unlocked : false;

  const { data: quota } = useQuery({
    queryKey: ['story-quota', format],
    queryFn: () => fetchStoryQuota(format),
    staleTime: 30_000,
  });

  // What the scheduler left overnight. Also carries an unfinished story across
  // devices, which the localStorage id alone never could.
  const { data: latest, isPending: isLoadingLatest } = useQuery({
    queryKey: ['story-latest', format],
    queryFn: () => fetchLatestStory(format),
  });

  const storyId = choosing ? null : (localId ?? latest?.id ?? null);

  const {
    data: story,
    isPending: isLoadingStory,
    isError: isStoryError,
  } = useQuery({
    queryKey: ['story', storyId],
    queryFn: () => fetchStory(storyId!),
    enabled: !!storyId,
    // The server already sent the whole story when it answered /latest; seeding
    // avoids a second identical request just to render what we have.
    initialData: latest?.id === storyId ? latest : undefined,
    // Poll while the background job writes the story.
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === 'PENDING' || status === 'GENERATING' ? 4000 : false;
    },
  });

  const generate = useMutation({
    mutationFn: (vars: { topic?: string | null; prompt?: string; format?: StoryFormat }) =>
      createStory({
        topic: vars.topic ?? undefined,
        format: vars.format,
        // An empty or whitespace-only box means "no idea given", not an empty
        // prompt — the server reads absent as "write from the topic instead".
        prompt: vars.prompt?.trim() || undefined,
      }),
    onSuccess: (created) => {
      localStorage.setItem(STORY_ID_KEY, created.id);
      setLocalId(created.id);
      setChoosing(false);
      setNotUnderstood(new Set());
      setOpenWord(null);
      setShowEnglish(false);
      setIsTakingQuiz(false);
      setQuizResults(null);
      setQuizScore(null);
      queryClient.setQueryData(['story', created.id], created);
      void queryClient.invalidateQueries({ queryKey: ['story-quota'] });
      void queryClient.invalidateQueries({ queryKey: ['story-latest'] });
      trackEvent('story_generate', { topic: created.topic ?? 'none', sourced: !!created.source });
    },
    onError: (error) => {
      const status = isAxiosError(error) ? error.response?.status : undefined;
      trackEvent('story_generate_failed', {
        reason: status === 400 ? 'no_words' : status === 403 ? 'quota_exhausted' : 'error',
      });
    },
  });

  const finish = useMutation({
    mutationFn: (answers?: SubmitStoryQuizAnswer[]) =>
      completeStory(storyId!, [...notUnderstood], answers ?? []),
    onSuccess: (res) => {
      queryClient.setQueryData(['story', res.story.id], res.story);
      if (res.quizResults) setQuizResults(res.quizResults);
      if (res.score) setQuizScore(res.score);
      setIsTakingQuiz(false);
      // A completed story is no longer "waiting", so the cached answer is stale.
      void queryClient.invalidateQueries({ queryKey: ['story-latest'] });
      void queryClient.invalidateQueries({ queryKey: ['due-cards'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['known-words'] });
      trackEvent('story_complete', {
        target_count: res.story.targets.length,
        not_understood_count: notUnderstood.size,
        topic: res.story.topic ?? 'none',
      });
    },
  });

  const interact = useMutation({
    mutationFn: (vars: { entryId: string; action: 'CLICK_HARD' | 'DONT_KNOW_AGAIN' | 'RESET' }) =>
      interactStoryWord(storyId!, vars.entryId, vars.action),
    onSuccess: (_res, vars) => {
      trackEvent('story_word_interact', { action: vars.action, entryId: vars.entryId });
    },
  });

  const handleWordClick = (target: StoryTarget) => {
    if (!storyId || isCompleted) return;
    interact.mutate({ entryId: target.entryId, action: 'CLICK_HARD' });
  };

  const storyRef = useRef<HTMLDivElement>(null);
  useFadeIn(storyRef, [story?.status]);

  useEffect(() => {
    if (!story) return;
    if (story.status === 'GENERATING' || story.status === 'PENDING') {
      setAnnouncement(
        story.stage === 'NARRATING' ? 'Recording the narration…' : 'Writing your story…',
      );
    } else if (story.status === 'READY') {
      setAnnouncement(
        `Story ready: ${story.targets.length} words you are studying appear in it.`,
      );
    } else if (story.status === 'FAILED') {
      setAnnouncement("Your story couldn't be written.");
    }
  }, [story?.status, story?.stage, story?.targets.length]);

  /**
   * German with the studied words made tappable. Extracted so a podcast
   * transcript's turns and a story's single paragraph go through exactly the
   * same popover wiring — the words behave the same either way.
   */
  const renderGerman = (text: string, keyPrefix: string) =>
    segmentStory(text, story?.targets ?? []).map((part, i) => {
      const key = `${keyPrefix}-${i}`;
      return part.target ? (
        <StoryWord
          key={key}
          target={part.target}
          text={part.text}
          open={openWord === key}
          onOpenChange={(next) => setOpenWord(next ? key : null)}
          onWordClick={handleWordClick}
          marked={notUnderstood.has(part.target.entryId)}
          onToggleMark={() => toggleMark(part.target!)}
          markable={!isCompleted}
          markedNoteId={markedNoteId}
        />
      ) : (
        <span key={key}>{part.text}</span>
      );
    });

  const segments = useMemo(
    () => (story?.text ? segmentStory(story.text, story.targets) : []),
    [story?.text, story?.targets],
  );

  const isCompleted = !!story?.completedAt;

  /**
   * Records that a word didn't land / user doesn't know it.
   */
  const toggleMark = (target: StoryTarget) => {
    if (!storyId || isCompleted) return;
    setNotUnderstood((prev) => {
      const next = new Set(prev);
      if (next.has(target.entryId)) {
        next.delete(target.entryId);
        interact.mutate({ entryId: target.entryId, action: 'RESET' });
        setAnnouncement(`${target.word} unmarked.`);
      } else {
        next.add(target.entryId);
        interact.mutate({ entryId: target.entryId, action: 'DONT_KNOW_AGAIN' });
        setAnnouncement(`${target.word} marked as not known. ${target.translation ?? ''}`);
      }
      return next;
    });
  };

  /** Clears the current story and returns the learner to the topic chooser. */
  const startOver = () => {
    localStorage.removeItem(STORY_ID_KEY);
    setLocalId(null);
    setChoosing(true);
    setCustomPrompt('');
    setNotUnderstood(new Set());
    setOpenWord(null);
    setShowEnglish(false);
    setIsTakingQuiz(false);
    setQuizResults(null);
    setQuizScore(null);
  };

  const createError = generate.error;
  const noWords = isAxiosError(createError) && createError.response?.status === 400;
  const outOfQuota = isAxiosError(createError) && createError.response?.status === 403;

  return (
    <MotionConfig reducedMotion="user">
      <section aria-label="Story" className="space-y-5">
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-surface-400">Story</h2>
          {quota && (
            <p className="text-xs tabular-nums text-surface-500">
              {quota.cap - quota.used} of {quota.cap} left today
            </p>
          )}
        </div>

        {noWords && (
          <div className="rounded-3xl border border-surface-800 bg-surface-900 p-8 text-center shadow-xl">
            <IllustrationEmptyQueue className="mx-auto mb-4 w-32" />
            <p>No words to build a story from yet.</p>
            <p className="mt-1 text-sm text-surface-400">
              Enroll in a course or add a deck, and your studied words will show up here.
            </p>
            <Link to="/library" className={`mt-4 inline-block ${SECONDARY_BUTTON}`}>
              Browse the library
            </Link>
          </div>
        )}

        {outOfQuota && (
          <p role="status" className="text-sm text-accent-amber">
            You've used all {quota?.cap ?? 0} stories for today. Come back tomorrow.
          </p>
        )}

        {generate.isError && !noWords && !outOfQuota && (
          <p aria-live="polite" className="text-accent-red">
            Couldn't start a story. Please try again.
          </p>
        )}

        {/* Nothing waiting: let the learner describe what they want or pick a topic.
            Held back until /latest has answered, so a story written overnight
            isn't hidden behind a chooser for a frame. */}
        {!storyId && !noWords && !isLoadingLatest && (
          <div className="rounded-3xl border border-surface-800 bg-surface-900 p-6 sm:p-8 text-center shadow-xl">
            <h3 className="text-lg font-medium text-surface-100">
              {format === 'PODCAST' ? 'Create your German episode' : 'Create your German story'}
            </h3>
            <p className="mx-auto mt-2 max-w-prose text-sm text-surface-400">
              {format === 'PODCAST'
                ? "Two hosts talk for about five minutes at your level \u2014 mostly words you already know, with a few new ones they stop and explain."
                : "Describe what kind of story you want or pick a subject. We'll generate a personalized story at your level using words you're studying."}
            </p>

            {/* A segmented control rather than a toggle: both are things you can
                ask for, and neither is a modifier of the other. */}
            <div
              role="radiogroup"
              aria-label="What to generate"
              className="mx-auto mt-5 inline-flex rounded-xl border border-surface-700 bg-surface-950 p-1"
            >
              {(['TEXT', 'PODCAST'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={format === option}
                  onClick={() => setFormat(option)}
                  disabled={generate.isPending}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50 ${
                    format === option
                      ? 'bg-indigo-500 text-white'
                      : 'text-surface-400 hover:text-surface-200'
                  }`}
                >
                  {option === 'PODCAST' &&
                    (podcastLocked ? (
                      <Lock className="size-4" aria-hidden="true" />
                    ) : (
                      <Headphones className="size-4" aria-hidden="true" />
                    ))}
                  {option === 'TEXT' ? 'Read' : 'Listen'}
                </button>
              ))}
            </div>

            {format === 'PODCAST' && podcastLocked && podcastAccess ? (
              <PodcastLockedPanel access={podcastAccess} />
            ) : (
            <>
            <div className="mt-6 text-left">
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="story-custom-prompt"
                  className="text-xs font-semibold uppercase tracking-wider text-surface-400"
                >
                  {format === 'PODCAST' ? 'Describe your episode idea' : 'Describe your story idea'}{' '}
                  <span className="font-normal text-surface-500">(optional)</span>
                </label>
                {customPrompt.length > 0 && (
                  <span className="text-xs tabular-nums text-surface-500">
                    {500 - customPrompt.length} chars left
                  </span>
                )}
              </div>
              <textarea
                id="story-custom-prompt"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value.slice(0, 500))}
                disabled={generate.isPending}
                rows={3}
                placeholder="e.g. A mystery at a Leipzig train station, ordering pastries in a Munich café, a sci-fi adventure..."
                className="w-full rounded-2xl border border-surface-700 bg-surface-950 px-4 py-3 text-sm text-surface-100 placeholder:text-surface-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
              />
            </div>

            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-surface-400 text-left">
                Or pick a quick topic:
              </p>
              <TopicPicker
                value={topic}
                onChange={setTopic}
                disabled={generate.isPending}
                userInterests={user?.interests}
              />
            </div>

            <button
              type="button"
              onClick={() => generate.mutate({ topic, prompt: customPrompt, format })}
              disabled={generate.isPending}
              className={`mt-6 ${PRIMARY_BUTTON}`}
            >
              {generate.isPending
                ? 'Starting…'
                : format === 'PODCAST'
                  ? customPrompt.trim()
                    ? 'Make an episode from my idea'
                    : topic
                      ? `Make an episode about ${topicLabel(topic)?.toLowerCase()}`
                      : 'Make me an episode'
                  : customPrompt.trim()
                    ? 'Write story from idea'
                    : topic
                      ? `Read about ${topicLabel(topic)?.toLowerCase()}`
                      : 'Find me something to read'}
            </button>
            </>
            )}
          </div>
        )}

        {(isLoadingLatest || (storyId && isLoadingStory)) && (
          <p aria-live="polite" className="text-sm text-surface-400">
            Loading your story…
          </p>
        )}
        {storyId && isStoryError && (
          <p aria-live="polite" className="text-accent-red">
            Couldn't load your story.
          </p>
        )}

        {(story?.status === 'PENDING' || story?.status === 'GENERATING') && (
          <GeneratingCard story={story} />
        )}

        {story?.status === 'FAILED' && (
          <div className="rounded-3xl border border-surface-800 bg-surface-900 p-8 text-center shadow-xl">
            <p className="text-accent-red">Your story couldn't be written.</p>
            <p className="mt-1 text-sm text-surface-400">
              This usually clears up on a second try.
            </p>
            <button
              type="button"
              onClick={() => {
                startOver();
                generate.mutate({
                  topic: story.topic ?? null,
                  prompt: story.prompt ?? undefined,
                  format: story.format,
                });
              }}
              className={`mt-4 ${PRIMARY_BUTTON}`}
            >
              Try again
            </button>
          </div>
        )}

        {story?.status === 'READY' && (
          <div ref={storyRef} className="space-y-4">
            {!isTakingQuiz && (
              <article className="rounded-3xl border border-surface-800 bg-surface-900 p-6 shadow-xl sm:p-8">
                {/* A story the scheduler wrote is framed as something that was
                    waiting, not something the learner just triggered. */}
                {story.origin === 'DAILY' && (
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-indigo-300">
                    Today's read
                  </p>
                )}

                {story.prompt && (
                  <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">
                    <Sparkles className="size-3.5 shrink-0 text-indigo-400" aria-hidden="true" />
                    <span className="truncate max-w-sm sm:max-w-md">Idea: &ldquo;{story.prompt}&rdquo;</span>
                  </div>
                )}

                {story.title && (
                  <h3 lang="de" className="font-serif text-xl font-semibold">
                    {story.title}
                  </h3>
                )}

                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs uppercase tracking-wide text-surface-500">
                  {story.topic && <span>{topicLabel(story.topic)}</span>}
                  {story.topic && story.cefrLevel && <span aria-hidden="true">·</span>}
                  {story.cefrLevel && <span>Level {story.cefrLevel}</span>}
                </p>

                {/* Null for every story written before this existed, and for any
                    whose lookup failed — a normal state, rendered as nothing. */}
                {story.image && <StoryImage image={story.image} title={story.title} />}

                {story.audioUrl && (
                  <div className="mt-4">
                    <StoryAudio src={story.audioUrl} />
                  </div>
                )}

                {story.format === 'PODCAST' && story.segments.length > 0 ? (
                  <div className="mt-4">
                    <PodcastPlayer
                      segments={story.segments}
                      renderText={renderGerman}
                      showEnglish={showEnglish}
                    />
                  </div>
                ) : (
                  <p lang="de" className="mt-4 text-lg leading-relaxed">
                    {segments.map((segment, i) =>
                      segment.target ? (
                        <StoryWord
                          key={i}
                          target={segment.target}
                          text={segment.text}
                          open={openWord === String(i)}
                          onOpenChange={(next) => setOpenWord(next ? String(i) : null)}
                          onWordClick={handleWordClick}
                          marked={notUnderstood.has(segment.target.entryId)}
                          onToggleMark={() => toggleMark(segment.target!)}
                          markable={!isCompleted}
                          markedNoteId={markedNoteId}
                        />
                      ) : (
                        <span key={i}>{segment.text}</span>
                      ),
                    )}
                  </p>
                )}
                {/* Described, not named: the word's accessible name has to stay
                    the German surface form. One node, shared by every marked
                    trigger, and outside the lang="de" paragraph. */}
                <span id={markedNoteId} className="sr-only">
                  Marked as didn't land
                </span>

                {story.translation && (
                  <div className="mt-6 border-t border-surface-800 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowEnglish((v) => !v)}
                      aria-expanded={showEnglish}
                      className="text-sm font-medium text-accent-indigo underline underline-offset-4"
                    >
                      {showEnglish ? 'Hide English' : 'Show English'}
                    </button>
                    {showEnglish && (
                      <p className="mt-3 leading-relaxed text-surface-300">{story.translation}</p>
                    )}
                  </div>
                )}

                {story.source && <SourceCredit source={story.source} />}
              </article>
            )}

            {!isCompleted && isTakingQuiz && (
              <StoryQuizStepper
                questions={story.quiz ?? []}
                onComplete={(answers) => finish.mutate(answers)}
                onCancel={() => setIsTakingQuiz(false)}
                isSubmitting={finish.isPending}
              />
            )}

            {!isCompleted && !isTakingQuiz && (
              <div className="flex flex-wrap items-center gap-3">
                {story.quiz && story.quiz.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsTakingQuiz(true)}
                      className={`inline-flex items-center gap-2 ${PRIMARY_BUTTON}`}
                    >
                      <Sparkles className="size-4" aria-hidden="true" />
                      Take Story Quiz ({story.quiz.length} questions)
                    </button>
                    <button
                      type="button"
                      onClick={() => finish.mutate(undefined)}
                      disabled={finish.isPending}
                      className="min-h-11 rounded-xl border border-surface-700 px-4 py-2.5 text-xs text-surface-400 transition-colors hover:border-surface-600 hover:bg-surface-800 hover:text-surface-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                      {finish.isPending ? 'Saving…' : 'Skip quiz & finish'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => finish.mutate(undefined)}
                    disabled={finish.isPending}
                    className={PRIMARY_BUTTON}
                  >
                    {finish.isPending ? 'Saving…' : 'Finish reading'}
                  </button>
                )}
                <p className="text-sm text-surface-400">
                  {notUnderstood.size === 0
                    ? `${story.targets.length} of your words are in here.`
                    : `${notUnderstood.size} marked as didn't land.`}
                </p>
              </div>
            )}

            {finish.isError && (
              <p aria-live="polite" className="text-accent-red">
                Couldn't save your answers. Please try again.
              </p>
            )}

            {isCompleted && (
              <StoryQuizResultsView
                score={quizScore ?? undefined}
                quizResults={quizResults ?? undefined}
                questions={story.quiz}
                targets={story.targets}
                notUnderstood={notUnderstood}
                onStartOver={startOver}
              />
            )}
          </div>
        )}
      </section>
    </MotionConfig>
  );
}
