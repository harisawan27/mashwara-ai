import { createAuthClient } from "@neondatabase/neon-js/auth";

// Default production fallback for Neon Auth URL
export const DEFAULT_NEON_AUTH_URL =
  "https://ep-muddy-frog-adaf15fz.neonauth.c-2.us-east-1.aws.neon.tech/neondb/auth";

/**
 * Returns an instance of the official Neon Auth client.
 * Uses VITE_NEON_AUTH_URL if set, or dynamic backend configuration / default URL.
 */
export function getNeonAuthClient(baseUrl?: string) {
  const url =
    baseUrl ||
    import.meta.env.VITE_NEON_AUTH_URL ||
    DEFAULT_NEON_AUTH_URL;
  return createAuthClient(url);
}

/**
 * Singleton official Neon Auth client instance.
 */
export const neonAuthClient = getNeonAuthClient();
