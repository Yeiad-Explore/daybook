/** The position the reorder RPC gives an item between `before` and `after` (either may be null). */
export function positionBetween<T extends { id: string; position: number }>(list: T[], before: string | null, after: string | null) {
  const lo = list.find((t) => t.id === before)?.position;
  const hi = list.find((t) => t.id === after)?.position;
  if (lo !== undefined && hi !== undefined) return (lo + hi) / 2;
  if (lo !== undefined) return lo + 1;
  return hi !== undefined ? hi - 1 : 0;
}

/** Moves the item at `from` to `to` and returns the new list with the item's new neighbours. */
export function moveItem<T extends { id: string }>(list: T[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return { next, before: next[to - 1]?.id ?? null, after: next[to + 1]?.id ?? null };
}
