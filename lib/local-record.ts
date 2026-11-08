/** Never replace a damaged credential map with an empty map on a write. */
export function readLocalRecord<T>(
  key: string,
  valid: (value: unknown) => value is T,
): Record<string, T> {
  const raw = localStorage.getItem(key);
  if (raw === null) return {};
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Object.values(value).every(valid)
  )
    throw Error(
      "As chaves locais não puderam ser lidas. Os dados armazenados foram preservados.",
    );
  return value as Record<string, T>;
}
export const validShareToken = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
