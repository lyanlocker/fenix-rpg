import test from "node:test";
import assert from "node:assert/strict";
import { newAgent, maximums, type Item } from "../lib/rules";
import {
  alternateAgent,
  alternateIsApproved,
  isAllowedAtNex,
  makeAlternateFace,
  maxRitualCircle,
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

test("ritual circles follow the class and NEX and edits cannot exceed them", () => {
  assert.equal(maxRitualCircle("Ocultista", 35), 2);
  assert.equal(maxRitualCircle("Ocultista", 55), 3);
  assert.equal(maxRitualCircle("Combatente", 35), 1);
  assert.equal(maxRitualCircle("Combatente", 45), 2);
  assert.equal(isAllowedAtNex(ritual("Terceiro", 3), "Ocultista", 35), false);
  assert.equal(isAllowedAtNex(ritual("Indefinido", 0), "Ocultista", 35), false);
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
