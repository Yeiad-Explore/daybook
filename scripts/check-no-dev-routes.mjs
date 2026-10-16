// DEV-1 / C-DEV-01: after `next build`, no /dev route may exist in the production output.
import { existsSync, readFileSync } from "node:fs";

const manifest = ".next/app-path-routes-manifest.json";
if (!existsSync(manifest)) {
  console.error(`${manifest} not found: run \`pnpm build\` first.`);
  process.exit(1);
}
const routes = Object.values(JSON.parse(readFileSync(manifest, "utf8")));
const devRoutes = routes.filter((r) => r === "/dev" || r.startsWith("/dev/"));
if (devRoutes.length) {
  console.error(`Development-only routes found in the production build: ${devRoutes.join(", ")}`);
  process.exit(1);
}
console.log(`check:no-dev-routes ok (${routes.length} routes, none under /dev)`);
