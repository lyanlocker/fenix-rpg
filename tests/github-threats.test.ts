import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  assertSameOrigin,
  openSession,
  readBoundedJson,
  sealSession,
  sessionSeconds,
  SyncError,
} from "../lib/server/github-session";
import {
  changeSchema,
  githubClient,
  prepareThreatImage,
  publishThreatChange,
  verifyGithubOwner,
  type GitClient,
} from "../lib/server/github-threats";
import {
  githubOwnerId,
  githubRepositoryId,
  libraryForPreview,
  libraryPath,
  mergeThreatCatalog,
  parseThreatLibrary,
  type ThreatLibrary,
} from "../lib/threat-library";
import { threatCatalog, type Threat } from "../lib/threats";
import { threatArtId, threatArtwork } from "../lib/threat-art";
import { presentationFrame } from "../lib/presentation";
import type { Encounter } from "../lib/model";

const sha = "a".repeat(40);
const nextSha = "b".repeat(40);
const secret = "unit-test-session-secret-DO-NOT-USE-IN-PRODUCTION";
const token = "github_pat_" + "test".repeat(12);
const origin = "https://fenix.test";
const custom: Threat = {
  ...threatCatalog[0],
  id: "1c854a7c-a89b-40c4-b295-5f22c1acf135",
  name: "Criatura de teste",
  bookId: "custom",
};
const empty = (): ThreatLibrary => ({ version: 1, threats: [], art: {} });
const hash = (s: string) => createHash("sha1").update(s).digest("hex");

function fakeGit(
  options: { library?: ThreatLibrary; conflict?: "code" | "library" } = {},
) {
  const calls: { path: string; method: string; body?: any }[] = [];
  let snapshots = 0;
  let patches = 0;
  const client: GitClient = async <T>(
    path: string,
    method = "GET",
    body?: unknown,
  ) => {
    calls.push({ path, method, body });
    const input = body as any;
    if (path.includes("/git/ref/heads/")) {
      snapshots++;
      return { object: { sha: snapshots > 1 ? "d".repeat(40) : sha } } as T;
    }
    if (method === "GET" && path.includes("/git/commits/"))
      return { tree: { sha: "c".repeat(40) } } as T;
    if (path.includes("/contents/"))
      return {
        size: 200,
        encoding: "base64",
        content: Buffer.from(
          JSON.stringify(options.library || empty()),
        ).toString("base64"),
        sha:
          snapshots > 1 && options.conflict === "library"
            ? "e".repeat(40)
            : sha,
      } as T;
    if (path.endsWith("/git/blobs")) return { sha: hash(input.content) } as T;
    if (path.endsWith("/git/trees")) return { sha: "f".repeat(40) } as T;
    if (path.endsWith("/git/commits")) return { sha: nextSha } as T;
    if (method === "PATCH") {
      if (patches++ === 0 && options.conflict)
        throw new SyncError("Conflict", 422);
      return { object: { sha: nextSha } } as T;
    }
    throw Error(`Unexpected request ${path}`);
  };
  return { client, calls };
}

test("GitHub sessions are encrypted, origin-bound, expiring and reject tampering", () => {
  const now = Date.now();
  const session = {
    token,
    origin,
    userId: githubOwnerId,
    expires: now + sessionSeconds * 1000,
  };
  const encoded = sealSession(session, secret);
  assert.ok(!encoded.includes(token));
  assert.deepEqual(openSession(encoded, secret, origin, now), session);
  assert.equal(openSession(encoded, secret, "https://other.test", now), null);
  assert.equal(openSession(encoded, secret, origin, session.expires), null);
  assert.equal(openSession(encoded, secret + "other", origin, now), null);
  const bytes = Buffer.from(encoded, "base64url");
  bytes[30] ^= 1;
  assert.equal(
    openSession(bytes.toString("base64url"), secret, origin, now),
    null,
  );
  assert.throws(() => sealSession(session, "short"));
});

test("writes reject missing or cross-site Origin and non-JSON before reading input", async () => {
  const request = (headers: Record<string, string>) =>
    new Request(`${origin}/api/github/threats`, {
      method: "POST",
      headers,
      body: "{}",
    });
  assert.doesNotThrow(() =>
    assertSameOrigin(request({ origin, "content-type": "application/json" })),
  );
  const rejectedHeaders: Record<string, string>[] = [
    { "content-type": "application/json" },
    { origin: "https://evil.test", "content-type": "application/json" },
    { origin, "content-type": "text/plain" },
  ];
  for (const headers of rejectedHeaders)
    assert.throws(() => assertSameOrigin(request(headers)));
  await assert.rejects(readBoundedJson(request({ origin }), 1));
  assert.deepEqual(await readBoundedJson(request({ origin }), 100), {});
});

test("only the owner ID and exact writable repository are accepted", async () => {
  const make =
    (id: number, repoId = githubRepositoryId, push = true): GitClient =>
    async <T>(path: string) =>
      (path === "/user"
        ? { id, login: "owner" }
        : { id: repoId, permissions: { push }, private: false }) as T;
  assert.equal(
    (await verifyGithubOwner(make(githubOwnerId))).id,
    githubOwnerId,
  );
  await assert.rejects(verifyGithubOwner(make(1)), /proprietário/);
  await assert.rejects(verifyGithubOwner(make(githubOwnerId, 1)), /Autorize/);
  await assert.rejects(
    verifyGithubOwner(make(githubOwnerId, githubRepositoryId, false)),
    /Autorize/,
  );
});

test("GitHub errors never echo credentials or upstream response bodies", async () => {
  const transport = (async () =>
    new Response(JSON.stringify({ message: token }), {
      status: 403,
    })) as typeof fetch;
  await assert.rejects(
    githubClient(token, transport)("/user"),
    (error: Error) =>
      !error.message.includes(token) && error.message.includes("recusou"),
  );
});

test("API schema rejects workspace, arbitrary paths and unsupported operations", () => {
  for (const extra of [
    { agents: [{ token: "private" }] },
    { path: "app/page.tsx" },
    { repository: "other/repo" },
  ])
    assert.equal(
      changeSchema.safeParse({
        action: "save",
        expected: sha,
        threats: [custom],
        ...extra,
      }).success,
      false,
    );
  assert.equal(
    changeSchema.safeParse({ action: "delete", expected: sha, id: custom.id })
      .success,
    false,
  );
  assert.equal(
    changeSchema.safeParse({ action: "save", expected: sha, threats: [custom] })
      .success,
    true,
  );
});

test("custom creatures are committed atomically with the existing repository tree and no force", async () => {
  const { client, calls } = fakeGit();
  const result = await publishThreatChange(client, {
    action: "save",
    expected: sha,
    threats: [custom],
  });
  assert.equal(result.library.threats[0].name, custom.name);
  const tree = calls.find((c) => c.path.endsWith("/git/trees"))!.body;
  assert.equal(tree.base_tree, "c".repeat(40));
  assert.deepEqual(
    tree.tree.map((t: any) => t.path),
    [libraryPath],
  );
  assert.deepEqual(calls.at(-1)?.body, { sha: nextSha, force: false });
  assert.equal(calls.at(-1)?.method, "PATCH");
});

test("outdated catalogue and official statistics are rejected before any write", async () => {
  for (const input of [
    { action: "save" as const, expected: "e".repeat(40), threats: [custom] },
    {
      action: "save" as const,
      expected: sha,
      threats: [{ ...threatCatalog[0], bookId: "custom" }],
    },
  ]) {
    const { client, calls } = fakeGit();
    await assert.rejects(publishThreatChange(client, input));
    assert.ok(calls.every((c) => c.method === "GET"));
  }
});

test("an unchanged save is idempotent and does not trigger another deployment", async () => {
  const { client, calls } = fakeGit({
    library: { ...empty(), threats: [custom] },
  });
  const result = await publishThreatChange(client, {
    action: "save",
    expected: sha,
    threats: [custom],
  });
  assert.equal(result.changed, false);
  assert.ok(calls.every((c) => c.method === "GET"));
});

test("concurrent code changes are preserved; simultaneous catalogue edits are rejected", async () => {
  const code = fakeGit({ conflict: "code" });
  await publishThreatChange(code.client, {
    action: "save",
    expected: sha,
    threats: [custom],
  });
  const commits = code.calls.filter(
    (c) => c.path.endsWith("/git/commits") && c.method === "POST",
  );
  assert.deepEqual(commits[1].body.parents, ["d".repeat(40)]);
  assert.ok(
    code.calls
      .filter((c) => c.method === "PATCH")
      .every((c) => c.body.force === false),
  );
  const catalogue = fakeGit({ conflict: "library" });
  await assert.rejects(
    publishThreatChange(catalogue.client, {
      action: "save",
      expected: sha,
      threats: [custom],
    }),
    /outra janela/,
  );
  assert.equal(catalogue.calls.filter((c) => c.method === "PATCH").length, 1);
});

test("images are decoded, resized and reencoded; binary spoofing and SVG are rejected", async () => {
  const input = await sharp({
    create: { width: 1800, height: 900, channels: 4, background: "#f003" },
  })
    .webp()
    .toBuffer();
  const prepared = await prepareThreatImage(
    `data:image/webp;base64,${input.toString("base64")}`,
  );
  assert.equal(prepared.art.width, 1024);
  assert.equal(prepared.art.thumbnailWidth, 320);
  for (const file of prepared.files) {
    assert.match(file.path, /^public\/art\/custom\/[a-f0-9]{64}\.webp$/);
    assert.equal((await sharp(file.data).metadata()).format, "webp");
    assert.ok(
      file.path.includes(createHash("sha256").update(file.data).digest("hex")),
    );
  }
  await assert.rejects(
    prepareThreatImage("data:image/svg+xml;base64,PHN2Zz4="),
  );
  await assert.rejects(
    prepareThreatImage("data:image/webp;base64,bm90LWltYWdl"),
  );
});

test("book image replacement commits both assets and mapping without editing official stats", async () => {
  const original = JSON.stringify(threatCatalog);
  const input = await sharp({
    create: { width: 600, height: 800, channels: 4, background: "#abcdef" },
  })
    .webp()
    .toBuffer();
  const { client, calls } = fakeGit();
  const result = await publishThreatChange(client, {
    action: "image",
    expected: sha,
    id: threatCatalog[0].id,
    image: `data:image/webp;base64,${input.toString("base64")}`,
  });
  assert.deepEqual(result.library.threats, []);
  const paths = calls
    .find((c) => c.path.endsWith("/git/trees"))!
    .body.tree.map((e: any) => e.path);
  assert.equal(paths.length, 3);
  assert.ok(paths.includes(libraryPath));
  assert.ok(
    paths.every(
      (p: string) => p === libraryPath || p.startsWith("public/art/custom/"),
    ),
  );
  assert.equal(JSON.stringify(threatCatalog), original);
  const restore = fakeGit({ library: result.library });
  assert.deepEqual(
    (
      await publishThreatChange(restore.client, {
        action: "image",
        expected: sha,
        id: threatCatalog[0].id,
        restore: true,
      })
    ).library.art,
    {},
  );
});

test("untrusted media paths and orphaned images never enter the catalogue", () => {
  const art = {
    src: "/art/custom/" + "a".repeat(64) + ".webp",
    thumbnail: "/art/custom/" + "b".repeat(64) + ".webp",
    width: 100,
    height: 100,
    thumbnailWidth: 100,
    thumbnailHeight: 100,
    bookId: "custom",
    page: 0,
    pdfPage: 0,
  };
  assert.doesNotThrow(() =>
    parseThreatLibrary({ ...empty(), art: { [threatCatalog[0].id]: art } }),
  );
  for (const src of [
    "https://evil.test/img",
    "/../secret",
    "data:image/svg+xml,x",
  ])
    assert.throws(() =>
      parseThreatLibrary({
        ...empty(),
        art: { [threatCatalog[0].id]: { ...art, src } },
      }),
    );
  assert.throws(() =>
    parseThreatLibrary({ ...empty(), art: { missing: art } }),
  );
});

test("merged catalogues retain local creatures and official stats, preferring published custom edits", () => {
  const old = { ...custom, name: "Nome antigo" };
  const unrelated = { ...custom, id: "local-only" };
  const all = mergeThreatCatalog(
    [old, unrelated, { ...threatCatalog[0], pv: 999 }],
    [custom],
  );
  assert.equal(all.find((t) => t.id === custom.id)?.name, custom.name);
  assert.ok(all.some((t) => t.id === unrelated.id));
  assert.deepEqual(
    all.find((t) => t.id === threatCatalog[0].id),
    threatCatalog[0],
  );
});

test("custom art reaches visible combat presentation only; hidden images remain private", () => {
  const book = threatCatalog.find((t) => threatArtId(t))!;
  const art = {
    ...threatArtwork(book.id)!,
    src: "/art/custom/" + "a".repeat(64) + ".webp",
    thumbnail: "/art/custom/" + "b".repeat(64) + ".webp",
    bookId: "custom",
    page: 0,
    pdfPage: 0,
  };
  const overrides = { [book.id]: art };
  const encounter: Encounter = {
    id: "test",
    campaign_id: "c",
    name: "secret",
    round: 1,
    turn: 0,
    active: true,
    participants: [
      {
        id: "p",
        name: book.name,
        threatId: book.id,
        hidden: false,
        initiative: 10,
        pv: 20,
        maxPv: 30,
        conditions: "secret",
      },
    ],
  };
  assert.equal(threatArtId(book, overrides), book.id);
  const options = { threats: [book], artOverrides: overrides };
  assert.equal(
    presentationFrame("c", encounter, [], [], "", options).participants[0]
      .portrait,
    art.src,
  );
  encounter.participants[0].hidden = true;
  assert.deepEqual(
    presentationFrame("c", encounter, [], [], "", options).participants,
    [],
  );
  const preview = libraryForPreview({ ...empty(), art: overrides }, sha);
  assert.ok(
    preview.art[book.id].src.startsWith(
      `https://raw.githubusercontent.com/lyanlocker/fenix-rpg/${sha}/public/`,
    ),
  );
});
