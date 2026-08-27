import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { topicLabel } from '@vocabahn/shared';
import { DictionaryService } from '../dictionary/dictionary.service';
import { UnsplashProvider } from '../images/unsplash.provider';
import { PrismaService } from '../prisma/prisma.service';
import { TtsProvider } from '../tts/tts.provider';
import type { GeneratedStory, RawPodcastSegment } from './providers/story.provider';

/** A generated episode: a story's shape, plus the turns it was built from. */
type GeneratedEpisode = GeneratedStory & { segments: RawPodcastSegment[] };
import { StoryProvider } from './providers/story.provider';
import {
  PODCAST_MIN_SEGMENTS,
  PODCAST_NEW_WORD_COUNT,
  PODCAST_REVIEW_WORD_COUNT,
  PODCAST_TARGET_WORD_COUNT,
  PODCAST_TTS_PROVIDER,
  PODCAST_VOICE_A,
  PODCAST_VOICE_B,
  STORY_MIN_TARGETS,
  STORY_QUEUE,
  type StoryJobData,
} from './stories.constants';
import { buildStoryQuizQuestions } from './story-quiz';
import { validateTargets } from './story-targets';

// Same rate limit as enrichment — both share the Gemini quota.
@Processor(STORY_QUEUE, {
  concurrency: 2,
  limiter: { max: 5, duration: 1_000 },
})
export class StoryProcessor extends WorkerHost {
  private readonly logger = new Logger(StoryProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storyProvider: StoryProvider,
    private readonly tts: TtsProvider,
    private readonly unsplash: UnsplashProvider,
    private readonly dictionary: DictionaryService,
  ) {
    super();
  }

  async process(job: Job<StoryJobData>): Promise<void> {
    const { storyId } = job.data;
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      include: {
        targets: {
          include: { dictionaryEntry: { select: { id: true, word: true, translation: true } } },
        },
        // The summary lives only on the source item; the story snapshots the
        // attribution, not the prose the model is grounded in.
        sourceItem: { select: { summary: true } },
      },
    });
    if (!story) {
      this.logger.warn(`story ${storyId} no longer exists — dropping job`);
      return;
    }

    await this.prisma.story.update({
      where: { id: storyId },
      data: { status: 'GENERATING', stage: 'WRITING', error: null },
    });

    const entries = story.targets.map((t) => t.dictionaryEntry);

    // Retelling a real item while weaving in eight prescribed words is a harder
    // brief than inventing freely, and a thin summary can leave too few words
    // placeable. On the final attempt the source is dropped so the learner ends
    // up with a readable topical story rather than a FAILED one — the topic is
    // most of why they opened it, and the article was the bonus.
    const isLastAttempt = job.attemptsMade >= (job.opts.attempts ?? 1) - 1;
    const useSource = story.sourceTitle && story.sourceUrl && !isLastAttempt;
    if (story.sourceTitle && isLastAttempt) {
      this.logger.warn(`story ${storyId}: dropping the source on the final attempt`);
    }

    // Fetch recent ready stories for this learner to provide gentle continuity
    const previousStoriesRows = await this.prisma.story.findMany({
      where: {
        userId: story.userId,
        id: { not: storyId },
        status: 'READY',
        text: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        title: true,
        topic: true,
        prompt: true,
        text: true,
      },
    });

    const previousStories = previousStoriesRows.map((p) => {
      const cleanText = (p.text ?? '').replace(/\s+/g, ' ').trim();
      const firstSentence = cleanText.split(/(?<=[.!?])\s+/)[0] ?? cleanText;
      const summary =
        firstSentence.length > 120 ? `${firstSentence.slice(0, 117)}...` : firstSentence;
      return {
        title: p.title,
        topic: p.topic ? topicLabel(p.topic) : null,
        prompt: p.prompt,
        summary,
      };
    });

    const isPodcast = story.format === 'PODCAST';

    // A real API failure throws → the job retries with backoff.
    //
    // An episode comes back as turns rather than prose, but it is flattened into
    // the same shape a story has — one German `text`, one translation, claimed
    // targets, a quiz — so target verification, the illustration, word
    // resolution and persistence below are the same code for both formats. The
    // turns ride along in `segments` for the narration step and the transcript.
    const generated = isPodcast
      ? await this.generateEpisode(story, entries, previousStories)
      : await this.storyProvider.generate({
          words: entries.map((e) => ({ word: e.word, translation: e.translation })),
          cefrLevel: story.cefrLevel ?? 'A2.1',
          topic: topicLabel(story.topic),
          userPrompt: story.prompt,
          previousStories: previousStories.length > 0 ? previousStories : undefined,
          source: useSource
            ? {
                title: story.sourceTitle!,
                summary: story.sourceItem?.summary ?? '',
                sourceName: story.sourceName ?? 'a German news outlet',
              }
            : null,
        });
    if (!generated) {
      throw new Error('Story generation is not configured (GEMINI_API_KEY missing)');
    }
    const segments: RawPodcastSegment[] = isPodcast ? (generated as GeneratedEpisode).segments : [];

    const verified = validateTargets(generated.text, generated.targets, entries);
    if (verified.length < STORY_MIN_TARGETS) {
      // Too few studied words actually landed in the text. Throwing sends this
      // back through the queue for a fresh attempt rather than shipping a story
      // with nothing to tap.
      throw new Error(
        `only ${verified.length}/${entries.length} target words verified in the generated text`,
      );
    }

    // The illustration is polish on the same terms as the narration below: it
    // gives the reader a scene to anchor on before decoding the German, and a
    // failed lookup costs them that and nothing else. Searched on the model's
    // English scene description — Unsplash is keyword-driven and the German
    // title would return junk — falling back to the English translation.
    // Landscape, because this renders as a banner above the text, not the
    // dictionary's square thumbnail.
    const imageQuery = generated.imageQuery ?? generated.translation;
    const image = imageQuery
      ? await this.safe(() => this.unsplash.search(imageQuery, 'landscape'))
      : null;

    // Narration is polish, not the product — a TTS outage must not cost the
    // learner the story (or their quota), so failure just means no audio.
    await this.prisma.story.update({ where: { id: storyId }, data: { stage: 'NARRATING' } });
    // An episode is synthesized a turn at a time: one request per turn keeps
    // each well inside what the engines accept, lets the two hosts use two
    // voices, and gives the transcript something to follow without any timing
    // data. A story is one file, as before.
    const segmentAudio = isPodcast ? await this.narrateEpisode(storyId, segments) : [];
    const audioUrl = isPodcast
      ? null
      : await this.safe(() => this.tts.synthesize(`story-${storyId}`, generated.text));

    // Resolve dictionary entries for all words in the story so every word is interactive
    const allWords = [...new Set(generated.text.match(/[\p{L}ÄÖÜäöüß-]+/gu) || [])];
    const resolvedMap = await this.dictionary.resolveWordsToEntries(allWords);

    const finalTargets: { dictionaryEntryId: string; surfaceForm: string }[] = [];
    const seenEntryIds = new Set<string>();

    for (const v of verified) {
      seenEntryIds.add(v.entryId);
      finalTargets.push({ dictionaryEntryId: v.entryId, surfaceForm: v.surfaceForm });
    }

    for (const word of allWords) {
      const match = resolvedMap.get(word.toLowerCase()) ?? resolvedMap.get(word);
      if (match && !seenEntryIds.has(match.id)) {
        seenEntryIds.add(match.id);
        finalTargets.push({ dictionaryEntryId: match.id, surfaceForm: word });
      }
    }

    const verifiedTargetsForQuiz = verified.map((v) => {
      const ent = entries.find((e) => e.id === v.entryId);
      return {
        entryId: v.entryId,
        word: ent?.word ?? v.surfaceForm,
        surfaceForm: v.surfaceForm,
        translation: ent?.translation ?? null,
      };
    });

    const quizQuestionsToCreate = buildStoryQuizQuestions(
      generated.quiz ?? [],
      verifiedTargetsForQuiz,
      entries,
    );

    await this.prisma.$transaction([
      // Drop the placeholders; keep verified words, all story words, and quiz questions.
      this.prisma.storyTarget.deleteMany({ where: { storyId } }),
      this.prisma.storyQuizQuestion.deleteMany({ where: { storyId } }),
      this.prisma.storySegment.deleteMany({ where: { storyId } }),
      this.prisma.story.update({
        where: { id: storyId },
        data: {
          title: generated.title,
          text: generated.text,
          translation: generated.translation,
          audioUrl,
          // All four move together: a null imageUrl is the normal no-image
          // state, and a credit without a photo would render as an orphan
          // caption.
          imageUrl: image?.imageUrl ?? null,
          imageAuthorName: image?.authorName ?? null,
          imageAuthorUrl: image?.authorUrl ?? null,
          imageSourceUrl: image?.sourceUrl ?? null,
          status: 'READY',
          stage: null,
          error: null,
          // The text no longer retells the article, so it must not be credited
          // to it. Clearing the link as well keeps the item eligible for this
          // learner's next story rather than burning it on one they never read.
          ...(useSource
            ? {}
            : {
                sourceItemId: null,
                sourceTitle: null,
                sourceUrl: null,
                sourceName: null,
                sourcePublished: null,
              }),
          targets: {
            create: finalTargets.map((t) => ({
              dictionaryEntryId: t.dictionaryEntryId,
              surfaceForm: t.surfaceForm,
            })),
          },
          segments: {
            create: segments.map((seg, i) => ({
              order: i,
              speaker: seg.speaker === 'HOST_B' ? ('HOST_B' as const) : ('HOST_A' as const),
              kind: (['INTRO', 'TOPIC', 'VOCAB', 'RECAP'].includes(seg.kind)
                ? seg.kind
                : 'TOPIC') as 'INTRO' | 'TOPIC' | 'VOCAB' | 'RECAP',
              text: seg.text,
              translation: seg.translation,
              focusWord: seg.focusWord,
              audioUrl: segmentAudio[i] ?? null,
            })),
          },
          quizQuestions: {
            create: quizQuestionsToCreate.map((q) => ({
              dictionaryEntryId: q.dictionaryEntryId,
              targetWord: q.targetWord,
              order: q.order,
              prompt: q.prompt,
              options: q.options,
              correctIndex: q.correctIndex,
              explanation: q.explanation,
            })),
          },
        },
      }),
    ]);

    this.logger.log(
      isPodcast
        ? `generated episode ${storyId}: ${segments.length} turns, ` +
            `${segmentAudio.filter(Boolean).length} narrated, ${verified.length} target words`
        : `generated story ${storyId} with ${verified.length} target words` +
            `${audioUrl ? ' and narration' : ''}`,
    );
  }

  /** Run an optional step; log and swallow its error so it can't fail the job. */
  private async safe<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(
        `optional story step failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Generates one episode and flattens it into the shape the rest of `process`
   * expects, with the turns carried alongside.
   *
   * The three word roles the prompt needs are re-derived from the learner's
   * cards rather than threaded through the Story row: `knownState` and `state`
   * already say exactly which words are banked, which are due and which have
   * never been seen, and reading them here keeps the roles correct even on a
   * retry days after the row was written.
   */
  private async generateEpisode(
    story: { id: string; userId: string; cefrLevel: string | null; topic: string | null; prompt: string | null },
    entries: { id: string; word: string; translation: string | null }[],
    previousStories: { title: string | null; topic: string | null; prompt: string | null; summary: string }[],
  ): Promise<GeneratedEpisode | null> {
    const cards = await this.prisma.card.findMany({
      where: { userId: story.userId, dictionaryEntryId: { in: entries.map((e) => e.id) } },
      select: { dictionaryEntryId: true, knownState: true, state: true },
    });
    const byEntry = new Map(cards.map((c) => [c.dictionaryEntryId, c]));

    const known: { word: string; translation: string | null }[] = [];
    const review: { word: string; translation: string | null }[] = [];
    const fresh: { word: string; translation: string | null }[] = [];
    for (const entry of entries) {
      const card = byEntry.get(entry.id);
      const word = { word: entry.word, translation: entry.translation };
      if (card && (card.knownState === 'AUTO_KNOWN' || card.knownState === 'USER_KNOWN')) {
        known.push(word);
      } else if (card?.state === 'NEW') {
        fresh.push(word);
      } else {
        review.push(word);
      }
    }

    const generated = await this.storyProvider.generatePodcast({
      knownWords: known,
      reviewWords: review.slice(0, PODCAST_REVIEW_WORD_COUNT),
      newWords: fresh.slice(0, PODCAST_NEW_WORD_COUNT),
      cefrLevel: story.cefrLevel ?? 'A2.1',
      topic: topicLabel(story.topic),
      userPrompt: story.prompt,
      previousStories: previousStories.length > 0 ? previousStories : undefined,
      targetWordCount: PODCAST_TARGET_WORD_COUNT,
    });
    if (!generated) return null;

    if (generated.segments.length < PODCAST_MIN_SEGMENTS) {
      // Too few turns to be a conversation. Throwing sends this back through the
      // queue rather than shipping a monologue with two names on it.
      throw new Error(
        `episode came back with only ${generated.segments.length} turns (minimum ${PODCAST_MIN_SEGMENTS})`,
      );
    }

    // The flattened transcript is what target verification, word resolution and
    // the reader all work from, so the joined text is the episode as spoken.
    return {
      title: generated.title,
      text: generated.segments.map((seg) => seg.text).join('\n\n'),
      translation: generated.segments
        .map((seg) => seg.translation)
        .filter(Boolean)
        .join('\n\n') || null,
      imageQuery: generated.imageQuery,
      targets: generated.targets,
      quiz: generated.quiz,
      segments: generated.segments,
    };
  }

  /**
   * Synthesizes one file per turn, alternating voices so the two hosts sound
   * like two people. Returns a URL per turn, positionally — a null is a turn
   * that failed to synthesize, which costs the listener that turn's audio and
   * nothing else, exactly as a failed story narration does.
   *
   * Sequential rather than parallel: a five-minute episode is around twenty
   * requests, and firing them at once is the fastest way to be rate limited by
   * the speech API for no gain the learner can perceive.
   */
  private async narrateEpisode(
    storyId: string,
    segments: RawPodcastSegment[],
  ): Promise<(string | null)[]> {
    const provider = PODCAST_TTS_PROVIDER === 'elevenlabs' ? 'elevenlabs' : 'google';
    const urls: (string | null)[] = [];

    for (const [i, seg] of segments.entries()) {
      const url = await this.safe(() =>
        this.tts.synthesize(`story-${storyId}-s${i}`, seg.text, {
          provider,
          voice: seg.speaker === 'HOST_B' ? PODCAST_VOICE_B : PODCAST_VOICE_A,
        }),
      );
      urls.push(url ?? null);
    }
    return urls;
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<StoryJobData>, err: Error): Promise<void> {
    // Mark FAILED only once retries are exhausted, so the client keeps polling
    // through intermediate attempts.
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;
    await this.prisma.story
      .update({
        where: { id: job.data.storyId },
        data: { status: 'FAILED', error: err.message?.slice(0, 500) },
      })
      .catch(() => undefined);
  }
}
