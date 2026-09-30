import type { Threat } from "./threats";
import type { Agent, Item } from "./rules";
export type Campaign = {
  id: string;
  owner_id?: string;
  name: string;
  description: string;
  element: string;
  notes: string;
  rules: string;
  invite_code?: string;
};
export type Roll = {
  id: string;
  campaign_id: string | null;
  actor_id?: string;
  agentName: string;
  label: string;
  expression: string;
  dice: number[];
  total: number;
  secret: boolean;
  created_at: string;
};
export type Participant = {
  id: string;
  name: string;
  initiative: number;
  pv: number;
  maxPv: number;
  hidden: boolean;
  conditions: string;
  threatId?: string;
  agentId?: string;
  face?: "main" | "alternate";
  defense?: number;
  initiativeTest?: string;
  initiativeAttribute?: number;
  initiativeBonus?: number;
  initiativeRolled?: boolean;
};
export type Encounter = {
  id: string;
  campaign_id: string | null;
  name: string;
  round: number;
  turn: number;
  active: boolean;
  started?: boolean;
  sharedRevision?: number;
  participants: Participant[];
};
export type Brew = Item & { version: number; source: string };
export type Member = {
  id: string;
  campaign_id: string;
  user_id: string;
  status: string;
  display_name: string;
};
export type State = {
  agents: Agent[];
  campaigns: Campaign[];
  rolls: Roll[];
  encounters: Encounter[];
  brews: Brew[];
  threats: Threat[];
};
export const emptyState: State = {
  agents: [],
  campaigns: [],
  rolls: [],
  encounters: [],
  brews: [],
  threats: [],
};
