import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import raw from "../lib/data/threat-art.json";
import { threatArtwork, threatArtId } from "../lib/threat-art";
import { parseThreatImport, threatCatalog } from "../lib/threats";
import { participantPortrait } from "../lib/participant-portrait";
import { presentationFrame } from "../lib/presentation";
import { newAgent } from "../lib/rules";
import type { Encounter, Participant } from "../lib/model";

const root = process.cwd();
const illustrated = threatCatalog.find((t) => threatArtwork(t.id))!;
const art = threatArtwork(illustrated.id)!;
const participant: Participant = {
  id: "existing-participant",
  name: illustrated.name,
  threatId: illustrated.id,
  initiative: 12,
  pv: 80,
  maxPv: 150,
  hidden: false,
  conditions: "Condição privada",
};
const encounter: Encounter = {
  id: "existing-combat",
  campaign_id: "campaign",
  name: "Plano secreto",
  active: true,
  round: 1,
  turn: 0,
  participants: [participant],
};
const since = "2026-10-28T00:00:00Z";

test("all curated artwork has valid local WebP files, matching hashes, and bounded download sizes", () => {
  let total = 0;
  const used = new Set<string>();
  for (const [id, entry] of Object.entries(raw)) {
    assert.ok(
      threatCatalog.some((t) => t.id === id && t.bookId === entry.bookId),
      id,
    );
    assert.ok(
      entry.width > 0 &&
        entry.height > 0 &&
        Math.max(entry.width, entry.height) <= 1024,
      id,
    );
    assert.ok(
      entry.thumbnailWidth > 0 &&
        entry.thumbnailHeight > 0 &&
        Math.max(entry.thumbnailWidth, entry.thumbnailHeight) <= 320,
      id,
    );
    for (const [path, bytes, limit] of [
      [entry.src, entry.bytes, 500_000],
      [entry.thumbnail, entry.thumbnailBytes, 80_000],
    ] as const) {
      assert.match(path, /^\/art\/threats\/[a-z0-9-]+-[a-f0-9]{10}\.webp$/);
      const data = readFileSync(resolve(root, "public", path.slice(1)));
      assert.equal(data.subarray(0, 4).toString(), "RIFF", path);
      assert.equal(data.subarray(8, 12).toString(), "WEBP", path);
      assert.equal(data.length, bytes, path);
      assert.ok(data.length <= limit, path);
      assert.ok(
        path.endsWith(
          `-${createHash("sha256").update(data).digest("hex").slice(0, 10)}.webp`,
        ),
        path,
      );
      used.add(path.split("/").at(-1)!);
      total += data.length;
    }
  }
  assert.deepEqual(
    new Set(readdirSync(resolve(root, "public/art/threats"))),
    used,
  );
  assert.ok(total <= 10_000_000, `Artwork download budget exceeded: ${total}`);
});

test("existing combats gain illustrations without changing any saved participant or sheet", () => {
  const agent = newAgent("Ficha existente");
  agent.notes = "Anotações preservadas";
  const before = JSON.stringify({ encounter, agent });
  const frame = presentationFrame("Campanha", encounter, [agent], [], since);
  assert.equal(frame.participants[0].portrait, art.src);
  assert.equal(frame.participants[0].thumbnail, art.thumbnail);
  assert.equal(JSON.stringify({ encounter, agent }), before);
});

test("old threat exports still import and illustrated custom copies retain only their curated reference", () => {
  const [legacy] = parseThreatImport({ version: 1, threats: [illustrated] });
  assert.deepEqual(legacy, illustrated);
  const [custom] = parseThreatImport({
    version: 1,
    threats: [
      {
        ...illustrated,
        id: "my-copy",
        bookId: "custom",
        artId: threatArtId(illustrated),
      },
    ],
  });
  assert.equal(threatArtId(custom), illustrated.id);
  assert.deepEqual(
    participantPortrait({ ...participant, threatId: custom.id }, [], [custom]),
    {
      portrait: art.src,
      thumbnail: art.thumbnail,
    },
  );
  for (const artId of [
    "https://example.com/image.jpg",
    "../../private",
    "__proto__",
  ]) {
    assert.throws(() =>
      parseThreatImport({ version: 1, threats: [{ ...custom, artId }] }),
    );
    assert.equal(threatArtwork(artId), undefined);
  }
});

test("unknown threats have a stable fallback and agents always keep their own portraits", () => {
  assert.deepEqual(
    participantPortrait({ ...participant, threatId: "no-art" }, []),
    { portrait: "" },
  );
  const agent = newAgent("Agente");
  agent.portrait = "data:image/png;base64,AGENT";
  assert.deepEqual(
    participantPortrait({ ...participant, agentId: agent.id }, [agent]),
    { portrait: agent.portrait },
  );
  assert.deepEqual(
    participantPortrait({ ...participant, agentId: "removed-agent" }, []),
    { portrait: "" },
  );
});

test("hidden artwork and spotlight never enter the public frame, including after a reveal is revoked", () => {
  const options = { spotlightId: participant.id };
  const visible = presentationFrame(
    "Campanha",
    encounter,
    [],
    [],
    since,
    options,
  );
  assert.equal(visible.spotlightId, participant.id);
  assert.deepEqual(Object.keys(visible.participants[0]).sort(), [
    "id",
    "name",
    "portrait",
    "thumbnail",
  ]);
  for (const participants of [[{ ...participant, hidden: true }], []]) {
    const frame = presentationFrame(
      "Campanha",
      { ...encounter, participants },
      [],
      [],
      since,
      options,
    );
    assert.equal(frame.spotlightId, null);
    assert.equal(frame.currentId, null);
    assert.deepEqual(frame.participants, []);
    const serialized = JSON.stringify(frame);
    for (const privateValue of [
      art.src,
      art.thumbnail,
      participant.id,
      participant.name,
      participant.conditions,
      encounter.name,
    ])
      assert.ok(!serialized.includes(privateValue), privateValue);
  }
  assert.equal(
    presentationFrame("Campanha", encounter, [], [], since, {
      spotlightId: "removed",
    }).spotlightId,
    null,
  );
  assert.equal(
    presentationFrame("Campanha", encounter, [], [], since).spotlightId,
    null,
  );
});
