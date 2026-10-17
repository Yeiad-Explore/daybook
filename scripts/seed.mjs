// Loads the PRD §12 seed into the LOCAL Supabase stack: `pnpm seed` (with the dev examples) or
// `pnpm seed -- --empty` (structure only). Optional `--email=you@example.com` (default: the owner).
// The owner must exist (sign in once) and must have no spaces: the database refuses otherwise (C-SEED-01).
// Each space also gets its original cover photo from supabase/seed-assets/covers/.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const empty = args.includes("--empty");
const email = (args.find((a) => a.startsWith("--email=")) ?? "--email=ourcoc4@gmail.com").slice("--email=".length);

function localStack() {
  const lines = execSync("pnpm exec supabase status -o env", { encoding: "utf8" }).split(/\r?\n/);
  const vars = Object.fromEntries(lines.flatMap((l) => (l.match(/^([A-Z_]+)="?(.*?)"?$/) ? [[RegExp.$1, RegExp.$2]] : [])));
  const secret = vars.SECRET_KEY ?? vars.SERVICE_ROLE_KEY;
  if (!vars.API_URL || !secret) throw new Error("Local Supabase is not running (pnpm db:start).");
  return { url: vars.API_URL, secret };
}

const { url, secret } = localStack();
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error(`Refusing to seed ${url}: this script is for the local stack.`);
const admin = createClient(url, secret, { auth: { persistSession: false } });

const { data: users, error: listError } = await admin.auth.admin.listUsers();
if (listError) throw listError;
const owner = users.users.find((u) => u.email === email);
if (!owner) throw new Error(`No user ${email} in the local database. Sign in once, then run this again.`);

const { data: ids, error } = await admin.rpc("seed_owner", { p_owner: owner.id, p_examples: !empty });
if (error) throw new Error(error.code === "55000" ? `${email} already has spaces; reset the local database first (pnpm db:reset).` : error.message);

// Covers: one original image per mark, uploaded to <owner>/<space>/cover.webp.
const { data: spaces } = await admin.from("spaces").select("id, name, mark").eq("owner_id", owner.id);
let covers = 0;
for (const s of spaces ?? []) {
  const file = `supabase/seed-assets/covers/${s.mark}.webp`;
  if (!existsSync(file)) continue;
  const path = `${owner.id}/${s.id}/cover.webp`;
  const up = await admin.storage.from("covers").upload(path, readFileSync(file), { contentType: "image/webp", upsert: true });
  if (up.error) throw up.error;
  const { error: updateError } = await admin.from("spaces").update({ cover_path: path }).eq("id", s.id);
  if (updateError) throw updateError;
  covers += 1;
}
console.log(`Seeded ${Object.keys(ids).length} spaces for ${email}${empty ? " (structure only)" : " with examples"}, ${covers} covers.`);
