import { healthResponseSchema, userSchema, type User } from '@vocabahn/shared';
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
