"use client";
import { useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Plus,
  Swords,
  Trash2,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { useGame } from "./game-shell";
import { Modal } from "./ui";
import { ThreatContent, ThreatDetails } from "./threats";
import { parseThreatTest, threatCatalog, type Threat } from "@/lib/threats";
import {
  advanceTurn,
  changeHitPoints,
  participantFromAgent,
  participantFromThreat,
  removeParticipant,
  reorderEncounter,
  sortParticipants,
} from "@/lib/combat";
import {
  getShareCredentials,
  loadSharedAgent,
  saveSharedAgent,
} from "@/lib/share";
import { conditionDefinitions } from "@/lib/conditions";
import type { Agent } from "@/lib/rules";
import type { Encounter, Participant } from "@/lib/model";

export default function CampaignCombat({ campaignId }: { campaignId: string }) {
  const game = useGame();
  const [selected, setSelected] = useState<string | null>(null),
    [name, setName] = useState(""),
    [picker, setPicker] = useState<"threat" | "agent" | "manual" | null>(null),
    [details, setDetails] = useState<Threat | null>(null),
    [busy, setBusy] = useState(false),
    [hpAmount, setHpAmount] = useState("1"),
    [target, setTarget] = useState("");
  const lock = useRef(false);
  const encounters = game.state.encounters.filter(
    (e) => e.campaign_id === campaignId,
  );
  const encounter = encounters.find((e) => e.id === selected) || encounters[0];
  const threats = [...game.state.threats, ...threatCatalog];
  const current = encounter?.participants[encounter.turn];
  const agents = game.state.agents.filter((a) => a.campaign_id === campaignId);
  async function run(action: () => Promise<void>) {
    if (lock.current || game.access.isPlayer || !game.ready) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      game.setNotice((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save(e: Encounter) {
    await game.save("encounters", e);
  }
  async function create() {
    const e: Encounter = {
      id: crypto.randomUUID(),
      campaign_id: campaignId,
      name: name.trim() || `Combate ${encounters.length + 1}`,
      round: 1,
      turn: 0,
      active: false,
      participants: [],
    };
    await save(e);
    setSelected(e.id);
    setName("");
  }
  async function freshAgent(id: string) {
    const local = game.state.agents.find((a) => a.id === id);
    if (!local || local.campaign_id !== campaignId)
      throw Error("A ficha não está vinculada a esta campanha.");
    const token = getShareCredentials(id)?.masterToken;
    if (!token) return { agent: local, token: null };
    const shared = await loadSharedAgent(id, token);
    if (shared.role !== "master" || shared.agent.campaign_id !== campaignId)
      throw Error(
        "É necessária a chave de mestre desta ficha e a mesma campanha.",
      );
    return { agent: shared.agent, token };
  }
  async function add(p: Participant) {
    if (!encounter) return;
    if (
      p.agentId &&
      encounter.participants.some((x) => x.agentId === p.agentId)
    )
      throw Error(
        "Este personagem já participa do combate. Remova-o antes de trocar a face.",
      );
    await save({ ...encounter, participants: [...encounter.participants, p] });
    setPicker(null);
  }
  async function addAgent(a: Agent, alternate: boolean) {
    const { agent } = await freshAgent(a.id);
    if (alternate && agent.alternate?.approvedCampaignId !== campaignId)
      throw Error("Esta face não foi liberada nesta campanha.");
    await add(participantFromAgent(agent, alternate));
  }
  async function updateParticipant(p: Participant) {
    if (!encounter) return;
    await save({
      ...encounter,
      participants: encounter.participants.map((x) => (x.id === p.id ? p : x)),
    });
  }
  async function adjustHp(p: Participant, delta: number) {
    if (!encounter) return;
    let next = changeHitPoints(p, delta);
    if (p.agentId) {
      const { agent, token } = await freshAgent(p.agentId);
      const alternate = p.face === "alternate";
      if (alternate && agent.alternate?.approvedCampaignId !== campaignId)
        throw Error("Esta face não está liberada para a campanha.");
      const actual = participantFromAgent(agent, alternate);
      next = changeHitPoints(
        { ...p, pv: actual.pv, maxPv: actual.maxPv },
        delta,
      );
      const updated: Agent = alternate
        ? {
            ...agent,
            alternate: {
              ...agent.alternate!,
              face: {
                ...agent.alternate!.face,
                resources: { ...agent.alternate!.face.resources, pv: next.pv },
              },
            },
          }
        : { ...agent, resources: { ...agent.resources, pv: next.pv } };
      if (token) await saveSharedAgent(updated, token);
      await game.save("agents", updated);
    }
    await updateParticipant(next);
  }
  async function refreshAgents() {
    if (!encounter) return;
    const participants: Participant[] = [];
    for (const p of encounter.participants) {
      if (!p.agentId) {
        participants.push(p);
        continue;
      }
      const { agent } = await freshAgent(p.agentId);
      const actual = participantFromAgent(agent, p.face === "alternate");
      participants.push({
        ...p,
        pv: actual.pv,
        maxPv: actual.maxPv,
        defense: actual.defense,
        initiativeAttribute: actual.initiativeAttribute,
        initiativeBonus: actual.initiativeBonus,
      });
      await game.save("agents", agent);
    }
    await save({ ...encounter, participants });
    game.setNotice("PV, Defesa e iniciativa atualizados a partir das fichas.");
  }
  async function rollInitiative() {
    if (!encounter) return;
    const participants: Participant[] = [];
    for (const p of encounter.participants) {
      let test;
      if (p.agentId) {
        const { agent } = await freshAgent(p.agentId);
        const actual = participantFromAgent(agent, p.face === "alternate");
        test = {
          attribute: actual.initiativeAttribute!,
          bonus: actual.initiativeBonus!,
        };
      } else test = parseThreatTest(p.initiativeTest || "1d20");
      const roll = await game.roll(
        null,
        `Iniciativa · ${p.name}`,
        test.attribute,
        test.bonus,
        "",
        p.hidden,
        campaignId,
      );
      participants.push({ ...p, initiative: roll.total });
    }
    await save(reorderEncounter({ ...encounter, participants }));
  }
  async function rollThreat(
    p: Participant,
    expression: string,
    label: string,
    damageRoll = false,
  ) {
    const test = damageRoll
      ? { attribute: 1, bonus: 0 }
      : parseThreatTest(expression);
    const roll = await game.roll(
      null,
      `${p.name} · ${label}`,
      test.attribute,
      test.bonus,
      damageRoll ? expression : "",
      p.hidden,
      campaignId,
    );
    game.setNotice(`${p.name} · ${label}: ${roll.total} (${roll.expression})`);
    if (damageRoll) setHpAmount(String(Math.max(0, roll.total)));
  }
  if (!game.ready || !game.access.ready || game.access.isPlayer) return null;
  return (
    <section className="combat" aria-label="Combate da campanha">
      <div className="section-title">
        <h3>
          <Swords size={20} />
          Combate
        </h3>
        <span className="muted small">Salvo neste navegador do mestre</span>
      </div>
      <fieldset disabled={busy} className="combat-controls">
        <div className="combat-toolbar">
          <label>
            Encontro
            <select
              aria-label="Selecionar combate"
              value={encounter?.id || ""}
              onChange={(e) => {
                setSelected(e.target.value);
                setTarget("");
              }}
            >
              <option value="" disabled>
                Selecione um combate
              </option>
              {encounters.map((e) => (
                <option value={e.id} key={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(create);
            }}
          >
            <input
              aria-label="Nome do novo combate"
              placeholder="Nome do combate"
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit">
              <Plus size={16} />
              Criar combate
            </button>
          </form>
        </div>
        {encounter ? (
          <>
            <div className="combat-toolbar">
              <button onClick={() => setPicker("agent")}>
                Adicionar personagem
              </button>
              <button onClick={() => setPicker("threat")}>
                Adicionar ameaça
              </button>
              <button onClick={() => setPicker("manual")}>
                Participante avulso
              </button>
              <button
                disabled={!encounter.participants.length || encounter.active}
                onClick={() => void run(rollInitiative)}
              >
                Rolar iniciativas
              </button>
              <button
                disabled={!encounter.participants.some((p) => p.agentId)}
                onClick={() => void run(refreshAgents)}
              >
                Atualizar fichas
              </button>
              <button
                aria-label="Excluir combate"
                title="Excluir combate"
                onClick={() =>
                  void run(async () => {
                    await game.remove("encounters", encounter.id);
                    setSelected(null);
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="combat-turn" aria-live="polite">
              <div>
                <small>RODADA {encounter.round}</small>
                <h4>
                  {encounter.active
                    ? `Turno de ${current?.name || "—"}`
                    : "Combate pausado"}
                </h4>
                <p className="muted small">
                  {encounter.participants.length} participantes
                </p>
              </div>
              <div className="combat-turn-buttons">
                <button
                  disabled={!encounter.participants.length}
                  onClick={() =>
                    void run(() =>
                      save(
                        encounter.active
                          ? { ...encounter, active: false }
                          : encounter.started
                            ? reorderEncounter({ ...encounter, active: true })
                            : {
                                ...encounter,
                                participants: sortParticipants(
                                  encounter.participants,
                                ),
                                active: true,
                                started: true,
                                turn: 0,
                                round: 1,
                              },
                      ),
                    )
                  }
                >
                  {encounter.active ? "Pausar" : "Iniciar / Retomar"}
                </button>
                <button
                  aria-label="Turno anterior"
                  disabled={
                    !encounter.active ||
                    (encounter.round === 1 && encounter.turn === 0)
                  }
                  onClick={() =>
                    void run(() => save(advanceTurn(encounter, -1)))
                  }
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  disabled={!encounter.active}
                  onClick={() => void run(() => save(advanceTurn(encounter)))}
                >
                  Próximo turno
                  <ChevronRight size={18} />
                </button>
                <button
                  disabled={!encounter.participants.length}
                  onClick={() =>
                    void run(() =>
                      save({
                        ...encounter,
                        participants: sortParticipants(encounter.participants),
                        turn: 0,
                        round: 1,
                        active: false,
                        started: false,
                      }),
                    )
                  }
                >
                  Reiniciar rodadas
                </button>
              </div>
            </div>
            {!encounter.participants.length && (
              <p className="hint">
                Adicione os personagens da campanha e as ameaças para preparar o
                encontro.
              </p>
            )}
            <div className="combat-hp-controls">
              <label>
                Valor de dano ou cura
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  step={1}
                  value={hpAmount}
                  onChange={(e) => setHpAmount(e.target.value)}
                />
              </label>
              <label>
                Alvo
                <select
                  aria-label="Alvo do dano ou cura"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Selecionar alvo</option>
                  {encounter.participants.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={!target || !hpAmount}
                onClick={() =>
                  void run(async () => {
                    const p = encounter.participants.find(
                      (p) => p.id === target,
                    );
                    if (p) await adjustHp(p, -Math.abs(Number(hpAmount)));
                  })
                }
              >
                Aplicar dano
              </button>
              <button
                disabled={!target || !hpAmount}
                onClick={() =>
                  void run(async () => {
                    const p = encounter.participants.find(
                      (p) => p.id === target,
                    );
                    if (p) await adjustHp(p, Math.abs(Number(hpAmount)));
                  })
                }
              >
                Curar
              </button>
            </div>
            <p className="hint">
              Dano e cura em personagens vinculados atualizam a ficha escolhida,
              incluindo NEX 35. Aplique o valor final após resistências,
              imunidades e efeitos especiais.
            </p>
            <ol className="combat-participants">
              {encounter.participants.map((p, index) => {
                const t = threats.find((t) => t.id === p.threatId);
                const conditions = p.conditions
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                return (
                  <li
                    key={p.id}
                    className={
                      encounter.active && current?.id === p.id
                        ? "combat-current"
                        : ""
                    }
                  >
                    <div className="combat-participant-heading">
                      <span className="combat-position">{index + 1}</span>
                      <div>
                        <strong>{p.name}</strong>
                        <small>
                          {p.face === "alternate"
                            ? "Personagem NEX 35"
                            : p.agentId
                              ? "Personagem vinculado"
                              : "Ameaça"}
                          {p.hidden ? " · oculto" : ""}
                          {p.pv === 0 ? " · 0 PV" : ""}
                        </small>
                      </div>
                      <button
                        title={
                          p.hidden
                            ? "Revelar participante"
                            : "Ocultar participante"
                        }
                        aria-label={`${p.hidden ? "Revelar" : "Ocultar"} ${p.name}`}
                        onClick={() =>
                          void run(() =>
                            updateParticipant({ ...p, hidden: !p.hidden }),
                          )
                        }
                      >
                        {p.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button
                        aria-label={`Remover ${p.name}`}
                        onClick={() =>
                          void run(() =>
                            save(removeParticipant(encounter, p.id)),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="combat-participant-values">
                      <label>
                        Iniciativa
                        <input
                          type="number"
                          value={p.initiative}
                          min={-1000}
                          max={10000}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isInteger(n) && n >= -1000 && n <= 10000)
                              void run(() =>
                                save(
                                  reorderEncounter({
                                    ...encounter,
                                    participants: encounter.participants.map(
                                      (x) =>
                                        x.id === p.id
                                          ? { ...x, initiative: n }
                                          : x,
                                    ),
                                  }),
                                ),
                              );
                          }}
                        />
                      </label>
                      <div className="combat-pv">
                        <small>PV</small>
                        <strong>
                          {p.pv} / {p.maxPv}
                        </strong>
                        <progress
                          value={p.pv}
                          max={p.maxPv || 1}
                          aria-label={`PV de ${p.name}`}
                        />
                      </div>
                      <span>
                        Defesa <b>{p.defense ?? "—"}</b>
                      </span>
                      {t && (
                        <button onClick={() => setDetails(t)}>Ver ficha</button>
                      )}
                    </div>
                    <div className="combat-condition-row">
                      <label>
                        Adicionar condição
                        <select
                          aria-label={`Adicionar condição a ${p.name}`}
                          value=""
                          onChange={(e) => {
                            if (e.target.value)
                              void run(() =>
                                updateParticipant({
                                  ...p,
                                  conditions: [
                                    ...new Set([...conditions, e.target.value]),
                                  ].join(", "),
                                }),
                              );
                          }}
                        >
                          <option value="">Selecionar condição</option>
                          {conditionDefinitions
                            .filter((c) => !conditions.includes(c.name))
                            .map((c) => (
                              <option key={c.name}>{c.name}</option>
                            ))}
                        </select>
                      </label>
                      {conditions.map((c) => (
                        <button
                          className="condition-chip"
                          title={
                            conditionDefinitions.find((x) => x.name === c)
                              ?.description
                          }
                          key={c}
                          onClick={() =>
                            void run(() =>
                              updateParticipant({
                                ...p,
                                conditions: conditions
                                  .filter((x) => x !== c)
                                  .join(", "),
                              }),
                            )
                          }
                        >
                          {c} ×
                        </button>
                      ))}
                    </div>
                    {conditions.length > 0 && (
                      <details className="combat-condition-details">
                        <summary>Efeitos das condições</summary>
                        {conditions.map((c) => (
                          <p key={c}>
                            <b>{c}:</b>{" "}
                            {conditionDefinitions.find((x) => x.name === c)
                              ?.description || c}
                          </p>
                        ))}
                      </details>
                    )}
                    {t && t.attacks.length > 0 && (
                      <details className="combat-attacks">
                        <summary>Ataques e rolagens</summary>
                        {t.attacks.map((a, i) => (
                          <div key={i}>
                            <span>{a.name}</span>
                            <button
                              onClick={() =>
                                void run(() =>
                                  rollThreat(p, a.test, `Ataque · ${a.name}`),
                                )
                              }
                            >
                              Teste {a.test}
                            </button>
                            <button
                              onClick={() =>
                                void run(() =>
                                  rollThreat(
                                    p,
                                    a.damage,
                                    `Dano · ${a.name}`,
                                    true,
                                  ),
                                )
                              }
                            >
                              Dano {a.damage}
                            </button>
                          </div>
                        ))}
                      </details>
                    )}
                  </li>
                );
              })}
            </ol>
            <details className="combat-history">
              <summary>Histórico de rolagens do encontro e campanha</summary>
              {game.state.rolls
                .filter((r) => r.campaign_id === campaignId)
                .slice(0, 30)
                .map((r) => (
                  <p key={r.id}>
                    <strong>
                      {r.label}: {r.total}
                    </strong>
                    <small>
                      {r.expression} · dados [{r.dice.join(", ")}] ·{" "}
                      {r.secret ? "mestre" : "visível"}
                    </small>
                  </p>
                ))}
            </details>
          </>
        ) : (
          <p className="hint">
            Crie um combate para organizar iniciativa, rodadas e turnos.
          </p>
        )}
      </fieldset>
      {picker === "threat" && (
        <Modal
          title="Adicionar ameaça ao combate"
          wide
          onClose={() => setPicker(null)}
        >
          <fieldset className="combat-controls" disabled={busy}>
            <ThreatContent
              onChoose={(t) => void run(() => add(participantFromThreat(t)))}
            />
          </fieldset>
        </Modal>
      )}
      {picker === "agent" && (
        <Modal title="Personagens da campanha" onClose={() => setPicker(null)}>
          <fieldset disabled={busy} className="combat-controls">
            {agents.length ? (
              agents.map((a) => (
                <div className="combat-agent-choice" key={a.id}>
                  <strong>{a.name}</strong>
                  <button onClick={() => void run(() => addAgent(a, false))}>
                    Adicionar NEX {a.nex}
                  </button>
                  {a.alternate?.approvedCampaignId === campaignId && (
                    <button onClick={() => void run(() => addAgent(a, true))}>
                      {a.alternate.face.name} · NEX 35
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p>Vincule as fichas à campanha no editor de personagem.</p>
            )}
          </fieldset>
        </Modal>
      )}
      {picker === "manual" && (
        <ManualParticipant
          busy={busy}
          onClose={() => setPicker(null)}
          onAdd={(p) => void run(() => add(p))}
        />
      )}
      {details && (
        <ThreatDetails threat={details} onClose={() => setDetails(null)} />
      )}
    </section>
  );
}
function ManualParticipant({
  busy,
  onClose,
  onAdd,
}: {
  busy: boolean;
  onClose: () => void;
  onAdd: (p: Participant) => void;
}) {
  const [name, setName] = useState(""),
    [pv, setPv] = useState(30),
    [defense, setDefense] = useState(15),
    [initiative, setInitiative] = useState(0);
  return (
    <Modal title="Participante avulso" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAdd({
            id: crypto.randomUUID(),
            name: name.trim(),
            pv,
            maxPv: pv,
            defense,
            initiative,
            hidden: true,
            conditions: "",
            initiativeTest: "1d20",
          });
        }}
      >
        <fieldset disabled={busy} className="combat-controls">
          <label>
            Nome
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label>
              PV máximos
              <input
                required
                type="number"
                min={1}
                max={1000000}
                step={1}
                value={pv}
                onChange={(e) => setPv(Number(e.target.value))}
              />
            </label>
            <label>
              Defesa
              <input
                required
                type="number"
                min={0}
                max={1000000}
                step={1}
                value={defense}
                onChange={(e) => setDefense(Number(e.target.value))}
              />
            </label>
            <label>
              Iniciativa
              <input
                required
                type="number"
                min={-1000}
                max={10000}
                step={1}
                value={initiative}
                onChange={(e) => setInitiative(Number(e.target.value))}
              />
            </label>
          </div>
          <button className="primary">Adicionar participante</button>
        </fieldset>
      </form>
    </Modal>
  );
}
