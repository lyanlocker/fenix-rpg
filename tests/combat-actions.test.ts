import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, maximums, type Agent, type Item } from "../lib/rules";
import { participantFromAgent, advanceTurn } from "../lib/combat";
import {
  budgetFor,
  combatOptions,
  emptyLedger,
  turnKey,
  type CombatCommand,
  type CombatRule,
} from "../lib/combat-actions";
import {
  executeCombatCommand,
  type CombatContext,
} from "../lib/server/combat-engine";
function item(
  name: string,
  kind: Item["kind"] = "Poder",
  extra: Partial<Item> = {},
): Item {
  return {
    id: crypto.randomUUID(),
    name,
    kind,
    quantity: 1,
    spaces: 0,
    damage: "",
    notes: "",
    ...extra,
  };
}
function setup() {
  const a = newAgent("Ana"),
    b = newAgent("Bia");
  const campaign = crypto.randomUUID();
  for (const f of [a, b]) {
    f.campaign_id = campaign;
    f.nex = 65;
    f.resources = { ...maximums(f), pe: 100, pd: 100 };
  }
  b.resources.pv = 2;
  const pa = participantFromAgent(a),
    pb = participantFromAgent(b);
  const c: CombatContext = {
    role: "player",
    actorId: pa.id,
    revision: 1,
    encounter: {
      id: crypto.randomUUID(),
      campaign_id: campaign,
      name: "Teste",
      round: 1,
      turn: 0,
      active: true,
      started: true,
      participants: [pa, pb],
      combat: emptyLedger(),
    },
    sheets: { [a.id]: a, [b.id]: b },
    sheetVersions: { [a.id]: "version-a", [b.id]: "version-b" },
  };
  return { c, a, b, pa, pb };
}
function apply(
  c: CombatContext,
  command: CombatCommand,
  roll = (s: number) => s,
  actor = c.actorId!,
) {
  const r = executeCombatCommand(c, command, actor, roll);
  c.encounter = r.encounter;
  c.revision++;
  for (const p of r.patches) {
    const { id, face, version, ...patch } = p;
    const a = c.sheets[id];
    if (face === "alternate") Object.assign(a.alternate!.face, patch);
    else Object.assign(a, patch);
  }
  return r;
}
function newTurn(c: CombatContext) {
  c.encounter = {
    ...c.encounter,
    round: c.encounter.round + 1,
    turn: 0,
    turnSerial: (c.encounter.turnSerial || 0) + 1,
  };
}

test("authority: inactive, closed, off-turn, unselected and forged actors cannot act", () => {
  for (const mode of [
    "inactive",
    "closed",
    "offturn",
    "unselected",
    "forged",
  ]) {
    const { c, pa, pb } = setup();
    if (mode === "inactive") c.encounter.active = false;
    if (mode === "closed") c.encounter.started = false;
    if (mode === "offturn") c.encounter.turn = 1;
    if (mode === "unselected") pa.playerAccess = false;
    assert.throws(() =>
      executeCombatCommand(
        c,
        { kind: "use", optionId: "free" },
        mode === "forged" ? pb.id : pa.id,
      ),
    );
  }
});
test("movement spends move then standard; over-spend rejects without mutating the context", () => {
  const { c, pa } = setup();
  const snapshot = structuredClone(c);
  const first = executeCombatCommand(
    c,
    { kind: "use", optionId: "move" },
    pa.id,
  );
  assert.deepEqual(c, snapshot);
  assert.equal(first.encounter.combat!.budgets[pa.id].move, 0);
  apply(c, { kind: "use", optionId: "move" });
  apply(c, { kind: "use", optionId: "move" });
  assert.throws(() => apply(c, { kind: "use", optionId: "move" }), /gasta/);
});
test("cicatrizante consumes exactly one unit and healing clamps to the target maximum", () => {
  const { c, a, b, pb } = setup();
  const heal = item("Cicatrizante", "Item", { quantity: 2 });
  a.inventory.push(heal);
  b.resources.pv = maximums(b).pv - 1;
  const r = apply(c, { kind: "use", optionId: heal.id, targetIds: [pb.id] });
  assert.equal(b.resources.pv, maximums(b).pv);
  assert.equal(a.inventory[0].quantity, 1);
  assert.equal(r.event.rolls[0].expression, "2d8+2");
  assert.equal(r.patches.length, 2);
});
test("first aid uses INT, training, escalating scene DT and removes dying/unconscious", () => {
  const { c, a, b, pb } = setup();
  a.skills.Medicina = 5;
  a.inventory.push(item("Kit de Medicina", "Item"));
  b.resources.pv = 0;
  b.conditions = ["Morrendo", "Inconsciente"];
  let r = apply(c, { kind: "use", optionId: "firstAid", targetIds: [pb.id] });
  assert.equal(r.event.rolls[0].dice.length, 3);
  assert.equal(r.event.rolls[0].total, 25);
  assert.equal(b.resources.pv, 1);
  assert.deepEqual(b.conditions, []);
  b.resources.pv = 0;
  b.conditions = ["Morrendo"];
  newTurn(c);
  r = apply(c, { kind: "use", optionId: "firstAid", targetIds: [pb.id] });
  assert.match(r.event.text, /DT 25/);
  newTurn(c);
  a.inventory = [];
  b.resources.pv = 0;
  b.conditions = ["Morrendo"];
  r = apply(c, { kind: "use", optionId: "firstAid", targetIds: [pb.id] });
  assert.equal(r.event.rolls[0].total, 20);
  assert.match(r.event.text, /Falha/);
});
test("paramedic requires a kit and unlocks one boost per threshold", () => {
  const { c, a, pb } = setup();
  const ability = item("Paramédico");
  a.inventory.push(ability);
  assert.ok(!combatOptions(a).some((o) => o.id === ability.id));
  a.inventory.push(item("Kit médico", "Item"));
  assert.throws(
    () =>
      apply(c, {
        kind: "use",
        optionId: ability.id,
        targetIds: [pb.id],
        boost: 3,
      }),
    /NEX/,
  );
  const r = apply(c, {
    kind: "use",
    optionId: ability.id,
    targetIds: [pb.id],
    boost: 2,
  });
  assert.equal(r.event.rolls[0].expression, "4d10");
  assert.equal(a.resources.pe, 96);
  assert.equal(r.event.rolls.length, 1);
});
test("Surto Temporal grants self a standard action and rejects re-use in the scene", () => {
  const { c, a, pa, pb } = setup();
  const ability = item("Surto Temporal");
  a.inventory.push(ability);
  assert.throws(
    () => apply(c, { kind: "use", optionId: ability.id, targetIds: [pb.id] }),
    /você/,
  );
  apply(c, { kind: "use", optionId: ability.id, targetIds: [pa.id] });
  assert.equal(a.resources.pe, 97);
  assert.equal(budgetFor(c.encounter, pa, a).standard, 2);
  assert.throws(() => apply(c, { kind: "use", optionId: ability.id }), /usado/);
  newTurn(c);
  assert.throws(() => apply(c, { kind: "use", optionId: ability.id }), /usado/);
});
test("Estrategista queues an ally move for their turn, without letting them act early or repeatedly apply it", () => {
  const { c, a, b, pa, pb } = setup();
  const ability = item("Estrategista");
  a.inventory.push(ability);
  apply(c, { kind: "use", optionId: ability.id, targetIds: [pb.id] });
  c.actorId = pb.id;
  assert.throws(() => apply(c, { kind: "use", optionId: "move" }), /Aguarde/);
  c.actorId = pa.id;
  apply(c, { kind: "end" });
  c.actorId = pb.id;
  assert.equal(budgetFor(c.encounter, pb, b).move, 2);
  apply(c, { kind: "use", optionId: "move" });
  assert.equal(budgetFor(c.encounter, pb, b).move, 1);
  assert.equal(c.encounter.combat!.effects.length, 0);
});
function speed() {
  const data = setup();
  data.a.className = "Ocultista";
  data.a.skills.Ocultismo = 15;
  const ritual = item("Velocidade Mortal", "Ritual", {
    execution: "padrão",
    element: "Morte",
    circle: 2,
    cost: 3,
  });
  data.a.inventory.push(ritual);
  return { ...data, ritual };
}
test("Velocidade Mortal discente adds restricted standard actions and charges upkeep on the next caster turn", () => {
  const { c, a, pa, ritual } = speed();
  apply(c, {
    kind: "use",
    optionId: ritual.id,
    targetIds: [pa.id],
    variant: "discente",
  });
  const budget = budgetFor(c.encounter, pa, a);
  assert.equal(budget.standard, 0);
  assert.equal(budget.restricted, 1);
  assert.throws(
    () => apply(c, { kind: "use", optionId: ritual.id, targetIds: [pa.id] }),
    /gasta/,
  );
  newTurn(c);
  assert.throws(() => apply(c, { kind: "use", optionId: "move" }), /Sustente/);
  const effect = c.encounter.combat!.effects[0];
  apply(c, { kind: "sustain", eventId: effect.id });
  assert.equal(a.resources.pe, 93);
  assert.throws(
    () => apply(c, { kind: "sustain", eventId: effect.id }),
    /sustentado/,
  );
});
test("ending upkeep removes its action and a GM advancing past unpaid upkeep drops the effect", () => {
  const { c, a, pa, ritual } = speed();
  apply(c, { kind: "use", optionId: ritual.id, targetIds: [pa.id] });
  newTurn(c);
  apply(c, { kind: "stopEffect", eventId: c.encounter.combat!.effects[0].id });
  assert.equal(budgetFor(c.encounter, pa, a).move, 1);
  assert.equal(c.encounter.combat!.effects.length, 0);
  newTurn(c);
  apply(c, { kind: "use", optionId: ritual.id, targetIds: [pa.id] });
  newTurn(c);
  c.encounter = advanceTurn(c.encounter);
  assert.equal(c.encounter.combat!.effects.length, 0);
});
test("ritual cost applies SAN/permanent SAN or PD conversion, using the actor INT test", () => {
  for (const determination of [false, true]) {
    const { c, a, pb } = setup();
    a.className = "Ocultista";
    a.determination = determination;
    a.skills.Ocultismo = 0;
    const ritual = item("Cicatrização", "Ritual", {
      execution: "padrão",
      circle: 1,
      element: "Morte",
    });
    a.inventory.push(ritual);
    const san = a.resources.san;
    apply(c, { kind: "use", optionId: ritual.id, targetIds: [pb.id] }, () => 1);
    assert.equal(
      a.resources[determination ? "pd" : "san"],
      determination ? 97 : san - 1,
    );
    assert.equal(a.adjustments.san, determination ? 0 : -1);
  }
});
test("invented actions, unavailable NEX abilities and hidden targets are rejected", () => {
  const { c, a, pb } = setup();
  assert.throws(
    () => apply(c, { kind: "use", optionId: "invented", targetIds: [pb.id] }),
    /disponível/,
  );
  pb.hidden = true;
  assert.throws(
    () => apply(c, { kind: "use", optionId: "unarmed", targetIds: [pb.id] }),
    /Alvo/,
  );
  a.nex = 5;
  const power = item("Estrategista");
  a.inventory.push(power);
  assert.ok(!combatOptions(a).some((x) => x.id === power.id));
});
test("attack rolls leave damage pending; only GM can apply a final value once", () => {
  const { c, a, b, pa, pb } = setup();
  b.resources.pv = 30;
  const weapon = item("Faca", "Arma", {
    damage: "1d4",
    critical: "x3",
    weaponType: "Corpo a corpo",
  });
  a.inventory.push(weapon);
  const attack = apply(c, {
    kind: "use",
    optionId: weapon.id,
    targetIds: [pb.id],
  });
  assert.equal(attack.event.pending, "damage");
  assert.equal(attack.event.proposedDamage, undefined);
  assert.equal(attack.event.rolls.length, 1);
  assert.equal(attack.event.damageRoll?.formula, "3d4+1");
  apply(c, { kind: "damage", eventId: attack.event.id, damageDice: "3d4+1" });
  assert.equal(
    c.encounter.combat!.events.find((x) => x.id === attack.event.id)!
      .proposedDamage,
    13,
  );
  assert.equal(b.resources.pv, 30);
  assert.throws(
    () => apply(c, { kind: "resolve", eventId: attack.event.id, amount: 7 }),
    /mestre/,
  );
  c.role = "master";
  apply(
    c,
    { kind: "resolve", eventId: attack.event.id, amount: 7 },
    (s) => s,
    pa.id,
  );
  assert.equal(b.resources.pv, 23);
  assert.throws(
    () => apply(c, { kind: "resolve", eventId: attack.event.id, amount: 7 }),
    /resolvida/,
  );
});
test("Ataque Extra costs two, needs an earlier attack and can only be used once per round", () => {
  const { c, a, pb } = setup();
  a.inventory.push(item("Ataque Extra"));
  const cmd: CombatCommand = {
    kind: "use",
    optionId: "unarmed",
    targetIds: [pb.id],
    extraAttack: true,
  };
  assert.throws(() => apply(c, cmd), /anterior/);
  apply(c, { ...cmd, extraAttack: false });
  apply(c, cmd);
  assert.equal(a.resources.pe, 98);
  assert.throws(() => apply(c, cmd), /usado/);
});
test("GM can configure a bandage with a Medicine test, healing and item consumption", () => {
  const { c, a, b, pb } = setup();
  a.skills.Medicina = 5;
  a.inventory.push(item("Kit de Medicina", "Item"));
  const bandage = item("Bandagem", "Item");
  a.inventory.push(bandage);
  const rule: CombatRule = {
    itemId: bandage.id,
    name: bandage.name,
    action: "standard",
    pe: 0,
    effect: "heal",
    formula: "1d6+2",
    target: "ally",
    timing: "now",
    limit: "turn",
    consume: true,
    medicine: true,
    difficulty: 20,
    noRitual: false,
    note: "Regra desta mesa",
  };
  c.encounter.combatRules = { [bandage.id]: rule };
  const r = apply(c, { kind: "use", optionId: bandage.id, targetIds: [pb.id] });
  assert.equal(r.event.rolls[0].label, "Medicina");
  assert.equal(b.resources.pv, 10);
  assert.ok(!a.inventory.some((i) => i.id === bandage.id));
});
test("alternate face changes only its own resources/inventory and never creates recursive state", () => {
  const { c, a, pa, pb } = setup();
  const face = newAgent("Outra face");
  face.campaign_id = a.campaign_id;
  face.nex = 35;
  face.resources.pe = 30;
  const heal = item("Cicatrizante", "Item");
  face.inventory.push(heal);
  a.alternate = { approvedCampaignId: a.campaign_id!, face };
  pa.face = "alternate";
  const before = structuredClone(a.resources);
  const r = apply(c, { kind: "use", optionId: heal.id, targetIds: [pb.id] });
  assert.deepEqual(a.resources, before);
  assert.equal(a.alternate.face.inventory.length, 0);
  assert.equal(r.patches[0].face, "alternate");
  assert.doesNotThrow(() => JSON.stringify(c));
});
test("minimum PE cost may exceed a low-NEX turn limit once, but a second paid action may not", () => {
  const { c, a } = setup();
  a.nex = 5;
  const surge = item("Surto Temporal");
  const homebrew = item("Pequena cura", "Item");
  a.inventory.push(surge, homebrew);
  c.encounter.combatRules = {
    [homebrew.id]: {
      itemId: homebrew.id,
      name: homebrew.name,
      action: "free",
      pe: 1,
      effect: "heal",
      formula: "1d4",
      target: "self",
      timing: "now",
      limit: "turn",
      consume: false,
      medicine: false,
      difficulty: 20,
      noRitual: false,
      note: "",
    },
  };
  apply(c, { kind: "use", optionId: surge.id });
  assert.equal(a.resources.pe, 97);
  apply(c, { kind: "use", optionId: "move" });
  apply(c, { kind: "use", optionId: "free" });
  assert.throws(
    () => apply(c, { kind: "use", optionId: homebrew.id }),
    /Limite/,
  );
  newTurn(c);
  apply(c, { kind: "use", optionId: homebrew.id });
  assert.equal(a.resources.pe, 96);
});
test("zero PV prevents taking actions and turn completion does not reset another player budget", () => {
  const { c, a, b, pa, pb } = setup();
  a.resources.pv = 0;
  assert.throws(() => apply(c, { kind: "use", optionId: "free" }), /condição/);
  a.resources.pv = 5;
  apply(c, { kind: "use", optionId: "move" });
  const key = turnKey(c.encounter);
  apply(c, { kind: "end" });
  assert.equal(c.encounter.participants[c.encounter.turn].id, pb.id);
  assert.notEqual(turnKey(c.encounter), key);
  assert.equal(c.encounter.combat!.budgets[pa.id].ended, true);
  assert.equal(budgetFor(c.encounter, pb, b).move, 1);
});

test("GM conditions block actions and first aid preserves unrelated GM conditions", () => {
  const { c, a, b, pa, pb } = setup();
  pa.conditions = "Atordoado";
  assert.throws(() => apply(c, { kind: "use", optionId: "free" }), /condição/);
  pa.conditions = "";
  a.skills.Medicina = 10;
  b.resources.pv = 0;
  b.conditions = ["Morrendo"];
  pb.conditions = "Morrendo, Inconsciente, Fatigado";
  apply(c, { kind: "use", optionId: "firstAid", targetIds: [pb.id] });
  assert.equal(c.encounter.participants[1].conditions, "Fatigado");
  assert.equal(b.resources.pv, 1);
});

test("legacy Eletrocussão recovers execution and cost, consumes standard once and asks for a separate damage roll", () => {
  const { c, a, b, pa, pb } = setup();
  a.skills.Ocultismo = 20;
  const ritual = item("Eletrocussão", "Ritual");
  a.inventory.push(ritual);
  const option = combatOptions(a).find((o) => o.id === ritual.id)!;
  assert.equal(option.action, "standard");
  assert.equal(option.pe, 1);
  assert.equal(option.formula, "3d6");
  const r = apply(c, { kind: "use", optionId: ritual.id, targetIds: [pb.id] });
  assert.equal(a.resources.pe, 99);
  assert.equal(c.encounter.combat!.budgets[pa.id].standard, 0);
  assert.equal(r.event.rolls.length, 1);
  assert.equal(r.event.rolls[0].label, "Ocultismo");
  assert.equal(b.resources.pv, 2);
  assert.equal(r.event.damageRoll?.formula, "3d6");
  apply(c, { kind: "damage", eventId: r.event.id, damageDice: "3d6+1d4+2" });
  const pending = c.encounter.combat!.events.find((x) => x.id === r.event.id)!;
  assert.equal(pending.proposedDamage, 24);
  assert.equal(a.resources.pe, 99);
  assert.equal(c.encounter.combat!.budgets[pa.id].standard, 0);
  assert.equal(b.resources.pv, 2);
});
test("investigation uses INT and training and spends a full action, without inventing a success DT", () => {
  const { c, a, pa } = setup();
  a.skills.Investigação = 5;
  const r = apply(c, {
    kind: "use",
    optionId: "investigate",
    note: "Examino a escrivaninha",
  });
  assert.equal(r.event.rolls[0].dice.length, 3);
  assert.equal(r.event.rolls[0].total, 25);
  assert.equal(r.event.pending, "interpretation");
  assert.equal(c.encounter.combat!.budgets[pa.id].standard, 0);
  assert.equal(c.encounter.combat!.budgets[pa.id].move, 0);
  assert.throws(
    () => apply(c, { kind: "use", optionId: "investigate" }),
    /gasta/,
  );
});
test("ad hoc actions require a description and spend exactly the selected action category", () => {
  for (const action of ["standard", "move", "free", "full"] as const) {
    const { c, pa } = setup();
    assert.throws(
      () => apply(c, { kind: "use", optionId: `custom:${action}` }),
      /Descreva/,
    );
    const r = apply(c, {
      kind: "use",
      optionId: `custom:${action}`,
      note: "Opero o mecanismo da porta",
    });
    const budget = c.encounter.combat!.budgets[pa.id];
    assert.equal(
      budget.standard,
      action === "standard" || action === "full" ? 0 : 1,
    );
    assert.equal(budget.move, action === "move" || action === "full" ? 0 : 1);
    assert.equal(r.event.pending, "interpretation");
    assert.match(r.event.text, /mecanismo/);
  }
});
test("delaying moves the current actor after a lower-initiative ally and retains order across rounds and sort/resume", () => {
  const { c, a, b, pa, pb } = setup();
  pa.initiative = 20;
  pb.initiative = 10;
  const enemy = {
    id: crypto.randomUUID(),
    name: "Ameaça",
    pv: 40,
    maxPv: 40,
    initiative: 15,
    hidden: false,
    conditions: "",
  };
  c.encounter.participants = [pa, enemy, pb];
  const before = structuredClone(c);
  const r = apply(c, { kind: "delay", afterId: pb.id });
  assert.deepEqual(
    c.encounter.participants.map((p) => p.id),
    [enemy.id, pb.id, pa.id],
  );
  assert.equal(c.encounter.turn, 0);
  assert.equal(c.encounter.round, 1);
  assert.equal(c.encounter.participants[2].initiative, 10);
  assert.deepEqual(a.resources, before.sheets[a.id].resources);
  assert.deepEqual(b.resources, before.sheets[b.id].resources);
  assert.equal(r.patches.length, 0);
  c.encounter = advanceTurn(c.encounter);
  c.encounter = advanceTurn(c.encounter);
  assert.equal(c.encounter.participants[c.encounter.turn].id, pa.id);
  assert.equal(
    budgetFor(c.encounter, c.encounter.participants[2], a).standard,
    1,
  );
  apply(c, { kind: "end" });
  assert.equal(c.encounter.round, 2);
  assert.equal(c.encounter.participants[c.encounter.turn].id, enemy.id);
});
test("delay rejects spent/free actions, hidden targets, targets already passed, self, enemies and the initiative floor", () => {
  for (const invalid of [
    "spent",
    "free",
    "hidden",
    "above",
    "self",
    "enemy",
    "floor",
  ]) {
    const { c, a, pa, pb } = setup();
    pa.initiative = 20;
    pb.initiative = 10;
    if (invalid === "spent") apply(c, { kind: "use", optionId: "move" });
    if (invalid === "free") apply(c, { kind: "use", optionId: "free" });
    if (invalid === "hidden") pb.hidden = true;
    if (invalid === "above") pb.initiative = 25;
    if (invalid === "enemy") delete pb.agentId;
    if (invalid === "floor") {
      a.skills.Iniciativa = 5;
      pb.initiative = -6;
    }
    assert.throws(() =>
      apply(c, { kind: "delay", afterId: invalid === "self" ? pa.id : pb.id }),
    );
  }
});
test("manual attack expressions use the entered pool and bonus; damage is separate, single-use and owned by its actor", () => {
  const { c, b, pa, pb } = setup();
  let calls = 0;
  const attack = apply(
    c,
    {
      kind: "use",
      optionId: "unarmed",
      targetIds: [pb.id],
      attackDice: "4d20+7",
      attackMode: "lowest",
    },
    () => {
      calls++;
      return calls;
    },
  );
  assert.equal(calls, 4);
  assert.equal(attack.event.rolls[0].total, 8);
  assert.equal(attack.event.proposedDamage, undefined);
  assert.throws(() => apply(c, { kind: "end" }), /dano pendente/);
  assert.throws(() =>
    apply(
      c,
      { kind: "damage", eventId: attack.event.id, damageDice: "2d6+3" },
      (s) => s,
      pb.id,
    ),
  );
  const hp = b.resources.pv;
  const dmg = apply(c, {
    kind: "damage",
    eventId: attack.event.id,
    damageDice: "2d6+1d4+3",
  });
  assert.equal(dmg.event.rolls[0].total, 19);
  assert.equal(b.resources.pv, hp);
  assert.throws(
    () =>
      apply(c, {
        kind: "damage",
        eventId: attack.event.id,
        damageDice: "2d6+3",
      }),
    /já foi realizada/,
  );
  assert.equal(c.encounter.combat!.budgets[pa.id].standard, 0);
  apply(c, { kind: "end" });
});
test("invalid attack/damage expressions cannot consume actions, alter HP or replace a confirmed roll", () => {
  const { c, pb } = setup();
  const before = structuredClone(c);
  assert.throws(
    () =>
      apply(c, {
        kind: "use",
        optionId: "unarmed",
        targetIds: [pb.id],
        attackDice: "999999d20",
      }),
    /Ataque/,
  );
  assert.deepEqual(c, before);
  const attack = apply(c, {
    kind: "use",
    optionId: "unarmed",
    targetIds: [pb.id],
  });
  const staged = structuredClone(c);
  assert.throws(
    () =>
      apply(c, {
        kind: "damage",
        eventId: attack.event.id,
        damageDice: "process.exit()",
      }),
    /Dano/,
  );
  assert.deepEqual(c, staged);
  apply(c, { kind: "damage", eventId: attack.event.id, skipDamage: true });
  assert.equal(
    c.encounter.combat!.events.find((x) => x.id === attack.event.id)!.resolved,
    true,
  );
  apply(c, { kind: "end" });
});
test("damage stage is locked to the original turn even after the GM advances the turn", () => {
  const { c, pb } = setup();
  const attack = apply(c, {
    kind: "use",
    optionId: "unarmed",
    targetIds: [pb.id],
  });
  c.encounter = advanceTurn(advanceTurn(c.encounter));
  assert.throws(
    () =>
      apply(c, { kind: "damage", eventId: attack.event.id, damageDice: "2d6" }),
    /neste turno/,
  );
});

test("GM may arbitrate damage before a roll and the resolved event cannot be rolled later", () => {
  const { c, b, pb } = setup();
  b.resources.pv = 30;
  const hit = apply(c, {
    kind: "use",
    optionId: "unarmed",
    targetIds: [pb.id],
  });
  c.role = "master";
  const result = apply(c, {
    kind: "resolve",
    eventId: hit.event.id,
    amount: 4,
    note: "Resolução da mesa",
  });
  assert.equal(b.resources.pv, 26);
  assert.match(result.event.text, /definido pelo mestre antes/);
  c.role = "player";
  assert.throws(
    () =>
      apply(c, { kind: "damage", eventId: hit.event.id, damageDice: "1d6" }),
    /já foi realizada/,
  );
});
test("hiding the damage target does not trap a player behind an invisible pending roll", () => {
  const { c, pb } = setup();
  apply(c, { kind: "use", optionId: "unarmed", targetIds: [pb.id] });
  c.encounter.participants[1].hidden = true;
  assert.doesNotThrow(() => apply(c, { kind: "end" }));
});
