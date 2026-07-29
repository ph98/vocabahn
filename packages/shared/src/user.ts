import { z } from 'zod';

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  avatarUrl: z.string().url().nullable(),
  timezone: z.string().nullable().optional(),
  cefrLevel: z.string().nullable(),
});

export type User = z.infer<typeof userSchema>;

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

export const CEFR_LEVELS_LIST = [
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

export const updateCefrLevelSchema = z.object({
  cefrLevel: z.enum(CEFR_LEVELS_LIST).nullable(),
});

export type UpdateCefrLevelBody = z.infer<typeof updateCefrLevelSchema>;
