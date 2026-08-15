import { describe, expect, it } from 'vitest';
import { buildStoryQuizQuestions } from './story-quiz';

describe('buildStoryQuizQuestions', () => {
  const verifiedTargets = [
    { entryId: 'e1', word: 'Haus', surfaceForm: 'Häuser', translation: 'house' },
    { entryId: 'e2', word: 'grün', surfaceForm: 'grünes', translation: 'green' },
    { entryId: 'e3', word: 'schnell', surfaceForm: 'schnell', translation: 'fast' },
    { entryId: 'e4', word: 'laufen', surfaceForm: 'lief', translation: 'to run' },
  ];

  const allEntries = [
    { id: 'e1', word: 'Haus', translation: 'house' },
    { id: 'e2', word: 'grün', translation: 'green' },
    { id: 'e3', word: 'schnell', translation: 'fast' },
    { id: 'e4', word: 'laufen', translation: 'to run' },
    { id: 'e5', word: 'Katze', translation: 'cat' },
  ];

  it('matches raw questions to verified targets and prepares 4 options', () => {
    const rawQuestions = [
      {
        targetWord: 'Haus',
        prompt: 'In the story, what does "Häuser" refer to?',
        answer: 'houses',
        distractors: ['forests', 'castles', 'gardens'],
        explanation: 'Haus means house, and Häuser is plural.',
      },
      {
        targetWord: 'grün',
        prompt: 'What color was described as "grünes"?',
        answer: 'green',
        distractors: ['blue', 'yellow', 'red'],
        explanation: 'Grün means green.',
      },
      {
        targetWord: 'schnell',
        prompt: 'How was the movement described by "schnell"?',
        answer: 'fast',
        distractors: ['slow', 'careful', 'hesitant'],
        explanation: 'Schnell means fast.',
      },
    ];

    const questions = buildStoryQuizQuestions(rawQuestions, verifiedTargets, allEntries);

    expect(questions).toHaveLength(3);
    expect(questions[0]!.targetWord).toBe('Haus');
    expect(questions[0]!.dictionaryEntryId).toBe('e1');
    expect(questions[0]!.options).toHaveLength(4);
    expect(questions[0]!.options).toContain('houses');
    expect(questions[0]!.options[questions[0]!.correctIndex]).toBe('houses');
  });

  it('falls back to generating questions when raw questions are missing or insufficient', () => {
    const questions = buildStoryQuizQuestions([], verifiedTargets, allEntries);

    expect(questions.length).toBeGreaterThanOrEqual(3);
    expect(questions[0]!.options).toHaveLength(4);
    const correctOpt = questions[0]!.options[questions[0]!.correctIndex];
    expect(correctOpt).toBeTruthy();
  });
});
