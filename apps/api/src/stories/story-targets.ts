/**
 * The model is asked to copy each inflected form verbatim out of the story it
 * just wrote, but nothing stops it paraphrasing. A target the reader cannot
 * actually find in the text would render as a highlight over the wrong word, so
 * every claim is checked against the text before it reaches the database.
 */
export function validateTargets(
  text: string,
  claimed: { word: string; surfaceForm: string }[],
  entries: { id: string; word: string }[],
): { entryId: string; surfaceForm: string }[] {
  const byWord = new Map(entries.map((e) => [e.word.toLowerCase(), e.id]));
  const seen = new Set<string>();
  const out: { entryId: string; surfaceForm: string }[] = [];

  for (const { word, surfaceForm } of claimed) {
    const entryId = byWord.get(word.toLowerCase());
    // Unknown headword (the model invented one), or the form isn't really there.
    if (!entryId || !surfaceForm || !text.includes(surfaceForm)) continue;
    // One target per entry — StoryTarget is unique on (storyId, entryId).
    if (seen.has(entryId)) continue;
    seen.add(entryId);
    out.push({ entryId, surfaceForm });
  }

  return out;
}
