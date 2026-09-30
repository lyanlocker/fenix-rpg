import type { Encounter, Roll } from "./model";
import type { Agent } from "./rules";
import { rpc } from "./share";

const KEY = "fenix.combat-keys.v1";
export type MasterCombat = {
  encounter: Encounter | null;
  revision: number;
  agent?: Agent;
};
export type PlayerCombat = {
  id: string;
  name: string;
  active: boolean;
  round: number;
  currentParticipantId: string | null;
  currentName: string;
  participants: {
    id: string;
    name: string;
    initiative: number;
    initiativeRolled: boolean;
    mine: boolean;
    face: "main" | "alternate" | null;
    pv: number | null;
    maxPv: number | null;
  }[];
};
export function combatMasterKey(
  campaignId: string,
  create = false,
): string | null {
  if (typeof window === "undefined") return null;
  const keys: Record<string, string> = JSON.parse(
    localStorage.getItem(KEY) || "{}",
  );
  if (!keys[campaignId] && create) {
    keys[campaignId] = Array.from(
      crypto.getRandomValues(new Uint8Array(32)),
      (x) => x.toString(16).padStart(2, "0"),
    ).join("");
    localStorage.setItem(KEY, JSON.stringify(keys));
  }
  return keys[campaignId] || null;
}
export async function loadMasterCombat(campaignId: string, key: string) {
  return rpc<MasterCombat>("fenix_load_master_combat", {
    requested_campaign_id: campaignId,
    master_token: key,
  });
}
export async function saveMasterCombat(
  encounter: Encounter,
  key: string,
  agentKeys: { agentId: string; masterToken: string }[] = [],
) {
  return rpc<MasterCombat>("fenix_save_combat", {
    requested_campaign_id: encounter.campaign_id,
    master_token: key,
    encounter_data: encounter,
    expected_revision: encounter.sharedRevision ?? 0,
    agent_keys: agentKeys,
  });
}
export async function adjustSharedCombatHp(
  encounter: Encounter,
  key: string,
  participantId: string,
  change: number,
) {
  return rpc<MasterCombat>("fenix_adjust_combat_hp", {
    requested_campaign_id: encounter.campaign_id,
    master_token: key,
    requested_encounter_id: encounter.id,
    participant_id: participantId,
    change,
  });
}
export async function clearSharedCombat(encounter: Encounter, key: string) {
  return rpc<MasterCombat>("fenix_clear_combat", {
    requested_campaign_id: encounter.campaign_id,
    master_token: key,
    requested_encounter_id: encounter.id,
  });
}
export async function loadPlayerCombat(agentId: string, token: string) {
  return rpc<PlayerCombat | null>("fenix_load_player_combat", {
    requested_agent_id: agentId,
    share_token: token,
  });
}
export async function setPlayerInitiative(
  agentId: string,
  token: string,
  encounterId: string,
  value: number | null = null,
) {
  return rpc<{ combat: PlayerCombat; roll: Roll | null }>(
    "fenix_combat_initiative",
    {
      requested_agent_id: agentId,
      share_token: token,
      requested_encounter_id: encounterId,
      initiative_value: value,
    },
  );
}
export function withCombatRevision(payload: MasterCombat): Encounter | null {
  return payload.encounter
    ? { ...payload.encounter, sharedRevision: payload.revision }
    : null;
}
