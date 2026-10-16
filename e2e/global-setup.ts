import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// TEST-1: signed-in e2e tests use email sign-in, which exists only in the LOCAL Supabase config.
// The owner is created (or updated) in the local database with a fresh random password each run,
// then signed in through @supabase/ssr so the cookies are exactly what the app writes.
export const OWNER_EMAIL = "ourcoc4@gmail.com";
export const OWNER_STATE = "e2e/.auth/owner.json";

function localStack() {
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

export default async function globalSetup() {
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
  mkdirSync(dirname(OWNER_STATE), { recursive: true });
  writeFileSync(
    OWNER_STATE,
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
}
