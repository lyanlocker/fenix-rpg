import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { newAgent } from "../lib/rules";
import { validateAgentImport } from "../lib/validation";
import { parseCatalog } from "../lib/catalog";
import { publishItemImage } from "../lib/server/github-item-image";
import { validItemImage } from "../lib/item-image-value";
import type { GitClient } from "../lib/server/github-threats";
import { SyncError } from "../lib/server/github-session";

test("custom item images survive sheet and library imports while arbitrary URLs are rejected", () => {
  const item = {
    id: "image",
    name: "Ritual próprio",
    kind: "Ritual" as const,
    quantity: 1,
    spaces: 0,
    damage: "",
    notes: "",
    image: "data:image/webp;base64,AAAA",
  };
  const agent = { ...newAgent(), inventory: [item] };
  assert.equal(
    validateAgentImport({ version: 1, agent }).inventory[0].image,
    item.image,
  );
  assert.equal(parseCatalog({ items: [item] })[0].image, item.image);
  for (const image of [
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
    "https://tracker.example/i.png",
    "/art/rituals/../../secret.webp",
  ]) {
    assert.equal(validItemImage(image), false);
    assert.throws(() =>
      validateAgentImport({
        version: 1,
        agent: { ...agent, inventory: [{ ...item, image }] },
      }),
    );
  }
});
test("image publication preserves current code when main advances and sends only image blobs", async () => {
  const image = await sharp({
    create: { width: 20, height: 30, channels: 4, background: "blue" },
  })
    .webp()
    .toBuffer();
  const calls: { path: string; method: string; body: any }[] = [];
  let reads = 0,
    patches = 0;
  const client: GitClient = async <T>(
    path: string,
    method = "GET",
    body?: unknown,
  ) => {
    const b = body as any;
    calls.push({ path, method, body: b });
    if (path.includes("/git/ref/heads/"))
      return { object: { sha: (++reads === 1 ? "a" : "b").repeat(40) } } as T;
    if (method === "GET" && path.includes("/git/commits/"))
      return { tree: { sha: (reads === 1 ? "c" : "d").repeat(40) } } as T;
    if (path.endsWith("/git/blobs")) return { sha: "e".repeat(40) } as T;
    if (path.endsWith("/git/trees")) return { sha: "f".repeat(40) } as T;
    if (path.endsWith("/git/commits")) return { sha: "1".repeat(40) } as T;
    if (method === "PATCH") {
      if (patches++ === 0) throw new SyncError("Conflict", 422);
      return {} as T;
    }
    throw Error("Unexpected request");
  };
  const result = await publishItemImage(
    client,
    `data:image/webp;base64,${image.toString("base64")}`,
  );
  assert.equal(validItemImage(result.image), true);
  const trees = calls.filter((c) => c.path.endsWith("/git/trees"));
  assert.equal(trees[1].body.base_tree, "d".repeat(40));
  assert.ok(
    trees.every((c) =>
      c.body.tree.every((entry: any) =>
        /^public\/art\/items\/[a-f0-9]{64}\.webp$/.test(entry.path),
      ),
    ),
  );
  assert.ok(
    calls
      .filter((c) => c.method === "PATCH")
      .every((c) => c.body.force === false),
  );
});
