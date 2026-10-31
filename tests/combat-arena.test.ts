import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CombatArena, {
  CombatEvents,
  arenaEncounter,
  type ArenaView,
} from "../components/combat-arena";
import { newAgent } from "../lib/rules";
import { budgetFor, type CombatEvent } from "../lib/combat-actions";
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

test("legacy ritual and ad hoc action are offered without triggering a roll on rendering", () => {
  const agent = newAgent("Ana");
  agent.inventory = [
    {
      id: "spell",
      kind: "Ritual",
      name: "Eletrocussão",
      quantity: 1,
      spaces: 0,
      notes: "",
      damage: "",
    },
  ];
  let commands = 0;
  const html = renderToStaticMarkup(
    createElement(CombatArena, {
      combat: view(),
      agent,
      busy: false,
      error: "",
      onCommand: () => {
        commands++;
      },
    }),
  );
  assert.match(html, /Eletrocussão/);
  assert.match(html, /Ação avulsa/);
  assert.match(html, /Atrasar ação/);
  assert.equal(commands, 0);
});
test("the active actor gets editable pending damage and an explicit roll button; others never get that form", () => {
  const combat = view();
  combat.events = [
    {
      id: "hit",
      actorId: "a",
      actor: "Ana",
      targetIds: ["b"],
      label: "Faca",
      text: "Ataque registrado",
      round: 2,
      secret: false,
      createdAt: "2026-10-31",
      rolls: [],
      pending: "damage",
      damageRoll: { formula: "2d6+3", turn: "2:a:4", done: false },
    },
  ];
  const html = renderToStaticMarkup(
    createElement(CombatArena, {
      combat,
      agent: newAgent(),
      busy: false,
      error: "",
      onCommand: () => {},
    }),
  );
  assert.match(html, /Dados de dano de Faca/);
  assert.match(html, /value="2d6\+3"/);
  assert.match(html, />Rolar dano<\/button>/);
  assert.match(html, /Sem dano \/ não acertou/);
  assert.match(html, /<button class="arena-end" disabled/);
  combat.participants[0].mine = false;
  combat.participants[1].mine = true;
  const observer = renderToStaticMarkup(
    createElement(CombatArena, {
      combat,
      agent: newAgent(),
      busy: false,
      error: "",
      onCommand: () => {},
    }),
  );
  assert.doesNotMatch(observer, /Dados de dano de Faca/);
});
test("delay button is enabled only before acting and when a later ally exists", () => {
  const combat = view();
  combat.participants[1].isAgent = true;
  const render = () =>
    renderToStaticMarkup(
      createElement(CombatArena, {
        combat,
        agent: newAgent(),
        busy: false,
        error: "",
        onCommand: () => {},
      }),
    );
  assert.match(
    render(),
    /<button class="arena-delay-button" aria-expanded="false">Atrasar ação/,
  );
  combat.budget = {
    key: "2:a:4",
    standard: 1,
    move: 0,
    restricted: 0,
    attack: 0,
    spentPe: 0,
    attacked: false,
    ended: false,
  };
  assert.match(
    render(),
    /<button class="arena-delay-button" aria-expanded="false" disabled/,
  );
});

test("the player projection retains two standards after upkeep and does not apply the same effect twice", () => {
  const combat = view();
  combat.budget = {
    key: "2:a:4",
    standard: 1,
    restricted: 1,
    move: 1,
    attack: 0,
    spentPe: 1,
    attacked: false,
    ended: false,
  };
  combat.effects = [
    {
      id: "speed:a",
      sourceId: "a",
      targetId: "a",
      name: "Velocidade Mortal",
      grant: "standard",
      noRitual: true,
      timing: "sustained",
      createdKey: "1:a:0",
      upkeepKey: "2:a:4",
      appliedKey: "2:a:4",
    },
  ];
  const serialized = JSON.parse(JSON.stringify(combat));
  const encounter = arenaEncounter(serialized);
  assert.equal(budgetFor(encounter, encounter.participants[0]).standard, 1);
  assert.equal(budgetFor(encounter, encounter.participants[0]).restricted, 1);
  const html = renderToStaticMarkup(
    createElement(CombatArena, {
      combat: serialized,
      agent: newAgent(),
      busy: false,
      error: "",
      onCommand: () => {},
    }),
  );
  assert.match(html, /<b>2<\/b> padrão/);
  assert.match(html, /1 sem ritual/);
  assert.match(html, /Ações extras ativas/);
  assert.doesNotMatch(html, /Sustentar · 1/);
  assert.doesNotMatch(html, /<fieldset disabled/);
});
