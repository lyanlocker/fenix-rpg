"use client";
import { useState } from "react";
import { Swords, SlidersHorizontal } from "lucide-react";
import { useGame } from "./game-shell";
import { Modal } from "./ui";
import CombatArena, { CombatEvents, type ArenaView } from "./combat-arena";
import {
  combatFace,
  combatOptions,
  type CombatCommand,
  type CombatRule,
} from "@/lib/combat-actions";
import { participantPortrait } from "@/lib/participant-portrait";
import type { Encounter } from "@/lib/model";
import type { Agent } from "@/lib/rules";

export default function MasterCombatRoom({
  encounter,
  agents,
  busy,
  onCommand,
  save,
}: {
  encounter: Encounter;
  agents: Agent[];
  busy: boolean;
  onCommand: (command: CombatCommand, actorId: string) => Promise<void>;
  save: (encounter: Encounter) => Promise<void>;
}) {
  const game = useGame();
  const [open, setOpen] = useState(false),
    [rules, setRules] = useState(false),
    [error, setError] = useState("");
  const current = encounter.participants[encounter.turn];
  const participant = current?.agentId
    ? current
    : encounter.participants.find((p) => p.agentId);
  const stored = agents.find((a) => a.id === participant?.agentId);
  const agent =
    stored && participant ? combatFace(stored, participant) : undefined;
  const view: ArenaView = {
    id: encounter.id,
    name: encounter.name,
    active: encounter.active,
    round: encounter.round,
    revision: encounter.sharedRevision || 0,
    turnSerial: encounter.turnSerial || 0,
    currentParticipantId: current?.id || null,
    currentName: current?.name || "—",
    budget: participant
      ? encounter.combat?.budgets[participant.id] || null
      : null,
    effects: encounter.combat?.effects || [],
    events: encounter.combat?.events || [],
    rules: encounter.combatRules || {},
    participants: encounter.participants.map((p) => ({
      ...p,
      mine: p.id === participant?.id,
      isAgent: !!p.agentId,
      face: p.face || null,
      initiativeRolled: !!p.initiativeRolled,
    })),
    portraits: Object.fromEntries(
      encounter.participants.map((p) => {
        const art = participantPortrait(
          p,
          agents,
          game.allThreats,
          game.threatLibrary.library.art,
        );
        return [p.id, art.thumbnail || art.portrait];
      }),
    ),
  };
  async function act(command: CombatCommand, actorId = participant?.id) {
    if (!actorId || busy) return;
    setError("");
    try {
      await onCommand(command, actorId);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <section className="master-arena-controls">
      <div className="combat-toolbar">
        <button disabled={!encounter.started} onClick={() => setOpen(true)}>
          <Swords size={17} /> Sala interativa
        </button>
        <button onClick={() => setRules(true)}>
          <SlidersHorizontal size={17} /> Efeitos de itens e habilidades
        </button>
        <small>
          {
            encounter.participants.filter(
              (p) => p.agentId && p.playerAccess !== false,
            ).length
          }{" "}
          jogadores selecionados
        </small>
      </div>
      {error && (
        <p role="alert" className="hint arena-error">
          {error}
        </p>
      )}
      {!!encounter.combat?.events.length && (
        <details className="arena-master-log">
          <summary>
            Ações dos jogadores ·{" "}
            {
              encounter.combat.events.filter((e) => e.pending && !e.resolved)
                .length
            }{" "}
            pendentes
          </summary>
          <CombatEvents
            events={encounter.combat.events}
            disabled={busy}
            resolve={(c, id) => void act(c, id)}
          />
        </details>
      )}
      {open && (
        <Modal
          title="Sala de combate · mestre"
          wide
          className="arena-modal"
          onClose={() => setOpen(false)}
        >
          {!current?.agentId && (
            <p className="hint">
              Turno de ameaça: use os ataques e o botão Próximo turno nos
              controles da campanha.
            </p>
          )}
          <CombatArena
            key={participant?.id}
            combat={view}
            agent={agent}
            master
            busy={busy}
            error={error}
            onCommand={(c) => void act(c)}
          />
          <details>
            <summary>Resolver ações pendentes</summary>
            <CombatEvents
              events={view.events}
              disabled={busy}
              resolve={(c, id) => void act(c, id)}
            />
          </details>
        </Modal>
      )}
      {rules && (
        <CombatRuleEditor
          encounter={encounter}
          agents={agents}
          busy={busy}
          save={save}
          onClose={() => setRules(false)}
        />
      )}
    </section>
  );
}

function CombatRuleEditor({
  encounter,
  agents,
  busy,
  save,
  onClose,
}: {
  encounter: Encounter;
  agents: Agent[];
  busy: boolean;
  save: (e: Encounter) => Promise<void>;
  onClose: () => void;
}) {
  const items = encounter.participants.flatMap((p) => {
    const stored = agents.find((a) => a.id === p.agentId);
    if (!stored) return [];
    const face = combatFace(stored, p);
    const options = new Map(combatOptions(face).map((o) => [o.id, o]));
    return face.inventory
      .filter((i) => i.kind !== "Arma")
      .map((item) => ({ item, owner: p.name, option: options.get(item.id) }));
  });
  const [id, setId] = useState(""),
    [rule, setRule] = useState<CombatRule | null>(null),
    [error, setError] = useState("");
  const source = items.find((i) => i.item.id === id);
  function choose(id: string) {
    const source = items.find((i) => i.item.id === id);
    setId(id);
    setError("");
    setRule(
      source
        ? encounter.combatRules?.[id] || {
            itemId: id,
            name: source.item.name,
            action: source.option?.action || "standard",
            pe: source.option?.pe ?? source.item.cost ?? 0,
            effect: source.option?.effect === "grant" ? "grant" : "heal",
            formula: source.option?.formula || "1d6",
            grant: source.option?.grant || "standard",
            target:
              source.option?.target && source.option.target !== "none"
                ? source.option.target
                : "ally",
            timing: source.option?.timing || "now",
            limit: source.option?.limit || "turn",
            consume:
              source.option?.consume ??
              (source.item.kind === "Item" &&
                source.option?.effect !== "grant"),
            medicine: false,
            difficulty: 20,
            noRitual: !!source.option?.noRitual,
            note: source.item.notes.slice(0, 600),
          }
        : null,
    );
  }
  const update = (patch: Partial<CombatRule>) =>
    setRule((r) => (r ? { ...r, ...patch } : r));
  async function submit(remove = false) {
    if (!rule) return;
    setError("");
    if (
      !remove &&
      rule.effect === "heal" &&
      !/^(?:[1-9]\d?|100)d(?:[2-9]|[1-9]\d{1,3})(?:[+-]\d{1,4})?$/.test(
        rule.formula || "",
      )
    ) {
      setError("Use uma fórmula de 1 a 100 dados, como 2d8+2.");
      return;
    }
    const rules = { ...encounter.combatRules };
    if (remove) delete rules[id];
    else rules[id] = rule;
    try {
      await save({ ...encounter, combatRules: rules });
      onClose();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <Modal title="Efeitos de itens e habilidades" wide onClose={onClose}>
      <p className="hint">
        Configure efeitos que dependem da sua mesa, como uma bandagem
        personalizada. Use o custo, o teste e os limites da regra adotada. A
        configuração vale para este encontro e substitui o efeito automático
        deste item. Riscos especiais e condições da cena continuam sob decisão
        do mestre.
      </p>
      <label>
        Item presente na ficha
        <select value={id} onChange={(e) => choose(e.target.value)}>
          <option value="">Selecione</option>
          {items.map(({ item, owner }) => (
            <option key={item.id} value={item.id}>
              {owner} · {item.name}
            </option>
          ))}
        </select>
      </label>
      {source && (
        <details>
          <summary>Texto da ficha</summary>
          <p className="preserve">{source.item.notes}</p>
        </details>
      )}
      {rule && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset disabled={busy} className="combat-controls arena-rule-grid">
            <label>
              Efeito
              <select
                value={rule.effect}
                onChange={(e) =>
                  update({ effect: e.target.value as CombatRule["effect"] })
                }
              >
                <option value="heal">Curar PV</option>
                <option value="grant">Conceder ação</option>
              </select>
            </label>
            <label>
              Ação para usar
              <select
                value={rule.action}
                onChange={(e) =>
                  update({ action: e.target.value as CombatRule["action"] })
                }
              >
                <option value="standard">Padrão</option>
                <option value="move">Movimento</option>
                <option value="free">Livre</option>
                <option value="full">Completa</option>
              </select>
            </label>
            <label>
              Custo em PE / PD
              <input
                type="number"
                min={0}
                max={999}
                required
                value={rule.pe}
                onChange={(e) => update({ pe: Number(e.target.value) })}
              />
            </label>
            <label>
              Alvo
              <select
                value={rule.target}
                onChange={(e) =>
                  update({ target: e.target.value as CombatRule["target"] })
                }
              >
                <option value="self">O próprio usuário</option>
                <option value="ally">Personagem aliado</option>
                <option value="any">Qualquer participante visível</option>
              </select>
            </label>
            {rule.effect === "heal" ? (
              <label>
                Rolagem de cura
                <input
                  required
                  value={rule.formula || ""}
                  maxLength={20}
                  onChange={(e) => update({ formula: e.target.value })}
                />
              </label>
            ) : (
              <>
                <label>
                  Ação concedida
                  <select
                    value={rule.grant}
                    onChange={(e) =>
                      update({ grant: e.target.value as CombatRule["grant"] })
                    }
                  >
                    <option value="standard">Padrão</option>
                    <option value="move">Movimento</option>
                    <option value="attack">Apenas ataque</option>
                    <option value="free">Livre (sem cota fixa)</option>
                  </select>
                </label>
                <label>
                  Quando fica disponível
                  <select
                    value={rule.timing}
                    onChange={(e) =>
                      update({ timing: e.target.value as CombatRule["timing"] })
                    }
                  >
                    <option value="now">Agora / no turno do alvo</option>
                    <option value="next">Próximo turno do alvo</option>
                    <option value="scene">
                      Cada turno até encerrar o efeito
                    </option>
                    <option value="sustained">
                      Cada turno, sustentação de 1 PE/PD
                    </option>
                  </select>
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={rule.noRitual}
                    onChange={(e) => update({ noRitual: e.target.checked })}
                  />{" "}
                  Ação adicional não permite ritual
                </label>
              </>
            )}
            <label>
              Limite de uso
              <select
                value={rule.limit}
                onChange={(e) =>
                  update({ limit: e.target.value as CombatRule["limit"] })
                }
              >
                <option value="turn">Uma vez por turno</option>
                <option value="round">Uma vez por rodada</option>
                <option value="scene">Uma vez na cena</option>
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={rule.consume}
                onChange={(e) => update({ consume: e.target.checked })}
              />{" "}
              Consome uma unidade do item
            </label>
            {rule.effect === "heal" && (
              <>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={rule.medicine}
                    onChange={(e) => update({ medicine: e.target.checked })}
                  />{" "}
                  Exige teste de Medicina com INT
                </label>
                {rule.medicine && (
                  <label>
                    DT de Medicina
                    <input
                      type="number"
                      min={1}
                      max={100}
                      required
                      value={rule.difficulty}
                      onChange={(e) =>
                        update({ difficulty: Number(e.target.value) })
                      }
                    />
                  </label>
                )}
              </>
            )}
            <label className="span-all">
              Regra adotada
              <textarea
                value={rule.note}
                maxLength={600}
                onChange={(e) => update({ note: e.target.value })}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <button className="primary" type="submit">
              Salvar efeito
            </button>
            {encounter.combatRules?.[id] && (
              <button type="button" onClick={() => void submit(true)}>
                Restaurar efeito padrão
              </button>
            )}
          </fieldset>
        </form>
      )}
    </Modal>
  );
}
