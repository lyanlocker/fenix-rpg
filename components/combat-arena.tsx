"use client";
import { weaponType } from "@/lib/weapon-modifications";
import { combatRuleName, combatSkillAttribute } from "@/lib/combat-metadata";
import ItemArtwork from "./item-artwork";
import CombatPowerControls from "./combat-power-controls";
import {
  modifierLabel,
  resolvePower,
  type PowerSelection,
} from "@/lib/power-rules";
import {
  powerContributions,
  powerEffectActive,
  fixedBonus,
  combatDefense,
} from "@/lib/power-effects";
import { useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  HeartPulse,
  Shield,
  Swords,
  UserRound,
} from "lucide-react";
import {
  effectiveAttributes,
  skillBonus,
  accessoryDefenseBonus,
  skillAttributes,
} from "@/lib/rules";
import { weaponRollSuggestion, type AttackMode } from "@/lib/combat-dice";
import type { Agent } from "@/lib/rules";
import type { Encounter } from "@/lib/model";
import type { PlayerCombat } from "@/lib/shared-combat";
import {
  actionAvailable,
  firearmFollowUp,
  retainCombatEvents,
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
        {retainCombatEvents(events, 30)
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
                <span className="arena-pending">
                  {event.damageRoll && !event.damageRoll.done
                    ? "Aguardando rolagem de dano"
                    : "Aguardando mestre"}
                </span>
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
  const [category, setCategory] = useState<ActionCost | "powers">("standard"),
    [powerGroup, setPowerGroup] = useState("all"),
    [powerSearch, setPowerSearch] = useState(""),
    [customSkill, setCustomSkill] = useState(""),
    [powerSelection, setPowerSelection] = useState<PowerSelection>({
      steps: 1,
      attackSteps: 1,
    }),
    [optionId, setOptionId] = useState(""),
    [targets, setTargets] = useState<string[]>([]),
    [variant, setVariant] = useState<"base" | "discente">("base"),
    [boost, setBoost] = useState(0),
    [confirmedHit, setConfirmedHit] = useState(""),
    [extraAttack, setExtraAttack] = useState(false),
    [accelerate, setAccelerate] = useState(false),
    [grant, setGrant] = useState<"standard" | "move">("standard"),
    [note, setNote] = useState(""),
    [attackDice, setAttackDice] = useState(""),
    [attackMode, setAttackMode] = useState<AttackMode>("highest"),
    [afterId, setAfterId] = useState(""),
    [delayOpen, setDelayOpen] = useState(false);
  const mine = combat.participants.find((p) => p.mine),
    e = arenaEncounter(combat),
    p = e.participants.find((p) => p.id === mine?.id),
    budget = p ? budgetFor(e, p, agent) : null,
    myTurn = !!mine && combat.active && mine.id === combat.currentParticipantId,
    canAct = myTurn && !!agent && agent.resources.pv > 0 && !busy;
  const options = agent
      ? combatOptions(
          agent,
          combat.rules,
          (e.combat?.effects || []).filter((x) => x.targetId === mine?.id),
        )
      : [],
    selected = options.find((o) => o.id === optionId),
    name = normalizeCombatName(
      selected?.item ? combatRuleName(selected.item) : selected?.name || "",
    ),
    multi = !!selected && !!agent && maxTargets(selected, agent) > 1,
    followUp =
      agent &&
      mine &&
      budget &&
      selected?.effect === "attack" &&
      selected.item &&
      weaponType(selected.item) === "Arma de fogo" &&
      hasPower(agent, "Segurar o Gatilho", combat.rules)
        ? firearmFollowUp(
            combat.events || [],
            budget,
            mine.id,
            selected.item.id,
            targets[0],
          )
        : undefined,
    following = !!followUp && confirmedHit === followUp.hitId,
    effectiveAction =
      accelerate || extraAttack || following ? "free" : selected?.action;
  let powerCost = selected?.pe || 0;
  if (selected?.power && selected.item && agent) {
    try {
      powerCost = resolvePower(
        selected.item,
        agent,
        {
          ...powerSelection,
          ...(selected.power.special === "moshPit"
            ? { steps: Math.max(1, Math.min(5, targets.length)) }
            : {}),
          confirmed: true,
        },
        selected.power,
      ).pe;
    } catch {}
  }
  const contributions = agent && p ? powerContributions(agent, e, p) : [];
  const visibleOptions = options.filter((o) =>
    category === "powers"
      ? o.item?.kind === "Poder" &&
        (powerGroup === "all" ||
          (o.item.subtype?.includes("Habilidade") ? "abilities" : "powers") ===
            powerGroup) &&
        normalizeCombatName(`${o.name} ${o.item.subtype || ""}`).includes(
          normalizeCombatName(powerSearch),
        )
      : o.action === category && o.item?.kind !== "Poder",
  );
  const baseCost =
      powerCost +
      (name === "paramedico" ? boost : 0) +
      (variant === "discente" ? (name === "cicatrizacao" ? 2 : 3) : 0) +
      (accelerate ? 4 : 0) +
      (extraAttack ? 2 : 0) +
      (following ? followUp.cost : 0),
    ritualDiscount =
      agent && selected?.item?.kind === "Ritual"
        ? fixedBonus(
            contributions.filter(
              (m) =>
                !m.personalOnly ||
                (targets.length === 1 && targets[0] === mine?.id) ||
                selected.target === "self",
            ),
            "ritualCost",
            agent,
            selected.item,
          )
        : 0,
    cost = Math.max(baseCost > 0 ? 1 : 0, baseCost + ritualDiscount),
    costTotal = name === "estrategista" ? cost * targets.length : cost,
    targetList = selected?.target === "self" && mine ? [mine.id] : targets;
  const upkeep = (combat.effects || []).filter(
    (x) =>
      x.sourceId === mine?.id &&
      x.timing === "sustained" &&
      x.createdKey !== turnKey(e) &&
      x.upkeepKey !== turnKey(e),
  );
  const pendingDamage = (combat.events || []).filter(
    (x) =>
      x.actorId === mine?.id &&
      !x.resolved &&
      x.damageRoll &&
      !x.damageRoll.done &&
      x.damageRoll.turn === turnKey(e),
  );
  const laterAllies = combat.participants.filter(
    (t, index) =>
      t.isAgent &&
      index > combat.participants.findIndex((x) => x.id === mine?.id) &&
      mine &&
      t.initiative < mine.initiative,
  );
  const delayAllowed = canAct && combat.budget?.key !== turnKey(e);
  const latestRoll = (combat.events || [])
    .filter((x) => x.actorId === mine?.id && x.rolls.length)
    .at(-1);
  function choose(id: string) {
    setOptionId(id);
    setCustomSkill("");
    setTargets([]);
    setBoost(0);
    setPowerSelection({ steps: 1, attackSteps: 1 });
    setVariant("base");
    setExtraAttack(false);
    setConfirmedHit("");
    setAccelerate(false);
    setNote("");
    const next = options.find((o) => o.id === id);
    if (agent && next?.effect === "attack" && next.item) {
      const suggestion = weaponRollSuggestion(agent, next.item);
      setAttackDice(suggestion.attack);
      setAttackMode(suggestion.mode);
    } else if (agent && next?.effect === "investigate") {
      const int = effectiveAttributes(agent).INT,
        bonus = skillBonus(agent, "Investigação").total;
      setAttackDice(`${int || 2}d20${bonus >= 0 ? "+" : ""}${bonus}`);
      setAttackMode(int === 0 ? "lowest" : "highest");
    } else {
      setAttackDice("");
      setAttackMode("highest");
    }
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
              </span>
              <span>
                <b>{budget.move + (budget.restrictedMove || 0)}</b> movimento
                {budget.restrictedMove
                  ? ` (${budget.restrictedMove} sem ritual)`
                  : ""}
              </span>
              <span>
                <b>{budget.attack}</b> ataques extras
              </span>
              {!!budget.movementOnly && (
                <span>
                  <b>{budget.movementOnly}</b> movimento só para se deslocar
                </span>
              )}
              {!!budget?.meleeAttack && (
                <span>
                  <b>{budget.meleeAttack}</b> ataques corpo a corpo extras
                </span>
              )}
              <span>Livre · sem cota fixa</span>
            </div>
          )}
          {upkeep.length > 0 && (
            <div className="hint">
              <strong>Sustentação no início do turno</strong>
              <p>
                Ação livre: paga apenas 1 PE/PD por efeito. Mantém suas ações
                padrão e de movimento.
              </p>
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
          {!!contributions.length && agent && (
            <div
              className="hint arena-active-effects"
              aria-label="Bônus de combate"
            >
              <strong>Bônus da ficha e efeitos ativos</strong>
              <ul>
                {contributions.map((m, i) => (
                  <li key={`${m.source}:${i}`}>
                    {m.source}: {modifierLabel(m)}
                  </li>
                ))}
              </ul>
              <p>
                Defesa: {p ? combatDefense(agent, e, p) : "—"} · deslocamento
                adicional: {fixedBonus(contributions, "speed", agent)} m
              </p>
              <small>
                Os bônus de ataque, dano e cura são acrescentados pelo servidor.
                Não os repita nos dados digitados.
              </small>
            </div>
          )}
          {(combat.effects || []).some(
            (x) => x.targetId === mine?.id || x.sourceId === mine?.id,
          ) && (
            <div
              className="hint arena-active-effects"
              aria-label="Efeitos ativos"
            >
              <strong>Efeitos ativos</strong>
              {(combat.effects || [])
                .filter(
                  (x) =>
                    (x.targetId === mine?.id || x.sourceId === mine?.id) &&
                    powerEffectActive(x, e),
                )
                .map((x) => (
                  <div key={x.id}>
                    <span>
                      {x.name}
                      {x.power
                        ? ` · ${x.power.modifiers.map(modifierLabel).join("; ")}`
                        : " · +1 "}
                      {x.power
                        ? ""
                        : x.grant === "standard"
                          ? "padrão"
                          : x.grant === "move"
                            ? "movimento"
                            : x.grant === "meleeAttack"
                              ? "ataque corpo a corpo"
                              : x.grant === "attack"
                                ? "ataque"
                                : "livre"}
                      {x.targetId !== mine?.id
                        ? ` para ${combat.participants.find((p) => p.id === x.targetId)?.name || "aliado"}`
                        : ""}
                      {x.noRitual && x.grant !== "standard"
                        ? " · sem ritual"
                        : ""}
                      {x.power
                        ? ""
                        : x.timing === "sustained"
                          ? " · sustentada"
                          : x.timing === "scene"
                            ? " · até encerrar"
                            : " · próximo turno do alvo"}
                    </span>
                    {x.sourceId === mine?.id &&
                      ["sustained", "scene"].includes(x.timing) &&
                      !upkeep.includes(x) && (
                        <button
                          disabled={!canAct}
                          onClick={() =>
                            onCommand({ kind: "stopEffect", eventId: x.id })
                          }
                        >
                          Encerrar efeito
                        </button>
                      )}
                  </div>
                ))}
            </div>
          )}
          {latestRoll && (
            <div
              key={`${latestRoll.id}:${latestRoll.rolls.length}`}
              className="arena-roll-result"
              role="status"
            >
              <small>{latestRoll.label}</small>
              <strong>{latestRoll.rolls.at(-1)!.total}</strong>
              <span>
                {latestRoll.rolls.at(-1)!.expression} · [
                {latestRoll.rolls.at(-1)!.dice.join(", ")}]
              </span>
            </div>
          )}
          {pendingDamage.map((event) => (
            <DamageRollForm
              key={event.id}
              event={event}
              disabled={!canAct}
              onCommand={onCommand}
            />
          ))}
          <div className="arena-tabs" role="tablist" aria-label="Tipo de ação">
            <button
              role="tab"
              aria-selected={category === "powers"}
              onClick={() => {
                setCategory("powers");
                choose("");
              }}
            >
              Habilidades e poderes
            </button>
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
            {category === "powers" && (
              <div className="arena-power-filters">
                <label>
                  Buscar habilidade ou poder
                  <input
                    value={powerSearch}
                    onChange={(ev) => setPowerSearch(ev.target.value)}
                    placeholder="Nome da habilidade"
                  />
                </label>
                <label>
                  Mostrar
                  <select
                    value={powerGroup}
                    onChange={(ev) => {
                      setPowerGroup(ev.target.value);
                      choose("");
                    }}
                  >
                    <option value="all">Todos</option>
                    <option value="abilities">Habilidades de trilha</option>
                    <option value="powers">
                      Poderes e habilidades de classe/origem
                    </option>
                  </select>
                </label>
              </div>
            )}
            <div className="arena-option-grid">
              {visibleOptions.map((o) => (
                <button
                  key={o.id}
                  className={optionId === o.id ? "selected" : ""}
                  onClick={() => choose(o.id)}
                >
                  <strong>{o.name}</strong>
                  <small>
                    {o.power?.outsideCombat
                      ? "Fora do combate"
                      : o.power?.viaAction
                        ? "Usar junto à ação"
                        : o.power?.passive
                          ? "Passivo · automático"
                          : o.power?.blocked
                            ? "Conferir regra"
                            : o.pe
                              ? `${o.pe} ${agent?.determination ? "PD" : "PE"}`
                              : actionLabels[o.action]}
                    {o.consume ? " · consome 1 item" : ""}
                  </small>
                </button>
              ))}
            </div>
            {!visibleOptions.length && (
              <p className="muted">
                Nenhuma ação deste tipo disponível na ficha.
              </p>
            )}
            {selected && (
              <div className="arena-action-detail">
                <h3>{selected.name}</h3>
                {selected.item && <ItemArtwork item={selected.item} />}
                <details>
                  <summary>Regra e alcance</summary>
                  <p className="preserve">{selected.description}</p>
                </details>
                {selected.power && selected.item && agent && (
                  <CombatPowerControls
                    rule={selected.power}
                    item={selected.item}
                    agent={agent}
                    value={
                      selected.power.special === "moshPit"
                        ? {
                            ...powerSelection,
                            steps: Math.max(1, Math.min(5, targets.length)),
                          }
                        : powerSelection
                    }
                    onChange={setPowerSelection}
                  />
                )}
                {selected.power?.enemyChoice && (
                  <label>
                    {selected.power.special === "moshPit"
                      ? "Inimigo cercado"
                      : "Alvo da habilidade"}
                    <select
                      value={powerSelection.enemyId || ""}
                      onChange={(ev) =>
                        setPowerSelection({
                          ...powerSelection,
                          enemyId: ev.target.value,
                        })
                      }
                    >
                      <option value="">Selecione o inimigo</option>
                      {combat.participants
                        .filter(
                          (t) => t.id !== mine?.id && !targets.includes(t.id),
                        )
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
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
                      <option value="base">
                        {name === "velocidade mortal"
                          ? "Básica · +1 movimento por turno"
                          : "Básica"}
                      </option>
                      <option value="discente">
                        {name === "velocidade mortal"
                          ? "Discente · +1 padrão por turno"
                          : "Discente"}
                      </option>
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
                        onChange={(ev) => {
                          setExtraAttack(ev.target.checked);
                          setConfirmedHit("");
                        }}
                      />{" "}
                      Ataque Extra · +2 pontos, uma vez por rodada após atacar
                    </label>
                  )}
                {followUp && agent && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={following}
                      onChange={(ev) => {
                        setConfirmedHit(
                          ev.target.checked ? followUp.hitId : "",
                        );
                        setExtraAttack(false);
                      }}
                    />
                    Segurar o Gatilho · confirmo que acertei o ataque anterior.
                    Atacar o mesmo alvo por {followUp.cost}{" "}
                    {agent.determination ? "PD" : "PE"}.
                  </label>
                )}
                {agent &&
                  selected.item?.kind === "Ritual" &&
                  hasPower(agent, "Acelerar Ritual", combat.rules) && (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={accelerate}
                        onChange={(ev) => setAccelerate(ev.target.checked)}
                      />{" "}
                      Acelerar Ritual · ação livre, +4 pontos
                    </label>
                  )}
                {selected.effect === "custom" && agent && (
                  <label>
                    Teste de perícia (opcional)
                    <select
                      value={customSkill}
                      onChange={(ev) => {
                        const skill = ev.target.value;
                        setCustomSkill(skill);
                        if (skill) {
                          const count =
                            effectiveAttributes(agent)[
                              combatSkillAttribute(agent, skill)
                            ];
                          setAttackDice(
                            `${count || 2}d20+${skillBonus(agent, skill).total}`,
                          );
                          setAttackMode(count ? "highest" : "lowest");
                        }
                      }}
                    >
                      <option value="">Sem teste</option>
                      {Object.keys(skillAttributes).map((skill) => (
                        <option key={skill}>{skill}</option>
                      ))}
                    </select>
                  </label>
                )}
                {(selected.effect === "attack" ||
                  (selected.effect === "custom" && !!customSkill) ||
                  selected.effect === "investigate") && (
                  <div className="arena-dice-inputs">
                    <label>
                      Dados do{" "}
                      {selected.effect === "attack" ? "ataque" : "teste"}
                      <input
                        aria-label="Dados do ataque ou teste"
                        value={attackDice}
                        maxLength={40}
                        placeholder="Ex.: 3d20+5"
                        onChange={(ev) => setAttackDice(ev.target.value)}
                      />
                    </label>
                    <label>
                      Resultado dos d20
                      <select
                        value={attackMode}
                        onChange={(ev) =>
                          setAttackMode(ev.target.value as AttackMode)
                        }
                      >
                        <option value="highest">Usar o maior dado</option>
                        <option value="lowest">Usar o menor dado</option>
                      </select>
                    </label>
                    <p className="hint">
                      Informe os dados base. Os bônus de habilidades são somados
                      automaticamente e o dano é uma etapa separada.
                    </p>
                  </div>
                )}
                <label>
                  {selected.effect === "custom"
                    ? "Descreva a ação avulsa (obrigatório)"
                    : "Descrição da ação (opcional)"}
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
                    (!!selected.power?.enemyChoice &&
                      !powerSelection.enemyId) ||
                    !!selected.power?.viaAction ||
                    !!selected.power?.passive ||
                    !!selected.power?.blocked ||
                    ((!!selected.power?.weaponChoice ||
                      !!selected.power?.ritualChoice) &&
                      !powerSelection.weaponId) ||
                    (!!selected.power?.condition &&
                      !powerSelection.confirmed) ||
                    (!!selected.power?.choices?.length &&
                      (selected.power.multiChoice
                        ? !powerSelection.choices?.length
                        : !powerSelection.choice)) ||
                    !budget ||
                    !effectiveAction ||
                    !actionAvailable(
                      budget,
                      effectiveAction,
                      selected.item?.kind === "Ritual",
                      selected.effect === "attack",
                      !!selected.item &&
                        weaponType(selected.item) === "Corpo a corpo",
                      selected.effect === "move",
                    ) ||
                    (selected.target !== "none" && !targetList.length) ||
                    (selected.effect === "custom" && !note.trim()) ||
                    (["attack", "investigate"].includes(selected.effect) &&
                      !attackDice.trim())
                  }
                  onClick={() =>
                    onCommand({
                      kind: "use",
                      optionId: selected.id,
                      targetIds: targetList,
                      variant,
                      boost,
                      extraAttack,
                      ...(following ? { followUpHitId: followUp.hitId } : {}),
                      accelerate,
                      ...(name === "surto de adrenalina" ? { grant } : {}),
                      note,
                      ...(selected.power && !selected.power.passive
                        ? { power: powerSelection }
                        : {}),
                      ...(["attack", "investigate"].includes(selected.effect) ||
                      (selected.effect === "custom" && customSkill)
                        ? {
                            attackDice,
                            attackMode,
                            ...(selected.effect === "custom"
                              ? { skill: customSkill }
                              : {}),
                          }
                        : {}),
                    })
                  }
                >
                  {busy
                    ? "Rolando / registrando…"
                    : selected.effect === "attack"
                      ? "Rolar ataque"
                      : selected.effect === "investigate"
                        ? "Rolar Investigação"
                        : selected.item?.kind === "Ritual"
                          ? "Executar ritual"
                          : "Confirmar ação"}
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
            <div className="arena-delay">
              <button
                className="arena-delay-button"
                aria-expanded={delayOpen}
                disabled={!delayAllowed || !laterAllies.length}
                onClick={() => setDelayOpen((v) => !v)}
              >
                Atrasar ação
              </button>
              <small>
                Antes de agir: passe para depois de um aliado. A nova posição
                vale até o fim do combate.
              </small>
              {delayOpen && (
                <form
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    if (afterId) onCommand({ kind: "delay", afterId });
                  }}
                >
                  <label>
                    Agir depois de
                    <select
                      value={afterId}
                      onChange={(ev) => setAfterId(ev.target.value)}
                      required
                    >
                      <option value="">Selecione um aliado</option>
                      {laterAllies.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} · iniciativa {t.initiative}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="arena-delay-button"
                    disabled={
                      !delayAllowed ||
                      !laterAllies.some((t) => t.id === afterId)
                    }
                    type="submit"
                  >
                    Confirmar atraso permanente neste combate
                  </button>
                </form>
              )}
            </div>
          )}
          {mine && (
            <button
              className="arena-end"
              disabled={
                !canAct || upkeep.length > 0 || pendingDamage.length > 0
              }
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

function DamageRollForm({
  event,
  disabled,
  onCommand,
}: {
  event: CombatEvent;
  disabled: boolean;
  onCommand: (c: CombatCommand) => void;
}) {
  const [dice, setDice] = useState(event.damageRoll?.formula || "1d6");
  return (
    <form
      className="arena-damage-step"
      onSubmit={(e) => {
        e.preventDefault();
        onCommand({ kind: "damage", eventId: event.id, damageDice: dice });
      }}
    >
      <h3>Agora, o dano · {event.label}</h3>
      <p>
        Ataque/execução já registrado. Ajuste a expressão e role quando estiver
        pronto.
      </p>
      {event.damageRoll?.maximum && (
        <p className="hint">
          Atirar para Matar: o dano deste crítico usa o resultado máximo dos
          dados.
        </p>
      )}
      {!!event.damageRoll?.bonuses?.length && (
        <div className="hint">
          <strong>Bônus garantidos nesta rolagem</strong>
          <ul>
            {event.damageRoll.bonuses.map((b, i) => (
              <li key={i}>
                {b.source}: +{b.formula}
              </li>
            ))}
          </ul>
          <p>
            São adicionados automaticamente. Digite abaixo apenas os dados base.
          </p>
        </div>
      )}
      <label>
        Dados de dano base
        <input
          aria-label={`Dados de dano de ${event.label}`}
          value={dice}
          maxLength={80}
          required
          disabled={disabled}
          onChange={(e) => setDice(e.target.value)}
          placeholder="Ex.: 2d6+1d4+3"
        />
      </label>
      <div className="actions">
        <button
          className="primary"
          type="submit"
          disabled={disabled || !dice.trim()}
        >
          Rolar dano
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onCommand({ kind: "damage", eventId: event.id, skipDamage: true })
          }
        >
          Sem dano / não acertou
        </button>
      </div>
    </form>
  );
}
