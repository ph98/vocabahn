import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STORY_TOPICS, topicLabel, type Story, type StoryTarget } from '@vocabahn/shared';
import { isAxiosError } from 'axios';
import { ExternalLink, Pause, Play } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  completeStory,
  createStory,
  fetchLatestStory,
  fetchStory,
  fetchStoryQuota,
} from '../api';
import { useFadeIn } from '../lib/motion';
import { segmentStory } from '../lib/story-text';
import { trackEvent } from '../lib/telemetry';
import { IllustrationEmptyQueue } from './Illustrations';
import { UnsplashCredit } from './UnsplashCredit';

// Surviving a reload matters here: every story costs a generation from the
// learner's daily quota, so losing the reference would waste one. The server's
// /stories/latest is the durable answer; this is the fast path that avoids a
// round trip on reload, and the only one that works for a story still PENDING.
const STORY_ID_KEY = 'vocabahn-story-id';

const PRIMARY_BUTTON =
  'min-h-11 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-indigo-950/50 transition-colors hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60';
const SECONDARY_BUTTON =
  'min-h-11 rounded-xl border border-surface-700 px-4 py-2.5 text-sm font-medium transition-colors hover:border-surface-600 hover:bg-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

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
}: {
  value: string | null;
  onChange: (topic: string | null) => void;
  disabled?: boolean;
}) {
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

export function StoryPage() {
  const queryClient = useQueryClient();
  const [localId, setLocalId] = useState<string | null>(() =>
    localStorage.getItem(STORY_ID_KEY),
  );
  // Set when the learner has finished one story and is choosing the next, so
  // the server's "most recent unfinished story" doesn't pull them back into it.
  const [choosing, setChoosing] = useState(false);
  const [topic, setTopic] = useState<string | null>(null);
  const [notUnderstood, setNotUnderstood] = useState<Set<string>>(new Set());
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [showEnglish, setShowEnglish] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const { data: quota } = useQuery({
    queryKey: ['story-quota'],
    queryFn: fetchStoryQuota,
    staleTime: 30_000,
  });

  // What the scheduler left overnight. Also carries an unfinished story across
  // devices, which the localStorage id alone never could.
  const { data: latest, isPending: isLoadingLatest } = useQuery({
    queryKey: ['story-latest'],
    queryFn: fetchLatestStory,
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
    mutationFn: (chosen: string | null) => createStory(chosen ?? undefined),
    onSuccess: (created) => {
      localStorage.setItem(STORY_ID_KEY, created.id);
      setLocalId(created.id);
      setChoosing(false);
      setNotUnderstood(new Set());
      setActiveEntryId(null);
      setShowEnglish(false);
      queryClient.setQueryData(['story', created.id], created);
      void queryClient.invalidateQueries({ queryKey: ['story-quota'] });
      void queryClient.invalidateQueries({ queryKey: ['story-latest'] });
      trackEvent('story_create', { topic: created.topic ?? 'none', sourced: !!created.source });
    },
  });

  const finish = useMutation({
    mutationFn: () => completeStory(storyId!, [...notUnderstood]),
    onSuccess: (completed) => {
      queryClient.setQueryData(['story', completed.id], completed);
      // A completed story is no longer "waiting", so the cached answer is stale.
      void queryClient.invalidateQueries({ queryKey: ['story-latest'] });
      trackEvent('story_complete', {
        targets: completed.targets.length,
        not_understood: notUnderstood.size,
        topic: completed.topic ?? 'none',
      });
    },
  });

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

  const segments = useMemo(
    () => (story?.text ? segmentStory(story.text, story.targets) : []),
    [story?.text, story?.targets],
  );

  const activeTarget = story?.targets.find((t) => t.entryId === activeEntryId) ?? null;
  const isCompleted = !!story?.completedAt;

  const toggleTarget = (target: StoryTarget) => {
    setActiveEntryId((current) => (current === target.entryId ? null : target.entryId));
    setNotUnderstood((prev) => {
      const next = new Set(prev);
      if (next.has(target.entryId)) {
        next.delete(target.entryId);
        setAnnouncement(`${target.word} unmarked.`);
      } else {
        next.add(target.entryId);
        setAnnouncement(`${target.word} marked as didn't land. ${target.translation ?? ''}`);
      }
      return next;
    });
  };

  /** Clears the current story and returns the learner to the topic chooser. */
  const startOver = () => {
    localStorage.removeItem(STORY_ID_KEY);
    setLocalId(null);
    setChoosing(true);
    setNotUnderstood(new Set());
    setActiveEntryId(null);
    setShowEnglish(false);
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

        {/* Nothing waiting: let the learner pick what today's read is about.
            Held back until /latest has answered, so a story written overnight
            isn't hidden behind a chooser for a frame. */}
        {!storyId && !noWords && !isLoadingLatest && (
          <div className="rounded-3xl border border-surface-800 bg-surface-900 p-8 text-center shadow-xl">
            <p className="text-lg font-medium">Read today's news in German</p>
            <p className="mx-auto mt-2 max-w-prose text-sm text-surface-400">
              Pick a subject and we'll retell a real German article at your level, using the
              words you're studying. Tap any word that doesn't land as you read.
            </p>

            <TopicPicker value={topic} onChange={setTopic} disabled={generate.isPending} />

            <button
              type="button"
              onClick={() => generate.mutate(topic)}
              disabled={generate.isPending}
              className={`mt-6 ${PRIMARY_BUTTON}`}
            >
              {generate.isPending
                ? 'Starting…'
                : topic
                  ? `Read about ${topicLabel(topic)?.toLowerCase()}`
                  : 'Find me something to read'}
            </button>
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
                generate.mutate(story.topic ?? null);
              }}
              className={`mt-4 ${PRIMARY_BUTTON}`}
            >
              Try again
            </button>
          </div>
        )}

        {story?.status === 'READY' && (
          <div ref={storyRef} className="space-y-4">
            <article className="rounded-3xl border border-surface-800 bg-surface-900 p-6 shadow-xl sm:p-8">
              {/* A story the scheduler wrote is framed as something that was
                  waiting, not something the learner just triggered. */}
              {story.origin === 'DAILY' && (
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-indigo-300">
                  Today's read
                </p>
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

              <p lang="de" className="mt-4 text-lg leading-relaxed">
                {segments.map((segment, i) =>
                  segment.target ? (
                    <button
                      key={i}
                      type="button"
                      lang="de"
                      aria-pressed={notUnderstood.has(segment.target.entryId)}
                      onClick={() => toggleTarget(segment.target!)}
                      className={`rounded underline decoration-dotted underline-offset-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                        notUnderstood.has(segment.target.entryId)
                          ? 'bg-accent-amber/20 text-accent-amber decoration-accent-amber'
                          : 'decoration-surface-500 hover:bg-surface-800'
                      }`}
                    >
                      {segment.text}
                    </button>
                  ) : (
                    <span key={i}>{segment.text}</span>
                  ),
                )}
              </p>

              {activeTarget && (
                <div className="mt-5 rounded-2xl border border-surface-800 bg-surface-950 p-4">
                  <p className="flex items-center gap-2">
                    {activeTarget.emoji && <span aria-hidden="true">{activeTarget.emoji}</span>}
                    <span lang="de" className="font-medium">
                      {activeTarget.word}
                    </span>
                    {activeTarget.translation && (
                      <span className="text-surface-400">— {activeTarget.translation}</span>
                    )}
                  </p>
                  <Link
                    to={`/word/${encodeURIComponent(activeTarget.word)}`}
                    className="mt-2 inline-block text-sm text-accent-indigo underline underline-offset-4"
                  >
                    Open full entry
                  </Link>
                </div>
              )}

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

            {!isCompleted && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => finish.mutate()}
                  disabled={finish.isPending}
                  className={PRIMARY_BUTTON}
                >
                  {finish.isPending ? 'Saving…' : 'Finish reading'}
                </button>
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
              <div
                role="status"
                className="rounded-2xl border border-surface-800 bg-surface-900 p-5 shadow-lg shadow-black/20"
              >
                <p className="font-medium">
                  {notUnderstood.size === 0
                    ? `All ${story.targets.length} words landed.`
                    : `${notUnderstood.size} of ${story.targets.length} words didn't land.`}
                </p>
                {notUnderstood.size > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {story.targets
                      .filter((t) => notUnderstood.has(t.entryId))
                      .map((t) => (
                        <li key={t.entryId}>
                          <Link
                            lang="de"
                            to={`/word/${encodeURIComponent(t.word)}`}
                            className="inline-block rounded-lg bg-surface-800 px-3 py-1.5 text-sm underline underline-offset-4"
                          >
                            {t.word}
                          </Link>
                        </li>
                      ))}
                  </ul>
                )}
                {/* Back to the chooser rather than straight into another
                    generation: the subject is most of why they'd read a second
                    one, and rerolling it blind spends quota on a guess. */}
                <button
                  type="button"
                  onClick={startOver}
                  disabled={generate.isPending}
                  className={`mt-4 ${SECONDARY_BUTTON}`}
                >
                  Read something else
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </MotionConfig>
  );
}
