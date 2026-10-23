import type { SignInWithOAuthCredentials } from "@supabase/supabase-js";

// AUTH-1 AC2 / GC-1: ask for Calendar events and offline access with consent at sign-in, so Google
// returns a refresh token and Calendar sync needs no second consent screen.
export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";

export function googleSignInOptions(origin: string): SignInWithOAuthCredentials {
  return {
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: CALENDAR_EVENTS_SCOPE,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  };
}
