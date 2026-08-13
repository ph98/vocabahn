/**
 * Canned API payloads for the mocked (PR-check) specs.
 *
 * The web client parses almost every response through a Zod schema in
 * `packages/shared`, so a stub that omits a required field does not produce a
 * helpful failure — it produces a signed-out landing page, or an empty list,
 * and the test fails several assertions later on something unrelated. Building
 * the stubs from one place, shaped to the schemas, keeps that from happening
 * silently the next time a field is added.
 */

/** Matches `userSchema`. */
export const mockUser = {
  id: 'e2e-user',
  email: 'e2e@vocabahn.test',
  name: 'E2E User',
  avatarUrl: null,
  timezone: 'Europe/Berlin',
  cefrLevel: null,
  interests: [],
};

/** Matches `healthResponseSchema`. */
export const mockHealth = {
  status: 'ok',
  services: { database: 'up', redis: 'up' },
  timestamp: '2026-01-01T00:00:00.000Z',
};

/** One element of `dictionarySearchResponseSchema.results`. */
export function mockSearchResult(overrides: Record<string, unknown> = {}) {
  return {
    word: 'Haus',
    pos: 'noun',
    gender: 'neuter',
    translation: 'house',
    emoji: '🏠',
    cefrLevel: 'A1.1',
    frequencyRank: 120,
    enrichmentStatus: 'ENRICHED',
    ...overrides,
  };
}

/** Matches `dictionaryEntryDetailSchema` — every field, since none are optional. */
export function mockEntryDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    word: 'Haus',
    pos: 'noun',
    gender: 'neuter',
    ipa: '/haʊ̯s/',
    hyphenation: 'Haus',
    etymology: null,
    frequencyRank: 120,
    translation: 'house',
    emoji: '🏠',
    cefrLevel: 'A1.1',
    usageNote: null,
    collocations: [],
    falseFriends: [],
    register: null,
    mnemonic: null,
    imageUrl: null,
    audioUrl: null,
    enrichmentStatus: 'ENRICHED',
    examples: [],
    senses: [],
    forms: [],
    conjugation: null,
    nounDeclension: null,
    adjectiveDeclension: null,
    wordFamily: [],
    pronunciation: [],
    topics: [],
    formOf: null,
    imageCredit: null,
    ...overrides,
  };
}

/** Matches `reviewCardSchema`. */
export function mockDueCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-1',
    due: '2026-01-01T00:00:00.000Z',
    state: 'NEW',
    reps: 0,
    lapses: 0,
    entry: {
      id: 'entry-1',
      word: 'lernen',
      pos: 'verb',
      translation: 'to learn',
      emoji: '📚',
      imageUrl: null,
      audioUrl: null,
      examples: [],
    },
    ...overrides,
  };
}

export const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});
