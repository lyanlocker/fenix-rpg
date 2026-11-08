import type { Agent, Item } from "./rules";

// Send only fields edited since this view was opened. Missing optional fields
// remain missing (not JSON null), so deletion can be compared atomically too.
export function agentPatch(before: Agent, after: Agent) {
  if (before.id !== after.id)
    throw Error("A edição não corresponde à ficha aberta.");
  const expected: Record<string, unknown> = {},
    changes: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === "id" || key === "owner_id") continue;
    const k = key as keyof Agent;
    if (JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
    if (before[k] !== undefined) expected[key] = before[k];
    if (after[k] !== undefined) changes[key] = after[k];
  }
  return { expected, changes };
}

/** Preserve unrelated inventory edits, but never resurrect or overwrite a stale item. */
export function replaceInventoryItem(
  inventory: Item[],
  next: Item,
  original?: Item,
) {
  const current = inventory.find((entry) => entry.id === next.id);
  if (
    (original && original.id !== next.id) ||
    JSON.stringify(current) !== JSON.stringify(original)
  )
    throw Error(
      "Este item mudou ou foi removido enquanto a edição estava aberta. Feche e abra a edição novamente.",
    );
  return current
    ? inventory.map((entry) => (entry.id === next.id ? next : entry))
    : [...inventory, next];
}
