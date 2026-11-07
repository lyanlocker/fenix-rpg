import test from "node:test";
import assert from "node:assert/strict";
import { creationStepError, trainingLevels } from "../lib/creation";
import { newAgent, check, skillAttributes, type ClassName } from "../lib/rules";
import { addBenefits } from "../lib/books";
import { validateAgentImport } from "../lib/validation";
import { weaponRollSuggestion, rollAttackDice } from "../lib/combat-dice";

test("all classes can create low-NEX sheets with custom attributes, no mandatory skills and no training quota", () => {
  for (const className of [
    "Combatente",
    "Especialista",
    "Ocultista",
    "Sobrevivente",
  ] as ClassName[]) {
    const a = newAgent("Mesa livre");
    Object.assign(a, {
      className,
      nex: className === "Sobrevivente" ? 0 : 5,
      origin: "Acadêmico",
      attributes: { AGI: 12, FOR: 0, INT: 0, PRE: 7, VIG: 0 },
      skills: {},
    });
    for (const step of [0, 1, 2, 3])
      assert.equal(creationStepError(a, step), "");
    for (const degree of trainingLevels) {
      a.skills = Object.fromEntries(
        Object.keys(skillAttributes).map((k) => [k, degree]),
      );
      assert.equal(creationStepError(a, 3), "");
      const saved = validateAgentImport({ version: 1, agent: addBenefits(a) });
      assert.deepEqual(saved.attributes, a.attributes);
      assert.deepEqual(saved.skills, a.skills);
    }
  }
});
test("free distribution still rejects invalid numbers and incomplete identity", () => {
  const a = newAgent("Nome");
  for (const n of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    a.attributes.AGI = n;
    assert.ok(creationStepError(a, 2));
    assert.throws(() => validateAgentImport({ version: 1, agent: a }));
  }
  a.name = " ";
  a.origin = " ";
  assert.ok(creationStepError(a, 0));
  assert.ok(creationStepError(a, 1));
});
test("attributes above ten generate the full roll and weapon suggestion with an operational dice bound", () => {
  assert.equal(check(12, 10, () => 20).dice.length, 12);
  assert.equal(check(1000, 0, () => 1).dice.length, 1000);
  assert.throws(() => check(1001));
  const a = newAgent();
  a.attributes.AGI = 12;
  a.skills.Pontaria = 10;
  const suggestion = weaponRollSuggestion(a, {
    id: "weapon",
    name: "Pistola",
    kind: "Arma",
    quantity: 1,
    spaces: 1,
    notes: "",
    damage: "1d12",
    attackSkill: "Pontaria",
    weaponType: "Arma de fogo",
  });
  assert.equal(suggestion.attack, "12d20+10");
  assert.equal(
    rollAttackDice(suggestion.attack, "highest", () => 20).dice.length,
    12,
  );
});
