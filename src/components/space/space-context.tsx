"use client";

import { createContext, useContext } from "react";
import type { Block, Space } from "@/lib/space-page";

export type SpaceCtx = {
  space: Pick<Space, "id" | "kind" | "name" | "deadline" | "mark">;
  pageId: string;
  /** The owner's local date (TODAY-1) and timezone (NFR-6). */
  today: string;
  timezone: string;
  /** Blocks on this page (TODO-6 books time in the first Time block here). */
  blocks: Block[];
};

const Ctx = createContext<SpaceCtx | null>(null);

export const SpaceProvider = Ctx.Provider;

export function useSpace() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useSpace needs a SpaceProvider");
  return value;
}
