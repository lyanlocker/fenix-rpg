import { bookCatalog } from "./books";
import type { Item } from "./rules";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const byId = new Map(bookCatalog.map((i) => [i.id, i]));
const byName = new Map<string, Item[]>();
for (const item of bookCatalog) {
  const key = `${item.kind}:${norm(item.name)}`;
  byName.set(key, [...(byName.get(key) || []), item]);
}

/** Fill missing execution metadata, never overwrite an edited sheet or invent a source. */
export function combatItem(item: Item): Item {
  const explicit = item.catalogId
    ? byId.get(item.catalogId)
    : byId.get(item.id);
  const matches = explicit
    ? [explicit]
    : item.catalogId
      ? []
      : (byName.get(`${item.kind}:${norm(item.name)}`) || []).filter(
          (i) => !item.bookId || i.bookId === item.bookId,
        );
  const source =
    matches.length === 1 && matches[0].kind === item.kind
      ? matches[0]
      : undefined;
  const result = { ...item };
  if (!result.execution?.trim()) {
    const notes = item.notes;
    const declared = notes.match(
      /execu[çc][aã]o\s*:\s*([^\n.;]+?)(?=[.;\n]|\s+(?:alcance|alvo|[aá]rea|dura[çc][aã]o|resist[eê]ncia)\s*:|$)/i,
    )?.[1];
    const activation = notes.match(
      /(?:gastar|gastando|gaste|usar|usando|usa|use|consome|exige|executar|executando)\s+(?:uma?\s+)?a[çc][aã]o\s+(?:de\s+)?(padr[aã]o|movimento|livre|completa)/i,
    )?.[1];
    if (declared || activation)
      result.execution = (declared || activation)!.trim();
  }

  for (const key of [
    "notes",
    "discente",
    "verdadeiro",
    "execution",
    "range",
    "target",
    "duration",
    "element",
    "resistance",
    "circle",
    "cost",
  ] as const) {
    if (
      (result[key] === undefined || result[key] === "") &&
      source?.[key] !== undefined
    )
      Object.assign(result, { [key]: source[key] });
  }
  return result;
}

export function ritualDamage(item: Item): string {
  if (/(?:recuper|restaur|cura)/i.test(item.notes)) return "";
  return (
    item.damage?.trim() ||
    item.notes
      .match(
        /(?:sofre|causa)\s+(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+(?:pontos?\s+de\s+)?dano/i,
      )?.[1]
      ?.replace(/\s/g, "") ||
    ""
  );
}
