import { githubClient, verifyGithubOwner } from "@/lib/server/github-threats";
import {
  requireSession,
  noStore,
  errorResponse,
} from "@/lib/server/github-http";
import { assertSameOrigin, readBoundedJson } from "@/lib/server/github-session";
import { backupSchema } from "@/lib/backup-format";
import {
  listGithubBackups,
  readGithubBackup,
  saveGithubBackup,
} from "@/lib/server/github-backups";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const session = await requireSession(request),
      client = githubClient(session.token);
    await verifyGithubOwner(client);
    const path = new URL(request.url).searchParams.get("path");
    return Response.json(
      path
        ? { backup: await readGithubBackup(client, path) }
        : { backups: await listGithubBackups(client) },
      { headers: noStore },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const value = backupSchema.parse(await readBoundedJson(request, 3_800_000));
    const client = githubClient(session.token);
    await verifyGithubOwner(client);
    return Response.json(await saveGithubBackup(client, value), {
      headers: noStore,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
