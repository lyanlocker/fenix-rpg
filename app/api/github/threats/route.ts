import { libraryForPreview } from "@/lib/threat-library";
import {
  changeSchema,
  githubClient,
  publishThreatChange,
  readGithubLibrary,
  verifyGithubOwner,
} from "@/lib/server/github-threats";
import { assertSameOrigin, readBoundedJson } from "@/lib/server/github-session";
import {
  errorResponse,
  noStore,
  requireSession,
} from "@/lib/server/github-http";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const client = githubClient(session.token);
    const user = await verifyGithubOwner(client);
    const snapshot = await readGithubLibrary(client);
    return Response.json(
      {
        library: user.publicRepository
          ? libraryForPreview(snapshot.library, snapshot.head)
          : snapshot.library,
        revision: snapshot.fileSha,
      },
      { headers: noStore },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = changeSchema.parse(await readBoundedJson(request, 3_000_000));
    const client = githubClient(session.token);
    const user = await verifyGithubOwner(client);
    const result = await publishThreatChange(client, input);
    return Response.json(
      {
        library: user.publicRepository
          ? libraryForPreview(result.library, result.head)
          : result.library,
        revision: result.fileSha,
        commit: result.head,
        changed: result.changed,
      },
      { headers: noStore },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
