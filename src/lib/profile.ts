import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  display_name: string | null;
  timezone: string;
  week_starts_on: number;
  currency: string;
  theme: "system" | "light" | "dark";
  /** What to call the owner: display name, else the Google account name, else the email. */
  name: string;
};

/** The signed-in owner's profile, once per request (null when signed out). */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, timezone, week_starts_on, currency, theme")
    .eq("id", claims.claims.sub)
    .maybeSingle();
  if (!data) return null;
  const meta = claims.claims.user_metadata as { full_name?: string } | undefined;
  return { ...data, name: data.display_name ?? meta?.full_name ?? claims.claims.email ?? "You" };
});
