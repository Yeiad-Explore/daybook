import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { FullConfig } from "@playwright/test";

// TEST-1: signed-in e2e tests use email sign-in, which exists only in the LOCAL Supabase config.
// The owner is created (or updated) in the local database with a fresh random password each run,
// then signed in through @supabase/ssr so the cookies are exactly what the app writes.
export const OWNER_EMAIL = "ourcoc4@gmail.com";
export const OWNER_STATE = "e2e/.auth/owner.json";
/** A separate session, so the sign-out test cannot end the session the other tests share. */
export const SIGN_OUT_STATE = "e2e/.auth/sign-out.json";

export function localStack() {
  const lines = execSync("pnpm exec supabase status -o env", { encoding: "utf8" }).split(/\r?\n/);
  const vars = Object.fromEntries(
    lines.flatMap((line) => {
      const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
      return m ? [[m[1], m[2]]] : [];
    }),
  );
  const publishable = vars.PUBLISHABLE_KEY ?? vars.ANON_KEY;
  const secret = vars.SECRET_KEY ?? vars.SERVICE_ROLE_KEY;
  if (!vars.API_URL || !publishable || !secret) throw new Error("Local Supabase is not running (pnpm db:start).");
  return { url: vars.API_URL, publishable, secret };
}

export default async function globalSetup(config: FullConfig) {
  const { url, publishable, secret } = localStack();
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error(`Refusing to create test users on ${url}`);

  const password = randomBytes(24).toString("base64url");
  const admin = createClient(url, secret, { auth: { persistSession: false } });
  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  const existing = list.users.find((u) => u.email === OWNER_EMAIL);
  const { error } = existing
    ? await admin.auth.admin.updateUserById(existing.id, { password })
    : await admin.auth.admin.createUser({ email: OWNER_EMAIL, password, email_confirm: true });
  if (error) throw error;

  const ownerId = existing?.id ?? (await admin.auth.admin.listUsers()).data.users.find((u) => u.email === OWNER_EMAIL)!.id;

  // Every run starts from the PRD §5.8 profile defaults, whatever an earlier (failed) run left.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ display_name: null, timezone: "Asia/Dhaka", week_starts_on: 6, currency: "BDT", theme: "light" })
    .eq("id", ownerId);
  if (profileError) throw profileError;

  // Spaces the specs created in earlier runs go (deleted for good by trusted code; the Health and
  // Finance fixtures below stay), so the Index and Today only show this run's data.
  const { error: cleanError } = await admin.from("spaces").delete().eq("owner_id", ownerId).not("name", "in", "(Health,Finance)");
  if (cleanError) throw cleanError;

  // A little of the PRD §12 seed (only if missing), so the shell has a goal and a life area to show.
  const { data: spaces } = await admin.from("spaces").select("name").eq("owner_id", ownerId).is("deleted_at", null);
  if (!spaces?.some((s) => s.name === "Health")) {
    const { data: health, error: e1 } = await admin
      .from("spaces")
      .insert({ owner_id: ownerId, kind: "goal", name: "Health", mark: "moss", end_goal: "Reach 72 kg and run a 5K without stopping", start_date: "2026-09-01", deadline: "2027-01-31", position: 1 })
      .select("id")
      .single();
    if (e1) throw e1;
    const { error: e2 } = await admin.from("pages").insert({ owner_id: ownerId, space_id: health.id, title: "Workouts", position: 1 });
    if (e2) throw e2;
  }
  if (!spaces?.some((s) => s.name === "Finance")) {
    const { error } = await admin.from("spaces").insert({ owner_id: ownerId, kind: "area", name: "Finance", mark: "teal", position: 1 });
    if (error) throw error;
  }

  const cookies = await saveSession(url, publishable, password, OWNER_STATE);
  await saveSession(url, publishable, password, SIGN_OUT_STATE);

  // The dev server compiles each route on its first request; under parallel tests that first
  // compile can outlast an assertion's wait. Compile every route once, signed in, before tests.
  const baseURL = config.projects[0].use.baseURL;
  const { data: health } = await admin.from("spaces").select("id, pages(id)").eq("owner_id", ownerId).eq("name", "Health").single();
  const routes = ["/login", "/today", "/new", "/review", "/review/2026-10-10", "/history", "/settings", "/settings/calendar",
    "/settings/data", "/dev/primitives", "/no-such-page", `/s/${health?.id}`, `/s/${health?.id}/${health?.pages[0]?.id}`,
    `/s/${health?.id}/settings`];
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  for (const route of routes) {
    const res = await fetch(new URL(route, baseURL), { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(120_000) });
    await res.text(); // read it fully, so the render completes (an unread body cuts the stream)
  }
}

async function saveSession(url: string, publishable: string, password: string, path: string) {
  // Returns the session cookies (also saved to `path` as Playwright storage state).
  const jar = new Map<string, { value: string; maxAge?: number }>();
  const supabase = createServerClient(url, publishable, {
    cookies: {
      getAll: () => [...jar].map(([name, c]) => ({ name, value: c.value })),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => jar.set(name, { value, maxAge: options.maxAge })),
    },
  });
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: OWNER_EMAIL, password });
  if (signInError) throw signInError;

  const now = Math.floor(Date.now() / 1000);
  const cookies = [...jar].map(([name, c]) => ({ name, value: c.value }));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      cookies: [...jar].map(([name, c]) => ({
        name,
        value: c.value,
        domain: "localhost",
        path: "/",
        expires: c.maxAge ? now + c.maxAge : -1, // -1 would be a session cookie (lost on browser restart)
        httpOnly: false,
        secure: false,
        sameSite: "Lax" as const,
      })),
      origins: [],
    }),
  );
  return cookies;
}
