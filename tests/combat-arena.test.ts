import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CombatArena, {
  CombatEvents,
  type ArenaView,
} from "../components/combat-arena";
import { newAgent } from "../lib/rules";
import type { CombatEvent } from "../lib/combat-actions";
const view = (mine = true, active = true): ArenaView => ({
  id: "e",
  name: "Corredor escuro",
  active,
  round: 2,
  revision: 3,
  turnSerial: 4,
  currentParticipantId: mine ? "a" : "b",
  currentName: mine ? "Ana" : "Criatura",
  budget: null,
  effects: [],
  events: [],
  rules: {},
  portraits: { b: "/threat-art/zumbi-de-sangue.webp" },
  participants: [
    {
      id: "a",
      name: "Ana",
      initiative: 20,
      initiativeRolled: true,
      mine: true,
      isAgent: true,
      face: "main",
      pv: 20,
      maxPv: 30,
    },
    {
      id: "b",
      name: "Criatura",
      initiative: 10,
      initiativeRolled: true,
      mine: false,
      isAgent: false,
      face: null,
      pv: null,
      maxPv: null,
    },
  ],
});
test("arena renders tokens, active participant, action categories and enabled controls for the current player", () => {
  const html = renderToStaticMarkup(
    createElement(CombatArena, {
      combat: view(),
      agent: newAgent("Ana"),
      busy: false,
      error: "",
      onCommand: () => {},
    }),
  );
  assert.match(html, /Turno de Ana/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /Tokens e ordem dos turnos/);
  assert.match(html, /Padrão/);
  assert.match(html, /Movimento/);
  assert.match(html, /Livre/);
  assert.match(html, /Completa/);
  assert.doesNotMatch(html, /<fieldset disabled/);
  assert.match(html, /Concluir meu turno/);
});
test("spectators and paused players see tokens but cannot submit actions", () => {
  for (const combat of [view(false), view(true, false)]) {
    const html = renderToStaticMarkup(
      createElement(CombatArena, {
        combat,
        agent: newAgent(),
        busy: false,
        error: "",
        onCommand: () => {},
      }),
    );
    assert.match(html, /<fieldset disabled/);
    assert.match(html, /<button class="arena-end" disabled/);
    assert.match(html, /Criatura/);
  }
});
test("pending attack resolution is only rendered when the caller provides GM authority", () => {
  const event: CombatEvent = {
    id: "event",
    actorId: "a",
    actor: "Ana",
    targetIds: ["b"],
    label: "Faca",
    text: "Dano proposto",
    round: 1,
    secret: false,
    createdAt: "2026-10-31T00:00:00Z",
    rolls: [],
    pending: "damage",
    proposedDamage: 7,
  };
  const player = renderToStaticMarkup(
    createElement(CombatEvents, { events: [event] }),
  );
  assert.match(player, /Aguardando mestre/);
  assert.doesNotMatch(player, /Aplicar dano final/);
  const master = renderToStaticMarkup(
    createElement(CombatEvents, { events: [event], resolve: () => {} }),
  );
  assert.match(master, /Aplicar dano final/);
  assert.match(master, /value="7"/);
});
