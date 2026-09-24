import type { Item, ItemEnhancement } from "./rules";

export type WeaponType = "Corpo a corpo" | "Disparo" | "Arma de fogo";
type AppliesTo = "comum" | "fogo" | "ambos";
export type WeaponModification = {
  name: string;
  notes: string;
  appliesTo: AppliesTo;
};

// Livro de Regras, tabela 3.5, p. 60–61. Modificações de munição
// ficam fora desta lista porque pertencem à munição, não à arma.
export const weaponModifications: WeaponModification[] = [
  { name: "Certeira", notes: "+2 nos testes de ataque.", appliesTo: "comum" },
  { name: "Cruel", notes: "+2 nas rolagens de dano.", appliesTo: "comum" },
  {
    name: "Discreta",
    notes:
      "+5 em Crime para ocultar a arma; ocupa um espaço a menos (mínimo zero).",
    appliesTo: "ambos",
  },
  {
    name: "Perigosa",
    notes: "Aumenta em 2 a margem de ameaça.",
    appliesTo: "comum",
  },
  {
    name: "Tática",
    notes: "Pode ser sacada como ação livre.",
    appliesTo: "ambos",
  },
  { name: "Alongada", notes: "+2 nos testes de ataque.", appliesTo: "fogo" },
  {
    name: "Calibre Grosso",
    notes: "Mais um dado do mesmo tipo no dano; exige munição própria.",
    appliesTo: "fogo",
  },
  {
    name: "Compensador",
    notes: "Em arma automática, anula a penalidade de ataque por rajada.",
    appliesTo: "fogo",
  },
  {
    name: "Ferrolho Automático",
    notes: "A arma passa a ser automática.",
    appliesTo: "fogo",
  },
  {
    name: "Mira Laser",
    notes: "Aumenta em 2 a margem de ameaça.",
    appliesTo: "fogo",
  },
  {
    name: "Mira Telescópica",
    notes:
      "Aumenta o alcance em uma categoria e estende o uso de Ataque Furtivo.",
    appliesTo: "fogo",
  },
  {
    name: "Silenciador",
    notes: "Reduz a penalidade de Furtividade ao se esconder após atirar.",
    appliesTo: "fogo",
  },
  {
    name: "Visão de Calor",
    notes: "Ignora camuflagem do alvo.",
    appliesTo: "fogo",
  },
];

const firearms = new Set([
  "Pistola",
  "Revólver",
  "Fuzil de caça",
  "Submetralhadora",
  "Espingarda",
  "Fuzil de assalto",
  "Fuzil de precisão",
  "Bazuca",
  "Lança-chamas",
  "Arcabuz dos Moretti",
]);

export function weaponType(item: Item): WeaponType {
  if (item.weaponType) return item.weaponType;
  if (firearms.has(item.name)) return "Arma de fogo";
  if (item.attackSkill === "Pontaria") return "Disparo";
  return "Corpo a corpo";
}

export function availableModifications(item: Item) {
  const fire = weaponType(item) === "Arma de fogo";
  return weaponModifications.filter(
    (modification) =>
      modification.appliesTo === "ambos" ||
      modification.appliesTo === (fire ? "fogo" : "comum"),
  );
}

export function toWeaponModification(
  modification: WeaponModification,
): ItemEnhancement {
  return {
    id: crypto.randomUUID(),
    catalogId: `book-01-modification-${modification.name}`,
    name: modification.name,
    subtype: "Modificação",
    notes: modification.notes,
    source: "Livro de Regras v1.3 · tabela 3.5, p. 60–61",
    bookId: "01",
  };
}

export function hasWeaponModification(item: Item, name: string) {
  return (
    item.enhancements?.some(
      (entry) => entry.subtype === "Modificação" && entry.name === name,
    ) || false
  );
}

export function weaponAttackBonus(item: Item) {
  return (
    (item.attackBonus || 0) +
    (hasWeaponModification(item, "Certeira") ? 2 : 0) +
    (hasWeaponModification(item, "Alongada") ? 2 : 0)
  );
}

export function weaponDamage(item: Item) {
  let expression = item.damage;
  if (hasWeaponModification(item, "Calibre Grosso")) {
    expression = expression.replace(
      /^(\d{1,3})d(\d{1,7})/i,
      (match, count: string, faces: string) =>
        +count < 100 ? `${+count + 1}d${faces}` : match,
    );
  }
  if (
    hasWeaponModification(item, "Cruel") &&
    /^\d+d\d+(?:[+-]\d+)?$/i.test(expression.replace(/\s/g, ""))
  ) {
    const clean = expression.replace(/\s/g, "");
    const numeric = /([+-]\d+)$/.exec(clean);
    expression = clean.replace(
      /([+-]\d+)?$/,
      `+${Number(numeric?.[1] || 0) + 2}`,
    );
  }
  return expression;
}

export function weaponSpaces(item: Item) {
  return Math.max(
    0,
    item.spaces - (hasWeaponModification(item, "Discreta") ? 1 : 0),
  );
}

export function weaponCritical(item: Item) {
  const critical = item.critical || "";
  if (
    !hasWeaponModification(item, "Perigosa") &&
    !hasWeaponModification(item, "Mira Laser")
  )
    return critical;
  return critical.replace(
    /^(\d{1,2})(\s*\/\s*x\d+)/i,
    (_, start: string, rest: string) => `${Math.max(1, +start - 2)}${rest}`,
  );
}

export function weaponRange(item: Item) {
  if (!hasWeaponModification(item, "Mira Telescópica")) return item.range || "";
  const ranks = ["curto", "médio", "longo", "extremo"];
  const index = ranks.indexOf((item.range || "").toLocaleLowerCase());
  return index >= 0 ? ranks[Math.min(index + 1, 3)] : item.range || "";
}
