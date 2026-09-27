import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, maximums, type Item } from "../lib/rules";
import {
  alternateAgent,
  alternateIsApproved,
  deriveAlternateFace,
  inheritedPowerSelection,
  isAllowedAtNex,
  makeAlternateFace,
  maxRitualCircle,
  refreshAlternateInheritance,
  ritualWithKnownCircle,
  validateAlternateFace,
} from "../lib/alternate";
import { validateAgentImport } from "../lib/validation";

function ritual(name: string, circle: number): Item {
  return {
    id: name,
    name,
    kind: "Ritual",
    circle,
    quantity: 1,
    spaces: 0,
    damage: "",
    notes: "",
  };
}

test("face NEX 35 inherits eligible rituals and abilities without changing the original", () => {
  const base = newAgent("Pessoa original");
  base.className = "Ocultista";
  base.nex = 65;
  base.skills.Ocultismo = 15;
  base.resources = maximums(base);
  base.inventory = [
    ritual("Primeiro", 1),
    ritual("Segundo", 2),
    ritual("Terceiro", 3),
    ritual("Círculo indefinido", 0),
    { ...ritual("Habilidade inicial", 1), id: "early", kind: "Poder", nex: 10 },
    { ...ritual("Habilidade futura", 1), id: "late", kind: "Poder", nex: 40 },
  ];
  const face = makeAlternateFace(base);
  assert.equal(face.nex, 35);
  assert.equal(face.skills.Ocultismo, 10);
  assert.deepEqual(
    face.inventory.map((item) => item.name),
    ["Primeiro", "Segundo", "Habilidade inicial"],
  );
  assert.deepEqual(face.resources, maximums({ ...base, ...face }));
  assert.equal(base.nex, 65);
  assert.equal(base.skills.Ocultismo, 15);
  assert.equal(base.inventory.length, 6);
  face.inventory[0].name = "Independente";
  assert.equal(base.inventory[0].name, "Primeiro");
});

test("legacy book rituals recover a unique circle without guessing custom rituals", () => {
  const old = ritual("Cicatrização", 0);
  assert.equal(ritualWithKnownCircle(old).circle, 1);
  assert.equal(old.circle, 0);
  assert.equal(
    ritualWithKnownCircle(ritual("Ritual desconhecido", 0)).circle,
    0,
  );
  const base = newAgent("Ocultista");
  base.className = "Ocultista";
  base.nex = 65;
  base.inventory = [old, ritual("Segundo", 2), ritual("Terceiro", 3)];
  assert.deepEqual(
    makeAlternateFace(base).inventory.map((item) => [item.name, item.circle]),
    [
      ["Cicatrização", 1],
      ["Segundo", 2],
    ],
  );
});

test("half of original powers are randomly selected only among NEX 35 options", () => {
  const base = newAgent("Poderes");
  base.className = "Ocultista";
  base.nex = 65;
  base.inventory = [
    ...["a", "b", "c", "d"].map((id) => ({
      ...ritual(id, 1),
      id,
      kind: "Poder" as const,
      nex: 10,
    })),
    {
      ...ritual("Tardia", 1),
      id: "late",
      kind: "Poder",
      subtype: "Habilidade de trilha",
      nex: 40,
    },
    {
      ...ritual("Outra tardia", 1),
      id: "later",
      kind: "Poder",
      subtype: "Habilidade de trilha",
      nex: 65,
    },
  ];
  const first = deriveAlternateFace(base, () => 0);
  const second = deriveAlternateFace(base, () => 0.99);
  assert.equal(first.face.inventory.length, 3);
  assert.equal(second.face.inventory.length, 3);
  assert.notDeepEqual(
    first.inheritance.selectedPowerIds,
    second.inheritance.selectedPowerIds,
  );
  assert.ok(first.face.inventory.every((item) => item.nex === 10));
  assert.deepEqual(
    inheritedPowerSelection(
      base,
      first.inheritance.selectedPowerIds,
      () => 0.99,
    ).map((item) => item.id),
    first.face.inventory.map((item) => item.id),
  );
});

test("an existing face gains new eligible rituals and keeps the player's edits", () => {
  const base = newAgent("Pessoa original");
  base.className = "Ocultista";
  base.nex = 65;
  base.campaign_id = crypto.randomUUID();
  base.inventory = [
    ritual("Cicatrização", 0),
    ritual("Aprimorar Mente", 2),
    ritual("Terceiro", 3),
    ...["p1", "p2", "p3", "p4"].map((id) => ({
      ...ritual(id, 1),
      id,
      kind: "Poder" as const,
      nex: 10,
    })),
    {
      ...ritual("Tardia", 1),
      id: "p5",
      kind: "Poder",
      subtype: "Habilidade de trilha",
      nex: 40,
    },
  ];
  const face = makeAlternateFace({ ...base, inventory: [] });
  face.name = "Nome secreto";
  face.portrait = "data:image/png;base64,Zm9v";
  face.resources.pv = 2;
  face.inventory = [
    { ...ritual("Poder só da segunda face", 1), id: "unique", kind: "Poder" },
  ];
  base.alternate = { approvedCampaignId: base.campaign_id, face };
  const updated = refreshAlternateInheritance(base, () => 0);
  assert.equal(updated.alternate?.face.name, "Nome secreto");
  assert.equal(updated.alternate?.face.portrait, face.portrait);
  assert.equal(updated.alternate?.face.resources.pv, 2);
  assert.deepEqual(
    updated.alternate?.face.inventory
      .filter((item) => item.kind === "Ritual")
      .map((item) => [item.name, item.circle]),
    [
      ["Cicatrização", 1],
      ["Aprimorar Mente", 2],
    ],
  );
  assert.equal(
    updated.alternate?.face.inventory.filter((item) => item.kind === "Poder")
      .length,
    4,
  );
  assert.equal(
    updated.alternate?.face.inventory.some((item) => item.id === "p5"),
    false,
  );
  assert.equal(base.alternate.face.inventory.length, 1);
  const stable = refreshAlternateInheritance(updated, () => 0.99);
  assert.deepEqual(
    stable.alternate?.face.inventory,
    updated.alternate?.face.inventory,
  );
  assert.deepEqual(
    validateAgentImport({ version: 1, agent: stable }).alternate?.inheritance,
    stable.alternate?.inheritance,
  );
  const removedPower = stable.alternate!.inheritance!.selectedPowerIds[0];
  const playerEdited = structuredClone(stable);
  playerEdited.alternate!.face.inventory =
    playerEdited.alternate!.face.inventory.filter(
      (item) => item.id !== "Cicatrização" && item.id !== removedPower,
    );
  const afterRemoval = refreshAlternateInheritance(playerEdited, () => 0.9);
  assert.equal(
    afterRemoval.alternate?.face.inventory.some(
      (item) => item.id === "Cicatrização",
    ),
    false,
  );
  assert.equal(
    afterRemoval.alternate?.face.inventory.some(
      (item) => item.id === removedPower,
    ),
    false,
  );
});

test("ritual circles follow the class and NEX and edits cannot exceed them", () => {
  assert.equal(maxRitualCircle("Ocultista", 35), 2);
  assert.equal(maxRitualCircle("Ocultista", 55), 3);
  assert.equal(maxRitualCircle("Combatente", 35), 1);
  assert.equal(maxRitualCircle("Combatente", 45), 2);
  assert.equal(isAllowedAtNex(ritual("Terceiro", 3), "Ocultista", 35), false);
  assert.equal(isAllowedAtNex(ritual("Indefinido", 0), "Ocultista", 35), false);
  assert.equal(
    isAllowedAtNex(
      { ...ritual("Mestre", 1), kind: "Poder", requirements: "NEX 45%" },
      "Ocultista",
      35,
    ),
    false,
  );
  const base = newAgent();
  const face = makeAlternateFace(base);
  face.inventory = [ritual("Segundo", 2)];
  assert.throws(() => validateAlternateFace(face), /não está disponível/);
  face.inventory = [];
  face.skills.Vontade = 15;
  assert.throws(() => validateAlternateFace(face), /Expert/);
});

test("approved face is independent, exported and only opens for its campaign", () => {
  const base = newAgent("Base");
  const campaignId = crypto.randomUUID();
  base.campaign_id = campaignId;
  base.alternate = {
    approvedCampaignId: campaignId,
    face: makeAlternateFace(base),
  };
  assert.equal(alternateIsApproved(base), true);
  assert.equal(
    alternateIsApproved(base, {
      id: campaignId,
      name: "Apocalypsis Real",
      element: "Medo",
      description: "",
      notes: "",
      rules: "Livro Básico",
    }),
    true,
  );
  assert.equal(
    alternateIsApproved(base, {
      id: campaignId,
      name: "Outra campanha",
      element: "Medo",
      description: "",
      notes: "",
      rules: "Livro Básico",
    }),
    false,
  );
  const altered = alternateAgent(base);
  altered.name = "Outro nome";
  assert.equal(base.name, "Base");
  assert.equal(altered.nex, 35);
  const restored = validateAgentImport({ version: 1, agent: base });
  assert.equal(restored.alternate?.face.nex, 35);
  assert.equal(restored.alternate?.approvedCampaignId, campaignId);
});
