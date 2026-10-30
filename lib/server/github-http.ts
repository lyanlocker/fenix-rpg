import { cookies } from "next/headers";
import { ZodError } from "zod";
import { githubOwnerId } from "../threat-library";
import { openSession, sessionCookie, SyncError } from "./github-session";

export const noStore = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export function configured() {
  return (
    (process.env.FENIX_GITHUB_SESSION_SECRET?.length || 0) >= 32 &&
    process.env.VERCEL_ENV !== "preview"
  );
}
export function assertConfigured(request: Request) {
  if (!configured())
    throw new SyncError(
      "Conexão disponível somente no site principal, após a configuração administrativa.",
      503,
    );
  const origin = process.env.FENIX_GITHUB_ORIGIN;
  if (!origin || new URL(request.url).origin !== origin)
    throw new SyncError(
      "Use o endereço principal do Fênix para conectar o GitHub.",
      403,
    );
}
export async function getSession(request: Request) {
  const cookie = (await cookies()).get(sessionCookie)?.value;
  if (!cookie || !configured()) return null;
  const session = openSession(
    cookie,
    process.env.FENIX_GITHUB_SESSION_SECRET || "",
    new URL(request.url).origin,
  );
  return session?.userId === githubOwnerId ? session : null;
}
export async function requireSession(request: Request) {
  assertConfigured(request);
  const session = await getSession(request);
  if (!session)
    throw new SyncError(
      "Conecte seu GitHub antes de publicar no catálogo.",
      401,
    );
  return session;
}
export function errorResponse(error: unknown) {
  const safe =
    error instanceof SyncError
      ? error
      : error instanceof ZodError
        ? new SyncError("Confira os dados da criatura e tente novamente.")
        : new SyncError(
            "Não foi possível concluir o envio. Sua ficha e o arquivo escolhido continuam disponíveis para tentar novamente.",
            500,
          );
  return Response.json(
    { error: safe.message },
    {
      status: safe.status >= 400 && safe.status < 600 ? safe.status : 500,
      headers: noStore,
    },
  );
}
