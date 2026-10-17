"use client";

import { useState } from "react";

/**
 * Local state seeded from server props that follows them when a refresh brings new ones (React's
 * "adjusting state when a prop changes" pattern). Optimistic edits live here until router.refresh()
 * replaces them with the saved rows.
 */
export function useServerState<T>(server: T) {
  const [state, setState] = useState(server);
  const [seen, setSeen] = useState(server);
  if (server !== seen) {
    setSeen(server);
    setState(server);
  }
  return [state, setState] as const;
}
