import test from "node:test";
import assert from "node:assert/strict";
import { bookCatalog } from "../lib/books";
import { conditionDefinitions } from "../lib/conditions";
import { effectiveCategory, isWeaponCurse, toEnhancement } from "../lib/curses";
import {
  maximumFormula,
  maximums,
  newAgent,
  carryingCapacity,
  inventorySpaces,
  effectiveAttributes,
  skillBonus,
  activeAccessories,
  accessoryDefenseBonus,
  type Agent,
  type Item,
} from "../lib/rules";
import { isAccessoryCurse } from "../lib/curses";
import { validateAgentImport } from "../lib/validation";
import {
  availableModifications,
  toWeaponModification,
  weaponAttackBonus,
  weaponCritical,
  weaponDamage,
  weaponRange,
  weaponSpaces,
  weaponModifications,
} from "../lib/weapon-modifications";

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

test("weapon modifications change category and applicable roll and load values", () => {
  const chosen = (name: string) =>
    toWeaponModification(
      weaponModifications.find((entry) => entry.name === name)!,
    );
  const weapon: Item = {
    id: "knife",
    name: "Adaga",
    kind: "Arma",
    weaponType: "Corpo a corpo",
    quantity: 1,
    spaces: 1,
    damage: "1d4+1",
    critical: "19/x2",
    category: "I",
    notes: "",
    enhancements: [chosen("Certeira"), chosen("Cruel"), chosen("Discreta")],
  };
  assert.equal(weaponAttackBonus(weapon), 2);
  assert.equal(weaponDamage(weapon), "1d4+3");
  assert.equal(weaponSpaces(weapon), 0);
  assert.equal(effectiveCategory(weapon), "IV");
  assert.equal(inventorySpaces({ ...newAgent(), inventory: [weapon] }), 0);
  assert.equal(
    availableModifications(weapon).some((entry) => entry.name === "Mira Laser"),
    false,
  );
  weapon.enhancements!.push(
    toEnhancement(
      bookCatalog.find(
        (entry) => entry.name === "Lancinante" && entry.bookId === "01",
      )!,
    ),
  );
  assert.equal(effectiveCategory(weapon), "VI");
  const restored = validateAgentImport({
    version: 1,
    agent: { ...newAgent(), inventory: [weapon] },
  });
  assert.equal(restored.inventory[0].enhancements?.[0].subtype, "Modificação");
  assert.equal(restored.inventory[0].weaponType, "Corpo a corpo");
  const withoutCruel = {
    ...weapon,
    enhancements: weapon.enhancements!.filter((entry) => entry.name !== "Cruel"),
  };
  assert.equal(weaponDamage(withoutCruel), "1d4+1");
  assert.equal(effectiveCategory(withoutCruel), "V");
});

test("firearm modifications stay separate from ammunition and update derived values", () => {
  const chosen = (name: string) =>
    toWeaponModification(
      weaponModifications.find((entry) => entry.name === name)!,
    );
  const weapon: Item = {
    id: "gun",
    name: "Pistola",
    kind: "Arma",
    quantity: 1,
    spaces: 1,
    damage: "2d6",
    critical: "19/x3",
    range: "Curto",
    category: "I",
    notes: "",
    enhancements: [
      chosen("Alongada"),
      chosen("Calibre Grosso"),
      chosen("Mira Laser"),
      chosen("Mira Telescópica"),
    ],
  };
  assert.equal(weaponAttackBonus(weapon), 2);
  assert.equal(weaponDamage(weapon), "3d6");
  assert.equal(weaponCritical(weapon), "17/x3");
  assert.equal(weaponRange(weapon), "médio");
  assert.equal(
    availableModifications(weapon).some((entry) => entry.name === "Certeira"),
    false,
  );
  assert.equal(
    availableModifications(weapon).some((entry) => entry.name === "Dum Dum"),
    false,
  );
});

test("expert training and equipment bonuses remain independent", () => {
  const agent = newAgent("Expert");
  agent.skills.Reflexos = 5;
  agent.skills.Artes = 0;
  agent.skills.Fortitude = 0;
  agent.skillAdjustments = { Fortitude: 4 };
  agent.inventory = [
    {
      id: "vest",
      name: "Jaqueta",
      kind: "Item",
      accessoryType: "Vestimenta",
      equipped: true,
      accessorySkill: "Reflexos",
      accessoryBonus: 5,
      extraSkill: "Artes",
      extraBonus: 5,
      category: "I",
      quantity: 1,
      spaces: 1,
      damage: "",
      notes: "",
    },
    {
      id: "utensil",
      name: "Pincel",
      kind: "Item",
      accessoryType: "Utensílio",
      equipped: true,
      accessorySkill: "Artes",
      accessoryBonus: 5,
      category: "I",
      quantity: 1,
      spaces: 1,
      damage: "",
      notes: "",
    },
  ];
  assert.equal(skillBonus(agent, "Reflexos").total, 10);
  assert.equal(skillBonus(agent, "Artes").total, 10);
  assert.equal(skillBonus(agent, "Fortitude").total, 4);
  assert.equal(effectiveCategory(agent.inventory[0]), "IV");
  agent.skills.Artes = 15;
  assert.equal(skillBonus(agent, "Artes").total, 25);
  agent.inventory[1].equipped = false;
  assert.equal(skillBonus(agent, "Artes").total, 20);
  const restored = validateAgentImport({ version: 1, agent });
  assert.equal(restored.skills.Artes, 15);
  assert.equal(restored.skillAdjustments?.Fortitude, 4);
  assert.equal(restored.inventory[0].extraSkill, "Artes");
});

test("Pujança on an active vestment raises Strength and capacity", () => {
  const agent = newAgent();
  agent.attributes.FOR = 1;
  const curse = bookCatalog.find(
    (entry) => entry.name === "Pujança" && entry.bookId === "01",
  )!;
  assert.ok(isAccessoryCurse(curse));
  agent.inventory = [
    {
      id: "vest",
      name: "Vestimenta",
      kind: "Item",
      quantity: 1,
      spaces: 1,
      damage: "",
      notes: "",
      category: "I",
      accessorySkill: "Reflexos",
      accessoryBonus: 5,
      enhancements: [toEnhancement(curse)],
    },
    {
      id: "case",
      name: "Mala",
      kind: "Item",
      quantity: 1,
      spaces: 9,
      damage: "",
      notes: "",
    },
  ];
  assert.equal(inventorySpaces(agent), 10);
  assert.equal(effectiveAttributes(agent).FOR, 2);
  assert.equal(carryingCapacity(agent), 10);
  assert.equal(effectiveCategory(agent.inventory[0]), "IV");
  agent.inventory[0].equipped = false;
  assert.equal(carryingCapacity(agent), 5);
  assert.equal(skillBonus(agent, "Reflexos").total, 0);
});

test("at most two worn vestments contribute bonuses", () => {
  const agent = newAgent();
  agent.inventory = Array.from({ length: 3 }, (_, index) => ({
    id: `vest-${index}`,
    name: "Vestimenta",
    kind: "Item" as const,
    accessoryType: "Vestimenta" as const,
    accessorySkill: "Artes",
    accessoryBonus: 5 as const,
    equipped: true,
    quantity: 1,
    spaces: 1,
    damage: "",
    notes: "",
  }));
  assert.equal(activeAccessories(agent).length, 2);
  assert.equal(skillBonus(agent, "Artes").total, 10);
});

test("static accessory curses update defenses and day-gated maximums", () => {
  const agent = newAgent();
  const curse = (name: string) =>
    toEnhancement(
      bookCatalog.find(
        (entry) => entry.bookId === "01" && entry.name === name,
      )!,
    );
  agent.inventory = [
    {
      id: "ac",
      name: "Utensílio",
      kind: "Item",
      quantity: 1,
      spaces: 1,
      damage: "",
      notes: "",
      accessorySkill: "Artes",
      enhancements: [
        curse("Defesa"),
        curse("Vitalidade"),
        curse("Esforço Adicional"),
        curse("Carisma"),
      ],
    },
  ];
  assert.equal(accessoryDefenseBonus(agent), 5);
  assert.equal(effectiveAttributes(agent).PRE, agent.attributes.PRE + 1);
  assert.equal(maximums(agent).pe, 5); // Carisma não fornece PE adicionais.
  agent.inventory[0].attuned = true;
  assert.equal(maximums(agent).pv, 33);
  assert.equal(maximums(agent).pe, 10);
  agent.inventory[0].equipped = false;
  assert.equal(accessoryDefenseBonus(agent), 0);
  assert.equal(maximums(agent).pv, 18);
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
