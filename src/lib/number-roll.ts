/** DESIGN.md Motion: a big number rolls to its new value in 300ms. */
export const ROLL_MS = 300;

/** Linear position of a roll. Reduced motion, and any frame at or past the end, is the target. */
export function rollFrame(from: number, to: number, elapsedMs: number, reduce: boolean): number {
  if (reduce || from === to || elapsedMs >= ROLL_MS) return to;
  const t = Math.max(0, elapsedMs) / ROLL_MS;
  return from + (to - from) * t;
}
