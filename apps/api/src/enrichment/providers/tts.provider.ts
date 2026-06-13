import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Generated .mp3 cache, served as static files at /api/static/audio (PRD §7 step 5). */
export const AUDIO_DIR = join(process.cwd(), 'static', 'audio');

@Injectable()
export class TtsProvider {
  private readonly logger = new Logger(TtsProvider.name);
  // Uses Application Default Credentials via GOOGLE_APPLICATION_CREDENTIALS.
  private readonly client = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? new TextToSpeechClient(
        process.env.GCP_PROJECT ? { projectId: process.env.GCP_PROJECT } : {},
      )
    : null;

  get enabled(): boolean {
    return this.client !== null;
  }

  /**
   * Synthesizes German audio for `text` to `<key>.mp3` and returns its public URL
   * path, or null if unconfigured. `key` is the headword entry id, or
   * `<entryId>-ex<n>` for an example sentence.
   */
  async synthesize(key: string, text: string): Promise<string | null> {
    if (!this.client) {
      this.logger.warn('GOOGLE_APPLICATION_CREDENTIALS not set — skipping audio');
      return null;
    }

    const [response] = await this.client.synthesizeSpeech({
      input: { text },
      voice: { languageCode: 'de-DE', ssmlGender: 'NEUTRAL' },
      audioConfig: { audioEncoding: 'MP3' },
    });
    if (!response.audioContent) {
      return null;
    }

    await mkdir(AUDIO_DIR, { recursive: true });
    await writeFile(join(AUDIO_DIR, `${key}.mp3`), response.audioContent);
    return `/api/static/audio/${key}.mp3`;
  }
}
