import { writeFileSync } from "node:fs";
import { bookCatalog } from "../lib/books";
import { newAgent, type Item } from "../lib/rules";
import { combatOptions } from "../lib/combat-actions";
import { powerRule } from "../lib/power-rules";
const agent = newAgent();
agent.nex = 99;
agent.stage = 5;
const kit: Item = {
  id: "audit-medicine-kit",
  name: "Kit de Medicina",
  kind: "Item",
  quantity: 1,
  spaces: 1,
  notes: "",
  damage: "",
};
const records = bookCatalog
  .filter((item) => item.kind === "Poder")
  .map((item) => {
    agent.inventory = [item, kit];
    const rule = powerRule(item, agent);
    const option = combatOptions(agent).find((option) => option.id === item.id);
    const status =
      option && option.effect !== "power"
        ? "integrado"
        : rule.blocked
          ? "conferir_fonte_ou_execucao"
          : rule.modifiers.length ||
              rule.choices?.length ||
              rule.special ||
              rule.manifestation ||
              rule.grants.length
            ? "efeito_estruturado"
            : rule.passive
              ? "integrado_passivo"
              : "resolucao_do_mestre";
    return {
      id: item.id,
      nome: item.name,
      livro: item.bookId,
      status,
      acao: option?.action || rule.action,
      peBase: option?.pe ?? rule.pe,
      aviso: rule.blocked || rule.warning || null,
    };
  });
const counts = Object.fromEntries(
  [...new Set(records.map((x) => x.status))].map((status) => [
    status,
    records.filter((x) => x.status === status).length,
  ]),
);
writeFileSync(
  "docs/AUDITORIA-PODERES-2.9.5.json",
  JSON.stringify(
    {
      total: records.length,
      counts,
      observacao:
        "Efeito estruturado não significa automação integral de todas as cláusulas. Conferir a documentação e testes. Não é uma revisão semântica completa dos 933 textos.",
      records,
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(JSON.stringify({ total: records.length, counts }) + "\n");
