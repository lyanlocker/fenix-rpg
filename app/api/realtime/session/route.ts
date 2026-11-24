import { assertSameOrigin, readBoundedJson, SyncError } from "@/lib/server/github-session";
import { createRealtimeSession, realtimeAccess, realtimeEnabled } from "@/lib/server/realtime";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (!realtimeEnabled()) return Response.json({ message: "Sincronização complementar indisponível." }, { status: 503, headers });
    const input = realtimeAccess.safeParse(await readBoundedJson(request, 2048));
    if (!input.success) return Response.json({ message: "Acesso inválido." }, { status: 400, headers });
    return Response.json(await createRealtimeSession(input.data), { headers });
  } catch (error) {
    return Response.json({ message: "Sincronização complementar indisponível." }, { status: error instanceof SyncError ? error.status : 403, headers });
  }
}
