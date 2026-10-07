"use client";
import { useEffect, useRef, useState } from "react";
import { Dices, Swords } from "lucide-react";
import { useGame } from "./game-shell";
import {
  createPlayerCombatSync,
  setPlayerInitiative,
  type PlayerCombat as Combat,
} from "@/lib/shared-combat";
import { effectiveAttributes, skillBonus, type Agent } from "@/lib/rules";
import { alternateAgent } from "@/lib/alternate";
import { startVisiblePolling } from "@/lib/polling";

export default function PlayerCombat({
  agent,
  token,
}: {
  agent: Agent;
  token: string;
}) {
  const game = useGame();
  const [combat, setCombat] = useState<Combat | null>(null),
    [busy, setBusy] = useState(false),
    [value, setValue] = useState(""),
    [error, setError] = useState("");
  const lock = useRef(false),
    request = useRef(0);
  useEffect(() => {
    let active = true,
      fetching = false;
    let sync = createPlayerCombatSync(agent.id, token);
    async function refresh() {
      if (lock.current || fetching) return;
      fetching = true;
      const version = request.current;
      try {
        const next = await sync();
        if (active && version === request.current && !lock.current) {
          if (next !== undefined) setCombat(next);
          setError("");
        } else {
          sync = createPlayerCombatSync(agent.id, token);
        }
      } catch (reason) {
        if (active) setError((reason as Error).message);
        throw reason;
      } finally {
        fetching = false;
      }
    }
    const stop = startVisiblePolling(refresh, 2500);
    return () => {
      active = false;
      stop();
    };
  }, [agent.id, token]);
  const mine = combat?.participants.find((p) => p.mine);
  const face =
    mine?.face === "alternate" && agent.alternate
      ? alternateAgent(agent)
      : agent;
  const attribute = effectiveAttributes(face).AGI,
    bonus = skillBonus(face, "Iniciativa");
  async function initiative(manual = false) {
    if (!combat || lock.current) return;
    const n = Number(value);
    if (manual && (!value || !Number.isInteger(n) || n < -1000 || n > 10000)) {
      setError("Informe uma iniciativa inteira entre -1000 e 10000.");
      return;
    }
    lock.current = true;
    request.current++;
    setBusy(true);
    try {
      const result = await setPlayerInitiative(
        agent.id,
        token,
        combat.id,
        manual ? n : null,
      );
      setCombat(result.combat);
      setError("");
      setValue("");
      if (result.roll)
        game.setNotice(
          `Iniciativa: ${result.roll.total} · ${result.roll.expression} · dados: ${result.roll.dice.join(", ")}`,
        );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!combat)
    return error ? (
      <p className="hint" role="status">
        Combate: {error}
      </p>
    ) : null;
  return (
    <section
      className="combat player-combat"
      aria-label="Combate compartilhado"
    >
      <div className="section-title">
        <h3>
          <Swords size={20} /> {combat.name}
        </h3>
        <span className="muted small">Combate da campanha · sincronizado</span>
      </div>
      <div className="combat-turn" aria-live="polite">
        <div>
          <small>RODADA {combat.round}</small>
          <h4>
            {combat.active
              ? `Turno de ${combat.currentName}`
              : "Combate pausado"}
          </h4>
          {mine && (
            <p className="muted small">
              Você participa com {mine.name}
              {mine.face === "alternate" ? " · NEX 35" : ""} · PV {mine.pv} /{" "}
              {mine.maxPv}
            </p>
          )}
        </div>
      </div>
      {mine ? (
        <fieldset disabled={busy} className="combat-controls">
          <div className="combat-toolbar">
            <button onClick={() => void initiative()}>
              <Dices size={17} /> Rolar minha iniciativa
            </button>
            <span className="muted small">
              {attribute === 0 ? "2d20 (menor)" : `${attribute}d20 (maior)`}{" "}
              {bonus.total >= 0 ? "+" : ""}
              {bonus.total} · treinamento {bonus.training >= 0 ? "+" : ""}
              {bonus.training}
              {bonus.adjustment || bonus.sources.length
                ? " · inclui ajustes e equipamentos"
                : ""}
            </span>
          </div>
          <form
            className="combat-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              void initiative(true);
            }}
          >
            <label>
              Resultado manual
              <input
                aria-label="Minha iniciativa"
                type="number"
                min={-1000}
                max={10000}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Resultado final"
              />
            </label>
            <button type="submit" disabled={!value}>
              Informar iniciativa
            </button>
          </form>
        </fieldset>
      ) : (
        <p className="hint">
          Você pode acompanhar os turnos. O mestre precisa adicionar sua ficha
          para você rolar iniciativa.
        </p>
      )}
      {error && (
        <p role="alert" className="hint">
          {error}
        </p>
      )}
      <ol className="combat-participants">
        {combat.participants.map((p, index) => (
          <li
            key={p.id}
            className={
              p.id === combat.currentParticipantId ? "combat-current" : ""
            }
          >
            <div className="combat-participant-heading">
              <span className="combat-position">{index + 1}</span>
              <div>
                <strong>
                  {p.name}
                  {p.mine ? " · você" : ""}
                </strong>
                <small>
                  Iniciativa {p.initiativeRolled ? p.initiative : "aguardando"}
                </small>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="hint">
        O mestre controla os turnos e aplica o dano final. A tela sai da sua
        ficha quando o combate é encerrado.
      </p>
    </section>
  );
}
