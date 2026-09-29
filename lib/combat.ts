import type { Encounter, Participant } from "./model";
import type { Threat } from "./threats";
import {
  effectiveAttributes,
  maximums,
  skillBonus,
  accessoryDefenseBonus,
  type Agent,
} from "./rules";
export function sortParticipants(participants: Participant[]) {
  return [...participants].sort((a, b) => b.initiative - a.initiative);
}
export function reorderEncounter(encounter: Encounter): Encounter {
  const currentId = encounter.participants[encounter.turn]?.id;
  const participants = sortParticipants(encounter.participants);
  return {
    ...encounter,
    participants,
    turn: Math.max(
      0,
      participants.findIndex((p) => p.id === currentId),
    ),
  };
}
export function advanceTurn(encounter: Encounter, direction = 1): Encounter {
  if (!encounter.active || !encounter.participants.length) return encounter;
  const size = encounter.participants.length;
  const position = Math.max(0, encounter.round - 1) * size + encounter.turn;
  const next = Math.max(0, position + direction);
  return {
    ...encounter,
    round: Math.floor(next / size) + 1,
    turn: next % size,
  };
}
export function removeParticipant(encounter: Encounter, id: string): Encounter {
  const current = encounter.participants[encounter.turn];
  const participants = encounter.participants.filter((p) => p.id !== id);
  if (!participants.length)
    return { ...encounter, participants, active: false, turn: 0 };
  const index = participants.findIndex((p) => p.id === current?.id);
  const wraps = index < 0 && encounter.turn >= participants.length;
  return {
    ...encounter,
    participants,
    turn: index >= 0 ? index : wraps ? 0 : encounter.turn,
    round: encounter.round + (encounter.active && wraps ? 1 : 0),
  };
}
export function changeHitPoints(p: Participant, delta: number): Participant {
  if (!Number.isInteger(delta) || Math.abs(delta) > 1000000)
    throw Error("Informe um valor inteiro de até 1.000.000.");
  return { ...p, pv: Math.max(0, Math.min(p.maxPv, p.pv + delta)) };
}
export function participantFromThreat(t: Threat): Participant {
  if (t.pv === null || t.defense === null)
    throw Error("Esta manifestação não tem ficha numérica de combate.");
  return {
    id: crypto.randomUUID(),
    name: t.name,
    initiative: 0,
    pv: t.pv,
    maxPv: t.pv,
    hidden: true,
    conditions: "",
    threatId: t.id,
    defense: t.defense,
    initiativeTest: t.initiative,
  };
}
export function participantFromAgent(
  agent: Agent,
  alternate = false,
): Participant {
  if (alternate && !agent.alternate)
    throw Error("A face NEX 35 ainda não foi liberada.");
  const face: Agent = alternate
    ? { ...agent, ...agent.alternate!.face }
    : agent;
  return {
    id: crypto.randomUUID(),
    name: face.name,
    initiative: 0,
    pv: face.resources.pv,
    maxPv: maximums(face).pv,
    hidden: false,
    conditions: face.conditions.join(", "),
    agentId: agent.id,
    face: alternate ? "alternate" : "main",
    defense:
      10 +
      effectiveAttributes(face).AGI +
      face.defenseBonus +
      accessoryDefenseBonus(face),
    initiativeAttribute: effectiveAttributes(face).AGI,
    initiativeBonus: skillBonus(face, "Iniciativa").total,
  };
}
