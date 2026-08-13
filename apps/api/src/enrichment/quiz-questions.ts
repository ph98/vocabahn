/**
 * Quiz generation is two halves, and only the first one is AI.
 *
 * Gemini proposes questions inside the *existing* enrichment response — no
 * second call, so viewing a new word costs exactly what it costs today. What
 * comes back is fluent but unverified: the most damaging failure mode is a
 * distractor that happens to be a second valid meaning of the headword, which
 * makes the "wrong" answer right and teaches the learner the opposite of the
 * truth.
 *
 * So every option is checked here, against the entry's own data, before it
 * reaches the database — and rejected distractors are replaced from a pool of
 * real translations sampled from other entries at a similar CEFR sub-level and
 * frequency band. That pool cannot hallucinate, which is the point.
 *
 * Everything in this file is pure: no Prisma, no network, no clock.
 */

export const OPTIONS_PER_QUESTION = 4;
export const DISTRACTORS_PER_QUESTION = OPTIONS_PER_QUESTION - 1;
export const MAX_QUESTIONS_PER_ENTRY = 4;
/** How many questions the model is asked for, before validation drops any. */
export const QUIZ_QUESTIONS_REQUESTED = 3;
const MAX_OPTION_LENGTH = 80;
const MIN_OPTION_LENGTH = 2;

export type QuizOptionOrigin = 'ANSWER' | 'AI' | 'NEIGHBOUR';

/** One question as the model proposed it, before any validation. */
export interface RawQuizQuestion {
  prompt: string;
  answer: string;
  distractors: string[];
  explanation?: string | null;
}

/** A translation borrowed from another dictionary entry, used as a distractor. */
export interface NeighbourGloss {
  word: string;
  translation: string;
}

export interface BuiltQuizQuestion {
  order: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
  /** Index-aligned with `options`, so a bad option is traceable to its source. */
  optionOrigins: QuizOptionOrigin[];
}

export interface BuildMeaningQuestionsInput {
  /** Seeds the option shuffle, so the same entry always shuffles the same way. */
  entryId: string;
  word: string;
  translation: string | null;
  senses: { glosses: string[] }[];
  raw: RawQuizQuestion[];
  neighbours: NeighbourGloss[];
  maxQuestions?: number;
}

// Words too common to count as evidence that two glosses mean the same thing.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'and', 'or',
  'but', 'be', 'is', 'are', 'was', 'were', 'been', 'being', 'as', 'that',
  'this', 'these', 'those', 'with', 'from', 'into', 'onto', 'it', 'its',
  'something', 'someone', 'somebody', 'sth', 'sb', 'one', 'ones',
]);

/**
 * Collapses a gloss to a comparable key: "To run (quickly)!" and "run" both
 * become "run", so a distractor cannot sneak past by rewording the answer.
 */
export function normalizeGloss(text: string): string {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/^\s*(to|a|an|the)\s+/, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentTokens(normalized: string): string[] {
  return normalized.split(' ').filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Splits a multi-meaning gloss ("to run; to walk") into its parts. */
function splitMeanings(text: string): string[] {
  return text.split(/[;,/|]|\s+\bor\b\s+/).map((part) => part.trim()).filter(Boolean);
}

/**
 * Every English meaning this entry already claims — its translation plus every
 * Wiktextract gloss on every sense, whole and split. A distractor matching any
 * of these is a valid alternative meaning of the headword, i.e. accidentally
 * correct, which is the failure this whole module exists to prevent.
 */
export function meaningKeys(input: {
  translation: string | null;
  senses: { glosses: string[] }[];
}): Set<string> {
  const keys = new Set<string>();
  const add = (text: string) => {
    for (const piece of [text, ...splitMeanings(text)]) {
      const key = normalizeGloss(piece);
      if (key.length >= MIN_OPTION_LENGTH) keys.add(key);
    }
  };

  if (input.translation) add(input.translation);
  for (const sense of input.senses) {
    for (const gloss of sense.glosses) add(gloss);
  }
  return keys;
}

/**
 * True when `candidate` says the same thing as one of the entry's own meanings.
 * Token-subset in either direction, so "run" is caught against "to run fast"
 * and "a large dog" against "dog" — without rejecting merely similar-looking
 * strings ("car" survives against "carpet").
 */
export function isAccidentallyCorrect(candidate: string, keys: Set<string>): boolean {
  const normalized = normalizeGloss(candidate);
  if (!normalized) return true;
  if (keys.has(normalized)) return true;

  const candidateTokens = contentTokens(normalized);
  if (candidateTokens.length === 0) return true;

  for (const key of keys) {
    const keyTokens = contentTokens(key);
    if (keyTokens.length === 0) continue;
    const keySet = new Set(keyTokens);
    const candidateSet = new Set(candidateTokens);
    if (candidateTokens.every((t) => keySet.has(t))) return true;
    if (keyTokens.every((t) => candidateSet.has(t))) return true;
  }
  return false;
}

/**
 * A proposed correct answer is only trusted when the entry's own data supports
 * it — otherwise the model invented a meaning, and the whole question is
 * unsalvageable. Deliberately lenient (one shared content token is enough), so
 * a sense-specific answer phrased differently from the gloss still passes.
 */
export function isGroundedAnswer(answer: string, keys: Set<string>): boolean {
  const normalized = normalizeGloss(answer);
  if (normalized.length < MIN_OPTION_LENGTH) return false;
  if (keys.has(normalized)) return true;

  const tokens = new Set(contentTokens(normalized));
  if (tokens.size === 0) return false;
  for (const key of keys) {
    if (contentTokens(key).some((t) => tokens.has(t))) return true;
  }
  return false;
}

function isUsableOptionText(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length >= MIN_OPTION_LENGTH && trimmed.length <= MAX_OPTION_LENGTH;
}

// Deterministic PRNG (xmur3 seed + mulberry32) so a given entry always shuffles
// its options the same way: stable snapshots in tests, stable answers in review.
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Validates the model's proposals and assembles storable questions.
 *
 * A question survives only if its answer is grounded in the entry and it ends
 * up with three distinct, non-accidentally-correct distractors. Rejected
 * distractors are replaced from `neighbours`; if the pool runs dry the question
 * is dropped rather than padded with something wrong.
 */
export function buildMeaningQuestions(input: BuildMeaningQuestionsInput): BuiltQuizQuestion[] {
  const keys = meaningKeys(input);
  const headword = normalizeGloss(input.word);
  const limit = input.maxQuestions ?? MAX_QUESTIONS_PER_ENTRY;

  const neighbourPool = shuffle(
    input.neighbours.filter(
      (n) => n.translation && normalizeGloss(n.word) !== headword && isUsableOptionText(n.translation),
    ),
    seededRandom(`${input.entryId}:neighbours`),
  );

  const questions: BuiltQuizQuestion[] = [];
  const seenPrompts = new Set<string>();

  for (const candidate of input.raw) {
    if (questions.length >= limit) break;

    const prompt = candidate.prompt?.trim();
    const answer = candidate.answer?.trim();
    if (!prompt || !answer || !isUsableOptionText(answer)) continue;

    const promptKey = normalizeGloss(prompt);
    if (seenPrompts.has(promptKey)) continue;
    if (!isGroundedAnswer(answer, keys)) continue;

    // The answer occupies its own slot; nothing else may collide with it.
    const taken = new Set<string>([normalizeGloss(answer)]);
    const distractors: { text: string; origin: QuizOptionOrigin }[] = [];

    const accept = (text: string, origin: QuizOptionOrigin): boolean => {
      const trimmed = text.trim();
      if (!isUsableOptionText(trimmed)) return false;
      const key = normalizeGloss(trimmed);
      if (taken.has(key)) return false;
      if (isAccidentallyCorrect(trimmed, keys)) return false;
      // A distractor must not restate another distractor either.
      if (distractors.some((d) => isAccidentallyCorrect(trimmed, new Set([normalizeGloss(d.text)])))) {
        return false;
      }
      taken.add(key);
      distractors.push({ text: trimmed, origin });
      return true;
    };

    for (const proposed of candidate.distractors ?? []) {
      if (distractors.length >= DISTRACTORS_PER_QUESTION) break;
      if (typeof proposed === 'string') accept(proposed, 'AI');
    }

    // Top up from real entries when the model's distractors did not survive.
    for (const neighbour of neighbourPool) {
      if (distractors.length >= DISTRACTORS_PER_QUESTION) break;
      accept(neighbour.translation, 'NEIGHBOUR');
    }

    if (distractors.length < DISTRACTORS_PER_QUESTION) continue;

    const order = questions.length;
    const slots = shuffle(
      [
        { text: answer, origin: 'ANSWER' as QuizOptionOrigin, isAnswer: true },
        ...distractors.map((d) => ({ text: d.text, origin: d.origin, isAnswer: false })),
      ],
      seededRandom(`${input.entryId}:${order}`),
    );

    seenPrompts.add(promptKey);
    questions.push({
      order,
      prompt,
      options: slots.map((s) => s.text),
      correctIndex: slots.findIndex((s) => s.isAnswer),
      explanation: candidate.explanation?.trim() || null,
      optionOrigins: slots.map((s) => s.origin),
    });
  }

  if (questions.length > 0) return questions;

  // Nothing the model proposed survived. Fall back to one question built
  // entirely from stored data, so an enriched entry is never quiz-less.
  return buildFallbackQuestion(input, keys, neighbourPool);
}

function buildFallbackQuestion(
  input: BuildMeaningQuestionsInput,
  keys: Set<string>,
  neighbourPool: NeighbourGloss[],
): BuiltQuizQuestion[] {
  const answer = input.translation?.trim();
  if (!answer || !isUsableOptionText(answer)) return [];

  const taken = new Set<string>([normalizeGloss(answer)]);
  const distractors: string[] = [];
  for (const neighbour of neighbourPool) {
    if (distractors.length >= DISTRACTORS_PER_QUESTION) break;
    const text = neighbour.translation.trim();
    const key = normalizeGloss(text);
    if (taken.has(key) || isAccidentallyCorrect(text, keys)) continue;
    taken.add(key);
    distractors.push(text);
  }
  if (distractors.length < DISTRACTORS_PER_QUESTION) return [];

  const slots = shuffle(
    [
      { text: answer, isAnswer: true },
      ...distractors.map((text) => ({ text, isAnswer: false })),
    ],
    seededRandom(`${input.entryId}:fallback`),
  );

  return [
    {
      order: 0,
      prompt: `What does “${input.word}” mean?`,
      options: slots.map((s) => s.text),
      correctIndex: slots.findIndex((s) => s.isAnswer),
      explanation: null,
      optionOrigins: slots.map((s) => (s.isAnswer ? 'ANSWER' : 'NEIGHBOUR')),
    },
  ];
}
