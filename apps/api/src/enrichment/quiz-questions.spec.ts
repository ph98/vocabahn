import { describe, expect, it } from 'vitest';
import {
  DISTRACTORS_PER_QUESTION,
  buildMeaningQuestions,
  isAccidentallyCorrect,
  isGroundedAnswer,
  meaningKeys,
  normalizeGloss,
  type BuildMeaningQuestionsInput,
} from './quiz-questions';

const NEIGHBOURS = [
  { word: 'Katze', translation: 'cat' },
  { word: 'Baum', translation: 'tree' },
  { word: 'Fenster', translation: 'window' },
  { word: 'Löffel', translation: 'spoon' },
  { word: 'Wolke', translation: 'cloud' },
  { word: 'Teppich', translation: 'carpet' },
];

function input(overrides: Partial<BuildMeaningQuestionsInput> = {}): BuildMeaningQuestionsInput {
  return {
    entryId: 'entry-1',
    word: 'Hund',
    translation: 'dog',
    senses: [{ glosses: ['dog'] }, { glosses: ['hound', 'a contemptible person'] }],
    raw: [],
    neighbours: NEIGHBOURS,
    ...overrides,
  };
}

describe('normalizeGloss', () => {
  it('drops articles, infinitive markers, parentheticals and punctuation', () => {
    // The parenthetical is noise, not meaning: "to run (quickly)" and "run"
    // must collapse to the same key or a distractor could hide behind one.
    expect(normalizeGloss('To run (quickly)!')).toBe('run');
    expect(normalizeGloss('the  DOG ')).toBe('dog');
    expect(normalizeGloss('a house')).toBe('house');
    expect(normalizeGloss('to give [sth.] away')).toBe('give away');
  });
});

describe('meaningKeys', () => {
  it('covers the translation and every gloss, whole and split', () => {
    const keys = meaningKeys({
      translation: 'to run; to walk',
      senses: [{ glosses: ['to move fast, to sprint'] }],
    });
    expect(keys).toContain('run');
    expect(keys).toContain('walk');
    expect(keys).toContain('move fast');
    expect(keys).toContain('sprint');
  });
});

describe('isAccidentallyCorrect', () => {
  const keys = meaningKeys({ translation: 'dog', senses: [{ glosses: ['to run fast'] }] });

  it('catches an exact alternative meaning', () => {
    expect(isAccidentallyCorrect('dog', keys)).toBe(true);
  });

  it('catches a token subset of a real meaning in either direction', () => {
    expect(isAccidentallyCorrect('run', keys)).toBe(true);
    expect(isAccidentallyCorrect('a large dog', keys)).toBe(true);
  });

  it('keeps a merely similar-looking word', () => {
    expect(isAccidentallyCorrect('cat', keys)).toBe(false);
    expect(isAccidentallyCorrect('dogma', keys)).toBe(false);
  });

  it('rejects empty or punctuation-only options', () => {
    expect(isAccidentallyCorrect('   ', keys)).toBe(true);
    expect(isAccidentallyCorrect('---', keys)).toBe(true);
  });
});

describe('isGroundedAnswer', () => {
  const keys = meaningKeys({ translation: 'dog', senses: [{ glosses: ['hound'] }] });

  it('accepts an answer the entry already claims', () => {
    expect(isGroundedAnswer('a dog', keys)).toBe(true);
    expect(isGroundedAnswer('hound', keys)).toBe(true);
  });

  it('rejects a meaning the entry never claims', () => {
    expect(isGroundedAnswer('a kind of soup', keys)).toBe(false);
  });
});

describe('buildMeaningQuestions', () => {
  it('keeps a clean question and shuffles the answer into the options', () => {
    const [question] = buildMeaningQuestions(
      input({
        raw: [
          {
            prompt: 'What does “Hund” mean?',
            answer: 'dog',
            distractors: ['cat', 'tree', 'window'],
            explanation: 'Hund is the everyday word for a dog.',
          },
        ],
      }),
    );

    expect(question).toBeDefined();
    expect(question!.options).toHaveLength(DISTRACTORS_PER_QUESTION + 1);
    expect(question!.options[question!.correctIndex]).toBe('dog');
    expect(question!.explanation).toBe('Hund is the everyday word for a dog.');
    expect(question!.optionOrigins).toHaveLength(question!.options.length);
    expect(question!.optionOrigins[question!.correctIndex]).toBe('ANSWER');
  });

  it('rejects a distractor that is a second valid sense of the headword', () => {
    const [question] = buildMeaningQuestions(
      input({
        raw: [
          {
            prompt: 'What does “Hund” mean?',
            answer: 'dog',
            // "hound" and "a contemptible person" are both real senses.
            distractors: ['hound', 'a contemptible person', 'cat'],
          },
        ],
      }),
    );

    expect(question!.options).not.toContain('hound');
    expect(question!.options).not.toContain('a contemptible person');
    // The two rejected slots came from real entries instead.
    expect(question!.optionOrigins.filter((o) => o === 'NEIGHBOUR')).toHaveLength(2);
  });

  it('rejects a distractor that merely rewords the answer, and duplicates', () => {
    const [question] = buildMeaningQuestions(
      input({
        translation: 'to run',
        senses: [{ glosses: ['to run'] }],
        word: 'laufen',
        raw: [
          {
            prompt: 'What does “laufen” mean?',
            answer: 'to run',
            distractors: ['run', 'cat', 'cat'],
          },
        ],
      }),
    );

    expect(question!.options.filter((o) => normalizeGloss(o) === 'run')).toHaveLength(1);
    expect(new Set(question!.options).size).toBe(question!.options.length);
  });

  it('drops a question whose answer the entry never claims', () => {
    const questions = buildMeaningQuestions(
      input({
        raw: [
          {
            prompt: 'What does “Hund” mean?',
            answer: 'a kind of pastry',
            distractors: ['cat', 'tree', 'window'],
          },
        ],
      }),
    );

    // Falls back to the grounded question built from the stored translation.
    expect(questions).toHaveLength(1);
    expect(questions[0]!.options[questions[0]!.correctIndex]).toBe('dog');
    expect(questions[0]!.optionOrigins).not.toContain('AI');
  });

  it('drops a question that cannot reach three usable distractors', () => {
    const questions = buildMeaningQuestions(
      input({
        neighbours: [],
        raw: [
          {
            prompt: 'What does “Hund” mean?',
            answer: 'dog',
            distractors: ['hound', 'hound', 'a contemptible person'],
          },
        ],
      }),
    );

    expect(questions).toEqual([]);
  });

  it('is deterministic for the same entry', () => {
    const raw = [
      { prompt: 'What does “Hund” mean?', answer: 'dog', distractors: ['cat', 'tree', 'window'] },
    ];
    const first = buildMeaningQuestions(input({ raw }));
    const second = buildMeaningQuestions(input({ raw }));
    expect(second).toEqual(first);
  });

  it('numbers surviving questions consecutively and drops repeated prompts', () => {
    const questions = buildMeaningQuestions(
      input({
        raw: [
          { prompt: 'What does “Hund” mean?', answer: 'dog', distractors: ['cat', 'tree', 'window'] },
          { prompt: 'what does “Hund” mean', answer: 'dog', distractors: ['spoon', 'cloud', 'carpet'] },
          {
            prompt: 'In “Der Hund bellt”, what does “Hund” mean?',
            answer: 'dog',
            distractors: ['spoon', 'cloud', 'carpet'],
          },
        ],
      }),
    );

    expect(questions).toHaveLength(2);
    expect(questions.map((q) => q.order)).toEqual([0, 1]);
  });

  it('returns nothing when there is neither a usable proposal nor a translation', () => {
    expect(
      buildMeaningQuestions(input({ translation: null, senses: [], raw: [] })),
    ).toEqual([]);
  });
});
