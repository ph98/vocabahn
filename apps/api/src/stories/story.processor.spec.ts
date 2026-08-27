import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnsplashProvider } from '../images/unsplash.provider';
import type { PrismaService } from '../prisma/prisma.service';
import type { TtsProvider } from '../tts/tts.provider';
import type { StoryProvider } from './providers/story.provider';
import type { StoryJobData } from './stories.constants';
import { StoryProcessor } from './story.processor';

// Three studied words that all really occur in the generated text, so
// validateTargets passes and the run reaches the write.
const TEXT = 'Anna wartet am Bahnhof. Der Zug ist grün. Das Haus ist alt.';

const GENERATED = {
  title: 'Am Bahnhof',
  text: TEXT,
  translation: 'Anna waits at the station. The train is green. The house is old.',
  imageQuery: 'train station platform morning',
  targets: [
    { word: 'Bahnhof', surfaceForm: 'Bahnhof' },
    { word: 'grün', surfaceForm: 'grün' },
    { word: 'Haus', surfaceForm: 'Haus' },
  ],
};

const PHOTO = {
  imageUrl: 'https://images.unsplash.com/photo-1',
  authorName: 'Ada Fotograf',
  authorUrl: 'https://unsplash.com/@ada',
  sourceUrl: 'https://unsplash.com/photos/abc',
};

/**
 * A minimal episode: enough turns to clear PODCAST_MIN_SEGMENTS, both hosts,
 * and one VOCAB turn carrying a focus word.
 */
const EPISODE = {
  title: 'Der Bahnhof',
  imageQuery: 'train station platform morning',
  segments: [
    { speaker: 'HOST_A', kind: 'INTRO', text: 'Hallo und willkommen!', translation: 'Hello and welcome!', focusWord: null },
    { speaker: 'HOST_B', kind: 'INTRO', text: 'Schön, dass du da bist.', translation: 'Good to have you.', focusWord: null },
    { speaker: 'HOST_A', kind: 'TOPIC', text: 'Heute geht es um den Bahnhof.', translation: 'Today is about the station.', focusWord: null },
    { speaker: 'HOST_B', kind: 'VOCAB', text: 'Was bedeutet Bahnhof?', translation: 'What does Bahnhof mean?', focusWord: 'Bahnhof' },
    { speaker: 'HOST_A', kind: 'TOPIC', text: 'Das Haus ist grün.', translation: 'The house is green.', focusWord: null },
    { speaker: 'HOST_B', kind: 'RECAP', text: 'Bis zum nächsten Mal!', translation: 'Until next time!', focusWord: null },
  ],
  targets: [
    { word: 'Bahnhof', surfaceForm: 'Bahnhof' },
    { word: 'Haus', surfaceForm: 'Haus' },
    { word: 'grün', surfaceForm: 'grün' },
  ],
  quiz: [],
};

const PODCAST_JOB = {
  data: { storyId: 'story-1' },
  attemptsMade: 0,
  opts: { attempts: 3 },
} as unknown as Job<StoryJobData>;

const JOB = {
  data: { storyId: 'story-1' },
  attemptsMade: 0,
  opts: { attempts: 3 },
} as unknown as Job<StoryJobData>;

describe('StoryProcessor', () => {
  let prisma: {
    story: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    storyTarget: { deleteMany: ReturnType<typeof vi.fn> };
    storyQuizQuestion: { deleteMany: ReturnType<typeof vi.fn> };
    storySegment: { deleteMany: ReturnType<typeof vi.fn> };
    card: { findMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let storyProvider: {
    generate: ReturnType<typeof vi.fn>;
    generatePodcast: ReturnType<typeof vi.fn>;
  };
  let tts: { synthesize: ReturnType<typeof vi.fn> };
  let unsplash: { search: ReturnType<typeof vi.fn> };
  let processor: StoryProcessor;

  /** The `data` the processor wrote in its final, story-completing update. */
  function writtenStory(): Record<string, unknown> {
    const call = prisma.story.update.mock.calls.find(
      (c) => (c[0] as { data: { status?: string } }).data.status === 'READY',
    );
    return (call![0] as { data: Record<string, unknown> }).data;
  }

  beforeEach(() => {
    prisma = {
      story: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'story-1',
          userId: 'user-1',
          cefrLevel: 'A2.1',
          topic: 'everyday',
          prompt: 'A detective looking for a cat',
          sourceTitle: null,
          sourceUrl: null,
          sourceName: null,
          sourceItem: null,
          targets: [
            { dictionaryEntry: { id: 'e1', word: 'Bahnhof', translation: 'station' } },
            { dictionaryEntry: { id: 'e2', word: 'grün', translation: 'green' } },
            { dictionaryEntry: { id: 'e3', word: 'Haus', translation: 'house' } },
          ],
        }),
        findMany: vi.fn().mockResolvedValue([
          {
            title: 'Vorige Geschichte',
            topic: 'travel',
            prompt: 'An adventure in Berlin',
            text: 'Das war ein spannender Tag in Berlin.',
          },
        ]),
        // Returns the argument so the transaction's promises resolve to
        // something inspectable.
        update: vi.fn().mockImplementation((args: unknown) => Promise.resolve(args)),
      },
      storyTarget: { deleteMany: vi.fn() },
      storyQuizQuestion: { deleteMany: vi.fn() },
      storySegment: { deleteMany: vi.fn() },
      card: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    storyProvider = {
      generate: vi.fn().mockResolvedValue(GENERATED),
      generatePodcast: vi.fn().mockResolvedValue(EPISODE),
    };
    tts = { synthesize: vi.fn().mockResolvedValue('/api/static/audio/story-story-1.mp3') };
    unsplash = { search: vi.fn().mockResolvedValue(PHOTO) };
    const dictionary = { resolveWordsToEntries: vi.fn().mockResolvedValue(new Map()) };

    processor = new StoryProcessor(
      prisma as unknown as PrismaService,
      storyProvider as unknown as StoryProvider,
      tts as unknown as TtsProvider,
      unsplash as unknown as UnsplashProvider,
      dictionary as never,
    );
  });

  it("searches Unsplash in landscape with the model's English scene description", async () => {
    await processor.process(JOB);

    // Not the German title or body: Unsplash is English-keyword-driven, and a
    // story banner is a wide crop, not the dictionary's square thumbnail.
    expect(unsplash.search).toHaveBeenCalledWith('train station platform morning', 'landscape');
  });

  it('stores the photo and its attribution on the story', async () => {
    await processor.process(JOB);

    expect(writtenStory()).toMatchObject({
      status: 'READY',
      imageUrl: PHOTO.imageUrl,
      imageAuthorName: PHOTO.authorName,
      imageAuthorUrl: PHOTO.authorUrl,
      imageSourceUrl: PHOTO.sourceUrl,
    });
  });

  it('falls back to the English translation when the model omitted a query', async () => {
    storyProvider.generate.mockResolvedValue({ ...GENERATED, imageQuery: null });

    await processor.process(JOB);

    expect(unsplash.search).toHaveBeenCalledWith(GENERATED.translation, 'landscape');
  });

  it('skips the search entirely when there is no English text to search on', async () => {
    storyProvider.generate.mockResolvedValue({
      ...GENERATED,
      imageQuery: null,
      translation: null,
    });

    await processor.process(JOB);

    expect(unsplash.search).not.toHaveBeenCalled();
    expect(writtenStory()).toMatchObject({ status: 'READY', imageUrl: null });
  });

  it('still ships the story when Unsplash is unconfigured', async () => {
    unsplash.search.mockResolvedValue(null);

    await processor.process(JOB);

    expect(writtenStory()).toMatchObject({
      status: 'READY',
      text: TEXT,
      audioUrl: '/api/static/audio/story-story-1.mp3',
      imageUrl: null,
      imageAuthorName: null,
    });
  });

  it('still ships the story with its narration when the image lookup throws', async () => {
    unsplash.search.mockRejectedValue(new Error('Unsplash search failed: 503'));

    // An external-service failure must never cost the learner the story or the
    // quota they already spent — the same policy the narration runs under.
    await expect(processor.process(JOB)).resolves.toBeUndefined();
    expect(writtenStory()).toMatchObject({
      status: 'READY',
      text: TEXT,
      audioUrl: '/api/static/audio/story-story-1.mp3',
      imageUrl: null,
    });
  });

  it('still ships the story when both the image and the narration fail', async () => {
    unsplash.search.mockRejectedValue(new Error('Unsplash search failed: 503'));
    tts.synthesize.mockRejectedValue(new Error('ElevenLabs timed out'));

    await expect(processor.process(JOB)).resolves.toBeUndefined();
    expect(writtenStory()).toMatchObject({ status: 'READY', audioUrl: null, imageUrl: null });
  });

  describe('podcast episodes', () => {
    /** Puts the loaded story into PODCAST format, keeping everything else. */
    function asPodcast(overrides: Record<string, unknown> = {}) {
      prisma.story.findUnique.mockResolvedValue({
        id: 'story-1',
        userId: 'user-1',
        cefrLevel: 'A2.1',
        topic: 'everyday',
        prompt: null,
        format: 'PODCAST',
        sourceTitle: null,
        sourceUrl: null,
        sourceName: null,
        sourceItem: null,
        targets: [
          { dictionaryEntry: { id: 'e1', word: 'Bahnhof', translation: 'station' } },
          { dictionaryEntry: { id: 'e2', word: 'grün', translation: 'green' } },
          { dictionaryEntry: { id: 'e3', word: 'Haus', translation: 'house' } },
        ],
        ...overrides,
      });
    }

    it('generates an episode rather than a story', async () => {
      asPodcast();

      await processor.process(PODCAST_JOB);

      expect(storyProvider.generatePodcast).toHaveBeenCalled();
      expect(storyProvider.generate).not.toHaveBeenCalled();
    });

    // The learner's cards say which words are banked, due and unseen; the
    // episode's three roles are read back off them rather than from row order.
    it('sorts the words into known, review and new from the learner\'s cards', async () => {
      asPodcast();
      prisma.card.findMany.mockResolvedValue([
        { dictionaryEntryId: 'e1', knownState: 'USER_KNOWN', state: 'REVIEW' },
        { dictionaryEntryId: 'e2', knownState: 'ACTIVE', state: 'NEW' },
        { dictionaryEntryId: 'e3', knownState: 'ACTIVE', state: 'REVIEW' },
      ]);

      await processor.process(PODCAST_JOB);

      expect(storyProvider.generatePodcast).toHaveBeenCalledWith(
        expect.objectContaining({
          knownWords: [{ word: 'Bahnhof', translation: 'station' }],
          newWords: [{ word: 'grün', translation: 'green' }],
          reviewWords: [{ word: 'Haus', translation: 'house' }],
        }),
      );
    });

    it('synthesizes one file per turn, alternating the two host voices', async () => {
      asPodcast();

      await processor.process(PODCAST_JOB);

      expect(tts.synthesize).toHaveBeenCalledTimes(EPISODE.segments.length);
      expect(tts.synthesize).toHaveBeenNthCalledWith(
        1,
        'story-story-1-s0',
        'Hallo und willkommen!',
        expect.objectContaining({ provider: 'google', voice: 'de-DE-Neural2-B' }),
      );
      expect(tts.synthesize).toHaveBeenNthCalledWith(
        2,
        'story-story-1-s1',
        'Schön, dass du da bist.',
        expect.objectContaining({ voice: 'de-DE-Neural2-C' }),
      );
    });

    it('stores the turns in order with their audio, and no whole-episode file', async () => {
      asPodcast();
      tts.synthesize.mockImplementation((key: string) => Promise.resolve(`/audio/${key}.mp3`));

      await processor.process(PODCAST_JOB);

      const written = writtenStory();
      expect(written.audioUrl).toBeNull();
      const created = (written.segments as { create: Record<string, unknown>[] }).create;
      expect(created).toHaveLength(6);
      expect(created[0]).toMatchObject({
        order: 0,
        speaker: 'HOST_A',
        kind: 'INTRO',
        text: 'Hallo und willkommen!',
        audioUrl: '/audio/story-story-1-s0.mp3',
      });
      expect(created[3]).toMatchObject({ kind: 'VOCAB', focusWord: 'Bahnhof' });
    });

    // A turn whose synthesis failed costs the listener that turn's audio and
    // nothing else — the transcript is still there, as with a story.
    it('ships the episode when a turn fails to synthesize', async () => {
      asPodcast();
      tts.synthesize.mockRejectedValueOnce(new Error('TTS down'));

      await processor.process(PODCAST_JOB);

      const created = (writtenStory().segments as { create: Record<string, unknown>[] }).create;
      expect(created[0].audioUrl).toBeNull();
      expect(writtenStory()).toMatchObject({ status: 'READY' });
    });

    it('rejects a script too short to be a conversation', async () => {
      asPodcast();
      storyProvider.generatePodcast.mockResolvedValue({
        ...EPISODE,
        segments: EPISODE.segments.slice(0, 2),
      });

      await expect(processor.process(PODCAST_JOB)).rejects.toThrow(/only 2 turns/);
    });

    it('joins the turns into one transcript so the words stay tappable', async () => {
      asPodcast();

      await processor.process(PODCAST_JOB);

      const text = writtenStory().text as string;
      expect(text).toContain('Hallo und willkommen!');
      expect(text).toContain('Das Haus ist grün.');
    });
  });

  it('passes userPrompt and previousStories context to storyProvider', async () => {
    await processor.process(JOB);

    expect(storyProvider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: 'A detective looking for a cat',
        previousStories: [
          {
            title: 'Vorige Geschichte',
            topic: 'Travel & Places',
            prompt: 'An adventure in Berlin',
            summary: 'Das war ein spannender Tag in Berlin.',
          },
        ],
      }),
    );
  });
});
