import test from "node:test";
import assert from "node:assert/strict";
import { newAgent } from "../lib/rules";
import { agentPatch, replaceInventoryItem } from "../lib/agent-patch";
import {
  createSharedAgentSync,
  publishSharedAgent,
  saveSharedAgent,
} from "../lib/share";
import { reconcileMasterEncounters } from "../lib/shared-combat";
import { addBenefits, bookCatalog, characterOptions } from "../lib/books";
import { validateAgentImport } from "../lib/validation";
import type { Encounter } from "../lib/model";

test("sheet patches include only changed fields, including removed optional values", () => {
  const original = newAgent("Ana");
  original.portrait = "data:image/png;base64,AAAA";
  const changed = { ...original, notes: "Nova nota", portrait: undefined };
  assert.deepEqual(agentPatch(original, changed), {
    expected: { notes: "", portrait: original.portrait },
    changes: { notes: "Nova nota" },
  });
  assert.throws(() => agentPatch(original, { ...changed, id: "other" }));
});
test("saving notes preserves resources changed remotely and returns the canonical sheet", async () => {
  const previous = globalThis.fetch;
  const original = newAgent("Ana"),
    changed = { ...original, notes: "Edição" };
  const canonical = { ...changed, resources: { ...original.resources, pv: 2 } };
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.ok(String(url).endsWith("/fenix_patch_shared_agent"));
    const data = JSON.parse(String(init?.body));
    assert.deepEqual(data.expected_data, { notes: "" });
    assert.deepEqual(data.changed_data, { notes: "Edição" });
    return Response.json({ agent: canonical });
  };
  try {
    assert.deepEqual(
      await saveSharedAgent(changed, "a".repeat(64), original),
      canonical,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previous;
  }
});
test("a conflicting edit fails without retrying or falling back to full replacement", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  const original = newAgent();
  globalThis.fetch = async () => {
    calls++;
    return Response.json(
      { message: "A ficha mudou em outro aparelho" },
      { status: 409 },
    );
  };
  try {
    await assert.rejects(
      () =>
        saveSharedAgent(
          { ...original, notes: "Nova" },
          "a".repeat(64),
          original,
        ),
      /mudou/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previous;
  }
});
test("copying an existing player link validates access without publishing the stale local snapshot", async () => {
  const previous = globalThis.fetch;
  const original = newAgent();
  const credentials = {
    masterToken: "a".repeat(64),
    playerToken: "b".repeat(64),
  };
  globalThis.fetch = async (url) => {
    assert.ok(String(url).endsWith("/fenix_load_shared_agent"));
    return Response.json({ agent: original, role: "master", rolls: [] });
  };
  try {
    assert.deepEqual(
      await publishSharedAgent(original, credentials),
      credentials,
    );
  } finally {
    globalThis.fetch = previous;
  }
});
const fight = (id: string, campaign = "c", shared = true): Encounter => ({
  id,
  campaign_id: campaign,
  name: id,
  active: true,
  started: true,
  round: 1,
  turn: 0,
  participants: [],
  ...(shared ? { sharedRevision: 4 } : {}),
});
test("a remote room closure stops its local combat while preserving preparations and other campaigns", () => {
  const original = [
    fight("old"),
    fight("draft", "c", false),
    fight("other", "other"),
  ];
  const result = reconcileMasterEncounters(original, "c", {
    encounter: null,
    revision: 5,
  });
  assert.equal(result[0].active, false);
  assert.equal(result[0].started, false);
  assert.deepEqual(result.slice(1), original.slice(1));
  assert.equal(original[0].active, true);
});
test("a replacement room stops the previous shared encounter and keeps the new revision", () => {
  const result = reconcileMasterEncounters([fight("old")], "c", {
    encounter: fight("new"),
    revision: 9,
  });
  assert.equal(result[0].id, "new");
  assert.equal(result[0].sharedRevision, 9);
  assert.equal(result[1].active, false);
  assert.equal(result[1].sharedRevision, undefined);
});

test("damaged credential maps neither crash reads nor get overwritten when creating credentials", async () => {
  const { combatMasterKey } = await import("../lib/shared-combat");
  const { getShareCredentials, storeShareCredentials } = await import(
    "../lib/share"
  );
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  try {
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
    });
    for (const raw of ["null", "[]", "{", '{"id":null}']) {
      let writes = 0;
      Object.defineProperty(globalThis, "localStorage", {
        value: {
          getItem: () => raw,
          setItem: () => {
            writes++;
          },
        },
        configurable: true,
      });
      assert.equal(getShareCredentials("id"), null);
      assert.equal(combatMasterKey("id"), null);
      assert.throws(() => combatMasterKey("id", true), /preservados/);
      assert.throws(
        () =>
          storeShareCredentials("id", {
            masterToken: "a".repeat(64),
            playerToken: "b".repeat(64),
          }),
        /preservados/,
      );
      assert.equal(writes, 0);
    }
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (oldStorage)
      Object.defineProperty(globalThis, "localStorage", oldStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("an item editor preserves other changes and rejects changed or consumed items", () => {
  const original = {
    id: "kit",
    damage: "",
    name: "Kit",
    kind: "Item" as const,
    quantity: 2,
    spaces: 1,
    notes: "",
  };
  const other = { ...original, id: "other", name: "Outro" };
  const edited = { ...original, notes: "Nota" };
  assert.deepEqual(replaceInventoryItem([original, other], edited, original), [
    edited,
    other,
  ]);
  assert.deepEqual(replaceInventoryItem([other], original), [other, original]);
  assert.throws(
    () =>
      replaceInventoryItem([{ ...original, quantity: 1 }], edited, original),
    /mudou/,
  );
  assert.throws(() => replaceInventoryItem([], edited, original), /removido/);
  assert.throws(() => replaceInventoryItem([original], original), /mudou/);
});

test("player can add a catalog power and a homebrew to a shared sheet with an origin grant, then reload", async () => {
  const base = newAgent("Agente de teste");
  const origin = characterOptions.find(
    (o) =>
      o.subtype === "Origem" && o.grantName && o.grantNotes && o.skillsText,
  )!;
  base.originId = origin.id;
  const published = addBenefits(base);
  let saved = structuredClone(published);
  const power = bookCatalog.find(
    (i) => i.kind === "Poder" && i.name === "Golpe Pesado",
  )!;
  const token = "b".repeat(64);
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const args = JSON.parse(String(init?.body));
    assert.equal(args.share_token, token);
    if (String(url).endsWith("/fenix_sync_shared_agent"))
      return Response.json({
        versions: {},
        unchanged: false,
        agent: saved,
        portraits: { main: "" },
      });
    assert.ok(String(url).endsWith("/fenix_patch_shared_agent"));
    // Same JSON equality check as fenix_patch_shared_agent.
    assert.deepEqual(args.expected_data.inventory, saved.inventory);
    saved = { ...saved, ...args.changed_data };
    return Response.json({ agent: saved });
  };
  try {
    const load = async () =>
      (await createSharedAgentSync(base.id, token)())!.agent!;
    let sheet = await load();
    for (const item of [
      { ...power, catalogId: power.id, id: crypto.randomUUID() },
      {
        ...power,
        id: crypto.randomUUID(),
        name: "Habilidade da mesa",
        source: "Conteúdo próprio",
        version: 1,
      },
    ]) {
      await saveSharedAgent(
        { ...sheet, inventory: [...sheet.inventory, item] },
        token,
        sheet,
      );
      sheet = await load();
      assert.deepEqual(sheet.inventory.at(-1), item);
    }
    assert.deepEqual(
      sheet.inventory.slice(0, published.inventory.length),
      published.inventory,
    );
  } finally {
    globalThis.fetch = previous;
  }
});

test("all catalog powers retain their metadata through shared sheet validation", () => {
  const base = newAgent();
  const powers = bookCatalog.filter((i) => i.kind === "Poder");
  for (let offset = 0; offset < powers.length; offset += 500) {
    const inventory = powers.slice(offset, offset + 500);
    const parsed = validateAgentImport({
      version: 1,
      agent: { ...base, inventory },
    });
    assert.deepEqual(parsed.inventory, inventory);
  }
});
