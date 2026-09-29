import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advanceTurn,
  changeHitPoints,
  participantFromAgent,
  participantFromThreat,
  removeParticipant,
  reorderEncounter,
} from "../lib/combat";
import {
  parseThreatImport,
  parseThreatTest,
  threatCatalog,
} from "../lib/threats";
import { newAgent } from "../lib/rules";
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
test("alternate combat uses the NEX 35 face and does not change the main sheet", () => {
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
  const main = participantFromAgent(a),
    other = participantFromAgent(a, true);
  assert.equal(main.name, "Principal");
  assert.equal(other.name, "Parente");
  assert.equal(other.pv, 12);
  assert.equal(other.agentId, a.id);
  assert.equal(other.face, "alternate");
  assert.equal(a.resources.pv, 50);
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
