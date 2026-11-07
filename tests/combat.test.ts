import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advanceTurn,
  changeHitPoints,
  participantFromAgent,
  participantFromThreat,
  removeParticipant,
  reorderEncounter,
  restoreOriginalParticipants,
} from "../lib/combat";
import {
  parseThreatImport,
  parseThreatTest,
  threatCatalog,
} from "../lib/threats";
import { newAgent } from "../lib/rules";
import { emptyLedger } from "../lib/combat-actions";
import type { Encounter, Participant } from "../lib/model";
const p = (id: string, initiative: number): Participant => ({
  id,
  name: id,
  initiative,
  pv: 10,
  maxPv: 10,
  hidden: false,
  conditions: "",
});
const encounter = (): Encounter => ({
  id: "e",
  campaign_id: "c",
  name: "e",
  round: 1,
  turn: 0,
  active: true,
  participants: [p("a", 20), p("b", 10), p("c", 5)],
});
test("turns advance and rewind across rounds without negative rounds", () => {
  let e = encounter();
  e = advanceTurn(advanceTurn(advanceTurn(e)));
  assert.equal(e.round, 2);
  assert.equal(e.turn, 0);
  e = advanceTurn(e, -1);
  assert.equal(e.round, 1);
  assert.equal(e.turn, 2);
  assert.equal(advanceTurn(encounter(), -1).round, 1);
  assert.equal(advanceTurn(encounter(), -1).turn, 0);
  assert.equal(advanceTurn({ ...encounter(), active: false }).turn, 0);
});
test("removing participants preserves the acting participant or selects its successor", () => {
  const e = { ...encounter(), turn: 1 };
  assert.equal(removeParticipant(e, "a").participants[0].id, "b");
  assert.equal(removeParticipant(e, "a").turn, 0);
  assert.equal(removeParticipant(e, "b").participants[1].id, "c");
  const last = removeParticipant({ ...e, turn: 2 }, "c");
  assert.equal(last.round, 2);
  assert.equal(last.turn, 0);
  const empty = removeParticipant(
    { ...e, participants: [p("a", 1)], turn: 0 },
    "a",
  );
  assert.equal(empty.active, false);
});
test("initiative ties are stable and reordering does not change the current actor", () => {
  const e = {
    ...encounter(),
    participants: [p("a", 1), p("b", 20), p("c", 20)],
  };
  const next = reorderEncounter(e);
  assert.deepEqual(
    next.participants.map((p) => p.id),
    ["b", "c", "a"],
  );
  assert.equal(next.turn, 2);
});
test("hit point adjustments clamp and reject invalid inputs", () => {
  assert.equal(changeHitPoints(p("a", 1), -100).pv, 0);
  assert.equal(changeHitPoints(p("a", 1), 100).pv, 10);
  assert.throws(() => changeHitPoints(p("a", 1), NaN));
  assert.throws(() => changeHitPoints(p("a", 1), 1.5));
});
test("retired face is unavailable; restoring old combat preserves sheets and initiative", () => {
  const a = newAgent("Principal");
  a.nex = 65;
  a.resources.pv = 50;
  a.alternate = {
    approvedCampaignId: "c",
    face: {
      ...newAgent("Parente"),
      nex: 35,
      resources: { pv: 12, pe: 5, san: 5, pd: 5 },
    },
  };
  const before = structuredClone(a);
  assert.throws(() => participantFromAgent(a, true), /desativada/);
  const main = participantFromAgent(a);
  const old = {
    ...encounter(),
    participants: [
      {
        ...main,
        face: "alternate" as const,
        name: "Parente",
        pv: 12,
        initiative: 22,
        initiativeRolled: true,
      },
    ],
  };
  const restored = restoreOriginalParticipants(old, [a]);
  assert.equal(restored.active, false);
  assert.equal(restored.participants[0].face, "main");
  assert.equal(restored.participants[0].name, "Principal");
  assert.equal(restored.participants[0].pv, 50);
  assert.equal(restored.participants[0].id, main.id);
  assert.equal(restored.participants[0].initiative, 22);
  assert.equal(restored.participants[0].initiativeRolled, true);
  assert.deepEqual(a, before);
  assert.equal(old.participants[0].face, "alternate");
  assert.equal(restoreOriginalParticipants(restored, [a]), restored);
  assert.throws(() => restoreOriginalParticipants(old, []), /Carregue/);
});
test("catalog entries match representative printed stat blocks and do not fabricate special PV", () => {
  assert.equal(
    new Set(threatCatalog.map((t) => t.id)).size,
    threatCatalog.length,
  );
  for (const t of threatCatalog) {
    assert.ok(t.details);
    assert.ok(t.page > 0);
    if (t.pv !== null) {
      assert.ok(t.pv > 0);
      assert.ok(t.defense !== null);
      parseThreatTest(t.initiative);
    }
  }
  const hikikomori = threatCatalog.find((t) => t.name === "Hikikomori")!;
  assert.equal(hikikomori.pv, 35);
  assert.equal(hikikomori.defense, 16);
  assert.equal(hikikomori.vd, 20);
  assert.equal(hikikomori.initiative, "2d20+5");
  assert.ok(hikikomori.details.includes("HIKIKOMORI"));
  assert.ok(hikikomori.details.includes("Fortitude 1d20"));
  assert.ok(hikikomori.attacks[0].name.includes("DISPARO INFECTADO"));
  for (const threat of threatCatalog) {
    assert.ok(!/[A-ZÀ-Ý]1d20[A-ZÀ-Ý]/.test(threat.details));
  }
  assert.equal(
    threatCatalog.find((t) => t.name === "Amigo Imaginário")!.pv,
    1000,
  );
  const special = threatCatalog.find((t) => t.kind === "Manifestação")!;
  assert.throws(() => participantFromThreat(special));
  assert.equal(
    parseThreatImport({ version: 1, threats: threatCatalog }).length,
    threatCatalog.length,
  );
  assert.throws(() =>
    parseThreatImport({ version: 1, threats: [{ ...hikikomori, pv: -10 }] }),
  );
});
test("threat d20 tests use the highest die and printed negative pools use the lowest", () => {
  assert.deepEqual(parseThreatTest("3d20+15"), { attribute: 3, bonus: 15 });
  assert.deepEqual(parseThreatTest("–2d20"), { attribute: 0, bonus: 0 });
  assert.throws(() => parseThreatTest("Veja texto"));
});

test("restoring originals retires only related effects and pending damage without refilling allies' turns", () => {
  const a = newAgent("Original");
  const old = { ...participantFromAgent(a), face: "alternate" as const };
  const e = encounter();
  const ally = e.participants[1];
  e.participants[0] = old;
  e.combat = {
    ...emptyLedger(),
    budgets: {
      [ally.id]: {
        key: "1:b:0",
        standard: 0,
        restricted: 1,
        move: 0,
        attack: 0,
        spentPe: 2,
        attacked: true,
        ended: false,
      },
    },
    uses: {},
    effects: [
      {
        id: "old",
        sourceId: old.id,
        targetId: ally.id,
        name: "Velocidade Mortal",
        grant: "standard",
        noRitual: true,
        timing: "sustained",
        createdKey: "1:a:0",
        appliedKey: "1:b:0",
      },
      {
        id: "keep",
        sourceId: ally.id,
        targetId: ally.id,
        name: "Outro efeito",
        grant: "move",
        noRitual: false,
        timing: "scene",
        createdKey: "1:b:0",
        appliedKey: "1:b:0",
      },
    ],
    events: [
      {
        id: "pending",
        actorId: ally.id,
        actor: "Aliado",
        targetIds: [old.id],
        label: "Ataque",
        text: "Pendente",
        round: 1,
        secret: false,
        createdAt: "2026-11-07",
        rolls: [],
        pending: "damage",
        proposedDamage: 8,
      },
    ],
  };
  const before = structuredClone(e);
  const restored = restoreOriginalParticipants(e, [a]);
  assert.equal(restored.combat!.budgets[ally.id].standard, 0);
  assert.equal(restored.combat!.budgets[ally.id].restricted, 0);
  assert.equal(restored.combat!.budgets[ally.id].spentPe, 2);
  assert.deepEqual(
    restored.combat!.effects.map((x) => x.id),
    ["keep"],
  );
  assert.equal(restored.combat!.events[0].resolved, true);
  assert.equal(a.resources.pv, newAgent().resources.pv);
  assert.deepEqual(e, before);
});
