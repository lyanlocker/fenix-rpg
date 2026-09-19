import { test } from "node:test";
import assert from "node:assert/strict";
import { check, damage, maximums, newAgent } from "../lib/rules";
import { validateAgentImport } from "../lib/validation";
test("zero chooses the worst die; positive attributes choose the best", () => {
  let i = 0;
  assert.equal(check(0, 5, () => [19, 3][i++]).total, 8);
  i = 0;
  assert.equal(check(2, 5, () => [19, 3][i++]).total, 24);
});
test("combatant NEX 65 base resources and determination", () => {
  const a = newAgent();
  a.className = "Combatente";
  a.nex = 65;
  a.attributes.VIG = 2;
  a.attributes.PRE = 2;
  assert.deepEqual(maximums(a), { pv: 94, pe: 52, san: 48, pd: 68 });
});
test("survivor advances by stage, not NEX", () => {
  const a = newAgent();
  a.className = "Sobrevivente";
  a.stage = 5;
  a.nex = 0;
  assert.deepEqual(maximums(a), { pv: 18, pe: 8, san: 16, pd: 14 });
});
test("NEX 99 is the twentieth advancement row", () => {
  const a = newAgent();
  a.className = "Ocultista";
  a.nex = 99;
  assert.equal(maximums(a).san, 115);
});
test("resource adjustments preserve special effects", () => {
  const a = newAgent();
  a.adjustments.pv = 10;
  a.adjustments.san = -4;
  assert.equal(maximums(a).pv, 28);
  assert.equal(maximums(a).san, 12);
});
test("damage accepts supported dice with modifier and rejects code/unbounded input", () => {
  assert.equal(damage("2d6+3", () => 4).total, 11);
  for (const s of ["100d6", "0d6", "2d3", "alert(1)", "1d20+Infinity", "-2d6"])
    assert.throws(() => damage(s));
});
test("import preserves valid sheet and rejects corrupted input", () => {
  const a = newAgent();
  assert.equal(validateAgentImport({ version: 1, agent: a }).name, a.name);
  assert.throws(() =>
    validateAgentImport({
      version: 1,
      agent: { ...a, attributes: { ...a.attributes, VIG: -1 } },
    }),
  );
  assert.throws(() => validateAgentImport({ version: 9, agent: a }));
});

test("import preserves attack and ritual fields without an account", () => {
  const a = newAgent("Teste");
  a.inventory = [
    {
      id: "weapon",
      name: "Teste",
      kind: "Arma",
      quantity: 1,
      spaces: 1,
      damage: "1d6",
      notes: "",
      attackSkill: "Pontaria",
      attackBonus: 2,
      critical: "19/x2",
    },
    {
      id: "ritual",
      name: "Teste",
      kind: "Ritual",
      quantity: 1,
      spaces: 0,
      damage: "",
      notes: "",
      cost: 3,
      discente: "Efeito discente",
    },
  ];
  const restored = validateAgentImport({ version: 1, agent: a });
  assert.equal(restored.inventory[0].attackSkill, "Pontaria");
  assert.equal(restored.inventory[1].cost, 3);
  assert.equal(restored.inventory[1].discente, "Efeito discente");
});
