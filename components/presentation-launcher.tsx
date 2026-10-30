"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MonitorPlay, Square } from "lucide-react";
import { useGame } from "./game-shell";
import { presentationFrame } from "@/lib/presentation";
import type { Encounter } from "@/lib/model";
import { createSharedAgentSync, getShareCredentials } from "@/lib/share";
import { startVisiblePolling } from "@/lib/polling";

export default function PresentationLauncher({
  encounter,
  campaign,
}: {
  encounter: Encounter;
  campaign: string;
}) {
  const game = useGame();
  const [session, setSession] = useState<{ id: string; since: string } | null>(
    null,
  );
  const channel = useRef<BroadcastChannel | null>(null);
  const [spotlightId, setSpotlightId] = useState("");
  const visibleParticipants = encounter.participants.filter((p) => !p.hidden);
  useEffect(() => {
    if (!encounter.participants.some((p) => p.id === spotlightId && !p.hidden))
      setSpotlightId("");
  }, [encounter.participants, spotlightId]);
  const payload = useMemo(
    () =>
      session
        ? presentationFrame(
            campaign,
            encounter,
            game.state.agents,
            game.state.rolls,
            session.since,
            {
              threats: game.allThreats,
              spotlightId,
              artOverrides: game.threatLibrary.library.art,
            },
          )
        : null,
    [
      campaign,
      encounter,
      game.state.agents,
      game.state.rolls,
      game.allThreats,
      game.threatLibrary.library.art,
      session,
      spotlightId,
    ],
  );
  const latest = useRef(payload);
  latest.current = payload;
  useEffect(() => {
    if (!session || game.access.isPlayer) return;
    const bus = new BroadcastChannel(`fenix-stage-${session.id}`);
    channel.current = bus;
    const send = () =>
      bus.postMessage({ type: "frame", frame: latest.current });
    bus.onmessage = (event) => {
      if (event.data?.type === "ready") send();
    };
    send();
    const heartbeat = setInterval(
      () => bus.postMessage({ type: "heartbeat" }),
      2000,
    );
    return () => {
      clearInterval(heartbeat);
      bus.postMessage({ type: "stop" });
      bus.close();
      channel.current = null;
    };
  }, [session, game.access.isPlayer]);
  useEffect(() => {
    if (payload)
      channel.current?.postMessage({ type: "frame", frame: payload });
  }, [payload]);
  const visibleAgents = encounter.participants
    .filter((p) => !p.hidden && p.agentId)
    .map((p) => p.agentId)
    .sort()
    .join(",");
  const [syncError, setSyncError] = useState("");
  useEffect(() => {
    if (!session || game.access.isPlayer || !game.access.ready) return;
    let active = true;
    const subscriptions = [
      ...new Set(visibleAgents.split(",").filter(Boolean)),
    ].flatMap((id) => {
      const key = getShareCredentials(id)?.masterToken;
      return key ? [createSharedAgentSync(id, key)] : [];
    });
    if (!subscriptions.length) return;
    const stop = startVisiblePolling(
      async () => {
        const results = await Promise.allSettled(
          subscriptions.map((sync) => sync()),
        );
        if (!active) return false;
        const rolls = results.flatMap((result) =>
          result.status === "fulfilled" ? result.value?.rolls || [] : [],
        );
        if (rolls.length) game.mergeSharedAgent(null, rolls);
        const failed = results.find((result) => result.status === "rejected");
        setSyncError(
          failed
            ? "As rolagens compartilhadas estão temporariamente indisponíveis. Tentando reconectar…"
            : "",
        );
        if (failed?.status === "rejected") throw failed.reason;
        return rolls.length > 0;
      },
      5000,
      15000,
    );
    return () => {
      active = false;
      stop();
    };
  }, [
    session,
    visibleAgents,
    game.access.isPlayer,
    game.access.ready,
    game.mergeSharedAgent,
  ]);
  if (game.access.isPlayer || !game.access.ready) return null;
  function start() {
    if (!("BroadcastChannel" in window)) {
      game.setNotice(
        "Este navegador não oferece a comunicação entre janelas necessária para a apresentação.",
      );
      return;
    }
    const id = crypto.randomUUID();
    const popup = window.open(`/apresentacao#${id}`, "_blank");
    if (!popup) {
      game.setNotice("Permita abrir uma nova aba para usar a apresentação.");
      return;
    }
    popup.opener = null;
    setSession({ id, since: new Date().toISOString() });
  }
  return (
    <div className="presentation-launcher">
      <button onClick={start}>
        <MonitorPlay size={16} />
        {session ? "Reabrir apresentação" : "Abrir apresentação"}
      </button>
      {session && (
        <label className="presentation-focus-control">
          Destaque na apresentação
          <select
            value={spotlightId}
            onChange={(event) => setSpotlightId(event.target.value)}
          >
            <option value="">Visão geral da mesa</option>
            {visibleParticipants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {session && (
        <button onClick={() => setSession(null)}>
          <Square size={13} />
          Encerrar transmissão
        </button>
      )}
      {session && spotlightId && (
        <button onClick={() => setSpotlightId("")}>Voltar à visão geral</button>
      )}
      <small>
        Transmita a nova aba. Mantenha este combate aberto neste navegador.
        Apenas participantes revelados e novas rolagens públicas aparecem.
      </small>
      {session && syncError && <small role="status">{syncError}</small>}
    </div>
  );
}
