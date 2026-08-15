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

const JOB = {
  data: { storyId: 'story-1' },
  attemptsMade: 0,
  opts: { attempts: 3 },
} as unknown as Job<StoryJobData>;

describe('StoryProcessor', () => {
  let prisma: {
    story: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    storyTarget: { deleteMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let storyProvider: { generate: ReturnType<typeof vi.fn> };
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
          cefrLevel: 'A2.1',
          topic: 'everyday',
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
        // Returns the argument so the transaction's promises resolve to
        // something inspectable.
        update: vi.fn().mockImplementation((args: unknown) => Promise.resolve(args)),
      },
      storyTarget: { deleteMany: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    storyProvider = { generate: vi.fn().mockResolvedValue(GENERATED) };
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
});
