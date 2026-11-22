import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { jianghuGifts, giftUses } from "../lib/jianghu-gifts";
import { bookCatalog } from "../lib/books";
import { heartDie } from "../lib/campaign-bonds";
import { newAgent, maximums } from "../lib/rules";
import { participantFromAgent } from "../lib/combat";
import { combatOptions, emptyLedger } from "../lib/combat-actions";
import {
  executeCombatCommand,
  type CombatContext,
} from "../lib/server/combat-engine";
import { validateAgentImport } from "../lib/validation";

function setup(index: number, uses = 3) {
  const a = newAgent("A"),
    b = newAgent("B");
  for (const f of [a, b]) {
    f.nex = 50;
    f.resources = { ...maximums(f), pe: 100, pd: 100 };
  }
  a.inventory = [
    {
      ...jianghuGifts[index],
      id: crypto.randomUUID(),
      catalogId: jianghuGifts[index].id,
      usesRemaining: uses,
    },
  ];
  const pa = participantFromAgent(a),
    pb = participantFromAgent(b);
  const context: CombatContext = {
    role: "player",
    actorId: pa.id,
    revision: 1,
    encounter: {
      id: crypto.randomUUID(),
      campaign_id: crypto.randomUUID(),
      name: "Teste",
      round: 1,
      turn: 0,
      active: true,
      started: true,
      participants: [pa, pb],
      combat: emptyLedger(),
    },
    sheets: { [a.id]: a, [b.id]: b },
    sheetVersions: { [a.id]: "a", [b.id]: "b" },
  };
  return { a, b, pa, pb, context, item: a.inventory[0] };
}
test("six independent custom gifts have valid catalog IDs and WebP illustrations", () => {
  assert.equal(jianghuGifts.length, 6);
  for (const i of jianghuGifts) {
    assert.ok(bookCatalog.some((x) => x.id === i.id));
    assert.ok(existsSync(`public${i.image}`));
    assert.equal(giftUses(i), 3);
  }
  const { a } = setup(0, 0);
  assert.equal(
    validateAgentImport({ version: 1, agent: a }).inventory[0].usesRemaining,
    0,
  );
});
test("updated key rolls 4d8 and records defense reduction, cost and persistent charge", () => {
  const { a, pa, pb, context, item } = setup(3);
  const r = executeCombatCommand(
    context,
    { kind: "use", optionId: item.id, targetIds: [pb.id] },
    pa.id,
    (s) => s,
  );
  assert.equal(r.event.rolls[0].total, 32);
  assert.equal(r.event.pending, "damage");
  assert.equal(r.patches[0].resources.pe, a.resources.pe - 5);
  assert.equal(r.patches[0].inventory[0].usesRemaining, 2);
  assert.equal(r.encounter.combat?.effects[0].power?.modifiers[0].amount, "-5");
});
test("counter grants both actions without consuming the normal ones", () => {
  const { pa, context, item } = setup(1);
  const r = executeCombatCommand(
    context,
    { kind: "use", optionId: item.id, targetIds: [pa.id] },
    pa.id,
  );
  assert.equal(r.encounter.combat?.budgets[pa.id].standard, 2);
  assert.equal(r.encounter.combat?.budgets[pa.id].move, 2);
  assert.equal(r.patches[0].inventory[0].usesRemaining, 2);
});
test("reaction gift can be logged off-turn and cannot be re-used when exhausted", () => {
  const { pa, pb, context, item } = setup(5, 1);
  context.encounter.turn = 1;
  const r = executeCombatCommand(
    context,
    { kind: "use", optionId: item.id, targetIds: [pb.id] },
    pa.id,
    (s) => s,
  );
  assert.equal(r.event.rolls[0].total, 6);
  assert.equal(r.patches[0].inventory[0].usesRemaining, 0);
  context.sheets[pa.agentId!].inventory = r.patches[0].inventory;
  assert.throws(
    () =>
      executeCombatCommand(
        context,
        { kind: "use", optionId: item.id, targetIds: [pb.id] },
        pa.id,
      ),
    /utilizações/,
  );
  assert.ok(
    !combatOptions(context.sheets[pa.agentId!]).some((o) => o.id === item.id),
  );
});
test("relation mapping and combat test bonus do not affect independent damage", () => {
  assert.deepEqual([0, 1, 2, 3].map(heartDie), [0, 8, 10, 12]);
  const { a, pa, pb, context } = setup(0);
  context.relationDice = { [a.id]: 10 };
  const r = executeCombatCommand(
    context,
    {
      kind: "use",
      optionId: "unarmed",
      targetIds: [pb.id],
      attackDice: "1d20+0",
    },
    pa.id,
    (s) => s,
  );
  assert.equal(r.event.rolls[0].total, 30);
  assert.match(r.event.rolls[0].expression, /Relação: 1d10/);
});
