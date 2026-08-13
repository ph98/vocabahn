export interface StoryPromptInput {
  words: { word: string; translation: string | null }[];
  cefrLevel: string;
  /** Human-readable topic label, e.g. "Football". Null for no topic. */
  topic: string | null;
  /** The real article to retell. Null generates fiction instead. */
  source: { title: string; summary: string; sourceName: string } | null;
}

/**
 * Builds the generation prompt. Pure, and separated from the API client so the
 * grounding rules — the part that decides whether a learner is told something
 * true — are readable and testable without a network call.
 *
 * Three shapes, in descending order of what the learner gets out of it:
 * a real item retold, a topical invention, or an untethered story.
 */
export function buildStoryPrompt(input: StoryPromptInput): string {
  const wordList = input.words
    .map((w) => (w.translation ? `- ${w.word} (${w.translation})` : `- ${w.word}`))
    .join('\n');

  const lines: string[] = [];

  if (input.source) {
    lines.push(
      'You retell real German news for language learners. Below is a genuine news',
      `item published by ${input.source.sourceName}.`,
      '',
      `HEADLINE: ${input.source.title}`,
      `SUMMARY: ${input.source.summary}`,
      '',
      `Retell this item in German at CEFR ${input.cefrLevel}, in your own words.`,
      '',
      'FACTS — these rules outrank every other instruction:',
      '- Use only what the headline and summary above actually state. Do not add',
      '  names, numbers, dates, places, quotes, causes or consequences that are',
      '  not there, and do not resolve anything the summary leaves open.',
      '- If the summary is thin, write a shorter text. Never pad with invention.',
      '- No speculation about what happens next, and no opinion of your own.',
      '- Do not copy sentences from the summary. Rewrite them at the target level.',
    );
  } else if (input.topic) {
    lines.push(
      'You write short German stories for vocabulary learners. The learner is',
      'studying the words below and needs to meet them in natural context.',
      '',
      `Write a story about this subject: ${input.topic}.`,
      'Make it concrete and specific — a scene with people doing something — not',
      'a general description of the subject. Invented characters and events are',
      'fine here, but do not present invented events as real news, and do not use',
      'the names of real living people, teams, companies or places in the news.',
    );
  } else {
    lines.push(
      'You write short German stories for vocabulary learners. The learner is',
      'studying the words below and needs to meet them in natural context.',
    );
  }

  lines.push(
    '',
    'No markdown, no meta-commentary, no title inside the body text.',
    `Target level: CEFR ${input.cefrLevel}.`,
    '',
    'Words the learner is studying:',
    wordList,
    '',
    'Return:',
    '- title: a short German title, 2 to 5 words.',
    input.source
      ? '- text: one self-contained German text of 80 to 120 words that reads as a\n  short news piece, with the main point first. Grammar and sentence length\n  must suit the target level; vocabulary outside the studied words should be\n  common and below that level, so the studied words are the only hard part.'
      : '- text: one self-contained German story of 80 to 120 words. It must read as\n  a real story with a beginning and an end, not a list of sentences built\n  around the words. Grammar and sentence length must suit the target level;\n  vocabulary outside the studied words should be common and below that level\n  so the studied words are the only hard part.',
    input.source
      ? '  Use as many of the studied words as fit the facts naturally — aim for at\n  least five. Accuracy comes first: omit any word that would need something\n  invented to justify it. Never force a word in.'
      : '  Use EVERY word above at least once, inflected naturally — do not force a\n  word into an unnatural sentence.',
    '- translation: a natural English translation of the whole text. Translate',
    '  for meaning, not word by word.',
    '- targets: one entry per studied word you actually used. `word` is the',
    '  headword exactly as given above. `surfaceForm` is the inflected form as it',
    '  literally appears in your text — copy it character for character,',
    '  including capitalisation and any umlauts. If you used a word more than',
    '  once, give the first occurrence. Omit any word you could not use. An',
    '  incorrect surfaceForm is worse than an omitted one.',
  );

  return lines.join('\n');
}
