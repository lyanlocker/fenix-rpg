import { newAgent, type Item } from "./rules";
import { validateAgentImport } from "./validation";
export const starterCatalog: Item[] = [
  ["Faca", "1d4", "19/x2", "curto", "0", 1, "Luta"],
  ["Martelo", "1d6", "20/x2", "corpo a corpo", "0", 1, "Luta"],
  ["Punhal", "1d4", "20/x3", "corpo a corpo", "0", 1, "Luta"],
  ["Machete", "1d6", "19/x2", "corpo a corpo", "0", 1, "Luta"],
  ["Lança", "1d6", "20/x2", "curto", "0", 1, "Luta"],
  ["Arco", "1d6", "20/x3", "médio", "0", 2, "Pontaria"],
  ["Besta", "1d8", "19/x2", "médio", "0", 2, "Pontaria"],
  ["Pistola", "1d12", "18/x2", "curto", "I", 1, "Pontaria"],
  ["Revólver", "2d6", "19/x3", "curto", "I", 1, "Pontaria"],
  ["Fuzil de caça", "2d8", "19/x3", "médio", "I", 2, "Pontaria"],
  ["Machadinha", "1d6", "20/x3", "curto", "0", 1, "Luta"],
  ["Machado", "1d8", "20/x3", "corpo a corpo", "I", 1, "Luta"],
  ["Maça", "2d4", "20/x2", "corpo a corpo", "I", 1, "Luta"],
  ["Acha", "1d12", "20/x3", "corpo a corpo", "I", 2, "Luta"],
].map(([name, damage, critical, range, category, spaces, skill], index) => ({
  id: "base-weapon-" + index,
  name: String(name),
  kind: "Arma",
  quantity: 1,
  spaces: Number(spaces),
  damage: String(damage),
  critical: String(critical),
  range: String(range),
  category: String(category),
  source: "Livro de Regras · tabela de armas, p. 56–57",
  attackSkill: String(skill),
  attackBonus: 0,
  notes:
    "Perfil básico da arma. Confira proficiência, munição, empunhadura e modificações. Acrescente os bônus de dano aplicáveis à expressão antes de rolar; críticos e efeitos especiais são resolvidos manualmente.",
}));
export function parseCatalog(raw: unknown): Item[] {
  if (
    !raw ||
    typeof raw !== "object" ||
    !("items" in raw) ||
    !Array.isArray(raw.items) ||
    raw.items.length > 5000
  )
    throw Error("Use um arquivo de biblioteca do Fênix com até 5.000 registros.");
  const items: Item[] = [];
  for (let offset=0;offset<raw.items.length;offset+=500) items.push(...validateAgentImport({version:1,agent:{...newAgent("Validação"),inventory:raw.items.slice(offset,offset+500)}}).inventory);
  return items;
}
export const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
