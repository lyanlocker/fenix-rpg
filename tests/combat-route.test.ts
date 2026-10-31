import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/combat/action/route";
import { newAgent, maximums } from "../lib/rules";
import { participantFromAgent, advanceTurn } from "../lib/combat";
import { emptyLedger, type CombatCommand } from "../lib/combat-actions";
import type { CombatContext } from "../lib/server/combat-engine";

test("HTTP actions carry edited dice and delay intentions through server validation and atomic commit", async () => {
  const previousFetch = globalThis.fetch,
    previousSecret = process.env.FENIX_COMBAT_SERVER_SECRET,
    previousEnv = process.env.VERCEL_ENV;
  const secret = "synthetic-combat-test-capability".repeat(3);
  process.env.FENIX_COMBAT_SERVER_SECRET = secret;
  process.env.VERCEL_ENV = "production";
  const a = newAgent("Synthetic A"),
    b = newAgent("Synthetic B");
  const campaign = crypto.randomUUID();
  for (const f of [a, b]) {
    f.campaign_id = campaign;
    f.resources = maximums(f);
  }
  const pa = participantFromAgent(a),
    pb = participantFromAgent(b);
  pa.initiative = 20;
  pb.initiative = 10;
  let context: CombatContext = {
    role: "player",
    actorId: pa.id,
    revision: 1,
    encounter: {
      id: crypto.randomUUID(),
      campaign_id: campaign,
      name: "Synthetic test",
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
  let commits = 0;
  globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.server_token, secret);
    const url = String(input);
    if (url.endsWith("/fenix_combat_context")) return Response.json(context);
    assert.ok(url.endsWith("/fenix_commit_combat_action"));
    assert.equal(body.expected_revision, context.revision);
    commits++;
    context = {
      ...context,
      encounter: body.next_encounter,
      revision: context.revision + 1,
    };
    for (const patch of body.agent_changes) {
      const { id, face, version, ...data } = patch;
      if (face === "alternate")
        Object.assign(context.sheets[id].alternate!.face, data);
      else Object.assign(context.sheets[id], data);
    }
    return Response.json({
      combat: {
        id: context.encounter.id,
        revision: context.revision,
        budget: context.encounter.combat?.budgets[context.actorId!],
        effects: context.encounter.combat?.effects,
      },
    });
  };
  const send = (command: CombatCommand) =>
    POST(
      new Request("https://fenix.test/api/combat/action", {
        method: "POST",
        headers: {
          Origin: "https://fenix.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: a.id,
          actorId: pb.id,
          token: "b".repeat(64),
          encounterId: context.encounter.id,
          revision: context.revision,
          command,
        }),
      }),
    );
  try {
    let response = await send({
      kind: "use",
      optionId: "unarmed",
      targetIds: [pb.id],
      attackDice: "3d20+7",
      attackMode: "highest",
    });
    assert.equal(response.status, 200);
    assert.equal(commits, 1);
    const hit = context.encounter.combat!.events[0];
    assert.equal(hit.actorId, pa.id);
    assert.equal(hit.rolls[0].dice.length, 3);
    assert.match(hit.rolls[0].expression, /\+7/);
    assert.equal(hit.proposedDamage, undefined);
    response = await send({
      kind: "damage",
      eventId: hit.id,
      damageDice: "2d6+1d4+3",
    });
    assert.equal(response.status, 200);
    assert.equal(commits, 2);
    assert.equal(context.encounter.combat!.events[0].damageRoll?.done, true);
    assert.equal(
      context.encounter.combat!.events[1].rolls[0].expression,
      "2d6+1d4+3",
    );
    response = await send({
      kind: "damage",
      eventId: hit.id,
      damageDice: "2d6+1d4+3",
    });
    assert.equal(response.status, 400);
    assert.equal(commits, 2);
    context.encounter = {
      ...context.encounter,
      round: 2,
      turn: 0,
      turnSerial: 2,
    };
    response = await send({ kind: "delay", afterId: pb.id });
    assert.equal(response.status, 200);
    assert.equal(commits, 3);
    assert.deepEqual(
      context.encounter.participants.map((p) => p.id),
      [pb.id, pa.id],
    );
    assert.equal(context.encounter.turn, 0);
    response = await send({ kind: "use", optionId: "free" });
    assert.equal(response.status, 400);
    assert.equal(commits, 3);
    // A production-shaped JSON round-trip: casting, next round, sustaining,
    // then two real actions rather than only checking a derived counter.
    Object.assign(context.sheets[a.id], {
      nex: 65,
      className: "Ocultista",
      resources: { ...maximums(a), pe: 100 },
      inventory: [
        {
          id: "speed",
          name: "Velocidade Mortal",
          kind: "Ritual",
          quantity: 1,
          spaces: 0,
          damage: "",
          notes: "",
          circle: 2,
          element: "Morte",
          execution: "padrão",
          cost: 3,
        },
      ],
    });
    context.encounter = {
      ...context.encounter,
      participants: [pa, pb],
      round: 3,
      turn: 0,
      turnSerial: 4,
      combat: emptyLedger(),
    };
    response = await send({
      kind: "use",
      optionId: "speed",
      targetIds: [pa.id],
      variant: "discente",
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).combat.budget.restricted, 1);
    context.encounter = advanceTurn(advanceTurn(context.encounter));
    response = await send({
      kind: "sustain",
      eventId: context.encounter.combat!.effects[0].id,
    });
    assert.equal(response.status, 200);
    const sustained = (await response.json()).combat.budget;
    assert.equal(sustained.standard, 1);
    assert.equal(sustained.restricted, 1);
    assert.equal(sustained.move, 1);
    assert.equal(context.sheets[a.id].resources.pe, 93);
    for (let i = 0; i < 2; i++) {
      response = await send({
        kind: "use",
        optionId: "custom:standard",
        note: "Ação da rodada",
      });
      assert.equal(response.status, 200);
    }
    response = await send({
      kind: "use",
      optionId: "custom:standard",
      note: "Ação excedente",
    });
    assert.equal(response.status, 400);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined)
      delete process.env.FENIX_COMBAT_SERVER_SECRET;
    else process.env.FENIX_COMBAT_SERVER_SECRET = previousSecret;
    if (previousEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousEnv;
  }
});
