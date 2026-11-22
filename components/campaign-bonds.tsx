"use client";
import { useEffect, useRef, useState } from "react";
import { Heart, UserRound } from "lucide-react";
import {
  campaignBonds,
  heartDie,
  type BondOperation,
  type CampaignBonds,
} from "@/lib/campaign-bonds";
import { startVisiblePolling } from "@/lib/polling";

export function useCampaignBonds(
  id: string,
  token: string | null,
  campaignId: string | null | undefined,
) {
  const [data, setData] = useState<CampaignBonds | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const version = useRef(0),
    pending = useRef(false);
  useEffect(() => {
    setData(null);
    setError("");
    if (!token || !campaignId) return;
    let alive = true;
    const stop = startVisiblePolling(async () => {
      if (pending.current) return true;
      const stamp = version.current;
      try {
        const result = await campaignBonds(id, token);
        if (alive && stamp === version.current) {
          setData(result);
          setError("");
        }
        return true;
      } catch (e) {
        if (alive)
          setError(
            (e as { status?: number }).status === 404
              ? "As mecânicas de campanha aguardam a atualização do banco."
              : (e as Error).message,
          );
        return false;
      }
    }, 10000);
    return () => {
      alive = false;
      stop();
    };
  }, [id, token, campaignId]);
  async function act(op: BondOperation, ally?: string, points?: number) {
    if (!token || pending.current) return;
    pending.current = true;
    version.current++;
    setBusy(true);
    setError("");
    try {
      setData(await campaignBonds(id, token, op, ally, points));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      version.current++;
      setBusy(false);
    }
  }
  return { data, busy, error, act };
}
type Controls = ReturnType<typeof useCampaignBonds> & { master: boolean };

export function RelationsPanel({ data, busy, error, act, master }: Controls) {
  if (!data) return error ? <p className="hint">{error}</p> : null;
  if (data.registered === false)
    return (
      <p className="hint">
        O mestre precisa sincronizar o elenco da campanha para liberar as
        relações.
      </p>
    );
  return (
    <section className="campaign-bonds-panel" aria-label="Relações">
      <div className="section-title">
        <h3>Relações</h3>
        {data.activeDie ? (
          <strong>Ativa · +1d{data.activeDie}</strong>
        ) : (
          <small>
            {data.used
              ? "Utilizada nesta campanha"
              : "1 utilização por campanha"}
          </small>
        )}
      </div>
      <p className="hint">
        Atribua até três corações a cada aliado. Escolha um vínculo para
        acrescentar o dado de relação a todos os testes durante uma cena.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data.activeDie && (
        <div className="bond-active">
          <span>
            +1d{data.activeDie} até o fim da cena, sem afetar dano ou cura.
          </span>
          <button disabled={busy} onClick={() => void act("finish")}>
            Encerrar relação
          </button>
        </div>
      )}
      <div className="bond-grid">
        {data.allies.map((ally) => (
          <article
            key={ally.id}
            className={`bond-card ${ally.dead ? "bond-dead" : ""}`}
          >
            <div className="bond-portrait">
              {ally.portrait &&
              /^data:image\/(png|jpeg|webp);base64,/.test(ally.portrait) ? (
                <img src={ally.portrait} alt={ally.name} />
              ) : (
                <UserRound size={28} />
              )}
            </div>
            <strong>{ally.name}</strong>
            <div className="bond-hearts">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  aria-label={`${ally.name}: ${n} coração${n === 1 ? "" : "ões"}`}
                  aria-pressed={ally.hearts >= n}
                  disabled={busy || ally.dead || data.dead}
                  onClick={() =>
                    void act("heart", ally.id, ally.hearts === n ? n - 1 : n)
                  }
                >
                  <Heart
                    size={21}
                    fill={ally.hearts >= n ? "currentColor" : "none"}
                  />
                </button>
              ))}
            </div>
            <small>
              {ally.dead
                ? "Falecido"
                : heartDie(ally.hearts)
                  ? `1d${heartDie(ally.hearts)}`
                  : "Sem vínculo"}
            </small>
            <button
              disabled={
                busy || data.used || !ally.hearts || ally.dead || data.dead
              }
              onClick={() => {
                if (
                  window.confirm(
                    `Usar a única relação da campanha com ${ally.name} nesta cena?`,
                  )
                )
                  void act("activate", ally.id);
              }}
            >
              Ativar relação
            </button>
          </article>
        ))}
      </div>
      {!data.allies.length && (
        <p className="hint">
          Nenhum outro personagem publicado nesta campanha.
        </p>
      )}
      {master && (
        <div className="bond-master">
          <small>
            Falecimento definitivo: causa perda de SAN aos personagens que têm
            corações com este agente (2d8, 2d10 ou 2d12).
          </small>
          <button
            disabled={busy || data.dead}
            onClick={() => {
              if (
                window.confirm(
                  "Registrar o falecimento definitivo deste personagem e aplicar a perda de SAN aos aliados? Esta ação não pode ser repetida.",
                )
              )
                void act("death");
            }}
          >
            {data.dead ? "Falecimento registrado" : "Registrar falecimento"}
          </button>
        </div>
      )}
    </section>
  );
}

export function ReputationPanel({ data, busy, error, act, master }: Controls) {
  const reputation = data?.reputation;
  const [draft, setDraft] = useState<string | null>(null);
  if (!reputation || (!master && !reputation.visible)) return null;
  const value = reputation.value;
  return (
    <section className="reputation-panel" aria-label="Reputação">
      <div className="section-title">
        <h3>Reputação</h3>
        <strong>{value}/100</strong>
      </div>
      <div
        className="reputation-track"
        role="meter"
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label="Reputação"
      >
        <div className="reputation-zero" />
        <div
          className={`reputation-fill ${value < 0 ? "negative" : "positive"}`}
          style={{ width: `${Math.abs(value) / 2}%` }}
        />
      </div>
      <div className="reputation-scale">
        <span>-100</span>
        <span>0</span>
        <span>100</span>
      </div>
      {master && (
        <>
          <small>
            {reputation.visible ? "Visível ao jogador" : "Oculta do jogador"}
          </small>
          <div className="reputation-controls">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act("reputation", undefined, Math.max(-100, value - 1))
              }
            >
              −
            </button>
            <input
              aria-label="Valor da reputação"
              type="number"
              min={-100}
              max={100}
              value={draft ?? String(value)}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act("reputation", undefined, Math.min(100, value + 1))
              }
            >
              +
            </button>
            <button
              disabled={
                busy ||
                draft === null ||
                draft.trim() === "" ||
                !Number.isInteger(Number(draft)) ||
                Number(draft) < -100 ||
                Number(draft) > 100
              }
              onClick={() => {
                void act("reputation", undefined, Number(draft));
                setDraft(null);
              }}
            >
              Salvar
            </button>
            <button
              disabled={busy}
              onClick={() => void act(reputation.visible ? "hide" : "reveal")}
            >
              {reputation.visible ? "Ocultar" : "Liberar"}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </>
      )}
    </section>
  );
}
