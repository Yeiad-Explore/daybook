import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";
import { getProfile } from "@/lib/profile";
import { Providers } from "./providers";

// Self-hosted at build time by next/font: no request to Google from the browser (NFR-4).
// DESIGN.md: Inter for UI text, Inter Tight for headlines and big numbers.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });

export const metadata: Metadata = {
  title: "Daybook",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Light unless the owner chose dark or "system" (SET-1). Set on the server, so no flash on load.
  const theme = (await getProfile())?.theme ?? "light";
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning className={`${inter.variable} ${interTight.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
