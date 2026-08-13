import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DictionaryService } from '../dictionary/dictionary.service';
import { PrismaService } from '../prisma/prisma.service';
import { ENRICHMENT_QUEUE, type EnrichmentJobData } from './enrichment.constants';
import { GeminiProvider } from './providers/gemini.provider';
import { TtsProvider } from '../tts/tts.provider';
import { UnsplashProvider } from '../images/unsplash.provider';

// Global rate limit protects the free-tier external APIs.
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
          include: { senses: { orderBy: { order: 'asc' }, take: 5 } },
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
      cefrLevel = ai.cefrLevel ?? cefrLevel;
      usageNote = ai.usageNote ?? usageNote;
      examples = ai.examples;
      collocations = ai.collocations;
      falseFriends = ai.falseFriends;
      register = ai.register ?? register;
      mnemonic = ai.mnemonic ?? mnemonic;
    }

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
    this.logger.log(`enriched "${entry.word}" (${entry.id})`);
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
