import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { encryptSheetBackup, decryptSheetBackup } from "../lib/sheet-backup";
import {
  backupPath,
  backupSchema,
  backupPathPattern,
} from "../lib/backup-format";
import {
  saveGithubBackup,
  readGithubBackup,
  listGithubBackups,
} from "../lib/server/github-backups";
import { SyncError } from "../lib/server/github-session";
import type { GitClient } from "../lib/server/github-threats";
import { newAgent } from "../lib/rules";
import { withoutAgent } from "../lib/agent-removal";
import { emptyState } from "../lib/model";
import { participantFromAgent } from "../lib/combat";
import { emptyLedger } from "../lib/combat-actions";

const password = "Uma frase longa para teste 2026!";
function fakeGit() {
  const blobs = new Map<string, string>(),
    trees = new Map<string, any[]>(),
    commits = new Map<string, any>();
  let head: string | null = null,
    serial = 0;
  const calls: { path: string; method: string; body: any }[] = [];
  const hash = (s: string) => createHash("sha1").update(s).digest("hex");
  const client: GitClient = async <T>(
    path: string,
    method = "GET",
    body?: unknown,
  ) => {
    const b = body as any;
    calls.push({ path, method, body: b });
    if (path.endsWith("/git/ref/heads/fenix-backups")) {
      if (!head) throw new SyncError("missing", 404);
      return { object: { sha: head } } as T;
    }
    if (method === "GET" && path.includes("/git/commits/"))
      return commits.get(path.split("/").at(-1)!) as T;
    if (method === "GET" && path.includes("/git/trees/")) {
      const id = path.split("/").at(-1)!.split("?")[0];
      return { tree: trees.get(id), truncated: false } as T;
    }
    if (method === "GET" && path.includes("/git/blobs/"))
      return {
        encoding: "base64",
        content: Buffer.from(blobs.get(path.split("/").at(-1)!)!).toString(
          "base64",
        ),
      } as T;
    if (path.endsWith("/git/blobs")) {
      const id = hash(b.content);
      blobs.set(id, b.content);
      return { sha: id } as T;
    }
    if (path.endsWith("/git/trees")) {
      const current = new Map(
        (trees.get(b.base_tree) || []).map((x) => [x.path, x]),
      );
      for (const item of b.tree) {
        const id = item.sha || hash(item.content);
        if (item.content) blobs.set(id, item.content);
        current.set(item.path, {
          ...item,
          sha: id,
          size: blobs.get(id)?.length || 0,
        });
      }
      const id = hash(JSON.stringify([...current.values()]));
      trees.set(id, [...current.values()]);
      return { sha: id } as T;
    }
    if (path.endsWith("/git/commits")) {
      const id = hash(String(++serial));
      commits.set(id, { tree: { sha: b.tree }, parents: b.parents });
      return { sha: id } as T;
    }
    if (path.endsWith("/git/refs") && method === "POST") {
      assert.equal(b.ref, "refs/heads/fenix-backups");
      assert.equal(head, null);
      head = b.sha;
      return {} as T;
    }
    if (path.endsWith("/git/refs/heads/fenix-backups") && method === "PATCH") {
      assert.equal(b.force, false);
      assert.deepEqual(commits.get(b.sha).parents, [head]);
      head = b.sha;
      return {} as T;
    }
    throw Error(`Unexpected ${method} ${path}`);
  };
  return { client, calls };
}
test("encrypted backups recover the complete sheet and keys, with no plaintext metadata", async () => {
  const agent = newAgent("Segredo da campanha");
  agent.inventory = [
    {
      id: "custom",
      name: "Espada",
      kind: "Arma",
      quantity: 1,
      spaces: 1,
      damage: "1d6",
      notes: "",
      image: "data:image/webp;base64,AAAA",
    },
  ];
  const credentials = {
    masterToken: "a".repeat(64),
    playerToken: "b".repeat(64),
  };
  const source = { agent, credentials };
  const encrypted = await encryptSheetBackup(source, password);
  assert.ok(backupPathPattern.test(backupPath(encrypted)));
  for (const secret of [
    agent.name,
    agent.id,
    credentials.masterToken,
    password,
    "Espada",
  ])
    assert.ok(!JSON.stringify(encrypted).includes(secret));
  assert.deepEqual(await decryptSheetBackup(encrypted, password), source);
  const repeated = await encryptSheetBackup(source, password);
  assert.notEqual(repeated.ciphertext, encrypted.ciphertext);
  assert.notEqual(repeated.iv, encrypted.iv);
});
test("wrong password, tampered ciphertext and changed identity cannot restore a backup", async () => {
  const encrypted = await encryptSheetBackup({ agent: newAgent() }, password);
  await assert.rejects(
    decryptSheetBackup(encrypted, password + "!"),
    /Senha incorreta/,
  );
  await assert.rejects(
    decryptSheetBackup({ ...encrypted, id: crypto.randomUUID() }, password),
    /danificado/,
  );
  const bytes = Buffer.from(encrypted.ciphertext, "base64");
  bytes[3] ^= 1;
  await assert.rejects(
    decryptSheetBackup(
      { ...encrypted, ciphertext: bytes.toString("base64") },
      password,
    ),
    /danificado/,
  );
  assert.equal(
    backupSchema.safeParse({ ...encrypted, agent: newAgent() }).success,
    false,
  );
  await assert.rejects(
    encryptSheetBackup({ agent: newAgent() }, "curta"),
    /12 a 256/,
  );
});
test("backups use an isolated non-deploying branch, retain versions and allow idempotent retries", async () => {
  const git = fakeGit(),
    first = await encryptSheetBackup({ agent: newAgent("Primeira") }, password);
  assert.deepEqual(await listGithubBackups(git.client), []);
  const saved = await saveGithubBackup(git.client, first);
  const init = git.calls.find((c) => c.path.endsWith("/git/trees"))!.body;
  assert.equal(init.base_tree, undefined);
  assert.deepEqual(
    JSON.parse(init.tree.find((x: any) => x.path === "vercel.json").content),
    { git: { deploymentEnabled: false } },
  );
  const again = await saveGithubBackup(git.client, first);
  assert.equal(again.commit, saved.commit);
  const second = await encryptSheetBackup(
    { agent: newAgent("Outra") },
    password,
  );
  await saveGithubBackup(git.client, second);
  const list = await listGithubBackups(git.client);
  assert.equal(list.length, 2);
  assert.deepEqual(await readGithubBackup(git.client, saved.path), first);
  assert.ok(git.calls.every((c) => !c.path.includes("heads/main")));
  await assert.rejects(
    readGithubBackup(git.client, "../../secret"),
    /inválido/,
  );
});
test("local removal retires the agent from encounters without removing other sheets or campaigns", () => {
  const a = newAgent("A"),
    b = newAgent("B"),
    pa = participantFromAgent(a),
    pb = participantFromAgent(b);
  const ledger = emptyLedger();
  ledger.effects = [
    {
      id: "speed",
      sourceId: pa.id,
      targetId: pb.id,
      name: "Bônus",
      grant: "standard",
      timing: "scene",
      noRitual: false,
      createdKey: "x",
    },
  ];
  const state = {
    ...emptyState,
    agents: [a, b],
    encounters: [
      {
        id: "fight",
        campaign_id: null,
        name: "Combate",
        round: 1,
        turn: 0,
        active: false,
        participants: [pa, pb],
        combat: ledger,
      },
    ],
  };
  const before = JSON.stringify(state),
    after = withoutAgent(state, a.id);
  assert.deepEqual(after.agents, [b]);
  assert.deepEqual(after.encounters[0].participants, [pb]);
  assert.deepEqual(after.encounters[0].combat!.effects, []);
  assert.equal(JSON.stringify(state), before);
});
