import { z } from "zod";

// SET-1 profile fields. Mirrors the database checks (C-SCH-06, profiles.currency) for friendly
// messages only; the database stays the authority.
export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const WEEK_STARTS = [
  { value: "6", label: "Sat" },
  { value: "0", label: "Sun" },
  { value: "1", label: "Mon" },
] as const;

export const profileFields = z.object({
  display_name: z.string().trim().max(80, "Keep your name under 80 characters."),
  timezone: z.string().refine(isValidTimeZone, "Pick a timezone from the list."),
  week_starts_on: z.union([z.literal(0), z.literal(1), z.literal(6)]),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, like BDT."),
  theme: z.enum(["light", "dark", "system"]),
});

export type ProfileFields = z.infer<typeof profileFields>;
