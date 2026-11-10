import { z } from "zod";
import { assertSameOrigin, readBoundedJson } from "@/lib/server/github-session";
import {
  requireSession,
  errorResponse,
  noStore,
} from "@/lib/server/github-http";
import { githubClient, verifyGithubOwner } from "@/lib/server/github-threats";
import { publishItemImage } from "@/lib/server/github-item-image";
import { itemImageLimit } from "@/lib/item-image-value";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request);
    const input = z
      .object({ image: z.string().max(itemImageLimit) })
      .strict()
      .parse(await readBoundedJson(request, itemImageLimit + 500));
    const client = githubClient(session.token);
    await verifyGithubOwner(client);
    return Response.json(await publishItemImage(client, input.image), {
      headers: noStore,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
