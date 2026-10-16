import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DEV-1: pages named page.dev.tsx (e.g. /dev/primitives) exist only in development builds;
  // production builds do not see them at all (checked by `pnpm check:no-dev-routes` after a build).
  pageExtensions: process.env.NODE_ENV === "production" ? ["tsx", "ts"] : ["dev.tsx", "tsx", "ts"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
