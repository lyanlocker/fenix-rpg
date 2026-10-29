import test from "node:test";
import assert from "node:assert/strict";
import { presentationFrame } from "../lib/presentation";
import { newAgent } from "../lib/rules";
import type { Encounter, Roll } from "../lib/model";

const agent = newAgent("Agente visível");
agent.id = "agent";
agent.notes = "SEGREDO DA FICHA";
agent.portrait = "data:image/png;base64,MAIN";
agent.alternate = {
  approvedCampaignId: "campaign",
  face: { ...agent, portrait: "data:image/png;base64,ALTERNATE" },
};
const encounter: Encounter = {
  id: "encounter",
  campaign_id: "campaign",
  name: "SEGREDO DO ENCONTRO",
  active: true,
  round: 2,
  turn: 0,
  participants: [
    {
      id: "visible",
      name: agent.name,
      agentId: agent.id,
      initiative: 12,
      pv: 30,
      maxPv: 50,
      hidden: false,
      conditions: "CONDIÇÃO PRIVADA",
    },
    {
      id: "hidden",
      name: "AMEAÇA SECRETA",
      initiative: 10,
      pv: 100,
      maxPv: 200,
      hidden: true,
      conditions: "SEGREDO",
    },
  ],
};
const roll: Roll = {
  id: "roll",
  campaign_id: "campaign",
  agentName: agent.name,
  label: "Vontade",
  expression: "2d20+5",
  dice: [8, 14],
  total: 19,
  secret: false,
  created_at: "2026-10-27T20:00:00Z",
};
const since = "2026-10-27T19:00:00Z";

test("the audience receives only explicit public fields, never hidden participants, health, notes or encounter details", () => {
  const frame = presentationFrame(
    "APOCALYPSIS",
    encounter,
    [agent],
    [roll],
    since,
  );
  assert.deepEqual(frame.participants, [
    { id: "visible", name: agent.name, portrait: agent.portrait },
  ]);
  assert.equal(frame.currentId, "visible");
  assert.deepEqual(Object.keys(frame).sort(), [
    "active",
    "campaign",
    "currentId",
    "participants",
    "roll",
    "round",
    "spotlightId",
  ]);
  const serialized = JSON.stringify(frame);
  for (const privateField of [
    "SEGREDO",
    "SECRETA",
    "PRIVADA",
    '"pv"',
    '"maxPv"',
    '"initiative"',
    '"notes"',
    '"campaign_id"',
  ])
    assert.ok(!serialized.includes(privateField));
});

test("a hidden current turn has no public identity; paused combat has no active turn", () => {
  assert.equal(
    presentationFrame("Campaign", { ...encounter, turn: 1 }, [], [], since)
      .currentId,
    null,
  );
  assert.equal(
    presentationFrame(
      "Campaign",
      { ...encounter, active: false },
      [],
      [],
      since,
    ).currentId,
    null,
  );
});

test("secret, unrelated, historical and hidden-actor rolls cannot reach the presentation", () => {
  for (const candidate of [
    { ...roll, secret: true },
    { ...roll, campaign_id: "other" },
    { ...roll, created_at: "2026-10-27T18:00:00Z" },
    { ...roll, agentName: "AMEAÇA SECRETA" },
  ])
    assert.equal(
      presentationFrame("Campaign", encounter, [], [candidate], since).roll,
      null,
    );
});

test("revealing a participant adds its identity but still excludes its numeric stats", () => {
  const revealed = {
    ...encounter,
    turn: 1,
    participants: encounter.participants.map((p) => ({ ...p, hidden: false })),
  };
  const frame = presentationFrame("Campaign", revealed, [], [], since);
  assert.equal(frame.currentId, "hidden");
  assert.equal(frame.participants.length, 2);
  assert.deepEqual(Object.keys(frame.participants[1]).sort(), [
    "id",
    "name",
    "portrait",
  ]);
});

test("the alternate portrait matches the participant face without sending either full sheet", () => {
  const alternate = {
    ...encounter,
    participants: [
      { ...encounter.participants[0], face: "alternate" as const },
    ],
  };
  const frame = presentationFrame("Campaign", alternate, [agent], [], since);
  assert.equal(frame.participants[0].portrait, agent.alternate!.face.portrait);
  assert.ok(!JSON.stringify(frame).includes("MAIN"));
});

test("presentation preserves the confirmed dice and total and does not mutate the source", () => {
  const before = JSON.stringify({ encounter, agent, roll });
  const frame = presentationFrame(
    "Campaign",
    encounter,
    [agent],
    [roll],
    since,
  );
  assert.equal(frame.roll?.total, 19);
  assert.deepEqual(frame.roll?.dice, [8, 14]);
  frame.roll!.dice.push(20);
  assert.equal(JSON.stringify({ encounter, agent, roll }), before);
});
