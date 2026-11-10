import type { Agent } from "./rules";
import { validateAgentImport } from "./validation";
import { backupAAD, backupSchema, type EncryptedBackup } from "./backup-format";
import { validShareToken } from "./local-record";
import type { ShareCredentials } from "./share";

export type SheetBackup = { agent: Agent; credentials?: ShareCredentials };
const encode = (bytes: Uint8Array) => {
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 8192)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(text);
};
const decode = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
async function derive(password: string, salt: Uint8Array, usages: KeyUsage[]) {
  if (!crypto.subtle)
    throw Error("Abra o site por HTTPS para usar o backup protegido.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 600000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}
export async function encryptSheetBackup(
  value: SheetBackup,
  password: string,
): Promise<EncryptedBackup> {
  if (password.length < 12 || password.length > 256)
    throw Error("Use uma senha de 12 a 256 caracteres para o backup.");
  validateAgentImport({ version: 1, agent: value.agent });
  if (
    value.credentials &&
    (!validShareToken(value.credentials.masterToken) ||
      !validShareToken(value.credentials.playerToken))
  )
    throw Error("As chaves da ficha são inválidas. Nenhum backup foi enviado.");
  const plain = new TextEncoder().encode(JSON.stringify(value));
  if (plain.byteLength > 16_000_000)
    throw Error("A ficha excede 16 MB. Reduza as imagens antes do backup.");
  const zipped = new Uint8Array(
    await new Response(
      new Blob([plain]).stream().pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const header: Omit<EncryptedBackup, "ciphertext"> = {
    format: "fenix-encrypted-sheet",
    version: 1,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    algorithm: "AES-GCM",
    kdf: "PBKDF2-SHA256",
    iterations: 600000,
    compression: "gzip",
    salt: encode(salt),
    iv: encode(iv),
  };
  const key = await derive(password, salt, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: backupAAD(header) },
    key,
    zipped,
  );
  if (encrypted.byteLength > 2_700_000)
    throw Error(
      "A ficha continua grande após compactar. Reduza as imagens ou exporte o JSON pela ficha; nada foi enviado.",
    );
  return backupSchema.parse({
    ...header,
    ciphertext: encode(new Uint8Array(encrypted)),
  });
}
export async function decryptSheetBackup(
  raw: unknown,
  password: string,
): Promise<SheetBackup> {
  const value = backupSchema.parse(raw);
  let decrypted: ArrayBuffer;
  try {
    const key = await derive(password, decode(value.salt), ["decrypt"]);
    decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decode(value.iv),
        additionalData: backupAAD(value),
      },
      key,
      decode(value.ciphertext),
    );
  } catch {
    throw Error(
      "Senha incorreta ou backup danificado. Nenhuma ficha foi alterada.",
    );
  }
  const stream = new Blob([decrypted])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 16_000_000) {
        await reader.cancel();
        throw Error("Backup acima do limite de leitura.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const rawValue = JSON.parse(await new Blob(chunks as BlobPart[]).text());
  const agent = validateAgentImport({ version: 1, agent: rawValue.agent });
  const credentials = rawValue.credentials;
  if (
    credentials &&
    (!validShareToken(credentials.masterToken) ||
      !validShareToken(credentials.playerToken))
  )
    throw Error("As chaves do backup são inválidas.");
  return { agent, ...(credentials ? { credentials } : {}) };
}
