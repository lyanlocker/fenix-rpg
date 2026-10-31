"use client";
import { useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  HeartPulse,
  Shield,
  Swords,
  UserRound,
} from "lucide-react";
import type { Agent } from "@/lib/rules";
import type { Encounter } from "@/lib/model";
import type { PlayerCombat } from "@/lib/shared-combat";
import {
  actionAvailable,
  actionLabels,
  budgetFor,
  combatOptions,
  emptyLedger,
  hasPower,
  maxTargets,
  medicBoostLimit,
  normalizeCombatName,
  turnKey,
  type ActionCost,
  type CombatCommand,
  type CombatEvent,
} from "@/lib/combat-actions";
export type ArenaView = PlayerCombat & { portraits?: Record<string, string> };
export function arenaEncounter(c: ArenaView): Encounter {
  const mine = c.participants.find((p) => p.mine);
  return {
    id: c.id,
    campaign_id: null,
    name: c.name,
    round: c.round,
    turn: c.participants.findIndex((p) => p.id === c.currentParticipantId),
    turnSerial: c.turnSerial,
    active: c.active,
    started: true,
    participants: c.participants.map((p) => ({
      ...p,
      pv: p.pv || 0,
      maxPv: p.maxPv || 1,
      hidden: false,
      conditions: "",
      face: p.face || "main",
    })),
    combat: {
      ...emptyLedger(),
      effects: c.effects || [],
      budgets: mine && c.budget ? { [mine.id]: c.budget } : {},
    },
  };
}
export function CombatEvents({
  events,
  resolve,
  disabled = false,
}: {
  events: CombatEvent[];
  resolve?: (c: CombatCommand, actorId: string) => void;
  disabled?: boolean;
}) {
  return (
    <section className="arena-log" aria-label="Histórico do combate">
      <h3>Acontecimentos</h3>
      {!events.length && (
        <p className="muted">As ações e rolagens aparecerão aqui.</p>
      )}
      <ol>
        {events
          .slice(-30)
          .toReversed()
          .map((event) => (
            <li key={event.id}>
              <small>
                RODADA {event.round} · {event.actor}
                {event.secret ? " · somente mestre" : ""}
              </small>
              <strong>{event.label}</strong>
              <p>{event.text}</p>
              {event.rolls.map((r, i) => (
                <span className="arena-roll" key={i}>
                  {r.label}: <b>{r.total}</b> · {r.expression} · [
                  {r.dice.join(", ")}]
                </span>
              ))}
              {event.pending && !event.resolved && (
                <span className="arena-pending">Aguardando mestre</span>
              )}
              {event.resolved && <span className="muted small">Resolvido</span>}
              {event.pending && !event.resolved && resolve && (
                <form
                  className="arena-resolve"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    resolve(
                      {
                        kind: "resolve",
                        eventId: event.id,
                        amount: Number(data.get("amount") || 0),
                        note: String(data.get("note") || ""),
                      },
                      event.actorId,
                    );
                  }}
                >
                  {event.pending === "damage" && (
                    <label>
                      Dano final (0 se não acertou)
                      <input
                        name="amount"
                        type="number"
                        min={0}
                        max={100000}
                        required
                        defaultValue={event.proposedDamage || 0}
                      />
                    </label>
                  )}
                  <label>
                    Resolução do mestre
                    <input
                      name="note"
                      maxLength={300}
                      placeholder="Reação, resistência ou efeito aplicado"
                    />
                  </label>
                  <button disabled={disabled} type="submit">
                    {event.pending === "damage"
                      ? "Aplicar dano final"
                      : "Concluir resolução"}
                  </button>
                </form>
              )}
            </li>
          ))}
      </ol>
    </section>
  );
}
export default function CombatArena({
  combat,
  agent,
  busy,
  error,
  onCommand,
  master = false,
}: {
  combat: ArenaView;
  agent?: Agent;
  busy: boolean;
  error: string;
  onCommand: (c: CombatCommand) => void;
  master?: boolean;
}) {
  const [category, setCategory] = useState<ActionCost>("standard"),
    [optionId, setOptionId] = useState(""),
    [targets, setTargets] = useState<string[]>([]),
    [variant, setVariant] = useState<"base" | "discente">("base"),
    [boost, setBoost] = useState(0),
    [extraAttack, setExtraAttack] = useState(false),
    [accelerate, setAccelerate] = useState(false),
    [grant, setGrant] = useState<"standard" | "move">("standard"),
    [note, setNote] = useState("");
  const mine = combat.participants.find((p) => p.mine),
    e = arenaEncounter(combat),
    p = e.participants.find((p) => p.id === mine?.id),
    budget = p ? budgetFor(e, p, agent) : null,
    myTurn = !!mine && combat.active && mine.id === combat.currentParticipantId,
    canAct = myTurn && !!agent && agent.resources.pv > 0 && !busy;
  const options = agent ? combatOptions(agent, combat.rules) : [],
    selected = options.find((o) => o.id === optionId),
    name = normalizeCombatName(selected?.name || ""),
    multi = !!selected && !!agent && maxTargets(selected, agent) > 1,
    effectiveAction = accelerate || extraAttack ? "free" : selected?.action;
  const cost =
      (selected?.pe || 0) +
      (name === "paramedico" ? boost : 0) +
      (variant === "discente" ? (name === "cicatrizacao" ? 2 : 3) : 0) +
      (accelerate ? 4 : 0) +
      (extraAttack ? 2 : 0),
    costTotal = name === "estrategista" ? cost * targets.length : cost,
    targetList = selected?.target === "self" && mine ? [mine.id] : targets;
  const upkeep = (combat.effects || []).filter(
    (x) =>
      x.sourceId === mine?.id &&
      x.timing === "sustained" &&
      x.createdKey !== turnKey(e) &&
      x.upkeepKey !== turnKey(e),
  );
  function choose(id: string) {
    setOptionId(id);
    setTargets([]);
    setBoost(0);
    setVariant("base");
    setExtraAttack(false);
    setAccelerate(false);
    setNote("");
  }
  function target(id: string) {
    if (
      !canAct ||
      !selected ||
      selected.target === "none" ||
      selected.target === "self"
    )
      return;
    setTargets((old) =>
      multi
        ? old.includes(id)
          ? old.filter((x) => x !== id)
          : [...old, id]
        : [id],
    );
  }
  return (
    <div className={`combat-arena ${myTurn ? "arena-my-turn" : ""}`}>
      <header className="arena-heading">
        <div>
          <p className="eyebrow">SALA DE COMBATE · RODADA {combat.round}</p>
          <h2>{combat.name}</h2>
        </div>
        <span className="arena-status">
          {combat.active
            ? myTurn
              ? "Sua vez de agir"
              : "Acompanhando"
            : "Pausado pelo mestre"}
        </span>
      </header>
      <div className="arena-turn" aria-live="polite">
        <Swords size={22} />
        <strong>
          {combat.active ? `Turno de ${combat.currentName}` : "Combate pausado"}
        </strong>
      </div>
      <ol className="arena-tokens" aria-label="Tokens e ordem dos turnos">
        {combat.participants.map((person, index) => (
          <li
            key={person.id}
            aria-current={
              person.id === combat.currentParticipantId ? "step" : undefined
            }
          >
            <button
              type="button"
              className={targets.includes(person.id) ? "selected" : ""}
              onClick={() => target(person.id)}
              aria-pressed={targets.includes(person.id)}
              aria-label={`${person.name}${person.mine ? ", você" : ""}${person.id === combat.currentParticipantId ? ", turno atual" : ""}`}
            >
              <span className="arena-token-image">
                {combat.portraits?.[person.id] ? (
                  <Image
                    src={combat.portraits[person.id]}
                    alt=""
                    unoptimized
                    width={88}
                    height={88}
                  />
                ) : (
                  <UserRound size={38} />
                )}
                <i>{index + 1}</i>
              </span>
              <strong>{person.name}</strong>
              <small>
                {person.mine ? "Você · " : ""}
                {person.initiativeRolled
                  ? `INI ${person.initiative}`
                  : "Iniciativa pendente"}
              </small>
              {person.id === combat.currentParticipantId && (
                <b className="arena-now">AGINDO</b>
              )}
            </button>
          </li>
        ))}
      </ol>
      <div className="arena-columns">
        <section className="arena-actions" aria-label="Ações do personagem">
          {agent && mine && (
            <div className="arena-resources">
              <span>
                <HeartPulse size={17} />
                {mine.pv ?? agent.resources.pv} PV
              </span>
              <span>
                {agent.resources[agent.determination ? "pd" : "pe"]}{" "}
                {agent.determination ? "PD" : "PE"}
              </span>
              <span>
                <Shield size={17} />
                {agent.name}
              </span>
            </div>
          )}
          {!myTurn && (
            <p className="arena-wait">
              {combat.active
                ? `Aguarde: ${combat.currentName} está agindo. Você pode acompanhar os tokens e as rolagens.`
                : "O mestre pausou o combate. As ações serão liberadas ao retomar."}
            </p>
          )}
          {budget && (
            <div className="arena-budget" aria-label="Ações restantes">
              <span>
                <b>{budget.standard + budget.restricted}</b> padrão
                {budget.restricted ? ` (${budget.restricted} sem ritual)` : ""}
              </span>
              <span>
                <b>{budget.move}</b> movimento
              </span>
              <span>
                <b>{budget.attack}</b> ataques extras
              </span>
              <span>Livre · sem cota fixa</span>
            </div>
          )}
          {upkeep.length > 0 && (
            <div className="hint">
              <strong>Sustentação no início do turno</strong>
              {upkeep.map((x) => (
                <div key={x.id}>
                  <span>{x.name}</span>
                  <button
                    disabled={!canAct}
                    onClick={() =>
                      onCommand({ kind: "sustain", eventId: x.id })
                    }
                  >
                    Sustentar · 1 {agent?.determination ? "PD" : "PE"}
                  </button>
                  <button
                    disabled={!canAct}
                    onClick={() =>
                      onCommand({ kind: "stopEffect", eventId: x.id })
                    }
                  >
                    Encerrar efeito
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="arena-tabs" role="tablist" aria-label="Tipo de ação">
            {(Object.keys(actionLabels) as ActionCost[]).map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={category === c}
                onClick={() => {
                  setCategory(c);
                  choose("");
                }}
              >
                {actionLabels[c]}
              </button>
            ))}
          </div>
          <fieldset
            disabled={!canAct || upkeep.length > 0}
            className="combat-controls"
          >
            <div className="arena-option-grid">
              {options
                .filter((o) => o.action === category)
                .map((o) => (
                  <button
                    key={o.id}
                    className={optionId === o.id ? "selected" : ""}
                    onClick={() => choose(o.id)}
                  >
                    <strong>{o.name}</strong>
                    <small>
                      {o.pe
                        ? `${o.pe} ${agent?.determination ? "PD" : "PE"}`
                        : actionLabels[o.action]}
                      {o.consume ? " · consome 1 item" : ""}
                    </small>
                  </button>
                ))}
            </div>
            {!options.some((o) => o.action === category) && (
              <p className="muted">
                Nenhuma ação deste tipo disponível na ficha.
              </p>
            )}
            {selected && (
              <div className="arena-action-detail">
                <h3>{selected.name}</h3>
                <details>
                  <summary>Regra e alcance</summary>
                  <p className="preserve">{selected.description}</p>
                </details>
                {selected.rule && (
                  <small>Efeito configurado pelo mestre.</small>
                )}
                {selected.target !== "none" && selected.target !== "self" && (
                  <label>
                    {multi ? "Alvos (selecione um ou mais)" : "Alvo"}
                    <select
                      multiple={multi}
                      value={multi ? targets : targets[0] || ""}
                      onChange={(ev) =>
                        setTargets(
                          Array.from(
                            ev.target.selectedOptions,
                            (o) => o.value,
                          ).filter(Boolean),
                        )
                      }
                    >
                      {!multi && (
                        <option value="">
                          Selecione um token ou escolha aqui
                        </option>
                      )}
                      {combat.participants
                        .filter((t) => selected.target !== "ally" || t.isAgent)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                            {t.mine ? " · você" : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                {selected.target === "self" && <p>Alvo: você.</p>}
                {["cicatrizacao", "velocidade mortal"].includes(name) && (
                  <label>
                    Versão
                    <select
                      value={variant}
                      onChange={(ev) =>
                        setVariant(ev.target.value as typeof variant)
                      }
                    >
                      <option value="base">Básica</option>
                      <option value="discente">Discente</option>
                    </select>
                  </label>
                )}
                {name === "paramedico" && agent && (
                  <label>
                    Ampliação de cura
                    <select
                      value={boost}
                      onChange={(ev) => setBoost(Number(ev.target.value))}
                    >
                      {Array.from(
                        { length: medicBoostLimit(agent) + 1 },
                        (_, n) => (
                          <option key={n} value={n}>
                            {2 + n}d10 · {2 + n}{" "}
                            {agent.determination ? "PD" : "PE"}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                )}
                {name === "surto de adrenalina" && (
                  <label>
                    Ação adicional
                    <select
                      value={grant}
                      onChange={(ev) =>
                        setGrant(ev.target.value as typeof grant)
                      }
                    >
                      <option value="standard">Padrão</option>
                      <option value="move">Movimento</option>
                    </select>
                  </label>
                )}
                {agent &&
                  selected.effect === "attack" &&
                  hasPower(agent, "Ataque Extra") && (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={extraAttack}
                        onChange={(ev) => setExtraAttack(ev.target.checked)}
                      />{" "}
                      Ataque Extra · +2 pontos, uma vez por rodada após atacar
                    </label>
                  )}
                {agent &&
                  selected.item?.kind === "Ritual" &&
                  hasPower(agent, "Acelerar Ritual") && (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={accelerate}
                        onChange={(ev) => setAccelerate(ev.target.checked)}
                      />{" "}
                      Acelerar Ritual · ação livre, +4 pontos
                    </label>
                  )}
                <label>
                  Descrição da ação (opcional)
                  <input
                    value={note}
                    maxLength={300}
                    onChange={(ev) => setNote(ev.target.value)}
                    placeholder="Deslocamento, alcance ou detalhe da cena"
                  />
                </label>
                <p className="hint">
                  {effectiveAction && actionLabels[effectiveAction]} ·{" "}
                  {costTotal} {agent?.determination ? "PD" : "PE"}
                  {selected.effect === "attack"
                    ? " · o mestre confirma o dano final"
                    : ""}
                </p>
                <button
                  className="primary"
                  disabled={
                    !budget ||
                    !effectiveAction ||
                    !actionAvailable(
                      budget,
                      effectiveAction,
                      selected.item?.kind === "Ritual",
                      selected.effect === "attack",
                    ) ||
                    (selected.target !== "none" && !targetList.length)
                  }
                  onClick={() =>
                    onCommand({
                      kind: "use",
                      optionId: selected.id,
                      targetIds: targetList,
                      variant,
                      boost,
                      extraAttack,
                      accelerate,
                      ...(name === "surto de adrenalina" ? { grant } : {}),
                      note,
                    })
                  }
                >
                  {busy ? "Registrando…" : "Confirmar ação"}
                  <ArrowRight size={17} />
                </button>
              </div>
            )}
          </fieldset>
          {error && (
            <p role="alert" className="hint arena-error">
              {error}
            </p>
          )}
          {mine && (
            <button
              className="arena-end"
              disabled={!canAct || upkeep.length > 0}
              onClick={() => onCommand({ kind: "end" })}
            >
              Concluir meu turno
              <ArrowRight size={17} />
            </button>
          )}
          {!master && (
            <p className="hint">
              O mestre controla a cena e pode pausar, ajustar efeitos e corrigir
              resultados.
            </p>
          )}
        </section>
        <CombatEvents events={combat.events || []} />
      </div>
    </div>
  );
}
