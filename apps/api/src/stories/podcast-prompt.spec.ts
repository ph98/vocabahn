import { describe, expect, it } from 'vitest';
import { buildPodcastPrompt, type PodcastPromptInput } from './podcast-prompt';

const base: PodcastPromptInput = {
  knownWords: [
    { word: 'Haus', translation: 'house' },
    { word: 'gehen', translation: 'to go' },
  ],
  reviewWords: [{ word: 'Bahnhof', translation: 'train station' }],
  newWords: [{ word: 'Maßnahme', translation: 'measure' }],
  cefrLevel: 'A2.1',
  topic: 'Space & Astronomy',
  targetWordCount: 650,
};

describe('buildPodcastPrompt', () => {
  it('names both hosts and the target level', () => {
    const prompt = buildPodcastPrompt(base);
    expect(prompt).toContain('HOST_A');
    expect(prompt).toContain('HOST_B');
    expect(prompt).toContain('Target level: CEFR A2.1.');
  });

  it('separates the three word roles', () => {
    const prompt = buildPodcastPrompt(base);

    expect(prompt).toContain('VOCABULARY THE LISTENER ALREADY KNOWS');
    expect(prompt).toContain('Haus (house), gehen (to go)');

    expect(prompt).toContain('DUE FOR REVIEW');
    expect(prompt).toContain('Bahnhof (train station)');
    // The distinction that makes the episode listenable: due words are heard,
    // new words are stopped on.
    expect(prompt).toContain('Do NOT stop to explain them');

    expect(prompt).toContain('NEW WORDS');
    expect(prompt).toContain('Maßnahme (measure)');
    expect(prompt).toContain('Each one gets its own VOCAB');
  });

  it('asks for the episode length in German words', () => {
    expect(buildPodcastPrompt(base)).toContain('roughly 650 German words');
  });

  it('carries the topic through when the learner wrote no idea', () => {
    expect(buildPodcastPrompt(base)).toContain('Subject of this episode: Space & Astronomy.');
  });

  it("puts the learner's own idea above the topic", () => {
    const prompt = buildPodcastPrompt({
      ...base,
      userPrompt: 'How rockets land themselves',
    });

    expect(prompt).toContain('The learner asked for this episode specifically:');
    expect(prompt).toContain('"How rockets land themselves"');
    expect(prompt).toContain('General theme: Space & Astronomy.');
    expect(prompt).not.toContain('Subject of this episode:');
  });

  it('offers continuity from earlier episodes', () => {
    const prompt = buildPodcastPrompt({
      ...base,
      previousStories: [
        { title: 'Der Mond', topic: 'Space', prompt: null, summary: 'Anna spricht über den Mond.' },
      ],
    });

    expect(prompt).toContain('EARLIER EPISODES');
    expect(prompt).toContain('Title: "Der Mond"');
    expect(prompt).toContain('Anna spricht über den Mond.');
    expect(prompt).toContain('must still stand completely on its own');
  });

  it('omits the empty sections rather than printing empty lists', () => {
    const prompt = buildPodcastPrompt({
      ...base,
      knownWords: [],
      reviewWords: [],
      newWords: [],
      topic: null,
    });

    expect(prompt).not.toContain('VOCABULARY THE LISTENER ALREADY KNOWS');
    expect(prompt).not.toContain('DUE FOR REVIEW');
    expect(prompt).not.toContain('NEW WORDS');
    expect(prompt).toContain('Pick one concrete, everyday subject');
  });

  // The text is read aloud verbatim, so anything that is not speech is a defect
  // the listener hears.
  it('forbids anything the synthesizer would read out wrong', () => {
    const prompt = buildPodcastPrompt(base);
    expect(prompt).toContain('written as words, not digits');
    expect(prompt).toContain('No stage directions');
  });
});
