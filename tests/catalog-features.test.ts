import test from "node:test";
import assert from "node:assert/strict";
import { bookCatalog } from "../lib/books";
import { conditionDefinitions } from "../lib/conditions";
import { effectiveCategory, isWeaponCurse, toEnhancement } from "../lib/curses";
import {
  maximumFormula,
  maximums,
  newAgent,
  type Agent,
  type Item,
} from "../lib/rules";
import { validateAgentImport } from "../lib/validation";

test("class resource formulas match the rulebook at NEX 5", () => {
  const expected = {
    Combatente: { pv: 22, pe: 4, san: 12, pd: 8 },
    Especialista: { pv: 18, pe: 5, san: 16, pd: 10 },
    Ocultista: { pv: 14, pe: 6, san: 20, pd: 12 },
  } as const;
  for (const [className, resources] of Object.entries(expected)) {
    const agent = { ...newAgent(), className, nex: 5 } as Agent;
    assert.deepEqual(maximums(agent), resources);
    assert.match(maximumFormula(agent, "pv"), /VIG 2/);
  }
});

test("conditions are complete, unique and explain their effects", () => {
  assert.equal(conditionDefinitions.length, 38);
  assert.equal(
    new Set(conditionDefinitions.map((entry) => entry.name)).size,
    38,
  );
  assert.ok(
    conditionDefinitions.every((entry) => entry.description.length > 10),
  );
  assert.ok(
    conditionDefinitions.some(
      (entry) =>
        entry.name === "Sangrando" && entry.description.includes("1d6"),
    ),
  );
});

test("weapon curses attach to a weapon and raise its category", () => {
  const curse = bookCatalog.find(
    (entry) => entry.name === "Lancinante" && entry.bookId === "01",
  )!;
  const protectionCurse = bookCatalog.find(
    (entry) => entry.name === "Cinética" && entry.bookId === "01",
  )!;
  assert.ok(isWeaponCurse(curse));
  assert.equal(isWeaponCurse(protectionCurse), false);
  const weapon: Item = {
    id: "weapon",
    name: "Adaga",
    kind: "Arma",
    quantity: 1,
    spaces: 1,
    damage: "1d4",
    notes: "",
    category: "I",
    enhancements: [toEnhancement(curse)],
  };
  assert.equal(effectiveCategory(weapon), "III");
  const restored = validateAgentImport({
    version: 1,
    agent: { ...newAgent(), inventory: [weapon] },
  });
  assert.equal(restored.inventory[0].enhancements?.[0].name, "Lancinante");
});

test("supplement rituals retain printed element, circle and cost", () => {
  const primary = bookCatalog.find(
    (entry) => entry.name === "Adaptar Corpo" && entry.bookId === "03",
  )!;
  const first = bookCatalog.find(
    (entry) => entry.name === "Ascensão de Espinhos" && entry.bookId === "03",
  )!;
  const fourth = bookCatalog.find(
    (entry) => entry.name === "Banho de Sangue" && entry.bookId === "03",
  )!;
  assert.deepEqual(
    [primary.element, primary.circle, primary.cost],
    ["Sangue", 0, 0],
  );
  assert.deepEqual([first.element, first.circle, first.cost], ["Sangue", 1, 1]);
  assert.deepEqual(
    [fourth.element, fourth.circle, fourth.cost],
    ["Sangue", 4, 10],
  );
});
