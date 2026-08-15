import type { RawStoryQuizQuestion } from './providers/story.provider';

export interface VerifiedTargetForQuiz {
  entryId: string;
  word: string;
  surfaceForm: string;
  translation?: string | null;
}

export interface PreparedStoryQuizQuestion {
  dictionaryEntryId: string;
  targetWord: string;
  order: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string | null;
}

/**
 * Deterministic shuffle with seed or random array shuffle.
 */
function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j]!;
    arr[j] = temp!;
  }
  return arr;
}

/**
 * Validates, matches to dictionary entries, and formats story quiz questions.
 * If the model returned fewer questions than desired (e.g. fewer than min(3, targets.length)),
 * fallback questions are generated from verified targets so every story has 3-4 interactive questions.
 */
export function buildStoryQuizQuestions(
  rawQuestions: RawStoryQuizQuestion[],
  verifiedTargets: VerifiedTargetForQuiz[],
  allEntries: { id: string; word: string; translation: string | null }[] = [],
): PreparedStoryQuizQuestion[] {
  const prepared: PreparedStoryQuizQuestion[] = [];
  const usedEntryIds = new Set<string>();

  const targetByWord = new Map<string, VerifiedTargetForQuiz>();
  const targetBySurface = new Map<string, VerifiedTargetForQuiz>();

  for (const target of verifiedTargets) {
    if (target.word) targetByWord.set(target.word.toLowerCase(), target);
    if (target.surfaceForm) targetBySurface.set(target.surfaceForm.toLowerCase(), target);
  }

  // 1. Process questions from the model
  for (const raw of rawQuestions) {
    if (!raw.prompt || !raw.answer || !raw.distractors || raw.distractors.length === 0) {
      continue;
    }

    const cleanWord = raw.targetWord.toLowerCase().trim();
    const matched = targetByWord.get(cleanWord) ?? targetBySurface.get(cleanWord);
    if (!matched || usedEntryIds.has(matched.entryId)) {
      continue;
    }

    // Need 3 unique distractors that don't match the answer
    const answerClean = raw.answer.trim();
    const uniqueDistractors = [
      ...new Set(
        raw.distractors
          .map((d) => d.trim())
          .filter((d) => d.length > 0 && d.toLowerCase() !== answerClean.toLowerCase()),
      ),
    ];

    // If fewer than 3 distractors, pull fallback distractors from other entries
    while (uniqueDistractors.length < 3) {
      const fallbackEntry = allEntries.find(
        (e) =>
          e.translation &&
          e.translation.toLowerCase() !== answerClean.toLowerCase() &&
          !uniqueDistractors.includes(e.translation),
      );
      if (fallbackEntry?.translation) {
        uniqueDistractors.push(fallbackEntry.translation);
      } else {
        const fallbacks = ['to observe carefully', 'a sudden realization', 'to make progress', 'an unexpected challenge'];
        const fb = fallbacks.find(
          (f) => f.toLowerCase() !== answerClean.toLowerCase() && !uniqueDistractors.includes(f),
        );
        uniqueDistractors.push(fb ?? `alternative option ${uniqueDistractors.length + 1}`);
      }
    }

    const optionsToShuffle = [answerClean, ...uniqueDistractors.slice(0, 3)];
    const shuffled = shuffleArray(optionsToShuffle);
    const correctIndex = shuffled.indexOf(answerClean);

    usedEntryIds.add(matched.entryId);
    prepared.push({
      dictionaryEntryId: matched.entryId,
      targetWord: matched.word,
      order: prepared.length,
      prompt: raw.prompt,
      options: shuffled,
      correctIndex: correctIndex >= 0 ? correctIndex : 0,
      explanation: raw.explanation ?? `In this story, “${matched.word}” means “${answerClean}”.`,
    });

    if (prepared.length >= 4) break;
  }

  // 2. Fallback: if we have fewer than min(3, verifiedTargets.length), generate questions for unused targets
  const minRequired = Math.min(3, verifiedTargets.length);
  if (prepared.length < minRequired) {
    for (const target of verifiedTargets) {
      if (usedEntryIds.has(target.entryId)) continue;
      if (!target.translation) continue;

      const answer = target.translation;
      const distractors: string[] = [];

      for (const other of allEntries) {
        if (
          other.id !== target.entryId &&
          other.translation &&
          other.translation.toLowerCase() !== answer.toLowerCase() &&
          !distractors.includes(other.translation)
        ) {
          distractors.push(other.translation);
          if (distractors.length >= 3) break;
        }
      }

      while (distractors.length < 3) {
        const genericFallbacks = [
          'to prepare in advance',
          'a remarkable event',
          'to understand clearly',
          'a temporary state',
        ];
        const fb = genericFallbacks.find(
          (g) => g.toLowerCase() !== answer.toLowerCase() && !distractors.includes(g),
        );
        distractors.push(fb ?? `meaning ${distractors.length + 1}`);
      }

      const options = shuffleArray([answer, ...distractors.slice(0, 3)]);
      const correctIndex = options.indexOf(answer);

      usedEntryIds.add(target.entryId);
      prepared.push({
        dictionaryEntryId: target.entryId,
        targetWord: target.word,
        order: prepared.length,
        prompt: `What does the word “${target.word}” mean as used in this story?`,
        options,
        correctIndex: correctIndex >= 0 ? correctIndex : 0,
        explanation: `“${target.word}” means “${answer}”.`,
      });

      if (prepared.length >= 4) break;
    }
  }

  return prepared;
}
