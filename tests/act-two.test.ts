import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { signed, standing, projectedAverage } from "../lib/act-two";
import { jianghuGifts } from "../lib/jianghu-gifts";
import { prepareRpc, RpcError } from "../lib/server/neon-rpc";
test("elenco, média exata, sinal e classificação nas fronteiras", () => {
  const rows = [18, 12, -7, 20, -5, 10].map((value, i) => ({
    id: String(i),
    name: String(i),
    portrait: null,
    value,
  }));
  assert.equal(signed(projectedAverage(rows, [], 0, false)!, 1), "+8,0");
  assert.equal(projectedAverage([], [], 0, false), null);
  assert.equal(projectedAverage(rows.slice(0, 1), ["0"], 200, false), 100);
  assert.equal(projectedAverage(rows.slice(0, 1), ["0"], -100, true), -100);
  assert.deepEqual([-60.1, -60, -30, -10, 10, 10.01, 60, 60.1].map(standing), [
    "Inimigo",
    "Suspeito",
    "Malvisto",
    "Desconhecido",
    "Desconhecido",
    "Respeitado",
    "Confiável",
    "Protetor",
  ]);
});
test("o catálogo e o consumo confirmado usam os mesmos IDs e custos", () => {
  const sql = readFileSync("database/act-two.sql", "utf8");
  for (const g of jianghuGifts)
    assert.ok(sql.includes("when '" + g.id + "' then " + g.cost));
});
test("a evidência de combate exige a rota de servidor", () => {
  assert.throws(
    () => prepareRpc("fenix_act_commit_gift", {}),
    (e: unknown) => e instanceof RpcError && e.status === 404,
  );
});
