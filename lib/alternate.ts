import { maximums, type Agent, type AlternateFace, type Item } from "./rules";
import type { Campaign } from "./model";
import { bookCatalog } from "./books";

export function isApocalypsisCampaign(campaign?: Campaign) {
  return !!campaign && /apocalypsis/i.test(campaign.name);
}

export function maxRitualCircle(className: Agent["className"], nex: number) {
  if (className === "Ocultista")
    return nex >= 85 ? 4 : nex >= 55 ? 3 : nex >= 25 ? 2 : 1;
  return nex >= 75 ? 3 : nex >= 45 ? 2 : 1;
}

const normalizeName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

/** Only fill missing book metadata when the catalog identifies one unambiguous circle. */
export function ritualWithKnownCircle(item: Item): Item {
  if (item.kind !== "Ritual" || (item.circle && item.circle >= 1)) return item;
  const matches = bookCatalog.filter(
    (entry) =>
      entry.kind === "Ritual" &&
      (item.catalogId
        ? entry.id === item.catalogId
        : normalizeName(entry.name) === normalizeName(item.name) &&
          (!item.bookId || item.bookId === entry.bookId)),
  );
  const circles = [...new Set(matches.map((entry) => entry.circle))];
  return circles.length === 1 && circles[0] && circles[0] >= 1
    ? { ...item, circle: circles[0] }
    : item;
}

function powerRequirement(item: Item) {
  if (item.kind !== "Poder") return item.nex;
  const printedNex = [
    ...(item.requirements || "").matchAll(/NEX\s*(\d{1,2})\s*%/gi),
  ].map((match) => Number(match[1]));
  if (item.nex !== undefined) return Math.max(item.nex, ...printedNex);
  if (item.subtype !== "Habilidade de trilha")
    return printedNex.length ? Math.max(...printedNex) : undefined;
  const entries = bookCatalog.filter(
    (entry) =>
      entry.kind === "Poder" &&
      entry.subtype === "Habilidade de trilha" &&
      (item.catalogId
        ? entry.id === item.catalogId
        : normalizeName(entry.name) === normalizeName(item.name) &&
          (!item.track || item.track === entry.track) &&
          (!item.bookId || item.bookId === entry.bookId)),
  );
  const nex = [...new Set(entries.map((entry) => entry.nex))];
  return nex.length === 1 && nex[0] !== undefined
    ? Math.max(nex[0], ...printedNex)
    : Infinity;
}

export function isAllowedAtNex(
  item: Item,
  className: Agent["className"],
  nex: number,
) {
  const requiredNex = powerRequirement(item);
  if (requiredNex !== undefined && requiredNex > nex) return false;
  return (
    item.kind !== "Ritual" ||
    (Number.isInteger(item.circle) &&
      (item.circle ?? 0) >= 1 &&
      (item.circle ?? 0) <= maxRitualCircle(className, nex))
  );
}

export function inheritedPowerSelection(
  agent: Agent,
  previousIds: readonly string[] = [],
  random: () => number = Math.random,
): Item[] {
  const powers = agent.inventory.filter((item) => item.kind === "Poder");
  const eligible = powers.filter((item) =>
    isAllowedAtNex(item, agent.className, 35),
  );
  const count = Math.min(Math.ceil(powers.length / 2), eligible.length);
  const selected = new Set(previousIds);
  const retained = eligible
    .filter((item) => selected.has(item.id))
    .slice(0, count);
  const choices = eligible.filter((item) => !selected.has(item.id));
  for (let index = choices.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [choices[index], choices[other]] = [choices[other], choices[index]];
  }
  return [...retained, ...choices.slice(0, count - retained.length)];
}

function sameEntry(left: Item, right: Item) {
  return (
    left.kind === right.kind &&
    (left.id === right.id ||
      (!!left.catalogId && left.catalogId === right.catalogId) ||
      (normalizeName(left.name) === normalizeName(right.name) &&
        left.bookId === right.bookId &&
        left.source === right.source))
  );
}

export function deriveAlternateFace(
  agent: Agent,
  random: () => number = Math.random,
) {
  const selectedPowers = inheritedPowerSelection(agent, [], random);
  const selectedIds = new Set(selectedPowers.map((item) => item.id));
  const face: AlternateFace = {
    ...structuredClone(faceFromAgent(agent)),
    name: agent.name + " · Outra face",
    nex: 35,
    portrait: "",
    skills: Object.fromEntries(
      Object.entries(agent.skills).map(([name, training]) => [
        name,
        Math.min(10, training),
      ]),
    ),
    inventory: structuredClone(
      agent.inventory
        .map(ritualWithKnownCircle)
        .filter(
          (item) =>
            isAllowedAtNex(item, agent.className, 35) &&
            (item.kind !== "Poder" || selectedIds.has(item.id)),
        ),
    ),
  };
  return {
    face: { ...face, resources: maximums({ ...agent, ...face }) },
    inheritance: {
      version: 1 as const,
      selectedPowerIds: selectedPowers.map((item) => item.id),
      inheritedRitualIds: face.inventory
        .filter((item) => item.kind === "Ritual")
        .map((item) => item.id),
    },
  };
}

/** Refresh only inherited entries, keeping the other face's personal edits. */
export function refreshAlternateInheritance(
  agent: Agent,
  random: () => number = Math.random,
) {
  if (!agent.alternate) throw Error("Esta ficha ainda não foi liberada.");
  const originalPowers = agent.inventory.filter(
    (item) => item.kind === "Poder",
  );
  const selectedPowers = inheritedPowerSelection(
    agent,
    agent.alternate.inheritance?.selectedPowerIds,
    random,
  );
  const selectedIds = new Set(selectedPowers.map((item) => item.id));
  const inheritedRituals = agent.inventory
    .filter((item) => item.kind === "Ritual")
    .map(ritualWithKnownCircle)
    .filter((item) => isAllowedAtNex(item, agent.className, 35));
  const old = agent.alternate.face.inventory;
  const previous = agent.alternate.inheritance;
  const inventory = old.filter(
    (item) =>
      !originalPowers.some((source) => sameEntry(source, item)) ||
      selectedPowers.some((selected) => sameEntry(selected, item)),
  );
  for (const source of [...inheritedRituals, ...selectedPowers]) {
    const index = inventory.findIndex((entry) => sameEntry(entry, source));
    if (
      index < 0 &&
      !(source.kind === "Ritual"
        ? previous?.inheritedRitualIds?.includes(source.id)
        : previous?.selectedPowerIds.includes(source.id))
    )
      inventory.push(structuredClone(source));
    else if (index >= 0 && source.kind === "Ritual" && !inventory[index].circle)
      inventory[index] = { ...inventory[index], circle: source.circle };
  }
  const updated: Agent = {
    ...agent,
    alternate: {
      ...agent.alternate,
      face: { ...agent.alternate.face, inventory },
      inheritance: {
        version: 1,
        selectedPowerIds: [...selectedIds],
        inheritedRitualIds: [
          ...new Set([
            ...(previous?.inheritedRitualIds || []),
            ...inheritedRituals.map((item) => item.id),
          ]),
        ],
      },
    },
  };
  validateAlternateFace(updated.alternate!.face);
  return updated;
}

export function faceFromAgent(agent: Agent): AlternateFace {
  const {
    name,
    className,
    origin,
    originId,
    track,
    trackId,
    nex,
    stage,
    determination,
    attributes,
    skills,
    skillAdjustments,
    resources,
    adjustments,
    defenseBonus,
    inventory,
    notes,
    conditions,
    color,
    portrait,
  } = agent;
  return {
    name,
    className,
    origin,
    originId,
    track,
    trackId,
    nex,
    stage,
    determination,
    attributes,
    skills,
    skillAdjustments,
    resources,
    adjustments,
    defenseBonus,
    inventory,
    notes,
    conditions,
    color,
    portrait,
  };
}

export function makeAlternateFace(agent: Agent): AlternateFace {
  return deriveAlternateFace(agent).face;
}

export function alternateAgent(agent: Agent): Agent {
  return agent.alternate
    ? { ...agent, ...agent.alternate.face, nex: 35 }
    : agent;
}

export function alternateIsApproved(agent: Agent, campaign?: Campaign) {
  return (
    !!agent.alternate &&
    agent.campaign_id === agent.alternate.approvedCampaignId &&
    (!campaign ||
      (campaign.id === agent.campaign_id && isApocalypsisCampaign(campaign)))
  );
}

export function validateAlternateFace(face: AlternateFace) {
  if (face.nex !== 35)
    throw Error("A face alternativa deve permanecer em NEX 35%.");
  if (Object.values(face.skills).some((training) => training > 10))
    throw Error("No NEX 35%, perícias não podem ter treinamento Expert (+15).");
  const unavailable = face.inventory.find(
    (item) => !isAllowedAtNex(item, face.className, 35),
  );
  if (unavailable)
    throw Error(
      `${unavailable.name} ainda não está disponível no NEX 35% para ${face.className}.`,
    );
}
