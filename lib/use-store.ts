"use client";
import { useCallback, useEffect, useState } from "react";
import { demoState } from "./demo";
import {
  emptyState,
  type State,
  type Campaign,
  type Encounter,
  type Brew,
  type Roll,
} from "./model";
import { check, damage, maximums, type Agent, type Resource } from "./rules";
import { getShareCredentials, rollSharedAgent, saveSharedAgent } from "./share";
const KEY = "fenix.workspace.v1";
export function useStore() {
  const [state, setState] = useState<State>(emptyState),
    [ready, setReady] = useState(false),
    [storageBlocked, setStorageBlocked] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "null");
      setState(
        raw?.version === 1 ? { ...emptyState, ...raw.state } : demoState(),
      );
    } catch {
      setStorageBlocked(true);
      setNotice(
        "Não foi possível ler os dados locais. Importe um backup antes de continuar.",
      );
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || storageBlocked) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, state }));
    } catch {
      setNotice(
        "O navegador não conseguiu salvar. Exporte suas fichas para manter um backup.",
      );
    }
  }, [state, ready, storageBlocked]);
  async function save(
    kind: "agents" | "campaigns" | "encounters" | "brews",
    value: Agent | Campaign | Encounter | Brew,
  ) {
    setState((s) => ({
      ...s,
      [kind]: [value, ...s[kind].filter((x) => x.id !== value.id)],
    }));
  }
  async function remove(
    kind: "agents" | "campaigns" | "encounters" | "brews",
    id: string,
  ) {
    setState((s) => ({ ...s, [kind]: s[kind].filter((x) => x.id !== id) }));
  }
  async function roll(
    a: Agent | null,
    label: string,
    attribute: number,
    bonus: number,
    expression = "",
    secret = false,
    campaignId: string | null = null,
    explicitShareToken?: string,
  ) {
    const storedToken = a ? getShareCredentials(a.id)?.masterToken : null;
    const shareToken = explicitShareToken || storedToken;
    const value: Roll =
      a && shareToken
        ? await rollSharedAgent(
            a,
            shareToken,
            label,
            attribute,
            bonus,
            expression,
          )
        : {
            ...(expression ? damage(expression) : check(attribute, bonus)),
            id: crypto.randomUUID(),
            campaign_id: a?.campaign_id || campaignId,
            agentName: a?.name || "Dados livres",
            label,
            secret,
            created_at: new Date().toISOString(),
          };
    setState((s) => ({ ...s, rolls: [value, ...s.rolls].slice(0, 100) }));
    return value;
  }
  async function syncSharedAgent(a: Agent, explicitShareToken?: string) {
    const token = explicitShareToken || getShareCredentials(a.id)?.masterToken;
    if (token) await saveSharedAgent(a, token);
  }
  const mergeSharedAgent = useCallback((a: Agent, rolls: Roll[]) => {
    setState((current) => {
      const rollMap = new Map(
        [...rolls, ...current.rolls].map((roll) => [roll.id, roll]),
      );
      return {
        ...current,
        agents: [a, ...current.agents.filter((value) => value.id !== a.id)],
        rolls: [...rollMap.values()]
          .sort((left, right) =>
            right.created_at.localeCompare(left.created_at),
          )
          .slice(0, 100),
      };
    });
  }, []);
  async function adjustResource(
    a: Agent,
    key: Resource,
    delta: number,
    explicitShareToken?: string,
  ) {
    if (!Number.isInteger(delta) || Math.abs(delta) > 10000)
      throw Error("Informe uma alteração inteira entre -10000 e 10000.");
    const updated: Agent = {
      ...a,
      resources: {
        ...a.resources,
        [key]: Math.max(
          0,
          Math.min(maximums(a)[key], a.resources[key] + delta),
        ),
      },
    };
    await syncSharedAgent(updated, explicitShareToken);
    setState((s) => ({
      ...s,
      agents: s.agents.map((current) =>
        current.id === a.id ? updated : current,
      ),
    }));
  }
  return {
    state,
    ready,
    notice,
    setNotice,
    save,
    remove,
    roll,
    syncSharedAgent,
    mergeSharedAgent,
    adjustResource,
  };
}
