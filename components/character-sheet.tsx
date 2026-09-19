"use client";
import RuleDetails from "./rule-details";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Dices,
  Plus,
  Pencil,
  Download,
  History,
  X,
} from "lucide-react";
import { useGame } from "./game-shell";
import {
  attributes,
  skillAttributes,
  maximums,
  maximumFormula,
  resourceKeys,
  resourceLabels,
  type Agent,
  type Item,
  type Resource,
} from "@/lib/rules";
import { attributeNames } from "@/lib/creation";
import type { Roll } from "@/lib/model";
import { Modal, download } from "./ui";
import AgentEditor from "./agent-editor";
import ItemForm from "./item-form";
import { CatalogPicker } from "./library";
import ConditionManager from "./condition-manager";
import CursePicker from "./curse-picker";
import { effectiveCategory, toEnhancement } from "@/lib/curses";
const sections = [
  "Combate",
  "Perícias",
  "Poderes",
  "Rituais",
  "Inventário",
  "Descrição",
];
export default function CharacterSheet({ id }: { id: string }) {
  const game = useGame(),
    a = game.state.agents.find((x) => x.id === id);
  const [section, setSection] = useState("Combate"),
    [editing, setEditing] = useState(false),
    [item, setItem] = useState<Item | null>(null),
    [catalog, setCatalog] = useState<Item["kind"] | null>(null),
    [result, setResult] = useState<Roll | null>(null),
    [history, setHistory] = useState(false),
    [busy, setBusy] = useState(false),
    [q, setQ] = useState(""),
    [dice, setDice] = useState("1d20"),
    [adjust, setAdjust] = useState<Resource | null>(null),
    [delta, setDelta] = useState(-1),
    [note, setNote] = useState<string | null>(null),
    [useItem, setUseItem] = useState<Item | null>(null),
    [curseTarget, setCurseTarget] = useState<Item | null>(null);
  if (!game.ready) return <div className="page">Carregando ficha…</div>;
  if (!a)
    return (
      <div className="page">
        <h1>Ficha não encontrada neste navegador</h1>
        <p>Importe o arquivo da ficha ou volte para seus personagens.</p>
        <Link href="/">Agentes</Link>
      </div>
    );
  const agent = a,
    max = maximums(a),
    kind: Item["kind"] =
      section === "Combate"
        ? "Arma"
        : section === "Poderes"
          ? "Poder"
          : section === "Rituais"
            ? "Ritual"
            : "Item";
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      game.setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function roll(label: string, attr: number, bonus = 0, expression = "") {
    await run(async () =>
      setResult(await game.roll(agent, label, attr, bonus, expression)),
    );
  }
  function test(s: string, bonus = 0, label = s) {
    void roll(
      label,
      agent.attributes[skillAttributes[s] || "INT"],
      (agent.skills[s] || 0) + bonus,
    );
  }
  async function save(p: Partial<Agent>) {
    await game.save("agents", { ...agent, ...p });
  }
  function add() {
    setItem({
      id: crypto.randomUUID(),
      name: "",
      kind,
      quantity: 1,
      spaces: kind === "Arma" || kind === "Item" ? 1 : 0,
      damage: "",
      notes: "",
    });
  }
  const items = a.inventory.filter((i) =>
    section === "Inventário"
      ? i.kind === "Arma" || i.kind === "Item"
      : i.kind === kind,
  );
  return (
    <div className="page sheet">
      <Link className="back" href="/">
        <ArrowLeft size={16} />
        Agentes
      </Link>
      <div className="sheet-heading">
        <div>
          <p className="eyebrow">FICHA DE PERSONAGEM</p>
          <h1>{a.name}</h1>
          <p>
            {a.origin || "Origem não informada"} · {a.className}
            {a.track && " / " + a.track} ·{" "}
            {a.className === "Sobrevivente"
              ? `Estágio ${a.stage}`
              : `NEX ${a.nex}%`}
          </p>
        </div>
        <div className="actions">
          <button
            onClick={() => download(a.name + ".json", { version: 1, agent: a })}
          >
            <Download size={16} />
            Exportar
          </button>
          <button onClick={() => setEditing(true)}>
            <Pencil size={16} />
            Editar ficha
          </button>
        </div>
      </div>
      <div className="sheet-layout">
        <aside className="sheet-aside">
          <section className="panel">
            <h2>Atributos</h2>
            <p className="hint">Clique para rolar um teste.</p>
            <div className="attribute-dice">
              {attributes.map((k) => (
                <button
                  key={k}
                  disabled={busy}
                  aria-label={"Rolar " + attributeNames[k]}
                  onClick={() => void roll(attributeNames[k], a.attributes[k])}
                >
                  <span>{k}</span>
                  <strong>{a.attributes[k]}</strong>
                  <Dices size={15} />
                </button>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2>Recursos</h2>
            {resourceKeys(a).map((k) => (
              <div className={"sheet-resource " + k} key={k}>
                <div>
                  <label>{resourceLabels[k]}</label>
                  <strong>
                    {a.resources[k]} <small>/ {max[k]}</small>
                  </strong>
                </div>
                <progress
                  aria-label={resourceLabels[k]}
                  value={a.resources[k]}
                  max={max[k] || 1}
                />
                <button
                  className="resource-action"
                  onClick={() => {
                    setAdjust(k);
                    setDelta(-1);
                  }}
                >
                  Ajustar {resourceLabels[k].toLocaleLowerCase()}
                </button>
              </div>
            ))}
            <details className="resource-calculation">
              <summary>Como os máximos são calculados</summary>
              {resourceKeys(a).map((key) => (
                <p key={key}>
                  <strong>
                    {resourceLabels[key]} {max[key]}
                  </strong>
                  <small>{maximumFormula(a, key)}</small>
                </p>
              ))}
            </details>
            <div className="defenses">
              <div>
                Defesa<strong>{10 + a.attributes.AGI + a.defenseBonus}</strong>
              </div>
              <div>
                Esquiva
                <strong>
                  {10 +
                    a.attributes.AGI +
                    a.defenseBonus +
                    (a.skills.Reflexos || 0)}
                </strong>
              </div>
              <div>
                Bloqueio<strong>{a.skills.Fortitude || 0}</strong>
              </div>
            </div>
            <ConditionManager
              conditions={a.conditions}
              onChange={(conditions) => save({ conditions })}
            />
            <p className="hint">
              Confira resistências e bônus situacionais antes de aplicar dano.
            </p>
          </section>
          <section className="panel">
            <h2>Dados livres</h2>
            <div className="inline">
              <input
                aria-label="Expressão de dados"
                value={dice}
                onChange={(e) => setDice(e.target.value)}
              />
              <button
                disabled={busy}
                aria-label="Rolar dados livres"
                onClick={() => void roll("Dados livres", 1, 0, dice)}
              >
                <Dices size={18} />
              </button>
            </div>
            <button className="history-button" onClick={() => setHistory(true)}>
              <History size={16} />
              Histórico de rolagens
            </button>
          </section>
        </aside>
        <div className="sheet-main">
          <nav className="sheet-tabs" aria-label="Seções do personagem">
            {sections.map((s) => (
              <button
                key={s}
                aria-pressed={section === s}
                onClick={() => setSection(s)}
              >
                {s}
              </button>
            ))}
          </nav>
          {section === "Perícias" ? (
            <section className="panel">
              <div className="section-title">
                <h2>Perícias</h2>
                <input
                  aria-label="Buscar perícia"
                  placeholder="Buscar perícia…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <p className="hint">
                O teste usa o atributo indicado e soma o treinamento.
              </p>
              <div className="skill-table">
                {Object.entries(skillAttributes)
                  .filter(([s]) =>
                    s.toLocaleLowerCase().includes(q.toLocaleLowerCase()),
                  )
                  .map(([s, k]) => (
                    <button
                      key={s}
                      disabled={busy}
                      aria-label={"Rolar " + s}
                      onClick={() => test(s)}
                    >
                      <span>{s}</span>
                      <small>
                        {k} {a.attributes[k]}
                      </small>
                      <b>+{a.skills[s] || 0}</b>
                      <Dices size={17} />
                    </button>
                  ))}
              </div>
            </section>
          ) : section === "Descrição" ? (
            <section className="panel">
              <h2>História e anotações</h2>
              <textarea
                aria-label="História e anotações"
                rows={14}
                value={note ?? a.notes}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                disabled={busy || note === null}
                className="primary"
                onClick={() =>
                  void run(async () => {
                    await save({ notes: note ?? a.notes });
                    setNote(null);
                  })
                }
              >
                Salvar anotações
              </button>
            </section>
          ) : (
            <section className="panel">
              <div className="section-title">
                <h2>{section === "Combate" ? "Ataques" : section}</h2>
                <div className="actions">
                  <button onClick={() => setCatalog(kind)}>Biblioteca</button>
                  <button onClick={add}>
                    <Plus size={16} />
                    Adicionar
                  </button>
                </div>
              </div>
              {section === "Combate" && (
                <div className="combat-tests">
                  {[
                    "Iniciativa",
                    "Luta",
                    "Pontaria",
                    "Fortitude",
                    "Reflexos",
                    "Vontade",
                  ].map((s) => (
                    <button disabled={busy} key={s} onClick={() => test(s)}>
                      <Dices size={15} />
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {section === "Inventário" && (
                <p className="help">
                  Espaços ocupados:{" "}
                  <b>
                    {a.inventory
                      .filter((i) => i.kind === "Item" || i.kind === "Arma")
                      .reduce((s, i) => s + i.spaces * i.quantity, 0)}
                  </b>
                  . Capacidade básica:{" "}
                  <b>{a.attributes.FOR === 0 ? 2 : a.attributes.FOR * 5}</b>.
                  Confira modificadores de poderes.
                </p>
              )}
              {items.length === 0 ? (
                <div className="empty">
                  <h3>
                    {section === "Combate"
                      ? "Nenhum ataque cadastrado"
                      : "Nenhum registro nesta seção"}
                  </h3>
                  <p>
                    Escolha conteúdo na Biblioteca ou adicione suas próprias
                    opções.
                  </p>
                  <button className="primary" onClick={() => setCatalog(kind)}>
                    Abrir biblioteca
                  </button>
                </div>
              ) : (
                items.map((i) => (
                  <article key={i.id} className="sheet-item">
                    <div className="section-title">
                      <div>
                        <h3>{i.name}</h3>
                        <p>
                          {i.kind === "Arma"
                            ? `${i.damage || "Dano não definido"} · Crítico ${i.critical || "—"} · ${i.range || "Alcance não definido"} · Categoria ${effectiveCategory(i)}`
                            : i.kind === "Ritual"
                              ? `${i.circle || 1}º círculo · ${i.element || "Elemento não definido"} · ${i.cost || 0} ${a.determination ? "PD" : "PE"}`
                              : `${i.kind} · ${i.quantity} un.`}
                        </p>
                      </div>
                      <button
                        aria-label={"Editar " + i.name}
                        onClick={() => setItem(i)}
                      >
                        <Pencil size={16} />
                      </button>
                    </div>
                    {i.kind === "Arma" && (
                      <>
                        <div className="actions">
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() =>
                              test(
                                i.attackSkill || "Luta",
                                i.attackBonus || 0,
                                "Ataque · " + i.name,
                              )
                            }
                          >
                            <Dices size={16} />
                            Atacar · +
                            {(a.skills[i.attackSkill || "Luta"] || 0) +
                              (i.attackBonus || 0)}
                          </button>
                          <button
                            disabled={busy || !i.damage}
                            onClick={() =>
                              void roll("Dano · " + i.name, 1, 0, i.damage)
                            }
                          >
                            <Dices size={16} />
                            Rolar dano
                          </button>
                          <button onClick={() => setCurseTarget(i)}>
                            Adicionar maldição
                          </button>
                        </div>
                        {!!i.enhancements?.length && (
                          <div className="weapon-curses">
                            <div className="curse-summary">
                              <strong>Maldições aplicadas</strong>
                              <small>
                                Categoria final {effectiveCategory(i)}
                              </small>
                            </div>
                            {i.enhancements.map((enhancement) => (
                              <article key={enhancement.id}>
                                <div>
                                  <strong>{enhancement.name}</strong>
                                  <span>
                                    {[enhancement.element, enhancement.source]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                  <button
                                    aria-label={`Remover ${enhancement.name} de ${i.name}`}
                                    onClick={() =>
                                      void save({
                                        inventory: a.inventory.map((entry) =>
                                          entry.id === i.id
                                            ? {
                                                ...entry,
                                                enhancements: (
                                                  entry.enhancements || []
                                                ).filter(
                                                  (value) =>
                                                    value.id !== enhancement.id,
                                                ),
                                              }
                                            : entry,
                                        ),
                                      })
                                    }
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                                <p>{enhancement.notes}</p>
                              </article>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    {(i.kind === "Ritual" || i.kind === "Poder") && (
                      <>
                        <p className="item-meta">
                          {[i.execution, i.range, i.target, i.duration]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <div className="actions">
                          <button
                            disabled={busy || !i.cost}
                            onClick={() => setUseItem(i)}
                          >
                            Usar · {i.cost || 0} {a.determination ? "PD" : "PE"}
                          </button>
                          {i.damage && (
                            <button
                              disabled={busy}
                              onClick={() => void roll(i.name, 1, 0, i.damage)}
                            >
                              <Dices size={16} />
                              Rolar {i.damage}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                    <RuleDetails item={i} />
                  </article>
                ))
              )}
            </section>
          )}
        </div>
      </div>
      {result && (
        <div className="roll-result" role="status">
          <Dices size={24} />
          <div>
            <strong>{result.label}</strong>
            <small>
              {result.expression} · [{result.dice.join(", ")}]
            </small>
          </div>
          <b>{result.total}</b>
          <button aria-label="Fechar resultado" onClick={() => setResult(null)}>
            <X size={17} />
          </button>
        </div>
      )}
      {editing && (
        <AgentEditor
          agent={a}
          campaigns={game.state.campaigns}
          onSave={async (value) => game.save("agents", value)}
          onClose={() => setEditing(false)}
          onRoll={(_, s) => test(s)}
        />
      )}
      {item && (
        <ItemForm
          item={item}
          onClose={() => setItem(null)}
          onSave={async (i) =>
            save({
              inventory: [...a.inventory.filter((x) => x.id !== i.id), i],
            })
          }
        />
      )}
      {catalog && (
        <CatalogPicker
          kind={catalog}
          onClose={() => setCatalog(null)}
          onChoose={(i) =>
            void run(async () => {
              await save({ inventory: [...agent.inventory, i] });
            })
          }
        />
      )}
      {curseTarget && (
        <CursePicker
          target={curseTarget}
          onClose={() => setCurseTarget(null)}
          onChoose={(curse) =>
            void run(async () => {
              const enhancement = toEnhancement(curse);
              await save({
                inventory: a.inventory.map((entry) =>
                  entry.id === curseTarget.id
                    ? {
                        ...entry,
                        enhancements: [
                          ...(entry.enhancements || []),
                          enhancement,
                        ],
                      }
                    : entry,
                ),
              });
              setCurseTarget(null);
            })
          }
        />
      )}
      {adjust && (
        <Modal
          title={"Ajustar " + resourceLabels[adjust]}
          onClose={() => setAdjust(null)}
        >
          <p>
            Atual: {a.resources[adjust]} / {max[adjust]}
          </p>
          <label>
            Alteração (negativo reduz, positivo recupera)
            <input
              type="number"
              value={delta}
              min={-10000}
              max={10000}
              onChange={(e) => setDelta(+e.target.value)}
            />
          </label>
          <p>
            Após aplicar:{" "}
            <b>
              {Math.max(0, Math.min(max[adjust], a.resources[adjust] + delta))}
            </b>
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await game.adjustResource(agent, adjust, delta);
                setAdjust(null);
              })
            }
          >
            Confirmar ajuste
          </button>
        </Modal>
      )}
      {useItem && (
        <Modal title={"Usar " + useItem.name} onClose={() => setUseItem(null)}>
          <p>
            Gastar {useItem.cost} {a.determination ? "PD" : "PE"}? Resolva
            separadamente os requisitos, testes e efeitos.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const key = agent.determination ? "pd" : "pe";
                if (agent.resources[key] < (useItem.cost || 0))
                  throw Error("Recurso insuficiente.");
                await game.adjustResource(agent, key, -(useItem.cost || 0));
                setUseItem(null);
              })
            }
          >
            Confirmar gasto
          </button>
        </Modal>
      )}
      {history && (
        <Modal title="Histórico de rolagens" onClose={() => setHistory(false)}>
          {game.state.rolls
            .filter((r) => r.agentName === a.name)
            .slice(0, 30)
            .map((r) => (
              <div className="history-row" key={r.id}>
                <div>
                  <strong>{r.label}</strong>
                  <small>
                    {r.expression} · [{r.dice.join(", ")}] ·{" "}
                    {new Date(r.created_at).toLocaleTimeString("pt-BR")}
                  </small>
                </div>
                <b>{r.total}</b>
              </div>
            ))}
        </Modal>
      )}
    </div>
  );
}
