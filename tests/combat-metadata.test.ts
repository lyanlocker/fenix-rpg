import test from "node:test";
import assert from "node:assert/strict";
import { combatItem, ritualDamage } from "../lib/combat-metadata";
import { combatOptions, executionCost } from "../lib/combat-actions";
import {
  rollAttackDice,
  rollDamageDice,
  weaponRollSuggestion,
} from "../lib/combat-dice";
import { newAgent, type Item } from "../lib/rules";
import { bookCatalog } from "../lib/books";
import { reorderEncounter } from "../lib/combat";
const item = (extra: Partial<Item> = {}): Item => ({
  id: crypto.randomUUID(),
  name: "Personalizado",
  kind: "Ritual",
  quantity: 1,
  spaces: 0,
  damage: "",
  notes: "",
  ...extra,
});
test("execution metadata fills old official rituals without mutating or replacing edited fields", () => {
  const old = item({ name: "Eletrocussão" }),
    before = structuredClone(old),
    next = combatItem(old);
  assert.equal(next.execution, "padrão");
  assert.equal(next.circle, 1);
  assert.equal(next.cost, 1);
  assert.equal(ritualDamage(next), "3d6");
  assert.deepEqual(old, before);
  const edited = combatItem({
    ...old,
    execution: "movimento",
    cost: 0,
    target: "você",
    notes: "Minha versão",
    damage: "4d6",
  });
  assert.equal(edited.execution, "movimento");
  assert.equal(edited.cost, 0);
  assert.equal(edited.target, "você");
  assert.equal(edited.notes, "Minha versão");
  assert.equal(ritualDamage(edited), "4d6");
});
test("catalog IDs take precedence and unknown IDs or ambiguous names cannot import another rule", () => {
  const official = bookCatalog.find((i) => i.name === "Eletrocussão")!;
  assert.equal(
    combatItem(item({ name: "Meu raio", catalogId: official.id })).execution,
    "padrão",
  );
  assert.equal(
    combatItem(item({ name: "Eletrocussão", catalogId: "custom-other" }))
      .execution,
    undefined,
  );
});
test("described execution maps to categories while reactions and multi-turn casting stay out", () => {
  for (const [text, action] of [
    ["padrão", "standard"],
    ["Ação de movimento", "move"],
    ["LIVRE", "free"],
    ["ação completa", "full"],
    ["reação", null],
    ["1 minuto", null],
    ["2 ações completas", null],
  ] as const) {
    assert.equal(executionCost(text), action, text);
  }
  const a = newAgent();
  a.nex = 65;
  a.inventory = [
    item({
      name: "Ritual descrito",
      notes: "Execução: padrão Alcance: curto Alvo: 1 ser",
    }),
    item({
      name: "Passo",
      kind: "Poder",
      notes: "Você pode gastar uma ação de movimento para atravessar a sala.",
    }),
    item({ name: "Dispositivo", kind: "Item", execution: "livre" }),
    item({
      name: "Passivo",
      kind: "Poder",
      notes: "Você recebe +2 de defesa.",
    }),
    item({ name: "Longo", execution: "1 minuto" }),
    item({ name: "Reagir", execution: "reação" }),
  ];
  const options = combatOptions(a);
  assert.equal(
    options.find((o) => o.name === "Ritual descrito")?.action,
    "standard",
  );
  assert.equal(options.find((o) => o.name === "Passo")?.action, "move");
  assert.equal(options.find((o) => o.name === "Dispositivo")?.action, "free");
  assert.ok(
    !options.some((o) => ["Passivo", "Longo", "Reagir"].includes(o.name)),
  );
});
test("attack dice respect highest/lowest selection and strict bounds", () => {
  assert.equal(rollAttackDice("3D20 + 5", "highest", () => 7).total, 12);
  let n = 0;
  assert.equal(rollAttackDice("3d20-2", "lowest", () => ++n).total, -1);
  for (const expression of [
    "0d20",
    "11d20",
    "2d6",
    "2d20+1001",
    "1d20;alert(1)",
  ])
    assert.throws(() => rollAttackDice(expression));
});
test("damage supports several bounded terms without evaluating code and rejects huge totals before rolling", () => {
  assert.deepEqual(
    rollDamageDice("2d6 + 1d4 + 3", (s) => s),
    { expression: "2d6+1d4+3", dice: [6, 6, 4], total: 19 },
  );
  assert.equal(rollDamageDice("1d6-2", () => 1).total, -1);
  for (const expression of [
    "0d6",
    "101d6",
    "50d6+51d4",
    "1d1",
    "1d1000001",
    "999999999",
    "1d6**2",
    "1d6+NaN",
    "1d6+process.env.KEY",
  ]) {
    let count = 0;
    assert.throws(() =>
      rollDamageDice(expression, () => {
        count++;
        return 1;
      }),
    );
    assert.equal(count, 0);
  }
});
test("zero attribute suggestions use two d20 and the lowest; stable initiative ties preserve delayed ordering", () => {
  const a = newAgent();
  a.attributes.AGI = 0;
  a.skills.Pontaria = 5;
  const w = item({
    kind: "Arma",
    weaponType: "Arma de fogo",
    damage: "1d12",
    attackSkill: "Pontaria",
  });
  assert.equal(weaponRollSuggestion(a, w).attack, "2d20+5");
  assert.equal(weaponRollSuggestion(a, w).mode, "lowest");
  const p = (id: string, initiative: number) => ({
    id,
    name: id,
    initiative,
    pv: 10,
    maxPv: 10,
    hidden: false,
    conditions: "",
  });
  const e = {
    id: "e",
    campaign_id: null,
    name: "e",
    active: true,
    started: true,
    turn: 1,
    round: 2,
    participants: [p("b", 10), p("a", 10), p("c", 5)],
  };
  assert.deepEqual(
    reorderEncounter(e).participants.map((p) => p.id),
    ["b", "a", "c"],
  );
  assert.equal(reorderEncounter(e).turn, 1);
});
