import { rpc } from "./share";

export type AllyBond = {
  id: string;
  name: string;
  portrait?: string;
  hearts: number;
  dead: boolean;
};
export type Reputation = { value: number; visible: boolean };
export type CampaignBonds = {
  allies: AllyBond[];
  used: boolean;
  registered?: boolean;
  activeDie?: number | null;
  activeAlly?: string | null;
  dead?: boolean;
  reputation?: Reputation | null;
};
export type BondOperation =
  | "read"
  | "heart"
  | "activate"
  | "finish"
  | "reputation"
  | "reveal"
  | "hide"
  | "death";
export function campaignBonds(
  id: string,
  token: string,
  operation: BondOperation = "read",
  allyId?: string,
  value?: number,
) {
  return rpc<CampaignBonds>("fenix_campaign_bonds", {
    requested_agent_id: id,
    share_token: token,
    operation,
    ally_id: allyId || null,
    value: value ?? null,
  });
}
export function heartDie(hearts: number) {
  return hearts >= 1 && hearts <= 3 ? 6 + 2 * hearts : 0;
}
export function registerBondRoster(
  campaignId: string,
  masterToken: string,
  agentKeys: { agentId: string; masterToken: string }[],
) {
  return rpc<number>("fenix_register_bond_roster", {
    requested_campaign_id: campaignId,
    master_token: masterToken,
    agent_keys: agentKeys,
  });
}
