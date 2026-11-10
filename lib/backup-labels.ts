const key = "fenix.backup-labels.v1";
function read(): Record<string, string> {
  const value = JSON.parse(localStorage.getItem(key) || "{}");
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    !Object.values(value).every((x) => typeof x === "string")
  )
    throw Error("labels");
  return value;
}
export function backupLabel(path: string) {
  try {
    return read()[path] || "Backup de ficha";
  } catch {
    return "Backup de ficha";
  }
}
export function rememberBackupLabel(path: string, name: string) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...read(), [path]: name }));
  } catch {
    /* Optional local names never affect backup success. */
  }
}
