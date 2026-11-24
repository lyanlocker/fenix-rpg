import {
  assertSameOrigin,
  readBoundedJson,
  SyncError,
} from "@/lib/server/github-session";
import { neonEnabled, neonRpc, RpcError } from "@/lib/server/neon-rpc";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  try {
    if (!neonEnabled())
      throw new RpcError("Backend alternativo indisponível.", 503);
    assertSameOrigin(request);
    const payload = await readBoundedJson(request, 4_000_000);
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new RpcError("Envio inválido.", 400);
    const input = payload as Record<string, unknown>;
    if (
      typeof input.name !== "string" ||
      !Object.hasOwn(input, "body") ||
      Object.keys(input).some((key) => key !== "body" && key !== "name")
    )
      throw new RpcError("Envio inválido.", 400);
    return Response.json(await neonRpc(input.name, input.body), { headers });
  } catch (error) {
    if (error instanceof SyncError || error instanceof RpcError)
      return Response.json(
        { message: error.message },
        { status: error.status, headers },
      );
    return Response.json(
      { message: "Operação indisponível." },
      { status: 503, headers },
    );
  }
}
