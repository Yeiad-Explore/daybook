import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DEV-1: pages named page.dev.tsx (e.g. /dev/primitives) exist only in development builds;
  // production builds do not see them at all (checked by `pnpm check:no-dev-routes` after a build).
  pageExtensions: process.env.NODE_ENV === "production" ? ["tsx", "ts"] : ["dev.tsx", "tsx", "ts"],
  // NFR-3 baseline hardening: no framing (clickjacking), no MIME sniffing, no full URLs leaked as
  // referrers, no device APIs. A full script CSP is on docs/launch-checklist.md.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
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
