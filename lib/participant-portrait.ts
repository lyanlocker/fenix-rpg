import type { Participant } from "./model";
import type { Agent } from "./rules";
import type { Threat } from "./threats";
import { threatArtwork, threatArtId, type ThreatArtwork } from "./threat-art";

export function participantPortrait(
  p: Participant,
  agents: Agent[],
  threats: Threat[] = [],
  artOverrides?: Record<string, ThreatArtwork>,
) {
  if (p.agentId) {
    const agent = agents.find((a) => a.id === p.agentId);
    const face = p.face === "alternate" ? agent?.alternate?.face : agent;
    return { portrait: face?.portrait || "" };
  }
  const threat = threats.find((t) => t.id === p.threatId);
  const id = threat ? threatArtId(threat, artOverrides) : p.threatId;
  const art = threatArtwork(id, artOverrides);
  return art
    ? { portrait: art.src, thumbnail: art.thumbnail }
    : { portrait: "" };
}
