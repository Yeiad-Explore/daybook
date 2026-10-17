import { cache } from "react";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type Profile = Pick<Tables<"profiles">, "id" | "display_name" | "timezone" | "week_starts_on" | "currency" | "theme"> & {
  /** PG AC: the page last opened in each space ({spaceId: pageId}). */
  last_page_by_space: Record<string, string>;
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
    .select("id, display_name, timezone, week_starts_on, currency, theme, last_page_by_space")
    .eq("id", claims.claims.sub)
    .maybeSingle();
  if (!data) return null;
  const meta = claims.claims.user_metadata as { full_name?: string } | undefined;
  return { ...data, last_page_by_space: data.last_page_by_space as Record<string, string>, name: data.display_name ?? meta?.full_name ?? claims.claims.email ?? "You" };
});
