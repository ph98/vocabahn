import { GoogleGenAI, Type } from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { buildStoryPrompt, type StoryPromptInput } from '../story-prompt';

/** A generated micro-story plus the words it claims to have used. */
export interface GeneratedStory {
  title: string | null;
  text: string;
  translation: string | null;
  /**
   * English scene description for the illustration search. Unsplash is
   * English-keyword-driven, so the German title or body would return junk; the
   * model already has the whole story in context and is the cheapest place to
   * get a usable query. Null when the model omitted it.
   */
  imageQuery: string | null;
  /** Claimed only — the caller must verify each surfaceForm occurs in `text`. */
  targets: { word: string; surfaceForm: string }[];
}

// Narrative coherence across eight prescribed words is the whole product here,
// so this uses the full model rather than enrichment's flash-lite. It is one
// call per story, not one per word.
const MODEL = 'gemini-2.5-flash';

@Injectable()
export class StoryProvider {
  private readonly logger = new Logger(StoryProvider.name);
  private readonly client = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    : null;

  get enabled(): boolean {
    return this.client !== null;
  }

  /**
   * One Gemini call per story. Returns null only when unconfigured;
   * a real API error throws so the job can retry with backoff.
   */
  async generate(input: StoryPromptInput): Promise<GeneratedStory | null> {
    if (!this.client) {
      this.logger.warn('GEMINI_API_KEY not set — skipping story generation');
      return null;
    }

    const prompt = buildStoryPrompt(input);

    const res = await this.client.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        // Inventing a story is a creative task and wants the higher setting.
        // Retelling a real news item is closer to extraction, and every degree
        // of freedom there is a degree of freedom to invent a fact, so a
        // sourced story runs at enrichment's temperature instead.
        temperature: input.source ? 0.4 : 0.8,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            text: { type: Type.STRING },
            translation: { type: Type.STRING },
            imageQuery: { type: Type.STRING },
            targets: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  surfaceForm: { type: Type.STRING },
                },
                required: ['word', 'surfaceForm'],
              },
            },
          },
          required: ['title', 'text', 'translation', 'imageQuery', 'targets'],
        },
      },
    });

    const raw = res.text;
    if (!raw) {
      throw new Error('Gemini returned an empty response');
    }

    const parsed = JSON.parse(raw) as {
      title?: string;
      text?: string;
      translation?: string;
      imageQuery?: string;
      targets?: { word?: string; surfaceForm?: string }[];
    };

    const text = parsed.text?.trim();
    if (!text) {
      throw new Error('Gemini returned a story with no text');
    }

    return {
      title: parsed.title?.trim() || null,
      text,
      translation: parsed.translation?.trim() || null,
      imageQuery: parsed.imageQuery?.trim() || null,
      targets: (parsed.targets ?? [])
        .filter((t): t is { word: string; surfaceForm: string } =>
          Boolean(t?.word && t?.surfaceForm),
        )
        // Only the outer whitespace is trimmed; the surface form must stay verbatim.
        .map((t) => ({ word: t.word.trim(), surfaceForm: t.surfaceForm.trim() })),
    };
  }
}
