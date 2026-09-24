import { accessoryType, type Item, type ItemEnhancement } from "./rules";

const baseWeaponCurses = new Set([
  "Antielemento",
  "Ritualística",
  "Senciente",
  "Empuxo",
  "Energética",
  "Vibrante",
  "Consumidora",
  "Erosiva",
  "Repulsora",
  "Lancinante",
  "Predadora",
  "Sanguinária",
]);
const baseAccessoryCurses = new Set([
  "Carisma",
  "Conjuração",
  "Escudo Mental",
  "Reflexão",
  "Sagacidade",
  "Defesa",
  "Destreza",
  "Potência",
  "Esforço Adicional",
  "Disposição",
  "Pujança",
  "Vitalidade",
  "Proteção Elemental",
]);

const arsenalWeaponCurses = new Set([
  "Ambiciosa",
  "Apegada",
  "Expansora",
  "Frustrante",
  "Raivosa",
  "Secretora",
  "Consciência Dupla",
  "Conveniente",
  "Metódica",
  "Esnobe",
  "Inexistida",
  "Obediente",
  "Piedosa",
  "Sábia",
  "Sombria",
  "Tácita",
  "Transcrita",
  "Dançante",
  "Impetuosa",
  "Incandescente",
  "Ígnea",
  "Gélida",
  "Redutível",
  "Retroalimentável",
  "Sacana",
  "Solar",
  "Tempestuosa",
  "Autoconsumidora",
  "Egoísta",
  "Faminta",
  "Finalizadora",
  "Gravital",
  "Pútrida",
  "Tóxica",
  "Aprisionada",
  "Consciente",
  "Estabilizante",
  "Exaltação",
  "Identitária",
  "Inscrito",
  "Transcendida",
]);

const baseElements: Record<string, string> = {};
for (const name of ["Antielemento", "Ritualística", "Senciente"])
  baseElements[name] = "Conhecimento";
for (const name of ["Empuxo", "Energética", "Vibrante"])
  baseElements[name] = "Energia";
for (const name of ["Consumidora", "Erosiva", "Repulsora"])
  baseElements[name] = "Morte";
for (const name of ["Lancinante", "Predadora", "Sanguinária"])
  baseElements[name] = "Sangue";

export function curseElement(item: Item) {
  if (item.element) return item.element;
  if (item.bookId === "01") return baseElements[item.name] || "";
  if (item.bookId === "05") {
    if ((item.page || 0) <= 181) return "Sangue";
    if ((item.page || 0) <= 183) return "Conhecimento";
    if ((item.page || 0) <= 185) return "Energia";
    if ((item.page || 0) <= 187) return "Morte";
    if ((item.page || 0) <= 189) return "Medo ou variável";
  }
  return "";
}

export function isWeaponCurse(item: Item) {
  if (item.subtype !== "Maldição") return false;
  if (item.bookId === "01") return baseWeaponCurses.has(item.name);
  if (item.bookId === "05") return arsenalWeaponCurses.has(item.name);
  return true;
}
export function isAccessoryCurse(item: Item) {
  return (
    item.subtype === "Maldição" &&
    item.bookId === "01" &&
    baseAccessoryCurses.has(item.name)
  );
}

export function toEnhancement(item: Item): ItemEnhancement {
  return {
    id: crypto.randomUUID(),
    catalogId: item.catalogId || item.id,
    name: item.name,
    subtype: "Maldição",
    notes: item.notes,
    source: item.source,
    bookId: item.bookId,
    page: item.page,
    requirements: item.requirements,
    element: curseElement(item),
  };
}

const categoryValues: Record<string, number> = {
  "0": 0,
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
};
const categoryLabels = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
export function effectiveCategory(item: Item) {
  const count =
    item.enhancements?.filter((entry) => entry.subtype === "Maldição").length ||
    0;
  const base = categoryValues[(item.category || "").toUpperCase()];
  if (base === undefined) return item.category || "não definida";
  const improvements = accessoryType(item)
    ? Number(item.accessoryBonus === 5) +
      Number(!!item.extraSkill) +
      Number(!!item.extraSkill && item.extraBonus === 5)
    : 0;
  const value = base + improvements + (count ? count + 1 : 0);
  return categoryLabels[value] || String(value);
}
