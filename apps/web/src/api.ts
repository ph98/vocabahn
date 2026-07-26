import {
  courseDetailSchema,
  courseListResponseSchema,
  dashboardResponseSchema,
  deckDetailSchema,
  deckListResponseSchema,
  deckSummarySchema,
  dictionaryEntryDetailSchema,
  dictionarySearchResponseSchema,
  dueCardsResponseSchema,
  entryFeedbackSchema,
  enrollResponseSchema,
  healthResponseSchema,
  knownWordsResponseSchema,
  submitReviewResponseSchema,
  syncReviewsResponseSchema,
  userSchema,
  type CreateDeckBody,
  type ReviewRating,
  type SubmitFeedbackBody,
  type SyncReviewItem,
  type UpdateDeckBody,
  type User,
} from '@vocabahn/shared';
import axios, { isAxiosError } from 'axios';

export const api = axios.create({ baseURL: '/api/v1' });

export async function fetchHealth() {
  const { data } = await api.get('/health');
  return healthResponseSchema.parse(data);
}

/** Returns the signed-in user, or null when signed out (after one silent refresh attempt). */
export async function fetchMe(): Promise<User | null> {
  try {
    const { data } = await api.get('/auth/me');
    return userSchema.parse(data);
  } catch (error) {
    if (!isAxiosError(error) || error.response?.status !== 401) {
      // Rate-limited or transient failure: settle into the signed-out state
      // instead of throwing — a throw makes react-query retry, and stacked
      // retries across remounts can storm the API into its throttler.
      return null;
    }
  }

  try {
    await api.post('/auth/refresh');
    const { data } = await api.get('/auth/me');
    return userSchema.parse(data);
  } catch {
    return null;
  }
}

export async function logout() {
  await api.post('/auth/logout');
}

export async function googleOneTapLogin(idToken: string): Promise<User> {
  const { data } = await api.post('/auth/google/onetap', { idToken });
  return userSchema.parse(data);
}

export async function searchDictionary(q: string) {
  const { data } = await api.get('/dictionary/search', { params: { q } });
  return dictionarySearchResponseSchema.parse(data).results;
}

export async function fetchDictionaryEntry(word: string, timezone?: string | object) {
  const tz = typeof timezone === 'string' ? timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data } = await api.get(`/dictionary/${encodeURIComponent(word)}`, { params: { timezone: tz } });
  return dictionaryEntryDetailSchema.parse(data);
}

export async function fetchCourses() {
  const { data } = await api.get('/courses');
  return courseListResponseSchema.parse(data).courses;
}

export async function fetchCourse(slug: string) {
  const { data } = await api.get(`/courses/${encodeURIComponent(slug)}`);
  return courseDetailSchema.parse(data);
}

export async function enrollCourse(slug: string) {
  const { data } = await api.post(`/courses/${encodeURIComponent(slug)}/enroll`);
  return enrollResponseSchema.parse(data);
}

export async function fetchDueCards(courseId?: string, deckId?: string) {
  const { data } = await api.get('/reviews/due', {
    params: {
      ...(courseId ? { courseId } : {}),
      ...(deckId ? { deckId } : {}),
    },
  });
  return dueCardsResponseSchema.parse(data).cards;
}

export async function submitReview(
  cardId: string,
  body: { rating: ReviewRating; latencyMs?: number },
) {
  const { data } = await api.post(`/reviews/${encodeURIComponent(cardId)}`, body);
  return submitReviewResponseSchema.parse(data);
}

export async function syncReviews(reviews: SyncReviewItem[]) {
  const { data } = await api.post('/reviews/sync', { reviews });
  return syncReviewsResponseSchema.parse(data).synced;
}

export async function fetchKnownWords() {
  const { data } = await api.get('/knowledge/known');
  return knownWordsResponseSchema.parse(data).words;
}

export async function undoKnownWord(cardId: string) {
  await api.post(`/knowledge/${encodeURIComponent(cardId)}/undo`);
}

export async function bulkUndoKnownWords(cardIds: string[]) {
  await api.post('/knowledge/bulk-undo', { cardIds });
}

export async function markWordKnown(entryId: string) {
  await api.post(`/knowledge/entry/${encodeURIComponent(entryId)}/mark-known`);
}

export async function fetchDashboard(timezone?: string | object) {
  const tz = typeof timezone === 'string' ? timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data } = await api.get('/dashboard', { params: { timezone: tz } });
  return dashboardResponseSchema.parse(data);
}

export async function fetchFeedback(word: string) {
  const { data } = await api.get(`/dictionary/${encodeURIComponent(word)}/feedback`);
  return entryFeedbackSchema.parse(data);
}

export async function submitFeedback(word: string, body: SubmitFeedbackBody) {
  const { data } = await api.post(`/dictionary/${encodeURIComponent(word)}/feedback`, body);
  return entryFeedbackSchema.parse(data);
}

export async function requestEmailSignIn(email: string): Promise<void> {
  await api.post('/auth/email/request', { email });
}

export async function fetchEnrichmentQuota(timezone?: string | object): Promise<{ used: number; cap: number }> {
  const tz = typeof timezone === 'string' ? timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data } = await api.get('/dictionary/quota', { params: { timezone: tz } });
  return data as { used: number; cap: number };
}

export async function fetchDecks() {
  const { data } = await api.get('/decks');
  return deckListResponseSchema.parse(data);
}

export async function fetchDeck(id: string) {
  const { data } = await api.get(`/decks/${encodeURIComponent(id)}`);
  return deckDetailSchema.parse(data);
}

export async function createDeck(body: CreateDeckBody) {
  const { data } = await api.post('/decks', body);
  return deckSummarySchema.parse(data);
}

export async function importWordsToDeck(id: string, words: string[]) {
  const { data } = await api.post(`/decks/${encodeURIComponent(id)}/import`, { words });
  return data as { imported: number; failed: string[] };
}

export async function updateDeck(id: string, body: UpdateDeckBody) {
  const { data } = await api.patch(`/decks/${encodeURIComponent(id)}`, body);
  return deckSummarySchema.parse(data);
}

export async function deleteDeck(id: string) {
  await api.delete(`/decks/${encodeURIComponent(id)}`);
}

export async function addWordToDeck(deckId: string, entryId: string) {
  await api.post(`/decks/${encodeURIComponent(deckId)}/words`, { entryId });
}

export async function removeWordFromDeck(deckId: string, entryId: string) {
  await api.delete(`/decks/${encodeURIComponent(deckId)}/words/${encodeURIComponent(entryId)}`);
}

export async function fetchKnowledgeSuggestions(limit = 50) {
  const { data } = await api.get(`/knowledge/suggestions?limit=${limit}`);
  return data;
}

export async function bulkMarkKnownWords(dictionaryEntryIds: string[]): Promise<void> {
  await api.post('/knowledge/bulk-mark-known', { dictionaryEntryIds });
}
