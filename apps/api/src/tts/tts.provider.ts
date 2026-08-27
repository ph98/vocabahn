import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Generated .mp3 cache, served as static files at /api/static/audio. */
export const AUDIO_DIR = join(process.cwd(), 'static', 'audio');

@Injectable()
export class TtsProvider {
  private readonly logger = new Logger(TtsProvider.name);
  // Uses Application Default Credentials via GOOGLE_APPLICATION_CREDENTIALS.
  private readonly googleClient = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? new TextToSpeechClient(
        process.env.GCP_PROJECT ? { projectId: process.env.GCP_PROJECT } : {},
      )
    : null;

  get enabled(): boolean {
    const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY.trim() !== '';
    return hasElevenLabs || this.googleClient !== null;
  }

  /**
   * Synthesizes German audio for `text` to `<key>.mp3` and returns its public URL
   * path, or null if unconfigured. `key` is the headword entry id, or
   * `<entryId>-ex<n>` for an example sentence, or `story-<id>-s<n>` for one turn
   * of a podcast episode.
   *
   * `opts.provider` pins the engine rather than taking the usual
   * ElevenLabs-then-Google order. Podcasts use it: an episode is ~4,500
   * characters against a headword's twenty, and per-character pricing makes the
   * choice of engine the dominant cost of the feature rather than a detail.
   * `opts.voice` picks the voice within whichever engine runs — a Google voice
   * name, or an ElevenLabs voice id — so two hosts can sound like two people.
   */
  async synthesize(
    key: string,
    text: string,
    opts: { provider?: 'google' | 'elevenlabs'; voice?: string } = {},
  ): Promise<string | null> {
    const elevenlabsApiKey = process.env.ELEVENLABS_API_KEY;
    const allowElevenLabs = opts.provider !== 'google';

    if (allowElevenLabs && elevenlabsApiKey && elevenlabsApiKey.trim() !== '') {
      try {
        const audioContent = await this.synthesizeElevenLabs(elevenlabsApiKey, text, opts.voice);
        if (audioContent) {
          await mkdir(AUDIO_DIR, { recursive: true });
          await writeFile(join(AUDIO_DIR, `${key}.mp3`), audioContent);
          return `/api/static/audio/${key}.mp3`;
        }
      } catch (err) {
        this.logger.warn(
          `ElevenLabs synthesis failed: ${
            err instanceof Error ? err.message : String(err)
          }. Falling back to Google TTS.`,
        );
      }
    }

    // Fallback to Google Cloud TTS
    if (!this.googleClient) {
      this.logger.warn(
        'Neither ElevenLabs API key nor GOOGLE_APPLICATION_CREDENTIALS is set — skipping audio',
      );
      return null;
    }

    const [response] = await this.googleClient.synthesizeSpeech({
      input: { text },
      voice: opts.voice
        ? { languageCode: 'de-DE', name: opts.voice }
        : { languageCode: 'de-DE', ssmlGender: 'NEUTRAL' },
      audioConfig: { audioEncoding: 'MP3' },
    });
    if (!response.audioContent) {
      return null;
    }

    await mkdir(AUDIO_DIR, { recursive: true });
    await writeFile(join(AUDIO_DIR, `${key}.mp3`), response.audioContent as Buffer);
    return `/api/static/audio/${key}.mp3`;
  }

  private async synthesizeElevenLabs(
    apiKey: string,
    text: string,
    voice?: string,
  ): Promise<Buffer | null> {
    const voiceId = voice || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
      // Scales with length: a headword returns in well under the 10 s floor,
      // but a whole micro-story is ~700 characters and needs considerably longer.
      signal: AbortSignal.timeout(Math.min(60_000, 10_000 + text.length * 40)),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `ElevenLabs API returned status ${response.status}: ${errorText || response.statusText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
