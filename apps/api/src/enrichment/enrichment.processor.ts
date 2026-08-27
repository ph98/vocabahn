import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DictionaryService } from '../dictionary/dictionary.service';
import { CEFR_LEVELS, cefrIndex } from '../knowledge/constants';
import { PrismaService } from '../prisma/prisma.service';
import { ENRICHMENT_QUEUE, type EnrichmentJobData } from './enrichment.constants';
import { GeminiProvider } from './providers/gemini.provider';
import { buildMeaningQuestions, type NeighbourGloss } from './quiz-questions';
import { TtsProvider } from '../tts/tts.provider';
import { UnsplashProvider } from '../images/unsplash.provider';

// Enough real translations to fill three distractors even after most are
// rejected for being alternative meanings of the headword.
const NEIGHBOUR_POOL_TARGET = 24;
const NEIGHBOUR_POOL_TAKE = 60;
// How far a distractor's source word may sit from the headword's CEFR
// sub-level, in half-levels (A1.1 … C2.2).
const NEIGHBOUR_LEVEL_SPREAD = 1;
// Distractors come from the same rough frequency band: a third to triple the
// headword's rank, so a B1 word is never contrasted with an obscure one.
const NEIGHBOUR_RANK_FACTOR = 3;

// Global rate limit protects the free-tier external APIs.
/**
 * Which CEFR level an enrichment run should leave on the entry.
 *
 * An existing level always wins. The levels already on entries come from the
 * curated CEFR wordlist and the course sync; a per-word AI guess is a far
 * weaker signal, and letting it overwrite them is how "Ich" and "Haben" came to
 * be tagged B2.1. Those tags then fed the learner-level inference and pinned
 * A2 learners at B2 — see `learning.md`. The AI only fills a blank.
 */
export function resolveCefrLevel(existing: string | null, proposed: string | null | undefined): string | null {
  return existing ?? proposed ?? null;
}

@Processor(ENRICHMENT_QUEUE, {
  concurrency: 2,
  limiter: { max: 5, duration: 1_000 },
})
export class EnrichmentProcessor extends WorkerHost {
  private readonly logger = new Logger(EnrichmentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiProvider,
    private readonly unsplash: UnsplashProvider,
    private readonly tts: TtsProvider,
    @Inject(forwardRef(() => DictionaryService))
    private readonly dictionaryService: DictionaryService,
  ) {
    super();
  }

  async process(job: Job<EnrichmentJobData>): Promise<void> {
    const { dictionaryEntryId } = job.data;
    const entry = await this.prisma.dictionaryEntry.findUnique({
      where: { id: dictionaryEntryId },
      include: {
        lexiconEntry: {
          // The prompt only uses the first six glosses, but quiz validation
          // needs every sense: a distractor matching sense 8 is still wrong.
          include: { senses: { orderBy: { order: 'asc' }, take: 12 } },
        },
      },
    });
    if (!entry) {
      this.logger.warn(`entry ${dictionaryEntryId} no longer exists — dropping job`);
      return;
    }

    await this.prisma.dictionaryEntry.update({
      where: { id: entry.id },
      data: { enrichmentStatus: 'ENRICHING', enrichmentError: null },
    });
    await this.dictionaryService.updateSearchIndex(entry.id);

    const lex = entry.lexiconEntry;
    const glosses = lex.senses.flatMap((s) => s.glosses);

    // 1. Local-data-first: the Wiktextract glosses are already English.
    let translation = entry.translation ?? (glosses.slice(0, 3).join('; ') || null);
    let emoji = entry.emoji;
    let cefrLevel = entry.cefrLevel;
    let usageNote = entry.usageNote;
    let examples: { de: string; en: string }[] = [];
    let collocations = entry.collocations;
    let falseFriends = entry.falseFriends;
    let register = entry.register;
    let mnemonic = entry.mnemonic;

    // 2. Gemini gap-fill. A real failure throws → job retries with backoff.
    const ai = await this.gemini.enrich({
      word: entry.word,
      pos: lex.pos,
      gender: lex.gender,
      glosses,
      betterModel: job.data.betterModel,
    });
    if (ai) {
      translation = ai.translation ?? translation;
      emoji = ai.emoji ?? emoji;
      if (cefrLevel !== null && ai.cefrLevel && ai.cefrLevel !== cefrLevel) {
        this.logger.debug(`"${entry.word}": keeping ${cefrLevel}, AI proposed ${ai.cefrLevel}`);
      }
      cefrLevel = resolveCefrLevel(cefrLevel, ai.cefrLevel);
      usageNote = ai.usageNote ?? usageNote;
      examples = ai.examples;
      collocations = ai.collocations;
      falseFriends = ai.falseFriends;
      register = ai.register ?? register;
      mnemonic = ai.mnemonic ?? mnemonic;
    }

    // 2b. Quiz questions, from that same response — no second AI call. Every
    // option is validated against this entry's own meanings, and rejected
    // distractors are replaced with real translations from comparable entries.
    const quizQuestions = buildMeaningQuestions({
      entryId: entry.id,
      word: entry.word,
      translation,
      senses: lex.senses.map((s) => ({ glosses: s.glosses })),
      raw: ai?.quiz ?? [],
      neighbours: await this.sampleNeighbourGlosses(entry.id, cefrLevel, lex.pos, lex.frequencyRank),
    });
    const quizGenerator = ai?.model ?? 'grounded';

    // 3 & 4. Image and audio are optional polish — never block ENRICHED on them.
    const image = await this.safe(() =>
      this.unsplash.search(translation ?? entry.word),
    );
    const audioUrl =
      (await this.safe(() => this.tts.synthesize(entry.id, entry.word))) ??
      entry.audioUrl;
    // One mp3 per example sentence, keyed by entry + index.
    const exampleRows = await Promise.all(
      examples.map(async (ex, i) => ({
        order: i,
        de: ex.de,
        en: ex.en,
        audioUrl: await this.safe(() =>
          this.tts.synthesize(`${entry.id}-ex${i}`, ex.de),
        ),
      })),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.dictionaryExample.deleteMany({ where: { entryId: entry.id } });
      // Questions are replaced wholesale; QuizAttempt.questionId is SET NULL on
      // delete, so a learner's answer history survives a re-enrichment.
      await tx.entryQuizQuestion.deleteMany({ where: { entryId: entry.id } });
      await tx.dictionaryEntry.update({
        where: { id: entry.id },
        data: {
          translation,
          emoji,
          cefrLevel,
          usageNote,
          collocations: collocations ?? undefined,
          falseFriends: falseFriends ?? undefined,
          register,
          mnemonic,
          audioUrl,
          imageUrl: image?.imageUrl ?? entry.imageUrl,
          imageSource: image ? 'UNSPLASH' : entry.imageSource,
          enrichmentStatus: 'ENRICHED',
          enrichmentError: null,
          examples: exampleRows.length
            ? {
                create: exampleRows.map((ex) => ({
                  order: ex.order,
                  de: ex.de,
                  en: ex.en,
                  audioUrl: ex.audioUrl,
                })),
              }
            : undefined,
          quizQuestions: quizQuestions.length
            ? {
                create: quizQuestions.map((q) => ({
                  type: 'MEANING' as const,
                  order: q.order,
                  prompt: q.prompt,
                  options: q.options,
                  correctIndex: q.correctIndex,
                  explanation: q.explanation,
                  optionOrigins: q.optionOrigins,
                  generator: quizGenerator,
                })),
              }
            : undefined,
          imageCredit: image
            ? {
                upsert: {
                  create: {
                    authorName: image.authorName,
                    authorUrl: image.authorUrl,
                    sourceUrl: image.sourceUrl,
                  },
                  update: {
                    authorName: image.authorName,
                    authorUrl: image.authorUrl,
                    sourceUrl: image.sourceUrl,
                  },
                },
              }
            : undefined,
        },
      });
    });

    await this.dictionaryService.updateSearchIndex(entry.id);
    this.logger.log(
      `enriched "${entry.word}" (${entry.id}) — ${quizQuestions.length} quiz question(s)`,
    );
  }

  /**
   * Real translations from other entries, used as distractors that cannot be
   * hallucinated. Tightest filter first — same part of speech, a neighbouring
   * CEFR sub-level, a comparable frequency rank — then progressively looser,
   * because a rare word has few peers and an empty pool means no quiz at all.
   */
  private async sampleNeighbourGlosses(
    entryId: string,
    cefrLevel: string | null,
    pos: string,
    frequencyRank: number | null,
  ): Promise<NeighbourGloss[]> {
    const levelIndex = cefrIndex(cefrLevel);
    const nearbyLevels =
      levelIndex === null
        ? null
        : CEFR_LEVELS.slice(
            Math.max(0, levelIndex - NEIGHBOUR_LEVEL_SPREAD),
            levelIndex + NEIGHBOUR_LEVEL_SPREAD + 1,
          );
    const rankBand =
      frequencyRank === null
        ? null
        : {
            gte: Math.floor(frequencyRank / NEIGHBOUR_RANK_FACTOR),
            lte: frequencyRank * NEIGHBOUR_RANK_FACTOR,
          };

    const filters = [
      { levels: nearbyLevels, rank: rankBand, samePos: true },
      { levels: nearbyLevels, rank: null, samePos: true },
      { levels: nearbyLevels, rank: null, samePos: false },
      { levels: null, rank: null, samePos: false },
    ];

    for (const filter of filters) {
      const lexiconWhere = {
        ...(filter.samePos ? { pos } : {}),
        ...(filter.rank ? { frequencyRank: filter.rank } : {}),
      };
      const rows = await this.prisma.dictionaryEntry.findMany({
        where: {
          id: { not: entryId },
          translation: { not: null },
          enrichmentStatus: 'ENRICHED',
          ...(filter.levels ? { cefrLevel: { in: [...filter.levels] } } : {}),
          ...(Object.keys(lexiconWhere).length > 0 ? { lexiconEntry: lexiconWhere } : {}),
        },
        select: { word: true, translation: true },
        take: NEIGHBOUR_POOL_TAKE,
      });
      const pool = rows.flatMap((r) =>
        r.translation ? [{ word: r.word, translation: r.translation }] : [],
      );
      if (pool.length >= NEIGHBOUR_POOL_TARGET || filter === filters[filters.length - 1]) {
        return pool;
      }
    }
    return [];
  }

  /** Run an optional step; log and swallow its error so it can't fail the job. */
  private async safe<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(
        `optional enrichment step failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<EnrichmentJobData>, err: Error): Promise<void> {
    // Mark FAILED only once retries are exhausted, so AdminJS surfaces dead letters.
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return;
    await this.prisma.dictionaryEntry
      .update({
        where: { id: job.data.dictionaryEntryId },
        data: { enrichmentStatus: 'FAILED', enrichmentError: err.message?.slice(0, 500) },
      })
      .catch(() => undefined);
    await this.dictionaryService
      .updateSearchIndex(job.data.dictionaryEntryId)
      .catch(() => undefined);
  }
}
