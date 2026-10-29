import { cookies } from "next/headers";
import { z } from "zod";
import { githubRepository } from "@/lib/threat-library";
import { githubClient, verifyGithubOwner } from "@/lib/server/github-threats";
import {
  assertSameOrigin,
  readBoundedJson,
  sealSession,
  sessionCookie,
  sessionSeconds,
} from "@/lib/server/github-session";
import {
  assertConfigured,
  configured,
  errorResponse,
  getSession,
  noStore,
} from "@/lib/server/github-http";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const session = await getSession(request);
  return Response.json(
    {
      connected: !!session,
      configured: configured(),
      repository: githubRepository,
    },
    { headers: noStore },
  );
}
export async function POST(request: Request) {
  try {
    assertConfigured(request);
    assertSameOrigin(request);
    const { token } = z
      .object({ token: z.string().regex(/^github_pat_[A-Za-z0-9_]{20,240}$/) })
      .strict()
      .parse(await readBoundedJson(request, 2048));
    const user = await verifyGithubOwner(githubClient(token));
    const encrypted = sealSession(
      {
        token,
        userId: user.id,
        expires: Date.now() + sessionSeconds * 1000,
        origin: new URL(request.url).origin,
      },
      process.env.FENIX_GITHUB_SESSION_SECRET || "",
    );
    (await cookies()).set(sessionCookie, encrypted, {
      secure: true,
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: sessionSeconds,
    });
    return Response.json(
      { connected: true, login: user.login, repository: githubRepository },
      { headers: noStore },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    (await cookies()).set(sessionCookie, "", {
      secure: true,
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return Response.json({ connected: false }, { headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}
