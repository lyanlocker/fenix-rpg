import { z } from "zod";

export const backupSchema = z
  .object({
    format: z.literal("fenix-encrypted-sheet"),
    version: z.literal(1),
    id: z
      .string()
      .uuid()
      .regex(/^[a-f0-9-]{36}$/),
    createdAt: z
      .string()
      .datetime()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    algorithm: z.literal("AES-GCM"),
    kdf: z.literal("PBKDF2-SHA256"),
    iterations: z.literal(600000),
    compression: z.literal("gzip"),
    salt: z.string().regex(/^[A-Za-z0-9+/]{22}==$/),
    iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
    ciphertext: z
      .string()
      .min(24)
      .max(3_600_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type EncryptedBackup = z.infer<typeof backupSchema>;
export const backupBranch = "fenix-backups";
export const backupPathPattern = /^sheets\/\d{17}Z-[a-f0-9-]{36}\.fenix\.json$/;
export function backupPath(value: Pick<EncryptedBackup, "id" | "createdAt">) {
  return `sheets/${value.createdAt.replace(/[-:.T]/g, "")}-${value.id}.fenix.json`;
}
export function backupAAD(value: Omit<EncryptedBackup, "ciphertext">) {
  return new TextEncoder().encode(
    JSON.stringify([
      value.format,
      value.version,
      value.id,
      value.createdAt,
      value.algorithm,
      value.kdf,
      value.iterations,
      value.compression,
      value.salt,
      value.iv,
    ]),
  );
}
export type BackupListing = { path: string; sha: string; size: number };

export function backupDate(path: string) {
  const digits = path.slice(7, 24);
  if (!/^\d{17}$/.test(digits)) return "Versão salva";
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}.${digits.slice(14)}Z`;
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}
