import type { Roll } from "./model";
import type { Agent } from "./rules";
import { validateAgentImport } from "./validation";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://isxmkpyohauzpobrqeiw.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_AZx2nJiHoBZ5NvLsC3V1zQ_9pbZ1mlu";
const SHARE_STORAGE_KEY = "fenix.share-links.v1";

export type ShareCredentials = {
  masterToken: string;
  playerToken: string;
};

type PublishedAgent = {
  agent_id: string;
  master_token: string;
  player_token: string;
};

type SharedPayload = {
  agent: unknown;
  rolls: Roll[];
  role: "master" | "player";
  updated_at: string;
};

async function rpc<T>(name: string, body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload?.message || "Não foi possível acessar a ficha compartilhada.",
    );
  }
  return payload as T;
}

function readCredentialMap() {
  if (typeof window === "undefined")
    return {} as Record<string, ShareCredentials>;
  try {
    return JSON.parse(
      localStorage.getItem(SHARE_STORAGE_KEY) || "{}",
    ) as Record<string, ShareCredentials>;
  } catch {
    return {};
  }
}

export function getShareCredentials(agentId: string) {
  return readCredentialMap()[agentId] || null;
}

export function storeShareCredentials(
  agentId: string,
  credentials: ShareCredentials,
) {
  const values = readCredentialMap();
  values[agentId] = credentials;
  localStorage.setItem(SHARE_STORAGE_KEY, JSON.stringify(values));
}

export async function publishSharedAgent(
  agent: Agent,
  credentials = getShareCredentials(agent.id),
) {
  const value = await rpc<PublishedAgent>("fenix_publish_agent", {
    agent_data: agent,
    supplied_master_token: credentials?.masterToken || null,
    supplied_player_token: credentials?.playerToken || null,
  });
  const next = {
    masterToken: value.master_token,
    playerToken: value.player_token,
  };
  storeShareCredentials(agent.id, next);
  return next;
}

export async function loadSharedAgent(agentId: string, token: string) {
  const value = await rpc<SharedPayload>("fenix_load_shared_agent", {
    requested_agent_id: agentId,
    share_token: token,
  });
  return {
    ...value,
    agent: validateAgentImport({ version: 1, agent: value.agent }),
    rolls: Array.isArray(value.rolls) ? value.rolls : [],
  };
}

export async function saveSharedAgent(agent: Agent, token: string) {
  await rpc("fenix_save_shared_agent", {
    requested_agent_id: agent.id,
    share_token: token,
    agent_data: agent,
  });
}

export async function rollSharedAgent(
  agent: Agent,
  token: string,
  label: string,
  attribute: number,
  bonus: number,
  expression: string,
) {
  return rpc<Roll>("fenix_roll_shared", {
    requested_agent_id: agent.id,
    share_token: token,
    agent_name: agent.name,
    roll_label: label,
    attribute_value: attribute,
    bonus,
    damage_expression: expression,
  });
}
