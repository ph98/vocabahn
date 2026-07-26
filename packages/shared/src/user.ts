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
