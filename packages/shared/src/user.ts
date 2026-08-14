import { z } from 'zod';

export const CEFR_LEVELS = [
  'A1.1',
  'A1.2',
  'A2.1',
  'A2.2',
  'B1.1',
  'B1.2',
  'B2.1',
  'B2.2',
  'C1.1',
  'C1.2',
  'C2.1',
  'C2.2',
] as const;

export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const MAIN_CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

export type MainCefrLevel = (typeof MAIN_CEFR_LEVELS)[number];

export function cefrIndex(level: string | null | undefined): number | null {
  if (!level) return null;
  const index = CEFR_LEVELS.indexOf(level as CefrLevel);
  if (index !== -1) return index;
  const subLevel = `${level}.1`;
  const mainIndex = CEFR_LEVELS.indexOf(subLevel as CefrLevel);
  return mainIndex === -1 ? null : mainIndex;
}

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  timezone: z.string().nullable().optional(),
  cefrLevel: z.string().nullable(),
  // Topic slugs from STORY_TOPICS. Empty means no preference stated, which the
  // story picker reads as "any topic", not "no topics".
  interests: z.array(z.string()).default([]),
});

export type User = z.infer<typeof userSchema>;

export const updateInterestsSchema = z.object({
  interests: z.array(z.string().min(1).max(50)).max(50),
});

export type UpdateInterestsBody = z.infer<typeof updateInterestsSchema>;

export const updateCefrLevelSchema = z.object({
  cefrLevel: z.string().nullable(),
});

export type UpdateCefrLevelBody = z.infer<typeof updateCefrLevelSchema>;

/** Body for the mobile-ready sign-in endpoint (POST /auth/google/token). */
export const googleIdTokenSignInSchema = z.object({
  idToken: z.string().min(10),
});

export type GoogleIdTokenSignIn = z.infer<typeof googleIdTokenSignInSchema>;

/** JSON token pair returned to non-cookie (native) clients. */
export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userSchema,
});

export type AuthTokens = z.infer<typeof authTokensSchema>;

export const authConfigSchema = z.object({
  googleClientId: z.string().nullable(),
});

export type AuthConfig = z.infer<typeof authConfigSchema>;

export const CEFR_LEVELS_LIST = CEFR_LEVELS;

