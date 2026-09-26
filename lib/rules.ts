import { weaponSpaces } from "./weapon-modifications";

export type Attribute = "AGI" | "FOR" | "INT" | "PRE" | "VIG";
export type ClassName =
  | "Combatente"
  | "Especialista"
  | "Ocultista"
  | "Sobrevivente";
export type Resource = "pv" | "pe" | "san" | "pd";
export type ItemEnhancement = {
  id: string;
  catalogId?: string;
  name: string;
  subtype: string;
  notes: string;
  source?: string;
  bookId?: string;
  page?: number;
  requirements?: string;
  element?: string;
};
export type Item = {
  id: string;
  name: string;
  kind: "Item" | "Arma" | "Ritual" | "Poder";
  quantity: number;
  spaces: number;
  damage: string;
  notes: string;
  catalogId?: string;
  subtype?: string;
  bookId?: string;
  page?: number;
  requirements?: string;
  className?: string;
  track?: string;
  origin?: string;
  nex?: number;
  stage?: number;
  resistance?: string;
  attackSkill?: string;
  attackBonus?: number;
  weaponType?: "Corpo a corpo" | "Disparo" | "Arma de fogo";
  critical?: string;
  range?: string;
  category?: string;
  source?: string;
  cost?: number;
  execution?: string;
  duration?: string;
  target?: string;
  element?: string;
  circle?: number;
  discente?: string;
  verdadeiro?: string;
  enhancements?: ItemEnhancement[];
  accessoryType?: "Vestimenta" | "Utensílio";
  equipped?: boolean;
  attuned?: boolean;
  accessorySkill?: string;
  accessoryBonus?: 2 | 5;
  extraSkill?: string;
  extraBonus?: 2 | 5;
};
export type Agent = {
  id: string;
  owner_id?: string;
  campaign_id: string | null;
  name: string;
  className: ClassName;
  origin: string;
  originId?: string;
  trackId?: string;
  track: string;
  nex: number;
  stage: number;
  determination: boolean;
  attributes: Record<Attribute, number>;
  skills: Record<string, number>;
  skillAdjustments?: Record<string, number>;
  resources: Record<Resource, number>;
  adjustments: Record<Resource, number>;
  defenseBonus: number;
  inventory: Item[];
  notes: string;
  conditions: string[];
  color: string;
  portrait?: string;
  alternate?: {
    approvedCampaignId: string;
    face: AlternateFace;
  };
};
export type AlternateFace = Pick<
  Agent,
  | "name"
  | "className"
  | "origin"
  | "originId"
  | "track"
  | "trackId"
  | "nex"
  | "stage"
  | "determination"
  | "attributes"
  | "skills"
  | "skillAdjustments"
  | "resources"
  | "adjustments"
  | "defenseBonus"
  | "inventory"
  | "notes"
  | "conditions"
  | "color"
  | "portrait"
>;
export const attributes: Attribute[] = ["AGI", "FOR", "INT", "PRE", "VIG"];
export const skillAttributes: Record<string, Attribute> = {
  Acrobacia: "AGI",
  Adestramento: "PRE",
  Artes: "PRE",
  Atletismo: "FOR",
  Atualidades: "INT",
  Ciências: "INT",
  Crime: "AGI",
  Diplomacia: "PRE",
  Enganação: "PRE",
  Fortitude: "VIG",
  Furtividade: "AGI",
  Iniciativa: "AGI",
  Intimidação: "PRE",
  Intuição: "PRE",
  Investigação: "INT",
  Luta: "FOR",
  Medicina: "INT",
  Ocultismo: "INT",
  Percepção: "PRE",
  Pilotagem: "AGI",
  Pontaria: "AGI",
  Profissão: "INT",
  Reflexos: "AGI",
  Religião: "PRE",
  Sobrevivência: "INT",
  Tática: "INT",
  Tecnologia: "INT",
  Vontade: "PRE",
};
export function accessoryType(item: Item): Item["accessoryType"] {
  if (item.kind !== "Item") return undefined;
  if (item.accessoryType) return item.accessoryType;
  if (/^vestimenta$/i.test(item.name)) return "Vestimenta";
  if (/^utens[ií]lio$/i.test(item.name)) return "Utensílio";
  return undefined;
}
export function activeAccessories(agent: Agent) {
  let worn = 0;
  return agent.inventory.filter((item) => {
    const type = accessoryType(item);
    if (!type || item.equipped === false) return false;
    if (type === "Vestimenta" && ++worn > 2) return false;
    return true;
  });
}
export function effectiveAttributes(agent: Agent): Record<Attribute, number> {
  const result = { ...agent.attributes };
  const curses: Partial<Record<string, Attribute>> = {
    Pujança: "FOR",
    Destreza: "AGI",
    Disposição: "VIG",
    Sagacidade: "INT",
    Carisma: "PRE",
  };
  for (const item of activeAccessories(agent)) {
    for (const enhancement of item.enhancements || []) {
      if (enhancement.bookId !== "01") continue;
      const attribute = curses[enhancement.name];
      if (attribute) result[attribute] += 1;
    }
  }
  return result;
}
export function skillBonus(agent: Agent, skill: string) {
  const training = agent.skills[skill] || 0;
  const adjustment = agent.skillAdjustments?.[skill] || 0;
  const sources: { name: string; bonus: number }[] = [];
  for (const item of activeAccessories(agent)) {
    if (item.accessorySkill === skill)
      sources.push({ name: item.name, bonus: item.accessoryBonus || 2 });
    if (item.extraSkill === skill)
      sources.push({
        name: `${item.name} (função adicional)`,
        bonus: item.extraBonus || 2,
      });
  }
  return {
    training,
    adjustment,
    sources,
    total:
      training +
      adjustment +
      sources.reduce((sum, source) => sum + source.bonus, 0),
  };
}
export function inventorySpaces(agent: Agent) {
  return agent.inventory
    .filter((item) => item.kind === "Arma" || item.kind === "Item")
    .reduce(
      (sum, item) =>
        sum +
        (item.kind === "Arma" ? weaponSpaces(item) : item.spaces) *
          item.quantity,
      0,
    );
}
export function carryingCapacity(agent: Agent) {
  const strength = effectiveAttributes(agent).FOR;
  return strength === 0 ? 2 : strength * 5;
}
export function accessoryDefenseBonus(agent: Agent) {
  return (
    activeAccessories(agent)
      .flatMap((item) => item.enhancements || [])
      .filter((entry) => entry.bookId === "01" && entry.name === "Defesa")
      .length * 5
  );
}
export function accessoryResourceBonus(agent: Agent, resource: "pv" | "pe") {
  const curse = resource === "pv" ? "Vitalidade" : "Esforço Adicional";
  return (
    activeAccessories(agent)
      .filter((item) => item.attuned)
      .flatMap((item) => item.enhancements || [])
      .filter((entry) => entry.bookId === "01" && entry.name === curse).length *
    (resource === "pv" ? 15 : 5)
  );
}
const bases: Record<ClassName, number[]> = {
  Combatente: [20, 4, 2, 2, 12, 3, 6, 3],
  Especialista: [16, 3, 3, 3, 16, 4, 8, 4],
  Ocultista: [12, 2, 4, 4, 20, 5, 10, 5],
  Sobrevivente: [8, 2, 2, 1, 8, 2, 4, 2],
};
export function maximums(a: Agent): Record<Resource, number> {
  const b = bases[a.className];
  const s = a.className === "Sobrevivente";
  const levels = s
    ? Math.max(0, a.stage - 1)
    : Math.max(0, (a.nex === 99 ? 20 : a.nex / 5) - 1);
  const vig = effectiveAttributes(a).VIG,
    pre = a.attributes.PRE;
  return {
    pv: Math.max(
      1,
      b[0] +
        vig +
        levels * (b[1] + (s ? 0 : vig)) +
        a.adjustments.pv +
        accessoryResourceBonus(a, "pv"),
    ),
    pe: Math.max(
      0,
      b[2] +
        pre +
        levels * (b[3] + (s ? 0 : pre)) +
        a.adjustments.pe +
        accessoryResourceBonus(a, "pe"),
    ),
    san: Math.max(0, b[4] + levels * b[5] + a.adjustments.san),
    pd: Math.max(
      0,
      b[6] + pre + levels * (b[7] + (s ? 0 : pre)) + a.adjustments.pd,
    ),
  };
}
function advancementCount(a: Agent) {
  return a.className === "Sobrevivente"
    ? Math.max(0, a.stage - 1)
    : Math.max(0, (a.nex === 99 ? 20 : a.nex / 5) - 1);
}
export function maximumFormula(a: Agent, key: Resource) {
  const b = bases[a.className],
    survivor = a.className === "Sobrevivente",
    advances = advancementCount(a),
    adjustment = a.adjustments[key],
    vigor = effectiveAttributes(a).VIG,
    suffix = adjustment
      ? ` ${adjustment > 0 ? "+" : "−"} ajuste ${Math.abs(adjustment)}`
      : "";
  if (key === "pv")
    return `${b[0]} + VIG ${vigor}${advances ? ` + ${advances} avanço${advances > 1 ? "s" : ""} × (${b[1]}${survivor ? "" : ` + VIG ${vigor}`})` : ""}${suffix}${accessoryResourceBonus(a, "pv") ? ` + acessórios ${accessoryResourceBonus(a, "pv")}` : ""}`;
  if (key === "pe")
    return `${b[2]} + PRE ${a.attributes.PRE}${advances ? ` + ${advances} avanço${advances > 1 ? "s" : ""} × (${b[3]}${survivor ? "" : ` + PRE ${a.attributes.PRE}`})` : ""}${suffix}${accessoryResourceBonus(a, "pe") ? ` + acessórios ${accessoryResourceBonus(a, "pe")}` : ""}`;
  if (key === "san")
    return `${b[4]}${advances ? ` + ${advances} avanço${advances > 1 ? "s" : ""} × ${b[5]}` : ""}${suffix}`;
  return `${b[6]} + PRE ${a.attributes.PRE}${advances ? ` + ${advances} avanço${advances > 1 ? "s" : ""} × (${b[7]}${survivor ? "" : ` + PRE ${a.attributes.PRE}`})` : ""}${suffix}`;
}
export function die(sides: number) {
  const limit = Math.floor(4294967296 / sides) * sides;
  let v: number;
  do {
    v = crypto.getRandomValues(new Uint32Array(1))[0];
  } while (v >= limit);
  return (v % sides) + 1;
}
export function check(attribute: number, bonus = 0, roll = die) {
  if (
    !Number.isInteger(attribute) ||
    attribute < 0 ||
    attribute > 10 ||
    !Number.isFinite(bonus)
  )
    throw Error("Atributo inválido");
  const dice = Array.from({ length: attribute || 2 }, () => roll(20));
  return {
    dice,
    total: (attribute === 0 ? Math.min(...dice) : Math.max(...dice)) + bonus,
    expression: `${attribute || 2}d20 (${attribute === 0 ? "menor" : "maior"}) ${bonus >= 0 ? "+" : ""}${bonus}`,
  };
}
export function damage(expression: string, roll = die) {
  const m = /^(\d{1,3})d(\d{1,7})([+-]\d{1,6})?$/.exec(
    expression.replace(/\s/g, ""),
  );
  if (!m || +m[1] < 1 || +m[1] > 100 || +m[2] < 2 || +m[2] > 1000000)
    throw Error("Use de 1 a 100 dados com 2 a 1.000.000 lados: 1d2 ou 2d37+3.");
  const dice = Array.from({ length: +m[1] }, () => roll(+m[2]));
  return {
    dice,
    total: dice.reduce((a, b) => a + b, 0) + Number(m[3] || 0),
    expression,
  };
}
export function newAgent(name = "Novo agente"): Agent {
  const a: Agent = {
    id: crypto.randomUUID(),
    campaign_id: null,
    name,
    className: "Especialista",
    origin: "",
    track: "",
    nex: 5,
    stage: 1,
    determination: false,
    attributes: { AGI: 1, FOR: 1, INT: 3, PRE: 2, VIG: 2 },
    skills: { Investigação: 5, Percepção: 5, Vontade: 5 },
    resources: { pv: 0, pe: 0, san: 0, pd: 0 },
    adjustments: { pv: 0, pe: 0, san: 0, pd: 0 },
    defenseBonus: 0,
    inventory: [],
    notes: "",
    conditions: [],
    color: "#e9a466",
    portrait: "",
  };
  a.resources = maximums(a);
  return a;
}
export function resourceKeys(a: Agent): Resource[] {
  return a.determination ? ["pv", "pd"] : ["pv", "san", "pe"];
}
export const resourceLabels: Record<Resource, string> = {
  pv: "Vida",
  pe: "Esforço",
  san: "Sanidade",
  pd: "Determinação",
};
