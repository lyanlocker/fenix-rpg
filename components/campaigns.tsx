"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { useGame } from "./game-shell";
import CampaignEditor from "./campaign-editor";
import type { Campaign } from "@/lib/model";
import { isApocalypsisCampaign, makeAlternateFace } from "@/lib/alternate";
import {
  getShareCredentials,
  loadSharedAgent,
  publishSharedAgent,
  saveSharedAgent,
  type AlternateEdit,
} from "@/lib/share";
export default function Campaigns() {
  const game = useGame(),
    [edit, setEdit] = useState<Campaign | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [events, setEvents] = useState<AlternateEdit[]>([]),
    [seenAt, setSeenAt] = useState(""),
    [busyId, setBusyId] = useState<string | null>(null),
    [feedError, setFeedError] = useState(""),
    c = game.state.campaigns.find((x) => x.id === selected);
  useEffect(() => {
    if (!selected || !game.ready || game.access.isPlayer) return;
    let active = true;
    setSeenAt(localStorage.getItem(`fenix.alternate.seen.${selected}`) || "");
    async function refresh() {
      const participants = game.state.agents.filter(
        (a) => a.campaign_id === selected,
      );
      const results = await Promise.allSettled(
        participants.map(async (a) => {
          const token = getShareCredentials(a.id)?.masterToken;
          if (!token) return [];
          const payload = await loadSharedAgent(a.id, token);
          return payload.role === "master" ? payload.alternate_edits : [];
        }),
      );
      if (!active) return;
      setEvents(
        results
          .flatMap((result) =>
            result.status === "fulfilled" ? result.value : [],
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
      setFeedError(
        results.some((result) => result.status === "rejected")
          ? "Não foi possível atualizar todos os avisos. Verifique os links publicados neste navegador."
          : "",
      );
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [selected, game.ready, game.access.isPlayer, game.state.agents]);

  async function enableAlternate(agentId: string, campaign: Campaign) {
    if (!isApocalypsisCampaign(campaign)) return;
    setBusyId(agentId);
    try {
      const local = game.state.agents.find((a) => a.id === agentId);
      if (!local || local.campaign_id !== campaign.id)
        throw Error("Adicione primeiro a ficha a esta campanha.");
      const credentials =
        getShareCredentials(agentId) || (await publishSharedAgent(local));
      const shared = await loadSharedAgent(agentId, credentials.masterToken);
      if (shared.role !== "master" || shared.agent.campaign_id !== campaign.id)
        throw Error(
          "A liberação exige a chave de mestre desta ficha e a mesma campanha.",
        );
      if (shared.agent.alternate)
        throw Error("Esta ficha já tem a face alternativa liberada.");
      const updated = {
        ...shared.agent,
        alternate: {
          approvedCampaignId: campaign.id,
          face: makeAlternateFace(shared.agent),
        },
      };
      await saveSharedAgent(updated, credentials.masterToken);
      await game.save("agents", updated);
      game.setNotice(
        "Face NEX 35 liberada. O jogador pode alternar tocando duas vezes na aparência do resumo.",
      );
      setEvents((prev) => [
        {
          id: crypto.randomUUID(),
          agent_id: agentId,
          actor: "master",
          summary: "Face NEX 35 liberada",
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (error) {
      game.setNotice((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SUAS MESAS</p>
          <h1>Campanhas</h1>
          <p>Organize os personagens e as anotações deste navegador.</p>
        </div>
        <button
          className="primary"
          onClick={() =>
            setEdit({
              id: crypto.randomUUID(),
              name: "",
              description: "",
              element: "Medo",
              notes: "",
              rules: "Básico",
            })
          }
        >
          <Plus size={17} />
          Nova campanha
        </button>
      </div>
      <div className="campaign-layout">
        <div>
          {game.state.campaigns.map((x) => (
            <button
              key={x.id}
              className="campaign-entry"
              onClick={() => setSelected(x.id)}
            >
              <strong>{x.name}</strong>
              <ArrowRight size={17} />
            </button>
          ))}
        </div>
        {c ? (
          <section className="panel">
            <h2>{c.name}</h2>
            <p className="prose">{c.description}</p>
            <button onClick={() => setEdit(c)}>Editar campanha</button>
            <h3>Personagens</h3>
            {game.state.agents
              .filter((a) => a.campaign_id === c.id)
              .map((a) => (
                <div className="campaign-face-row" key={a.id}>
                  <Link className="campaign-agent" href={"/agentes/" + a.id}>
                    <span>
                      {a.name}
                      <small>{a.className}</small>
                    </span>
                    <ArrowRight size={17} />
                  </Link>
                  {isApocalypsisCampaign(c) &&
                    !game.access.isPlayer &&
                    (a.alternate ? (
                      <small>Face NEX 35 liberada</small>
                    ) : (
                      <button
                        disabled={busyId === a.id}
                        onClick={() => void enableAlternate(a.id, c)}
                      >
                        {busyId === a.id ? "Liberando…" : "Liberar face NEX 35"}
                      </button>
                    ))}
                </div>
              ))}
            {isApocalypsisCampaign(c) && !game.access.isPlayer && (
              <section
                className="alternate-feed"
                aria-label="Alterações da face NEX 35"
              >
                <div className="section-title">
                  <h3>Alterações da face NEX 35</h3>
                  {events.some((event) => event.created_at > seenAt) && (
                    <button
                      onClick={() => {
                        const date = events[0].created_at;
                        localStorage.setItem(
                          `fenix.alternate.seen.${c.id}`,
                          date,
                        );
                        setSeenAt(date);
                      }}
                    >
                      Marcar como lidas (
                      {
                        events.filter((event) => event.created_at > seenAt)
                          .length
                      }
                      )
                    </button>
                  )}
                </div>
                <p className="hint">
                  Atualização automática a cada 10 segundos para fichas
                  compartilhadas com sua chave de mestre.
                </p>
                {feedError && (
                  <p role="alert" className="error">
                    {feedError}
                  </p>
                )}
                {events.length ? (
                  events.slice(0, 30).map((event) => (
                    <article
                      key={event.id}
                      className={
                        event.created_at > seenAt ? "alternate-unread" : ""
                      }
                    >
                      <strong>
                        {game.state.agents.find((a) => a.id === event.agent_id)
                          ?.name || "Agente"}
                      </strong>
                      <span>
                        {event.summary} ·{" "}
                        {event.actor === "player" ? "jogador" : "mestre"}
                      </span>
                      <time dateTime={event.created_at}>
                        {new Date(event.created_at).toLocaleString("pt-BR")}
                      </time>
                    </article>
                  ))
                ) : (
                  <p className="muted">Nenhuma edição registrada nessa face.</p>
                )}
              </section>
            )}
            <h3>Anotações</h3>
            <p className="prose">{c.notes || "Nenhuma anotação."}</p>
          </section>
        ) : (
          <section className="empty">
            <h2>Selecione uma campanha</h2>
            <p>As fichas continuam sendo o centro da sessão.</p>
          </section>
        )}
      </div>
      {edit && (
        <CampaignEditor
          campaign={edit}
          onClose={() => setEdit(null)}
          onSave={async (c) => {
            await game.save("campaigns", c);
            setSelected(c.id);
          }}
        />
      )}
    </div>
  );
}
