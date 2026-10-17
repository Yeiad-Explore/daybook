/** Moves the item at `from` to `to` and returns the new list with the item's new neighbours. */
export function moveItem<T extends { id: string }>(list: T[], from: number, to: number) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return { next, before: next[to - 1]?.id ?? null, after: next[to + 1]?.id ?? null };
}
