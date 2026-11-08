import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CombatEvents } from "../components/combat-arena";
import { newAgent } from "../lib/rules";
import { participantFromAgent, removeParticipant } from "../lib/combat";
import {
  emptyLedger,
  turnKey,
  budgetFor,
  type CombatEvent,
} from "../lib/combat-actions";
import {
  executeCombatCommand,
  type CombatContext,
} from "../lib/server/combat-engine";

function setup() {
  const a = newAgent("Ana"),
    b = newAgent("Bia");
  const pa = participantFromAgent(a),
    pb = participantFromAgent(b);
  const c: CombatContext = {
    role: "player",
    actorId: pa.id,
    revision: 1,
    sheets: { [a.id]: a, [b.id]: b },
    sheetVersions: { [a.id]: "a", [b.id]: "b" },
    encounter: {
      id: "fight",
      campaign_id: null,
      name: "Teste",
      round: 1,
      turn: 0,
      active: true,
      started: true,
      participants: [pa, pb],
      combat: emptyLedger(),
    },
  };
  const pending: CombatEvent = {
    id: "pending",
    actorId: pa.id,
    actor: "Ana",
    targetIds: [pb.id],
    label: "Ataque pendente",
    text: "Dano aguardando mestre",
    round: 1,
    secret: false,
    createdAt: "2026-11-08",
    rolls: [],
    pending: "damage",
    proposedDamage: 6,
  };
  return { c, a, b, pa, pb, pending };
}
test("unresolved damage survives more than forty later free actions", () => {
  const { c, pa, pending } = setup();
  c.encounter.combat!.events = [pending];
  for (let i = 0; i < 45; i++)
    c.encounter = executeCombatCommand(
      c,
      { kind: "use", optionId: "free" },
      pa.id,
      () => 20,
    ).encounter;
  assert.ok(c.encounter.combat!.events.some((e) => e.id === pending.id));
});
test("GM can still see and resolve old pending damage after thirty newer events", () => {
  const { pending } = setup();
  const events = [
    pending,
    ...Array.from({ length: 35 }, (_, i) => ({
      ...pending,
      id: `done-${i}`,
      pending: undefined,
    })),
  ];
  const html = renderToStaticMarkup(
    createElement(CombatEvents, { events, resolve: () => {} }),
  );
  assert.match(html, /Aplicar dano final/);
});
test("removing an actor expires its bonuses and cancels pending damage without changing sheets", () => {
  const { c, a, b, pa, pb, pending } = setup();
  c.encounter.combat!.events = [pending];
  c.encounter.combat!.effects = [
    {
      id: "effect",
      sourceId: pb.id,
      targetId: pa.id,
      name: "Velocidade",
      grant: "standard",
      noRitual: false,
      timing: "scene",
      createdKey: "before",
    },
  ];
  const before = JSON.stringify([a, b]);
  const e = removeParticipant(c.encounter, pb.id);
  assert.equal(budgetFor(e, pa, a).standard, 1);
  assert.equal(e.combat!.events[0].resolved, true);
  assert.equal(JSON.stringify([a, b]), before);
});
