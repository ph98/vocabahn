import type { PreviousStoryContext } from './story-prompt';

export interface PodcastWord {
  word: string;
  translation: string | null;
}

export interface PodcastPromptInput {
  /** Words the learner has already banked. The script leans on these. */
  knownWords: PodcastWord[];
  /** Words due for review — heard again in passing, not explained. */
  reviewWords: PodcastWord[];
  /** The few genuinely new words. Each one gets its own VOCAB turn. */
  newWords: PodcastWord[];
  cefrLevel: string;
  /** Human-readable topic label, e.g. "Space & Astronomy". Null for no topic. */
  topic: string | null;
  /** The learner's own episode idea, when they wrote one. */
  userPrompt?: string | null;
  /** Recent episodes/stories, for gentle continuity. */
  previousStories?: PreviousStoryContext[] | null;
  /** Roughly how many German words the whole script should run to. */
  targetWordCount: number;
}

const HOST_A = 'HOST_A';
const HOST_B = 'HOST_B';

function list(words: PodcastWord[]): string {
  return words.map((w) => (w.translation ? `${w.word} (${w.translation})` : w.word)).join(', ');
}

/**
 * The script for one podcast episode, as a two-host dialogue.
 *
 * Pure and unit-tested, for the same reason `buildStoryPrompt` is: the rules
 * that decide whether a learner can actually follow the audio — which words may
 * appear unexplained, which must be explained, what level the grammar sits at —
 * are the substance of the feature, and they should be readable and checkable
 * without a network call.
 *
 * The shape of an episode is fixed rather than left to the model: INTRO, then
 * TOPIC turns carrying the subject, with a VOCAB aside for each new word at the
 * point it first comes up, then a RECAP. A model given "write a podcast" writes
 * a monologue with names in front of it; given a running order, it writes a
 * conversation.
 */
export function buildPodcastPrompt(input: PodcastPromptInput): string {
  const lines: string[] = [
    'You write a short German podcast for language learners. Two hosts talk to',
    `each other: ${HOST_A} leads and explains, ${HOST_B} is curious and asks the`,
    'questions a learner would ask. They are relaxed and warm, not a lecture.',
    '',
    `Target level: CEFR ${input.cefrLevel}. Grammar, tense and sentence length must`,
    'suit that level. The listener has only the audio — no text in front of them —',
    'so sentences must be short enough to follow by ear, and each one must make',
    'sense without re-reading.',
    '',
  ];

  if (input.userPrompt && input.userPrompt.trim().length > 0) {
    lines.push(
      'The learner asked for this episode specifically:',
      `"${input.userPrompt.trim()}"`,
      ...(input.topic ? [`General theme: ${input.topic}.`] : []),
      'Build the episode around what they asked for.',
      '',
    );
  } else if (input.topic) {
    lines.push(
      `Subject of this episode: ${input.topic}.`,
      'Pick one specific, concrete angle on it — a single question, story or fact',
      'worth five minutes — rather than a general survey. Something the listener',
      'could repeat to a friend afterwards.',
      '',
    );
  } else {
    lines.push(
      'Pick one concrete, everyday subject worth five minutes of conversation.',
      '',
    );
  }

  if (input.knownWords.length > 0) {
    lines.push(
      'VOCABULARY THE LISTENER ALREADY KNOWS — lean on these, and work as many in',
      'as read naturally. They are what makes the episode followable:',
      list(input.knownWords),
      '',
    );
  }

  if (input.reviewWords.length > 0) {
    lines.push(
      'DUE FOR REVIEW — use these in passing, in a clear context that shows the',
      'meaning. Do NOT stop to explain them:',
      list(input.reviewWords),
      '',
    );
  }

  if (input.newWords.length > 0) {
    lines.push(
      'NEW WORDS — the listener has not met these. Each one gets its own VOCAB',
      'turn, and only these words do:',
      list(input.newWords),
      '',
      'Handle each new word like this, at the point it first comes up:',
      `1. ${HOST_A} uses it in a sentence where the context already hints at the meaning.`,
      `2. ${HOST_B} stops and asks what it means.`,
      `3. ${HOST_A} explains it in simple German, using only words at or below the`,
      '   target level, then gives the English meaning once, in one short clause.',
      '4. The word is used once more, in a different sentence, later in the episode.',
      '',
    );
  }

  if (input.previousStories && input.previousStories.length > 0) {
    lines.push('EARLIER EPISODES the listener has already had:');
    for (const [idx, prev] of input.previousStories.entries()) {
      const parts: string[] = [];
      if (prev.title) parts.push(`Title: "${prev.title}"`);
      if (prev.topic) parts.push(`Topic: ${prev.topic}`);
      const prefix = parts.length > 0 ? parts.join(', ') : `Episode #${idx + 1}`;
      lines.push(`- ${prefix} — ${prev.summary}`);
    }
    lines.push(
      '',
      'A brief callback to one of them is welcome — it makes the show feel like a',
      'show. This episode must still stand completely on its own.',
      '',
    );
  }

  lines.push(
    'RUNNING ORDER — return the turns in this order, as a flat array:',
    '- One or two INTRO turns: greet the listener and name what the episode is about.',
    '- TOPIC turns carrying the subject, the hosts genuinely talking to each other.',
    '- A VOCAB turn for each new word, placed where that word first comes up, with',
    '  `focusWord` set to the exact new word. These interrupt the TOPIC turns; they',
    '  do not all sit at the end.',
    '- One or two RECAP turns: say the new words once more with their meanings, and',
    '  sign off.',
    '',
    'RULES:',
    `- Alternate speakers. Never give ${HOST_A} or ${HOST_B} two turns in a row.`,
    '- A turn is one to four sentences. Never a monologue.',
    `- The whole script must run to roughly ${input.targetWordCount} German words,`,
    '  which is about five minutes spoken. Count the German only.',
    '- Vocabulary outside the lists must be common and at or below the target',
    '  level, so the new words are the only hard part.',
    '- Write only what is spoken. No stage directions, no sound effects, no',
    '  markdown, no speaker labels inside the text — the speaker is its own field.',
    '- Numbers, dates and units must be written as words, not digits: the text is',
    '  read aloud verbatim by a speech synthesizer.',
    '- Do not present invented events as real news.',
    '',
    'Return JSON:',
    '- title: a short German episode title, 2 to 6 words.',
    `- segments: the turns in order. Each has \`speaker\` ("${HOST_A}" or "${HOST_B}"),`,
    '  `kind` ("INTRO", "TOPIC", "VOCAB" or "RECAP"), `text` (what is spoken, German,',
    '  except the one short English clause allowed in a VOCAB turn), `translation`',
    '  (the full English of that turn) and `focusWord` (the new word, on VOCAB turns',
    '  only; empty otherwise).',
    '- imageQuery: a short English description of a scene for the cover image.',
    '- targets: for every studied word you actually used, the headword and the',
    '  exact surface form as it appears in the script.',
    '- quiz: 3 to 4 multiple-choice questions on the new words as the episode used',
    '  them. Each has `targetWord`, `prompt` (English), `answer`, exactly 3',
    '  `distractors` and a one-sentence `explanation`.',
  );

  return lines.join('\n');
}
