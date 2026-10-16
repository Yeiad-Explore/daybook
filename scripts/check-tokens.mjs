// CONSTRAINTS.md floor + ADR 0002: raw colour values may only appear in the token file.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/g;
const ALLOWED = new Set(["src/styles/tokens.css"]);
const EXTENSIONS = /\.(tsx?|css|mdx?)$/;

export function findRawColours(text) {
  return text.split("\n").flatMap((line, i) =>
    [...line.matchAll(RAW_COLOUR)].map((m) => ({ line: i + 1, match: m[0] })),
  );
}

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (EXTENSIONS.test(name)) yield path;
  }
}

export function scan(root) {
  const problems = [];
  for (const path of files(join(root, "src"))) {
    const rel = relative(root, path).split(sep).join("/");
    if (ALLOWED.has(rel)) continue;
    for (const hit of findRawColours(readFileSync(path, "utf8"))) problems.push(`${rel}:${hit.line} ${hit.match}`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = scan(process.cwd());
  if (problems.length) {
    console.error(`Raw colour values outside src/styles/tokens.css (use DESIGN.md tokens):\n${problems.join("\n")}`);
    process.exit(1);
  }
  console.log("check:tokens ok");
}
