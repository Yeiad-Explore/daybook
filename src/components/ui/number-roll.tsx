"use client";

import { useEffect, useRef, useState } from "react";
import { ROLL_MS, rollFrame } from "@/lib/number-roll";

function shownText(shown: number, value: number) {
  if (shown === value) return String(value);
  return Number.isInteger(value) ? String(Math.round(shown)) : shown.toFixed(1);
}

/**
 * DESIGN.md Motion: 300ms roll when a big value changes. The first paint shows the value as it
 * arrived (the blur-in covers that); only a later change rolls. Reduced motion snaps.
 */
export function NumberRoll({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let cancel = false;
    if (reduce) {
      // A microtask, not a sync setState: the lint rule forbids the latter, and this still lands
      // before the next paint.
      queueMicrotask(() => {
        if (cancel) return;
        shownRef.current = value;
        setShown(value);
      });
      return () => {
        cancel = true;
      };
    }
    const start = performance.now();
    const tick = (now: number) => {
      if (cancel) return;
      const next = rollFrame(from, value, now - start, false);
      shownRef.current = next;
      setShown(next);
      if (now - start < ROLL_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancel = true;
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return <span>{shownText(shown, value)}</span>;
}
