import { Controller, Get, Logger, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import {
  PODCAST_TTS_PROVIDER,
  PODCAST_VOICE_A,
  PODCAST_VOICE_B,
} from '../stories/stories.constants';
import { AUDIO_DIR, TtsProvider } from '../tts/tts.provider';

@Controller('static/audio')
export class StaticAudioController {
  private readonly logger = new Logger(StaticAudioController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tts: TtsProvider,
  ) {}

  @Get(':filename')
  async getAudioFile(@Param('filename') filename: string, @Res() res: Response): Promise<void> {
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!safeFilename.endsWith('.mp3')) {
      throw new NotFoundException('Invalid audio file format');
    }

    const filePath = join(AUDIO_DIR, safeFilename);

    // 1. If file exists on disk, stream it back directly
    if (existsSync(filePath)) {
      res.setHeader('Content-Type', 'audio/mpeg');
      createReadStream(filePath).pipe(res);
      return;
    }

    // 2. Parse key from filename (strip .mp3)
    const key = safeFilename.slice(0, -4);
    let textToSynthesize: string | null = null;
    // Podcast turns must come back in the voice they were recorded in — a
    // healed turn in the other host's voice is worse than a silent one.
    let ttsOpts: { provider?: 'google' | 'elevenlabs'; voice?: string } = {};

    // `static/audio` is container-local, so anything not on disk has to be
    // re-derivable from the database or a redeploy silences it permanently.
    // A podcast turn is keyed `story-<id>-s<n>` and must be matched before the
    // plain story pattern, which would otherwise swallow the whole tail as an id
    // and find nothing.
    const segmentMatch = key.match(/^story-(.+)-s(\d+)$/);
    const storyMatch = key.match(/^story-(.+)$/);
    const exampleMatch = key.match(/^(.+)-ex(\d+)$/);
    if (segmentMatch) {
      const segment = await this.prisma.storySegment.findUnique({
        where: {
          storyId_order: { storyId: segmentMatch[1]!, order: parseInt(segmentMatch[2]!, 10) },
        },
        select: { text: true, speaker: true },
      });
      if (segment?.text) {
        textToSynthesize = segment.text;
        ttsOpts = {
          provider: PODCAST_TTS_PROVIDER === 'elevenlabs' ? 'elevenlabs' : 'google',
          voice: segment.speaker === 'HOST_B' ? PODCAST_VOICE_B : PODCAST_VOICE_A,
        };
      }
    } else if (storyMatch) {
      const story = await this.prisma.story.findUnique({
        where: { id: storyMatch[1]! },
        select: { text: true },
      });
      if (story?.text) {
        textToSynthesize = story.text;
      }
    } else if (exampleMatch) {
      const entryId = exampleMatch[1]!;
      const exampleIndex = parseInt(exampleMatch[2]!, 10);
      const entry = await this.prisma.dictionaryEntry.findUnique({
        where: { id: entryId },
        include: { examples: { orderBy: { order: 'asc' } } },
      });
      const example =
        entry?.examples[exampleIndex] ?? entry?.examples.find((e) => e.order === exampleIndex);
      if (example?.de) {
        textToSynthesize = example.de;
      }
    } else {
      const entry = await this.prisma.dictionaryEntry.findUnique({
        where: { id: key },
        select: { id: true, word: true },
      });
      if (entry?.word) {
        textToSynthesize = entry.word;
      }
    }

    // 3. Attempt on-demand synthesis if text exists and TTS provider is configured
    if (textToSynthesize && this.tts.enabled) {
      this.logger.log(`Attempting on-demand TTS recovery for key "${key}" ("${textToSynthesize}")`);
      const generatedUrl = await this.tts.synthesize(key, textToSynthesize, ttsOpts);
      if (generatedUrl && existsSync(filePath)) {
        res.setHeader('Content-Type', 'audio/mpeg');
        createReadStream(filePath).pipe(res);
        return;
      }
    }

    // 4. Recovery unavailable or failed -> return 404
    throw new NotFoundException(`Audio file "${safeFilename}" not found`);
  }
}
