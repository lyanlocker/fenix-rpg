"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { useGame } from "./game-shell";
import dynamic from "next/dynamic";
const CampaignCombat = dynamic(() => import("./campaign-combat"));
import CampaignEditor from "./campaign-editor";
import type { Campaign } from "@/lib/model";
import {
  deriveAlternateFace,
  isApocalypsisCampaign,
  refreshAlternateInheritance,
} from "@/lib/alternate";
import {
  getShareCredentials,
  inactiveInfection,
  loadSharedAgent,
  publishSharedAgent,
  saveSharedAgent,
  updateSharedInfection,
  type AlternateEdit,
  type InfectionStatus,
} from "@/lib/share";
export default function Campaigns() {
  const game = useGame(),
    [edit, setEdit] = useState<Campaign | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [events, setEvents] = useState<AlternateEdit[]>([]),
    [infections, setInfections] = useState<Record<string, InfectionStatus>>({}),
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
          if (!token)
            return { agentId: a.id, events: [], infection: inactiveInfection };
          const payload = await loadSharedAgent(a.id, token);
          return {
            agentId: a.id,
            events: payload.role === "master" ? payload.alternate_edits : [],
            infection: payload.infection,
          };
        }),
      );
      if (!active) return;
      const loaded = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      setEvents(
        loaded
          .flatMap((item) => item.events)
          .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
      setInfections(
        Object.fromEntries(
          loaded.map((item) => [item.agentId, item.infection]),
        ),
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
      const derived = deriveAlternateFace(shared.agent);
      const updated = {
        ...shared.agent,
        alternate: {
          approvedCampaignId: campaign.id,
          ...derived,
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
  async function refreshInheritance(agentId: string, campaign: Campaign) {
    setBusyId(agentId);
    try {
      const token = getShareCredentials(agentId)?.masterToken;
      if (!token)
        throw Error(
          "Esta ficha exige a chave de mestre salva neste navegador.",
        );
      const shared = await loadSharedAgent(agentId, token);
      if (shared.role !== "master" || shared.agent.campaign_id !== campaign.id)
        throw Error(
          "Somente o mestre desta campanha pode atualizar a herança.",
        );
      const updated = refreshAlternateInheritance(shared.agent);
      const before = shared.agent.alternate!.face.inventory;
      const after = updated.alternate!.face.inventory;
      await saveSharedAgent(updated, token);
      await game.save("agents", updated);
      const rituals = after.filter(
        (entry) =>
          entry.kind === "Ritual" &&
          !before.some((item) => item.id === entry.id),
      ).length;
      const powers = after.filter((entry) => entry.kind === "Poder").length;
      game.setNotice(
        `Herança atualizada: ${rituals} rituais incluídos e ${powers} poderes nesta face. Nome, aparência e demais edições preservados.`,
      );
    } catch (error) {
      game.setNotice((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  async function setInfectionEnabled(
    agentId: string,
    campaign: Campaign,
    enabled: boolean,
  ) {
    setBusyId(agentId);
    try {
      const local = game.state.agents.find((agent) => agent.id === agentId);
      if (!local || local.campaign_id !== campaign.id)
        throw Error("Adicione primeiro o personagem a esta campanha.");
      const credentials =
        getShareCredentials(agentId) || (await publishSharedAgent(local));
      const shared = await loadSharedAgent(agentId, credentials.masterToken);
      if (shared.role !== "master" || shared.agent.campaign_id !== campaign.id)
        throw Error("Somente o mestre desta campanha pode liberar Infecção.");
      const status = await updateSharedInfection(
        agentId,
        credentials.masterToken,
        enabled ? "enable" : "disable",
      );
      setInfections((current) => ({ ...current, [agentId]: status }));
      game.setNotice(
        enabled
          ? "Infecção liberada para a ficha NEX 35."
          : "Barra de Infecção desativada.",
      );
    } catch (error) {
      game.setNotice((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  if (!game.access.ready || !game.ready) return <p>Carregando campanhas…</p>;
  if (game.access.isPlayer)
    return (
      <div className="page">
        <h1>Área do mestre</h1>
        <p>Use seu link compartilhado para acessar sua ficha.</p>
      </div>
    );
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
                      <button
                        disabled={busyId === a.id}
                        title="Inclui rituais elegíveis adicionados depois da liberação e seleciona metade dos poderes originais; preserva outras edições."
                        onClick={() => void refreshInheritance(a.id, c)}
                      >
                        {busyId === a.id
                          ? "Atualizando…"
                          : "Atualizar herança NEX 35"}
                      </button>
                    ) : (
                      <button
                        disabled={busyId === a.id}
                        onClick={() => void enableAlternate(a.id, c)}
                      >
                        {busyId === a.id ? "Liberando…" : "Liberar face NEX 35"}
                      </button>
                    ))}
                  {!game.access.isPlayer &&
                    (a.nex === 35 || a.alternate?.face.nex === 35) && (
                      <div className="campaign-infection-action">
                        <small>
                          Infecção:{" "}
                          {infections[a.id]?.enabled
                            ? `${infections[a.id].value}/100`
                            : "não liberada"}
                        </small>
                        <button
                          disabled={busyId === a.id}
                          onClick={() =>
                            void setInfectionEnabled(
                              a.id,
                              c,
                              !infections[a.id]?.enabled,
                            )
                          }
                        >
                          {busyId === a.id
                            ? "Salvando…"
                            : infections[a.id]?.enabled
                              ? "Desativar Infecção"
                              : "Liberar Infecção"}
                        </button>
                      </div>
                    )}
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
            <CampaignCombat key={c.id} campaignId={c.id} />
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
