import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, maximums, type Item } from "../lib/rules";
import { bookCatalog } from "../lib/books";
import {
  combatOptions,
  emptyLedger,
  budgetFor,
  effortLimit,
  type CombatCommand,
  type CombatRule,
} from "../lib/combat-actions";
import { participantFromAgent, advanceTurn } from "../lib/combat";
import {
  executeCombatCommand,
  type CombatContext,
} from "../lib/server/combat-engine";
import {
  powerRule,
  resolvePower,
  configuredPowerRule,
} from "../lib/power-rules";
import { fixedBonus, powerContributions } from "../lib/power-effects";
import { adjustedAttackPool } from "../lib/combat-dice";
function item(name: string, overrides: Partial<Item> = {}): Item {
  return {
    id: crypto.randomUUID(),
    name,
    kind: "Poder",
    quantity: 1,
    spaces: 0,
    notes: "",
    damage: "",
    ...overrides,
  };
}
function setup() {
  const a = newAgent("Ana"),
    b = newAgent("Bia");
  a.nex = b.nex = 65;
  a.attributes = { AGI: 2, FOR: 3, INT: 3, PRE: 2, VIG: 2 };
  a.resources = { ...maximums(a), pe: 100, pd: 100 };
  b.resources = { ...maximums(b), pv: 1 };
  const p = participantFromAgent(a),
    target = participantFromAgent(b);
  const c: CombatContext = {
    role: "player",
    actorId: p.id,
    revision: 0,
    sheetVersions: { [a.id]: "a", [b.id]: "b" },
    sheets: { [a.id]: a, [b.id]: b },
    encounter: {
      id: crypto.randomUUID(),
      campaign_id: null,
      active: true,
      started: true,
      name: "Poderes",
      turn: 0,
      round: 1,
      participants: [p, target],
      combat: emptyLedger(),
    },
  };
  function use(
    command: CombatCommand,
    roll = (n: number) => (n === 20 ? 10 : n),
  ) {
    const r = executeCombatCommand(c, command, p.id, roll);
    c.encounter = r.encounter;
    for (const patch of r.patches)
      Object.assign(c.sheets[patch.id], {
        resources: patch.resources,
        adjustments: patch.adjustments,
        conditions: patch.conditions,
        inventory: patch.inventory,
      });
    return r.event;
  }
  function equip(name: string, overrides: Partial<Item> = {}) {
    const i = item(name, overrides);
    a.inventory.push(i);
    return i;
  }
  const weapon = equip("Espada de teste", {
    kind: "Arma",
    damage: "1d6",
    weaponType: "Corpo a corpo",
    critical: "20/x2",
  });
  const attack = (roll?: (n: number) => number) =>
    use(
      {
        kind: "use",
        optionId: weapon.id,
        targetIds: [target.id],
        attackDice: "3d20+0",
      },
      roll,
    );
  return { a, b, p, target, c, use, equip, weapon, attack };
}

test("Ataque Especial deducts PE, preserves actions and freezes damage bonuses outside editable dice", () => {
  const { a, c, p, equip, use, attack } = setup();
  const power = equip("Ataque Especial");
  use({
    kind: "use",
    optionId: power.id,
    power: { steps: 3, attackSteps: 1, confirmed: true },
  });
  assert.equal(a.resources.pe, 96);
  assert.equal(budgetFor(c.encounter, p, a).standard, 1);
  const hit = attack();
  assert.equal(hit.rolls[0].total, 15);
  assert.deepEqual(
    hit.damageRoll!.bonuses!.map((x) => x.formula),
    ["10"],
  );
  const damage = use({ kind: "damage", eventId: hit.id, damageDice: "1" });
  assert.equal(damage.rolls[0].total, 11);
  assert.equal(c.encounter.combat!.effects.length, 0);
  assert.throws(
    () => use({ kind: "damage", eventId: hit.id, damageDice: "1" }),
    /rolado|resolvido|disponível/,
  );
});

test("selection, insufficient resources and off-turn use reject without modifying sheets or encounter", () => {
  const { a, c, equip, use } = setup();
  const power = equip("Ataque Especial");
  const before = structuredClone(c);
  assert.throws(
    () =>
      use({
        kind: "use",
        optionId: power.id,
        power: { steps: 20, confirmed: true },
      }),
    /NEX/,
  );
  assert.deepEqual(c, before);
  a.resources.pe = 1;
  assert.throws(
    () => use({ kind: "use", optionId: power.id, power: { confirmed: true } }),
    /insuficientes/,
  );
  assert.equal(a.resources.pe, 1);
  c.encounter.turn = 1;
  assert.throws(
    () => use({ kind: "use", optionId: power.id, power: { confirmed: true } }),
    /turno/,
  );
});

test("Ataque Furtivo attaches only after a successful-attack confirmation and charges once per round", () => {
  const { a, equip, use, attack } = setup();
  const power = equip("Ataque Furtivo");
  assert.throws(
    () => use({ kind: "use", optionId: power.id, power: { confirmed: true } }),
    /Faça o ataque/,
  );
  assert.equal(a.resources.pe, 100);
  const hit = attack();
  use({ kind: "use", optionId: power.id, power: { confirmed: true } });
  assert.equal(a.resources.pe, 99);
  assert.throws(
    () => use({ kind: "use", optionId: power.id, power: { confirmed: true } }),
    /usado/,
  );
  const damage = use({ kind: "damage", eventId: hit.id, damageDice: "1" });
  assert.equal(damage.rolls[0].total, 19); // 1 + 3d6 at NEX 65.
});

test("Golpe Pesado multiplies only its base die on critical; Golpe Demolidor adds unmultiplied dice for 1 PE", () => {
  const { a, equip, use, attack } = setup();
  equip("Golpe Pesado");
  const power = equip("Golpe Demolidor");
  use({ kind: "use", optionId: power.id, power: { confirmed: true } });
  assert.equal(a.resources.pe, 99);
  const hit = attack((n) => n);
  assert.equal(hit.damageRoll!.formula, "2d6+3");
  assert.deepEqual(
    hit.damageRoll!.bonuses!.map((x) => x.formula),
    ["2d6", "2d6"],
  );
  assert.equal(
    use({
      kind: "damage",
      eventId: hit.id,
      damageDice: hit.damageRoll!.formula,
    }).rolls[0].total,
    39,
  );
});

test("Ritual Potente adds INT to ritual damage and healing, never weapon damage", () => {
  const { a, equip, use, target, attack, c } = setup();
  a.className = "Ocultista";
  equip("Ritual Potente");
  const hit = attack();
  assert.deepEqual(hit.damageRoll!.bonuses, []);
  use({ kind: "damage", eventId: hit.id, skipDamage: true });
  c.encounter = advanceTurn(advanceTurn(c.encounter));
  const spell = equip("Ritual de teste", {
    kind: "Ritual",
    execution: "padrão",
    cost: 1,
    circle: 1,
    damage: "2d8",
    element: "Medo",
  });
  const cast = use({ kind: "use", optionId: spell.id, targetIds: [target.id] });
  assert.deepEqual(
    cast.damageRoll!.bonuses!.map((x) => x.formula),
    ["3"],
  );
  assert.equal(
    use({ kind: "damage", eventId: cast.id, damageDice: "2d8" }).rolls[0].total,
    19,
  );
  c.encounter = advanceTurn(advanceTurn(c.encounter));
  const heal = equip("Cicatrização", { kind: "Ritual", element: "Medo" });
  const healed = use({
    kind: "use",
    optionId: heal.id,
    targetIds: [target.id],
  });
  assert.equal(healed.rolls.find((x) => x.label === "Cura")!.total, 30); // 3d8+3 base +3 INT.
});

test("Tiro Certeiro applies to projectile weapons, not firearms", () => {
  const { a, equip, c, p } = setup();
  equip("Tiro Certeiro");
  const ms = powerContributions(a, c.encounter, p);
  assert.equal(
    fixedBonus(
      ms,
      "damage",
      a,
      item("Arco", { kind: "Arma", weaponType: "Disparo" }),
    ),
    2,
  );
  assert.equal(
    fixedBonus(
      ms,
      "damage",
      a,
      item("Pistola", { kind: "Arma", weaponType: "Arma de fogo" }),
    ),
    0,
  );
});

test("Combate Defensivo subtracts d20 without reducing damage and expires at the next own turn even when skipped", () => {
  const { equip, use, attack, c, a, p } = setup();
  const power = equip("Combate Defensivo");
  use({ kind: "use", optionId: power.id, power: { confirmed: true } });
  const hit = attack();
  assert.equal(hit.rolls[0].dice.length, 2);
  assert.equal(hit.damageRoll!.formula, "1d6+3");
  assert.equal(
    fixedBonus(powerContributions(a, c.encounter, p), "defense", a),
    5,
  );
  c.encounter = advanceTurn(c.encounter);
  assert.equal(powerContributions(a, c.encounter, p).length, 2);
  c.encounter = advanceTurn(c.encounter);
  assert.equal(powerContributions(a, c.encounter, p).length, 0);
  c.encounter = advanceTurn(c.encounter);
  assert.equal(powerContributions(a, c.encounter, p).length, 0);
});

test("d20 pool adjustments correctly cross the zero-attribute boundary", () => {
  assert.deepEqual(adjustedAttackPool("2d20+5", "lowest", 1), {
    expression: "1d20+5",
    mode: "highest",
  });
  assert.deepEqual(adjustedAttackPool("1d20+5", "highest", -1), {
    expression: "2d20+5",
    mode: "lowest",
  });
  assert.deepEqual(adjustedAttackPool("2d20+5", "lowest", -1), {
    expression: "3d20+5",
    mode: "lowest",
  });
});

test("Perito pays its NEX-scaled cost, only affects the selected trained skill and is consumed by the matching test", () => {
  const { a, c, equip, use } = setup();
  a.skills.Investigação = 5;
  const power = equip("Perito");
  use({
    kind: "use",
    optionId: power.id,
    power: { choice: "Investigação", steps: 3, confirmed: true },
  });
  assert.equal(a.resources.pe, 96);
  const unrelated = use({
    kind: "use",
    optionId: "custom:free",
    note: "Olhar ao redor",
    skill: "Percepção",
    attackDice: "1d20+0",
  });
  assert.equal(unrelated.rolls[0].total, 10);
  assert.equal(c.encounter.combat!.effects.length, 1);
  const matching = use({
    kind: "use",
    optionId: "custom:standard",
    note: "Examinar pista",
    skill: "Investigação",
    attackDice: "1d20+0",
  });
  assert.equal(matching.rolls[0].total, 20);
  assert.equal(c.encounter.combat!.effects.length, 0);
});

test("Ataque Extra grants a usable attack and shares its once-per-round limit with the attack shortcut", () => {
  const { a, c, p, equip, use, attack, weapon, target } = setup();
  const power = equip("Ataque Extra");
  assert.throws(
    () => use({ kind: "use", optionId: power.id, power: { confirmed: true } }),
    /anterior/,
  );
  const hit = attack();
  use({ kind: "damage", eventId: hit.id, skipDamage: true });
  use({ kind: "use", optionId: power.id, power: { confirmed: true } });
  assert.equal(a.resources.pe, 98);
  assert.equal(budgetFor(c.encounter, p, a).attack, 1);
  assert.throws(
    () =>
      use({
        kind: "use",
        optionId: weapon.id,
        targetIds: [target.id],
        extraAttack: true,
      }),
    /usado/,
  );
  attack();
  assert.equal(budgetFor(c.encounter, p, a).attack, 0);
});

test("Sangue Fervente is gated by HP, chooses one attribute and cannot stack duplicate instances", () => {
  const { a, c, equip, use, attack } = setup();
  const power = equip("Sangue Fervente");
  assert.throws(
    () =>
      use({
        kind: "use",
        optionId: power.id,
        power: { choice: "FOR", confirmed: true },
      }),
    /machucado/,
  );
  a.resources.pv = 1;
  use({
    kind: "use",
    optionId: power.id,
    power: { choice: "FOR", confirmed: true },
  });
  const duplicate = equip("Sangue Fervente");
  assert.throws(
    () =>
      use({
        kind: "use",
        optionId: duplicate.id,
        power: { choice: "FOR", confirmed: true },
      }),
    /ativa/,
  );
  const hit = attack();
  assert.equal(hit.rolls[0].dice.length, 4);
  assert.equal(hit.damageRoll!.bonuses!.at(-1)!.formula, "1");
  a.resources.pv = maximums(a).pv;
  use({ kind: "damage", eventId: hit.id, skipDamage: true });
  assert.equal(c.encounter.combat!.effects.length, 0);
});

test("fixed source rules avoid the catalog false positives identified in the audit", () => {
  const { a } = setup();
  const get = (name: string) =>
    bookCatalog.find((i) => i.kind === "Poder" && i.name === name)!;
  assert.equal(powerRule(get("Artista Marcial"), a).modifiers.length, 0);
  assert.deepEqual(
    powerRule(get("Gatuno"), a).modifiers.map((m) => m.skill),
    ["atletismo", "crime"],
  );
  for (const name of [
    "Perito em Explosivos",
    "Força Opressora",
    "Ser Amaldiçoado",
    "Mudanças Permanentes",
  ])
    assert.equal(powerRule(get(name), a).modifiers.length, 0, name);
  assert.ok(
    !powerRule(get("Magnum Opus"), a).modifiers.some(
      (m) => m.stat === "attribute",
    ),
  );
  assert.equal(powerRule(get("Técnica Sublime"), a).passive, false);
  assert.equal(powerRule(get("Golpe Demolidor"), a).pe, 1);
  assert.equal(powerRule(get("Arma de Sangue"), a).pe, 2);
  assert.equal(powerRule(get("Arma de Sangue"), a).action, "move");
});

test("the complete 933-power catalog compiles without throwing or inventing an implicit standard action", () => {
  const { a } = setup();
  const powers = bookCatalog.filter((i) => i.kind === "Poder");
  assert.equal(powers.length, 933);
  for (const item of powers) {
    const rule = powerRule(item, a);
    assert.ok(Number.isInteger(rule.pe) && rule.pe >= 0, item.name);
    assert.ok(["free", "move", "standard", "full"].includes(rule.action));
  }
  assert.equal(
    powerRule(
      item("Dom pessoal", {
        notes: "Você recebe +2 em rolagens de dano com armas de fogo.",
      }),
    ).action,
    "free",
  );
  assert.equal(
    powerRule(
      item("Impulso pessoal", {
        notes:
          "Você pode gastar 2 PE e uma ação de movimento para receber +2 na Defesa.",
      }),
    ).action,
    "move",
  );
});

test("GM configured effects apply to allies, charge declared action/PE and are validated", () => {
  const { a, b, c, p, target, equip, use } = setup();
  const power = equip("Proteção do grupo");
  const rule: CombatRule = {
    itemId: power.id,
    name: power.name,
    effect: "power",
    action: "standard",
    pe: 2,
    target: "ally",
    timing: "scene",
    limit: "turn",
    consume: false,
    medicine: false,
    difficulty: 20,
    noRitual: false,
    note: "",
    duration: "scene",
    modifiers: [{ stat: "defense", scope: "all", amount: "3" }],
  };
  c.encounter.combatRules = { [power.id]: rule };
  use({ kind: "use", optionId: power.id, targetIds: [target.id] });
  assert.equal(a.resources.pe, 98);
  assert.equal(budgetFor(c.encounter, p, a).standard, 0);
  assert.equal(
    fixedBonus(powerContributions(b, c.encounter, target), "defense", b),
    3,
  );
  assert.throws(
    () =>
      configuredPowerRule({
        ...rule,
        modifiers: [{ stat: "defense", scope: "all", amount: "1d6" }],
      }),
    /fixo/,
  );
  assert.throws(
    () =>
      configuredPowerRule({
        ...rule,
        modifiers: [{ stat: "damage", scope: "all", amount: "Infinity" }],
      }),
    /número/,
  );
});

test("effort limit uses Encarar a Morte/Dedicação, with Presença Poderosa only for rituals", () => {
  const { a, equip } = setup();
  a.nex = 50;
  const base = effortLimit(a);
  equip("Potencial Aprimorado");
  assert.equal(effortLimit(a), base);
  equip("Encarar a Morte", { attuned: true });
  equip("Dedicação");
  equip("Presença Poderosa");
  assert.equal(effortLimit(a), base + 4);
  assert.equal(effortLimit(a, true), base + 4 + 2);
});

test("Especialista em Emergências changes cicatrizante to movement and preserves consumption", () => {
  const { a, equip, use, target, c, p } = setup();
  equip("Especialista em Emergências");
  const healing = equip("Cicatrizante", { kind: "Item" });
  assert.equal(
    combatOptions(a).find((x) => x.id === healing.id)!.action,
    "move",
  );
  use({ kind: "use", optionId: healing.id, targetIds: [target.id] });
  assert.equal(budgetFor(c.encounter, p, a).standard, 1);
  assert.equal(budgetFor(c.encounter, p, a).move, 0);
  assert.ok(!a.inventory.some((x) => x.id === healing.id));
});

test("catalog identity recognizes cosmetic names without overwriting repurposed abilities", () => {
  const { a, c, p, equip } = setup();
  const potent = equip("Ritual Potente - NEX 50%", {
    catalogId: "book-6750292fd81b2a7f",
    notes:
      "Ritual Potente. Você soma seu Intelecto nas rolagens de dano ou nos efeitos de cura de seus rituais.",
  });
  assert.equal(powerRule(potent, a).passive, true);
  const custom = equip("10% - Ensaio.", {
    catalogId: "book-ccf3f840fd980115",
    notes:
      "NEX 10% - Ensaio: após ensaiar no interlúdio, recebe bônus na margem de ameaça.",
  });
  assert.equal(powerRule(custom, a).modifiers[0].stat, "critical");
  assert.equal(powerRule(custom, a).modifiers[0].amount, "3");
  const perito = equip("Perito (vontade e Reflexos)", {
    catalogId: "book-387719e911a00843",
  });
  a.skills.Vontade = a.skills.Reflexos = a.skills.Investigação = 5;
  assert.throws(
    () => resolvePower(perito, a, { choice: "Investigação", confirmed: true }),
    /não foi escolhida/,
  );
  assert.equal(
    resolvePower(perito, a, { choice: "Vontade", confirmed: true }).modifiers[0]
      .skill,
    "vontade",
  );
  assert.equal(
    fixedBonus(
      powerContributions(a, c.encounter, p),
      "damage",
      a,
      item("Teste", { kind: "Ritual" }),
    ),
    3,
  );
});

test("Tatuagem and Mestre em Elemento reduce the actual ritual cost with a floor of one and update its DT", () => {
  const { a, target, p, equip, use } = setup();
  a.className = "Ocultista";
  equip("Mestre em Elemento Morte", { catalogId: "book-a9ecdc92da920723" });
  equip("Tatuagem Ritualística");
  equip("Rituais Eficientes");
  equip("Especialista em Elemento Morte - NEX 30%", {
    catalogId: "book-2561fa34200ba000",
  });
  const ritual = equip("Defesa pessoal", {
    kind: "Ritual",
    range: "pessoal",
    element: "Morte",
    execution: "padrão",
    cost: 3,
    circle: 1,
  });
  const event = use(
    { kind: "use", optionId: ritual.id, targetIds: [p.id] },
    (n) => n,
  );
  assert.equal(a.resources.pe, 99);
  assert.match(event.text, /DT do ritual: 32/);
  assert.match(event.text, /Custo: 1 PE/);
  assert.notEqual(target.id, p.id);
});

test("personal-only ritual cost reduction does not apply to another target", () => {
  const { a, target, equip, use } = setup();
  a.className = "Ocultista";
  equip("Tatuagem Ritualística");
  const ritual = equip("Teste pessoal", {
    kind: "Ritual",
    range: "pessoal",
    element: "Medo",
    execution: "padrão",
    cost: 3,
    circle: 1,
  });
  use({ kind: "use", optionId: ritual.id, targetIds: [target.id] });
  assert.equal(a.resources.pe, 97);
});

test("Conjuração Marcial grants a melee-only credit after a standard ritual", () => {
  const { a, c, p, target, equip, use, attack } = setup();
  a.className = "Ocultista";
  const power = equip("Conjuração Marcial"),
    ritual = equip("Preparação", {
      kind: "Ritual",
      execution: "padrão",
      element: "Medo",
      circle: 1,
      cost: 1,
    });
  assert.throws(
    () => use({ kind: "use", optionId: power.id, power: { confirmed: true } }),
    /ritual de ação padrão/,
  );
  use({ kind: "use", optionId: ritual.id, targetIds: [p.id] });
  use({ kind: "use", optionId: power.id, power: { confirmed: true } });
  assert.equal(budgetFor(c.encounter, p, a).meleeAttack, 1);
  assert.equal(a.resources.pe, 97);
  const gun = equip("Pistola teste", {
    kind: "Arma",
    weaponType: "Arma de fogo",
    damage: "2d6",
  });
  assert.throws(
    () => use({ kind: "use", optionId: gun.id, targetIds: [target.id] }),
    /ação já foi gasta/,
  );
  attack();
  assert.equal(budgetFor(c.encounter, p, a).meleeAttack, 0);
});

test("Mosh Pit bonuses apply only to the selected surrounded enemy and selected allies", () => {
  const { a, b, c, p, target, equip, use, attack } = setup();
  const enemy = {
    ...participantFromAgent(newAgent("Inimigo")),
    id: crypto.randomUUID(),
    agentId: undefined,
  };
  c.encounter.participants.push(enemy);
  const power = equip("65% - Mosh Pit.", {
    catalogId: "book-97b0f64f569813d0",
    notes: "Mosh Pit: os personagens cercando o alvo recebem dano adicional.",
  });
  use({
    kind: "use",
    optionId: power.id,
    targetIds: [p.id, target.id],
    power: { enemyId: enemy.id, confirmed: true },
  });
  assert.equal(a.resources.pe, 100);
  assert.equal(
    powerContributions(b, c.encounter, target).find(
      (m) => m.source === power.name,
    )!.amount,
    "2d6",
  );
  const other = attack();
  assert.deepEqual(other.damageRoll!.bonuses, []);
  use({ kind: "damage", eventId: other.id, skipDamage: true });
  c.encounter = advanceTurn(advanceTurn(advanceTurn(c.encounter)));
  const attackOption = combatOptions(a).find(
    (x) => x.effect === "attack" && x.id !== "unarmed",
  )!;
  const surrounded = use({
    kind: "use",
    optionId: attackOption.id,
    targetIds: [enemy.id],
    attackDice: "3d20+0",
  });
  assert.deepEqual(
    surrounded.damageRoll!.bonuses!.map((x) => x.formula),
    ["2d6"],
  );
});

test("Frase de Efeito pays once for a pending critical and increases only crit-scaled dice", () => {
  const { a, equip, use, attack } = setup();
  a.attributes.PRE = 4;
  equip("Golpe Pesado");
  const power = equip("40% - Frase de Efeito.", {
    notes: "Frase de Efeito: aumenta multiplicador do acerto crítico, 2 PE.",
    catalogId: "book-06ea4aa0013c3914",
  });
  assert.throws(
    () => use({ kind: "use", optionId: power.id, power: { confirmed: true } }),
    /crítico/,
  );
  const hit = attack((n) => n);
  use({ kind: "use", optionId: power.id, power: { confirmed: true } });
  assert.equal(a.resources.pe, 98);
  assert.throws(
    () => use({ kind: "use", optionId: power.id, power: { confirmed: true } }),
    /usado/,
  );
  const result = use({
    kind: "damage",
    eventId: hit.id,
    damageDice: hit.damageRoll!.formula,
  });
  assert.equal(result.rolls[0].total, 51); // (1 base +1 Golpe Pesado)d6 x4 +3 FOR.
});

test("custom Artes weapons use PRE and preserve already-written damage", () => {
  const { a, target, equip, use } = setup();
  a.attributes.PRE = 4;
  const instrument = equip("Instrumento Elétrico   de Combate", {
    kind: "Arma",
    attackSkill: "Artes",
    damage: "2d8 + 4",
  });
  const result = use({
    kind: "use",
    optionId: instrument.id,
    targetIds: [target.id],
  });
  assert.equal(result.rolls[0].dice.length, 4);
  assert.equal(result.damageRoll!.formula, "2d8 + 4");
  assert.equal(
    use({ kind: "damage", eventId: result.id, damageDice: "2d8+4" }).rolls[0]
      .total,
    20,
  );
});

test("temporary defense is shown together with armor and passive bonuses without rewriting the sheet", async () => {
  const { combatDefense } = await import("../lib/power-effects");
  const { a, c, p, equip, use } = setup();
  p.defense = 20;
  equip("Reflexos Defensivos");
  const power = equip("Combate Defensivo");
  use({ kind: "use", optionId: power.id, power: { confirmed: true } });
  assert.equal(combatDefense(a, c.encounter, p), 27);
  assert.equal(p.defense, 20);
  c.encounter = advanceTurn(advanceTurn(c.encounter));
  assert.equal(combatDefense(a, c.encounter, p), 22);
});

test("Técnica Sublime combines distinct paid effects and confines them to the selected weapon", () => {
  const { a, equip, use, attack, weapon } = setup();
  const power = equip("Técnica Sublime");
  use({
    kind: "use",
    optionId: power.id,
    power: {
      choices: ["destroyer", "lethal2"],
      weaponId: weapon.id,
      confirmed: true,
    },
  });
  assert.equal(a.resources.pe, 94);
  const hit = attack((n) => (n === 20 ? 15 : n));
  assert.equal(hit.damageRoll!.formula, "3d6+3");
  assert.throws(
    () =>
      resolvePower(power, a, {
        choices: ["lethal", "lethal2"],
        weaponId: weapon.id,
        confirmed: true,
      }),
    /alternativas/,
  );
});

test("Potência Máxima doubles Ataque Especial for melee attacks only", () => {
  const { a, equip, use, attack } = setup();
  a.nex = 99;
  equip("Potência Máxima");
  const power = equip("Ataque Especial");
  use({
    kind: "use",
    optionId: power.id,
    power: { steps: 2, attackSteps: 1, confirmed: true },
  });
  const hit = attack();
  assert.equal(hit.rolls[0].total, 20);
  assert.deepEqual(
    hit.damageRoll!.bonuses!.map((x) => x.formula),
    ["10"],
  );
});

test("each standard action can fund a two-weapon pair without stacking its penalty or minting free attacks", () => {
  const { a, c, p, equip, use, attack } = setup();
  const surge = equip("Surto Temporal"),
    dual = equip("Combater com Duas Armas");
  use({ kind: "use", optionId: surge.id });
  const activate = () =>
    use({ kind: "use", optionId: dual.id, power: { confirmed: true } });
  for (let pair = 0; pair < 2; pair++) {
    activate();
    assert.throws(activate, /dois ataques/);
    for (let i = 0; i < 2; i++) {
      const hit = attack();
      assert.equal(hit.rolls[0].dice.length, 2);
      use({ kind: "damage", eventId: hit.id, skipDamage: true });
    }
  }
  assert.equal(budgetFor(c.encounter, p, a).standard, 0);
  assert.throws(activate, /ação padrão/);
});

test("repurposed names sharing the original prefix do not inherit the old mechanic", () => {
  const { a, equip } = setup();
  const changed = equip("Perito em Explosivos", {
    catalogId: "book-387719e911a00843",
    notes: "Você soma seu Intelecto à DT dos explosivos.",
  });
  assert.notEqual(powerRule(changed, a).special, "perito");
});

test("custom powers reject excessive costs and dice without silently reducing the cost", () => {
  for (const notes of [
    "Você pode gastar 1234 PE para ativar seu poder.",
    "Você recebe +999999d6 em rolagens de dano com armas.",
    "Você recebe +999999 em Defesa.",
    "Você recebe +1d6 em Defesa.",
  ]) {
    const { a, equip, c, use } = setup();
    const i = equip("Poder pessoal inválido", { notes });
    assert.ok(powerRule(i, a).blocked, notes);
    const original = JSON.stringify(c);
    assert.throws(() => use({ kind: "use", optionId: i.id }));
    assert.equal(JSON.stringify(c), original);
  }
});

test("temporary powers expire across skipped turns and a pending next attack has a deadline", () => {
  const { c, equip, use } = setup();
  const defensive = equip("Combate Defensivo");
  use({ kind: "use", optionId: defensive.id, power: { confirmed: true } });
  assert.equal(advanceTurn(c.encounter, 3).combat!.effects.length, 0);
  c.encounter.combat!.effects = [];
  const lethal = equip("Disparo Letal");
  use({ kind: "use", optionId: lethal.id, power: { confirmed: true } });
  assert.equal(advanceTurn(c.encounter, 2).combat!.effects.length, 1);
  assert.equal(advanceTurn(c.encounter, 3).combat!.effects.length, 0);
  c.encounter = advanceTurn(c.encounter);
  c.encounter = advanceTurn(c.encounter);
  assert.equal(c.encounter.combat!.effects.length, 1);
  c.encounter = advanceTurn(c.encounter);
  assert.equal(c.encounter.combat!.effects.length, 0);
});

test("Eclético replaces only the missing training and Engenhosidade respects NEX and costs", () => {
  const { a, c, equip, use } = setup();
  const power = equip("Eclético");
  equip("Engenhosidade");
  a.skills.Investigação = 5;
  assert.throws(
    () => resolvePower(power, a, { choice: "Investigação", steps: 1 }),
    /já tem/,
  );
  assert.throws(
    () => resolvePower(power, a, { choice: "Investigação", steps: 3 }),
    /grau disponível/,
  );
  use({
    kind: "use",
    optionId: power.id,
    power: { choice: "Investigação", steps: 2 },
  });
  assert.equal(a.resources.pe, 96);
  const event = use({
    kind: "use",
    optionId: "investigate",
    attackDice: "3d20+5",
  });
  assert.equal(event.rolls[0].total, 20);
  assert.equal(a.skills.Investigação, 5);
  assert.equal(c.encounter.combat!.effects.length, 0);
  a.nex = 75;
  assert.equal(
    resolvePower(power, a, { choice: "Investigação", steps: 3 }).pe,
    6,
  );
});

test("Ritual Predileto applies its cost reduction only to the selected ritual", () => {
  const { a, c, p, equip, use } = setup();
  const power = equip("Ritual Predileto");
  const chosen = equip("Ritual pessoal", {
    kind: "Ritual",
    cost: 3,
    execution: "padrão",
    notes: "Causa 1d6 de dano.",
  });
  const other = equip("Outro ritual", {
    kind: "Ritual",
    cost: 3,
    execution: "padrão",
    notes: "Causa 1d6 de dano.",
  });
  assert.throws(
    () => resolvePower(power, a, { confirmed: true, weaponId: "missing" }),
    /item beneficiado/,
  );
  use({
    kind: "use",
    optionId: power.id,
    power: { confirmed: true, weaponId: chosen.id },
  });
  const mods = powerContributions(a, c.encounter, p);
  assert.equal(fixedBonus(mods, "ritualCost", a, chosen), -1);
  assert.equal(fixedBonus(mods, "ritualCost", a, other), 0);
});

test("Atirar para Matar freezes maximum critical damage for firearms but not melee weapons", () => {
  const { a, c, equip, use, weapon, target } = setup();
  a.nex = 99;
  equip("Atirar para Matar");
  weapon.weaponType = "Arma de fogo";
  const event = use(
    {
      kind: "use",
      optionId: weapon.id,
      targetIds: [target.id],
      attackDice: "2d20",
    },
    () => 20,
  );
  assert.equal(event.damageRoll?.maximum, true);
  const damage = use(
    { kind: "damage", eventId: event.id, damageDice: "2d6" },
    () => 1,
  );
  assert.equal(damage.rolls[0].total, 12);
  c.encounter = advanceTurn(advanceTurn(c.encounter));
  a.inventory.find((i) => i.id === weapon.id)!.weaponType = "Corpo a corpo";
  const second = use(
    {
      kind: "use",
      optionId: weapon.id,
      targetIds: [target.id],
      attackDice: "3d20",
    },
    () => 20,
  );
  assert.equal(second.damageRoll?.maximum, false);
});

test("Primeira Impressão expires on the compatible test and cannot be activated after it", () => {
  const { equip, use, c } = setup();
  const power = equip("Primeira Impressão");
  use({ kind: "use", optionId: power.id, power: { confirmed: true } });
  const e = use({
    kind: "use",
    optionId: "custom:free",
    note: "Conversar",
    skill: "Diplomacia",
    attackDice: "2d20",
  });
  assert.equal(e.rolls[0].dice.length, 4);
  assert.equal(c.encounter.combat!.effects.length, 0);
  assert.throws(
    () => use({ kind: "use", optionId: power.id, power: { confirmed: true } }),
    /primeiro teste/,
  );
});

test("decimal movement, global healing and alternative skill attributes keep their actual scope", () => {
  const { a, c, equip, use } = setup();
  equip("Pernas Para Que Te Quero");
  a.stage = 2;
  const moved = use({ kind: "use", optionId: "move" });
  assert.match(moved.text, /10\.5 m/);
  equip("Racionalidade Inflexível");
  a.attributes.INT = 4;
  a.attributes.PRE = 2;
  const will = use({
    kind: "use",
    optionId: "custom:free",
    note: "Resistir",
    skill: "Vontade",
  });
  assert.equal(will.rolls[0].dice.length, 4);
  equip("Técnica Medicinal");
  a.resources.pv = 1;
  const heal = equip("Cicatrizante", { kind: "Item", notes: "", quantity: 2 });
  c.encounter = advanceTurn(advanceTurn(c.encounter));
  const healed = use({
    kind: "use",
    optionId: heal.id,
    targetIds: [c.actorId!],
  });
  assert.equal(healed.rolls[0].total, 22);
});

test("duplicate copies of a passive from different source IDs do not stack", () => {
  const { a, c, p, equip } = setup();
  equip("Ritual Potente", { catalogId: "copy-a" });
  equip("Ritual Potente", { catalogId: "copy-b" });
  const ritual = item("Ritual pessoal", { kind: "Ritual" });
  assert.equal(
    fixedBonus(powerContributions(a, c.encounter, p), "damage", a, ritual),
    a.attributes.INT,
  );
});

test("extra credits for an ally disappear if the GM skips past that ally's entire turn", () => {
  const { a, c, target, equip, use } = setup();
  a.nex = 99;
  const commander = equip("Oficial Comandante");
  use({ kind: "use", optionId: commander.id, targetIds: [target.id] });
  assert.equal(advanceTurn(c.encounter).combat!.effects.length, 1);
  assert.equal(advanceTurn(c.encounter, 2).combat!.effects.length, 0);
});

test("skipping beyond a sustained ritual's unpaid turn cannot preserve its credits", () => {
  const { c, p, equip, use } = setup();
  const ritual = equip("Velocidade Mortal", {
    kind: "Ritual",
    cost: 3,
    execution: "padrão",
  });
  use({ kind: "use", optionId: ritual.id, targetIds: [p.id] });
  assert.equal(advanceTurn(c.encounter, 2).combat!.effects.length, 1);
  assert.equal(advanceTurn(c.encounter, 3).combat!.effects.length, 0);
});

test("Arma de Sangue creates a temporary weapon and charges its own extra attack once per turn", () => {
  const { a, c, p, target, equip, use, attack } = setup();
  const power = equip("Arma de Sangue");
  const originalInventory = a.inventory.length;
  assert.ok(!combatOptions(a).some((o) => o.id === "blood-weapon"));
  assert.throws(
    () =>
      use({
        kind: "use",
        optionId: "blood-weapon-extra",
        targetIds: [target.id],
        attackDice: "3d20",
      }),
    /disponível|encontrad/i,
  );
  use({ kind: "use", optionId: power.id });
  assert.equal(a.resources.pe, 98);
  assert.equal(budgetFor(c.encounter, p, a).move, 0);
  const options = combatOptions(a, {}, c.encounter.combat!.effects);
  assert.equal(
    options.find((o) => o.id === "blood-weapon")?.item?.damage,
    "1d6",
  );
  assert.throws(
    () =>
      use({
        kind: "use",
        optionId: "blood-weapon-extra",
        targetIds: [target.id],
        attackDice: "3d20",
      }),
    /agredir/,
  );
  attack();
  const extra = use({
    kind: "use",
    optionId: "blood-weapon-extra",
    targetIds: [target.id],
    attackDice: "3d20",
  });
  assert.equal(extra.damageRoll?.formula, "1d6+3");
  assert.equal(extra.action, "free");
  assert.equal(a.resources.pe, 97);
  assert.throws(
    () =>
      use({
        kind: "use",
        optionId: "blood-weapon-extra",
        targetIds: [target.id],
        attackDice: "3d20",
      }),
    /período/,
  );
  assert.equal(a.inventory.length, originalInventory);
  use({ kind: "stopEffect", eventId: c.encounter.combat!.effects[0].id });
  assert.ok(
    !combatOptions(a, {}, c.encounter.combat!.effects).some(
      (o) => o.id === "blood-weapon",
    ),
  );
});

test("affinity grants a permanent blood weapon without creation costs and with its larger die", () => {
  const { a, c, p, target, equip, use } = setup();
  const power = equip("Arma de Sangue", { attuned: true });
  assert.equal(powerRule(power, a).passive, true);
  assert.equal(
    combatOptions(a).find((o) => o.id === "blood-weapon")?.item?.damage,
    "1d10",
  );
  const attack = use({
    kind: "use",
    optionId: "blood-weapon",
    targetIds: [target.id],
    attackDice: "3d20",
  });
  assert.equal(attack.damageRoll?.formula, "1d10+3");
  assert.equal(a.resources.pe, 100);
  assert.equal(budgetFor(c.encounter, p, a).move, 1);
  assert.equal(c.encounter.combat!.effects.length, 0);
});

test("a free attack credit alone does not satisfy the agredir trigger of Arma de Sangue", () => {
  const { a, c, target, equip, use, attack, p } = setup();
  equip("Arma de Sangue", { attuned: true });
  c.encounter.combat!.effects.push({
    id: "credit",
    sourceId: p.id,
    targetId: p.id,
    name: "Ataque livre",
    grant: "meleeAttack",
    noRitual: false,
    timing: "now",
    createdKey: "previous",
  });
  const free = attack();
  assert.equal(free.action, "free");
  assert.equal(budgetFor(c.encounter, p, a).standard, 1);
  assert.throws(
    () =>
      use({
        kind: "use",
        optionId: "blood-weapon-extra",
        targetIds: [target.id],
        attackDice: "3d20",
      }),
    /agredir/,
  );
});

test("Segurar o Gatilho exige o acerto anterior, a mesma arma e o mesmo alvo, e cobra 2, 4 e 6", () => {
  const { a, p, target, weapon, use, equip, c, attack } = setup();
  equip("Segurar o Gatilho");
  weapon.weaponType = "Arma de fogo";
  const other = equip("Outra arma", { ...weapon, id: crypto.randomUUID() });
  const target2 = { ...target, id: crypto.randomUUID() };
  c.encounter.participants.push(target2);
  const first = attack();
  const fire = (id: string, optionId = weapon.id, targetId = target.id) =>
    use({
      kind: "use",
      optionId,
      targetIds: [targetId],
      followUpHitId: id,
    });
  assert.throws(() => fire(first.id), /último acerto/);
  use({ kind: "damage", eventId: first.id, damageDice: "1" });
  assert.throws(() => fire(first.id, other.id), /mesma arma/);
  assert.throws(() => fire(first.id, weapon.id, target2.id), /mesmo alvo/);
  let previous = first;
  for (const cost of [2, 4, 6]) {
    const before = a.resources.pe;
    const next = fire(previous.id);
    assert.equal(next.action, "free");
    assert.equal(a.resources.pe, before - cost);
    assert.equal(c.encounter.combat!.budgets[p.id].standard, 0);
    assert.throws(() => fire(previous.id), /último acerto/);
    use({ kind: "damage", eventId: next.id, damageDice: "1" });
    previous = next;
  }
  assert.throws(() => fire(previous.id), /Limite/);
  assert.equal(a.resources.pe, 88);
});

test("Segurar o Gatilho respeita NEX, PD, arma de fogo e ataque sem dano", () => {
  const { a, weapon, attack, use, equip, target } = setup();
  equip("Segurar o Gatilho");
  a.determination = true;
  weapon.weaponType = "Arma de fogo";
  const first = attack();
  use({ kind: "damage", eventId: first.id, damageDice: "1" });
  const follow = {
    kind: "use" as const,
    optionId: weapon.id,
    targetIds: [target.id],
    followUpHitId: first.id,
  };
  a.nex = 55;
  assert.throws(() => use(follow), /Segurar/);
  a.nex = 60;
  a.inventory.find((i) => i.id === weapon.id)!.weaponType = "Disparo";
  assert.throws(() => use(follow), /Segurar/);
  a.inventory.find((i) => i.id === weapon.id)!.weaponType = "Arma de fogo";
  const next = use(follow);
  assert.equal(a.resources.pd, 98);
  assert.equal(a.resources.pe, 100);
  use({ kind: "damage", eventId: next.id, skipDamage: true });
  assert.throws(
    () => use({ ...follow, followUpHitId: next.id }),
    /último acerto/,
  );
});

test("Ninja Urbano aplica dano só a corpo a corpo e disparo", () => {
  for (const type of ["Corpo a corpo", "Disparo", "Arma de fogo"] as const) {
    const { weapon, equip, attack } = setup();
    equip("Ninja Urbano");
    weapon.weaponType = type;
    assert.deepEqual(
      attack().damageRoll!.bonuses!.map((b) => b.formula),
      type === "Arma de fogo" ? [] : ["2"],
    );
  }
});

test("Disparada aumenta o deslocamento durante a rodada e expira mesmo ao pular turnos", () => {
  const { a, c, p, use, equip } = setup();
  const power = equip("Disparada", { bookId: "05" });
  const speed = () =>
    fixedBonus(powerContributions(a, c.encounter, p), "speed", a);
  use({ kind: "use", optionId: power.id });
  assert.equal(a.resources.pe, 99);
  assert.equal(c.encounter.combat!.budgets[p.id].move, 1);
  assert.equal(speed(), 4.5);
  c.encounter = advanceTurn(c.encounter);
  assert.equal(speed(), 4.5);
  c.encounter = advanceTurn(c.encounter, 3);
  assert.equal(speed(), 0);
});

test("Correria Desesperada mantém o deslocamento ao consumir apenas o dado do teste de fuga", () => {
  const { a, c, p, equip, use } = setup();
  const power = equip("Correria Desesperada");
  const bonus = (stat: "speed" | "testDice") =>
    fixedBonus(
      powerContributions(a, c.encounter, p),
      stat,
      a,
      undefined,
      "Atletismo",
    );
  assert.equal(bonus("speed"), 3);
  assert.equal(bonus("testDice"), 0);
  use({ kind: "use", optionId: power.id, power: { confirmed: true } });
  assert.equal(bonus("testDice"), 1);
  use({
    kind: "use",
    optionId: "custom:free",
    skill: "Atletismo",
    note: "Fugir",
  });
  assert.equal(bonus("testDice"), 0);
  assert.equal(bonus("speed"), 3);
});
test("Velocidade do Caos só concede o movimento adicional com afinidade e apenas para deslocar", () => {
  const { a, c, p, equip, use } = setup();
  const power = equip("Velocidade do Caos", { bookId: "05" });
  assert.equal(budgetFor(c.encounter, p, a).movementOnly, undefined);
  power.attuned = true;
  assert.equal(
    fixedBonus(powerContributions(a, c.encounter, p), "speed", a),
    9,
  );
  use({ kind: "use", optionId: "custom:full", note: "Trabalho demorado" });
  assert.throws(
    () => use({ kind: "use", optionId: "custom:move", note: "Outra ação" }),
    /gasta/,
  );
  use({ kind: "use", optionId: "move" });
  assert.throws(() => use({ kind: "use", optionId: "move" }), /gasta/);
  c.encounter = advanceTurn(c.encounter, 2);
  assert.equal(budgetFor(c.encounter, p, a).movementOnly, undefined);
});
test("Minha Dor me Impulsiona valida os PV e consome 1d6 no teste compatível", () => {
  const { a, c, p, equip, use } = setup();
  const power = equip("Minha Dor me Impulsiona");
  a.resources.pv = maximums(a).pv - 4;
  const activate = () =>
    use({ kind: "use", optionId: power.id, power: { confirmed: true } });
  assert.throws(activate, /5 PV/);
  assert.equal(a.resources.pe, 100);
  a.resources.pv--;
  activate();
  use({
    kind: "use",
    optionId: "custom:free",
    skill: "Vontade",
    note: "Resistir",
  });
  assert.ok(
    powerContributions(a, c.encounter, p).some((m) => m.amount === "1d6"),
  );
  const result = use({
    kind: "use",
    optionId: "custom:free",
    skill: "Acrobacia",
    note: "Saltar",
  });
  assert.ok(result.rolls[0].expression.includes("1d6"));
  assert.equal(a.resources.pe, 99);
  assert.equal(powerContributions(a, c.encounter, p).length, 0);
});
test("DT depende da resistência declarada pelo ritual", () => {
  const { a, p, c, equip } = setup();
  equip("Conjuração Corporal", { bookId: "05" });
  equip("Letrado no Oculto", { bookId: "05" });
  const spell = item("Teste", { kind: "Ritual" });
  for (const [resistance, expected] of [
    ["Fortitude reduz à metade", 2],
    ["Reflexos anula", 2],
    ["Vontade parcial", 2],
    ["Nenhuma", 0],
  ] as const) {
    spell.resistance = resistance;
    assert.equal(
      fixedBonus(powerContributions(a, c.encounter, p), "ritualDC", a, spell),
      expected,
    );
  }
});
test("Atlético preserva o grau da ficha e distingue treinamento adquirido de bônus prévio", () => {
  const { a, c, p, equip, use } = setup();
  const atletico = equip("Atlético", { bookId: "07" });
  a.skills.Atletismo = 0;
  const select = (choice: string) =>
    use({
      kind: "use",
      optionId: atletico.id,
      power: { choice, confirmed: true },
    });
  assert.throws(() => select("prior"), /Escolha/);
  assert.equal(
    fixedBonus(powerContributions(a, c.encounter, p), "speed", a),
    3,
  );
  select("training");
  assert.equal(
    fixedBonus(
      powerContributions(a, c.encounter, p),
      "skill",
      a,
      undefined,
      "Atletismo",
    ),
    5,
  );
  assert.equal(a.skills.Atletismo, 0);
  a.skills.Atletismo = 10;
  assert.deepEqual(
    powerRule(atletico, a).choices?.map((choice) => choice.id),
    ["prior"],
  );
  assert.equal(
    resolvePower(atletico, a, { choice: "prior", confirmed: true }).modifiers[0]
      .amount,
    "2",
  );
});

test("benefícios de progressão e interlúdio continuam consultáveis sem gasto em combate", () => {
  const { a, c, use } = setup();
  for (const name of [
    "Aumento de Atributo",
    "Criar Selo",
    "Ingrediente Secreto",
  ]) {
    const ability = bookCatalog.find(
      (i) => i.name === name && i.bookId === "01",
    )!;
    a.inventory.push({ ...ability });
    assert.equal(
      combatOptions(a).find((o) => o.id === ability.id)?.power?.outsideCombat,
      true,
    );
    const before = structuredClone(c);
    assert.throws(
      () => use({ kind: "use", optionId: ability.id }),
      /interlúdio|progressão/,
    );
    assert.deepEqual(c, before);
  }
});

test("Precisão exige a arma e o alvo escolhidos e o dado adicional não multiplica no crítico", () => {
  const { a, c, p, target, weapon, equip, use } = setup();
  weapon.weaponType = "Arma de fogo";
  const second = equip("Arma secundária", {
    kind: "Arma",
    weaponType: "Arma de fogo",
    damage: "1d6",
  });
  const otherTarget = { ...target, id: crypto.randomUUID() };
  c.encounter.participants.push(otherTarget);
  const power = equip("Precisão", { bookId: "05" });
  const select = { confirmed: true, weaponId: weapon.id, enemyId: target.id };
  use({ kind: "use", optionId: power.id, power: select });
  const effects = powerContributions(a, c.encounter, p);
  assert.equal(fixedBonus(effects, "critical", a, second), 0);
  assert.equal(
    effects.find((x) => x.source === power.name)?.enemyId,
    target.id,
  );
  const hit = use(
    {
      kind: "use",
      optionId: weapon.id,
      targetIds: [target.id],
      attackDice: "1d20+0",
    },
    () => 19,
  );
  assert.equal(hit.damageRoll?.critical, 2);
  assert.deepEqual(
    hit.damageRoll?.bonuses?.map((x) => x.formula),
    ["1d6"],
  );
  assert.equal(a.resources.pe, 100);
});
