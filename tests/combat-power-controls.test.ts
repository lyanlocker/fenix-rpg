import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CombatPowerControls from "../components/combat-power-controls";
import { newAgent, type Item } from "../lib/rules";
import { powerRule } from "../lib/power-rules";

const item = (name: string, kind: Item["kind"] = "Poder"): Item => ({
  id: crypto.randomUUID(),
  name,
  kind,
  quantity: 1,
  spaces: 0,
  notes: "",
  damage: "",
});
test("ability controls render training choices, selected ritual and a clear deadline", () => {
  const a = newAgent();
  a.nex = 75;
  const eclectic = item("Eclético"),
    engineering = item("Engenhosidade"),
    favorite = item("Ritual Predileto");
  a.inventory = [
    eclectic,
    engineering,
    favorite,
    item("Ritual conhecido", "Ritual"),
    item("Espada", "Arma"),
  ];
  const render = (i: Item) =>
    renderToStaticMarkup(
      createElement(CombatPowerControls, {
        item: i,
        rule: powerRule(i, a),
        agent: a,
        value: {},
        onChange: () => {},
      }),
    );
  const html = render(eclectic);
  assert.match(html, /Treinado/);
  assert.match(html, /Veterano/);
  assert.match(html, /Expert/);
  assert.match(html, /6 PE\/PD/);
  const ritual = render(favorite);
  assert.match(ritual, /Ritual conhecido/);
  assert.doesNotMatch(ritual, /Espada/);
  assert.match(
    render(item("Disparo Letal")),
    /expira no fim do seu próximo turno/,
  );
});
