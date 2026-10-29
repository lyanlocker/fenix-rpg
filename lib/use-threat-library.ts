"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { publishedThreatLibrary, type ThreatLibrary } from "./threat-library";
import type { Threat } from "./threats";

type Change =
  | { action: "save"; threats: Threat[]; image?: string }
  | { action: "image"; id: string; image?: string; restore?: boolean };
type Result = {
  library: ThreatLibrary;
  revision: string;
  commit?: string;
  changed?: boolean;
};
async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Error(
      body.error || "Não foi possível concluir a conexão com o GitHub.",
    );
  return body as T;
}
export function useThreatLibrary(enabled: boolean) {
  const [library, setLibrary] = useState<ThreatLibrary>(publishedThreatLibrary);
  const [connected, setConnected] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [commit, setCommit] = useState("");
  const revision = useRef("");
  const publishing = useRef(false);
  const generation = useRef(0);
  const accept = useCallback((result: Result) => {
    setLibrary(result.library);
    revision.current = result.revision;
    if (result.commit) setCommit(result.commit);
  }, []);
  const refresh = useCallback(async () => {
    if (publishing.current)
      throw Error("Aguarde o envio terminar antes de atualizar.");
    const current = ++generation.current;
    const result = await api<Result>("/api/github/threats");
    if (current === generation.current) accept(result);
  }, [accept]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void api<{ connected: boolean; configured: boolean }>("/api/github/session")
      .then(async (status) => {
        if (!live) return;
        setConnected(status.connected);
        setConfigured(status.configured);
        if (status.connected) {
          const current = ++generation.current;
          const result = await api<Result>("/api/github/threats");
          if (live && current === generation.current) accept(result);
        }
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [enabled, accept]);
  async function connect(token: string) {
    await api("/api/github/session", "POST", { token });
    setConnected(true);
    await refresh();
    setError("");
  }
  async function disconnect() {
    await api("/api/github/session", "DELETE");
    setConnected(false);
    generation.current++;
    revision.current = "";
  }
  async function publish(change: Change) {
    if (!connected)
      throw Error("Conecte seu GitHub no painel acima antes de salvar.");
    if (!revision.current)
      throw Error("Clique em Atualizar catálogo antes de salvar.");
    if (publishing.current) throw Error("Aguarde o envio atual terminar.");
    publishing.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    try {
      const result = await api<Result>("/api/github/threats", "POST", {
        ...change,
        expected: revision.current,
      });
      accept(result);
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      publishing.current = false;
      setBusy(false);
    }
  }
  return {
    library,
    connected,
    configured,
    busy,
    error,
    commit,
    connect,
    disconnect,
    refresh,
    publish,
  };
}
