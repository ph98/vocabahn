import { describe, expect, it } from 'vitest';
import { buildStoryPrompt } from './story-prompt';

describe('buildStoryPrompt', () => {
  const words = [
    { word: 'Katze', translation: 'cat' },
    { word: 'suchen', translation: 'to search' },
  ];

  it('builds a prompt with custom user prompt', () => {
    const prompt = buildStoryPrompt({
      words,
      cefrLevel: 'A2.1',
      topic: null,
      userPrompt: 'A detective in Berlin looking for a lost cat',
      source: null,
    });

    expect(prompt).toContain('The learner explicitly requested this story idea / scenario:');
    expect(prompt).toContain('"A detective in Berlin looking for a lost cat"');
    expect(prompt).toContain('Katze (cat)');
    expect(prompt).toContain('suchen (to search)');
    expect(prompt).toContain('Target level: CEFR A2.1.');
  });

  it('includes previous stories context when provided', () => {
    const prompt = buildStoryPrompt({
      words,
      cefrLevel: 'B1.1',
      topic: 'Everyday',
      userPrompt: 'Buying groceries at a market',
      previousStories: [
        {
          title: 'Das Café in Berlin',
          topic: 'Food',
          prompt: 'Ordering coffee',
          summary: 'Anna trinkt Kaffee im Café.',
        },
      ],
      source: null,
    });

    expect(prompt).toContain('CONTEXT FROM PREVIOUS STORIES (FOR GENTLE CONTINUITY):');
    expect(prompt).toContain('Title: "Das Café in Berlin"');
    expect(prompt).toContain('Topic: Food');
    expect(prompt).toContain('Prompt: "Ordering coffee"');
    expect(prompt).toContain('Anna trinkt Kaffee im Café.');
    expect(prompt).toContain('Continuity guideline:');
  });

  it('builds a sourced prompt when source is present and no user prompt', () => {
    const prompt = buildStoryPrompt({
      words,
      cefrLevel: 'B2.1',
      topic: 'Technology',
      source: {
        title: 'Neuer Satellit gestartet',
        summary: 'Die ESA hat einen Satelliten ins All geschickt.',
        sourceName: 'heise',
      },
    });

    expect(prompt).toContain('HEADLINE: Neuer Satellit gestartet');
    expect(prompt).toContain('SUMMARY: Die ESA hat einen Satelliten ins All geschickt.');
    expect(prompt).toContain('FACTS — these rules outrank every other instruction:');
  });

  it('builds a topical prompt when only topic is provided', () => {
    const prompt = buildStoryPrompt({
      words,
      cefrLevel: 'A1.2',
      topic: 'Sports',
      source: null,
    });

    expect(prompt).toContain('Write a story about this subject: Sports.');
  });
});
