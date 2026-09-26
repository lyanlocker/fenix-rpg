import { maximums, type Agent, type AlternateFace, type Item } from "./rules";
import type { Campaign } from "./model";

export function isApocalypsisCampaign(campaign?: Campaign) {
  return !!campaign && /apocalypsis/i.test(campaign.name);
}

export function maxRitualCircle(className: Agent["className"], nex: number) {
  if (className === "Ocultista")
    return nex >= 85 ? 4 : nex >= 55 ? 3 : nex >= 25 ? 2 : 1;
  return nex >= 75 ? 3 : nex >= 45 ? 2 : 1;
}

export function isAllowedAtNex(
  item: Item,
  className: Agent["className"],
  nex: number,
) {
  if (item.nex !== undefined && item.nex > nex) return false;
  return (
    item.kind !== "Ritual" ||
    (Number.isInteger(item.circle) &&
      (item.circle ?? 0) >= 1 &&
      (item.circle ?? 0) <= maxRitualCircle(className, nex))
  );
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
      agent.inventory.filter((item) =>
        isAllowedAtNex(item, agent.className, 35),
      ),
    ),
  };
  const max = maximums({ ...agent, ...face });
  return { ...face, resources: max };
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
