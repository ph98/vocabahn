import {
  courseDetailSchema,
  courseListResponseSchema,
  dictionaryEntryDetailSchema,
  dictionarySearchResponseSchema,
  dueCardsResponseSchema,
  enrollResponseSchema,
  healthResponseSchema,
  submitReviewResponseSchema,
  userSchema,
  type ReviewMode,
  type ReviewRating,
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
    if (!isAxiosError(error) || error.response?.status !== 401) throw error;
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

export async function searchDictionary(q: string) {
  const { data } = await api.get('/dictionary/search', { params: { q } });
  return dictionarySearchResponseSchema.parse(data).results;
}

export async function fetchDictionaryEntry(word: string) {
  const { data } = await api.get(`/dictionary/${encodeURIComponent(word)}`);
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

export async function fetchDueCards(courseId?: string) {
  const { data } = await api.get('/reviews/due', { params: courseId ? { courseId } : undefined });
  return dueCardsResponseSchema.parse(data).cards;
}

export async function submitReview(
  cardId: string,
  body: { rating: ReviewRating; mode: ReviewMode; latencyMs?: number },
) {
  const { data } = await api.post(`/reviews/${encodeURIComponent(cardId)}`, body);
  return submitReviewResponseSchema.parse(data).card;
}
