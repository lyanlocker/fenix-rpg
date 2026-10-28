import type { Agent } from "./rules";
import type { Encounter, Roll } from "./model";

/** Explicit projection: never pass a workspace, sheet, encounter or credential to the audience. */
export type PresentationFrame = {
  campaign: string;
  active: boolean;
  round: number;
  currentId: string | null;
  participants: { id: string; name: string; portrait: string }[];
  roll: {
    id: string;
    name: string;
    label: string;
    expression: string;
    dice: number[];
    total: number;
  } | null;
};

export function presentationFrame(
  campaign: string,
  encounter: Encounter,
  agents: Agent[],
  rolls: Roll[],
  since: string,
): PresentationFrame {
  const hiddenNames = new Set(
    encounter.participants.filter((p) => p.hidden).map((p) => p.name),
  );
  const current = encounter.active
    ? encounter.participants[encounter.turn]
    : undefined;
  const roll = rolls.find(
    (r) =>
      !r.secret &&
      r.campaign_id === encounter.campaign_id &&
      r.created_at >= since &&
      !hiddenNames.has(r.agentName),
  );
  return {
    campaign,
    active: encounter.active,
    round: encounter.round,
    currentId: current && !current.hidden ? current.id : null,
    participants: encounter.participants
      .filter((p) => !p.hidden)
      .map((p) => {
        const agent = agents.find((a) => a.id === p.agentId);
        const face = p.face === "alternate" ? agent?.alternate?.face : agent;
        return { id: p.id, name: p.name, portrait: face?.portrait || "" };
      }),
    roll: roll
      ? {
          id: roll.id,
          name: roll.agentName,
          label: roll.label,
          expression: roll.expression,
          dice: [...roll.dice],
          total: roll.total,
        }
      : null,
  };
}
