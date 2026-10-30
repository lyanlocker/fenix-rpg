import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export const sessionSeconds = 8 * 60 * 60;
export const sessionCookie = "__Host-fenix-github";
export type GithubSession = {
  token: string;
  userId: number;
  expires: number;
  origin: string;
};
export class SyncError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function key(secret: string) {
  if (secret.length < 32)
    throw new SyncError("A conexão com GitHub ainda não foi configurada.", 503);
  return createHash("sha256").update(secret).digest();
}
export function sealSession(session: GithubSession, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from("fenix-github-session-v1"));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}
export function openSession(
  value: string,
  secret: string,
  origin: string,
  now = Date.now(),
): GithubSession | null {
  try {
    if (value.length > 3000) return null;
    const bytes = Buffer.from(value, "base64url");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(secret),
      bytes.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from("fenix-github-session-v1"));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const session = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    );
    if (
      session.origin !== origin ||
      typeof session.expires !== "number" ||
      !Number.isFinite(session.expires) ||
      session.expires <= now ||
      session.expires > now + sessionSeconds * 1000 ||
      typeof session.token !== "string" ||
      !/^github_pat_[A-Za-z0-9_]{20,240}$/.test(session.token) ||
      typeof session.userId !== "number"
    )
      return null;
    return session;
  } catch {
    return null;
  }
}

export function assertSameOrigin(request: Request) {
  const origin = new URL(request.url).origin;
  if (
    request.headers.get("origin") !== origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new SyncError("Abra esta ação diretamente no Fênix.", 403);
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new SyncError("Formato de envio inválido.", 415);
}

export async function readBoundedJson(
  request: Request,
  maximum: number,
): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maximum)
    throw new SyncError("Arquivo muito grande.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new SyncError("Envio vazio.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maximum) {
        await reader.cancel();
        throw new SyncError("Arquivo muito grande.", 413);
      }
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof SyncError) throw error;
    throw new SyncError("O arquivo enviado não pôde ser lido.");
  } finally {
    reader.releaseLock();
  }
}
