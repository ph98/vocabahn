export interface PreviousStoryContext {
  title: string | null;
  topic?: string | null;
  prompt?: string | null;
  summary: string;
}

export interface StoryPromptInput {
  words: { word: string; translation: string | null }[];
  cefrLevel: string;
  /** Human-readable topic label, e.g. "Football". Null for no topic. */
  topic: string | null;
  /** Custom user prompt / instructions describing what kind of story the learner wants. */
  userPrompt?: string | null;
  /** Brief context from previous stories to enable gentle continuity. */
  previousStories?: PreviousStoryContext[] | null;
  /** The real article to retell. Null generates fiction instead. */
  source: { title: string; summary: string; sourceName: string } | null;
}

/**
 * Builds the generation prompt. Pure, and separated from the API client so the
 * grounding rules — the part that decides whether a learner is told something
 * true — are readable and testable without a network call.
 *
 * Four shapes:
 * - A custom user-prompted story (with optional topic and continuity)
 * - A real news item retold
 * - A topical invention
 * - An untethered story
 */
export function buildStoryPrompt(input: StoryPromptInput): string {
  const wordList = input.words
    .map((w) => (w.translation ? `- ${w.word} (${w.translation})` : `- ${w.word}`))
    .join('\n');

  const lines: string[] = [];

  if (input.userPrompt && input.userPrompt.trim().length > 0) {
    lines.push(
      'You write short German stories for vocabulary learners. The learner is',
      'studying the words below and needs to meet them in natural context.',
      '',
      'The learner explicitly requested this story idea / scenario:',
      `"${input.userPrompt.trim()}"`,
      ...(input.topic ? [`General theme/category: ${input.topic}.`] : []),
      '',
      'Make the narrative, characters, and setting center directly around what the learner asked for.',
      'Invented characters and creative scenes are encouraged. Do not present invented events as real news.',
    );
  } else if (input.source) {
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

  if (input.previousStories && input.previousStories.length > 0) {
    lines.push(
      '',
      'CONTEXT FROM PREVIOUS STORIES (FOR GENTLE CONTINUITY):',
      'Here is brief context from recent stories this learner has read:',
    );
    for (const [idx, prev] of input.previousStories.entries()) {
      const parts: string[] = [];
      if (prev.title) parts.push(`Title: "${prev.title}"`);
      if (prev.topic) parts.push(`Topic: ${prev.topic}`);
      if (prev.prompt) parts.push(`Prompt: "${prev.prompt}"`);
      const prefix = parts.length > 0 ? parts.join(', ') : `Story #${idx + 1}`;
      lines.push(`- ${prefix} — ${prev.summary}`);
    }
    lines.push(
      '',
      'Continuity guideline: You may subtly include a gentle callback, recurring motif, familiar place, or character detail from previous stories if appropriate, giving a connected world feel. However, this new story MUST be completely self-contained and clear on its own.',
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
    // Searched against a stock-photo library, which is English-keyword-driven
    // and matches concrete objects far better than abstractions.
    '- imageQuery: 2 to 4 concrete English nouns naming what a photograph of this',
    '  scene would show, e.g. "train station platform morning" or "football',
    '  stadium crowd". Nouns only, no verbs, no adjectives of mood, no German, no',
    '  proper names, and nothing about language learning.',
    '- targets: one entry per studied word you actually used. `word` is the',
    '  headword exactly as given above. `surfaceForm` is the inflected form as it',
    '  literally appears in your text — copy it character for character,',
    '  including capitalisation and any umlauts. If you used a word more than',
    '  once, give the first occurrence. Omit any word you could not use. An',
    '  incorrect surfaceForm is worse than an omitted one.',
    '- quiz: 3 to 4 multiple-choice questions testing the learner\'s understanding of the studied words in the story context. Each item must test one studied word you used in the text: `targetWord` (the exact studied headword), `prompt` (English question testing what the word means or how it functions in this specific story context), `answer` (correct meaning or answer, 2–6 words), `distractors` (exactly 3 plausible but incorrect English alternatives), `explanation` (1 short sentence explaining why the answer is correct according to the story).',
  );

  return lines.join('\n');
}
