"use client";
import RuleDetails from "./rule-details";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Dices,
  Plus,
  Pencil,
  Trash2,
  Download,
  History,
  Copy,
  X,
} from "lucide-react";
import { useGame } from "./game-shell";
import {
  attributes,
  skillAttributes,
  skillBonus,
  effectiveAttributes,
  carryingCapacity,
  inventorySpaces,
  accessoryType,
  activeAccessories,
  accessoryDefenseBonus,
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
import WeaponModificationPicker from "./weapon-modification-picker";
import { effectiveCategory, toEnhancement } from "@/lib/curses";
import {
  hasWeaponModification,
  toWeaponModification,
  weaponAttackBonus,
  weaponCritical,
  weaponDamage,
  weaponRange,
  weaponSpaces,
  type WeaponModification,
} from "@/lib/weapon-modifications";
import { canAccessAgent } from "@/lib/access";
import {
  alternateAgent,
  alternateIsApproved,
  faceFromAgent,
  validateAlternateFace,
  isAllowedAtNex,
} from "@/lib/alternate";
import CharacterOverview from "./character-overview";
import DiceRoller from "./dice-roller";
import {
  getShareCredentials,
  loadSharedAgent,
  publishSharedAgent,
} from "@/lib/share";
const sections = [
  "Resumo",
  "Armas",
  "Perícias",
  "Poderes",
  "Rituais",
  "Inventário",
  "Descrição",
];
export default function CharacterSheet({ id }: { id: string }) {
  const game = useGame(),
    stored = game.state.agents.find((x) => x.id === id);
  const [otherFace, setOtherFace] = useState(false),
    [section, setSection] = useState("Resumo"),
    [editing, setEditing] = useState(false),
    [item, setItem] = useState<Item | null>(null),
    [catalog, setCatalog] = useState<Item["kind"] | null>(null),
    [result, setResult] = useState<Roll | null>(null),
    [history, setHistory] = useState(false),
    [busy, setBusy] = useState(false),
    [q, setQ] = useState(""),
    [adjust, setAdjust] = useState<Resource | null>(null),
    [delta, setDelta] = useState(-1),
    [note, setNote] = useState<string | null>(null),
    [useItem, setUseItem] = useState<Item | null>(null),
    [curseTarget, setCurseTarget] = useState<Item | null>(null),
    [modificationTarget, setModificationTarget] = useState<Item | null>(null),
    [sharedToken, setSharedToken] = useState<string | null>(null),
    [sharedError, setSharedError] = useState("");
  const campaign = game.state.campaigns.find(
      (entry) => entry.id === stored?.campaign_id,
    ),
    faceAvailable = !!stored && alternateIsApproved(stored, campaign),
    a = stored && otherFace && faceAvailable ? alternateAgent(stored) : stored;
  useEffect(() => {
    if (!game.access.ready) return;
    const token =
      game.access.shareToken ||
      sharedToken ||
      getShareCredentials(id)?.masterToken ||
      null;
    setSharedToken(token);
    setSharedError("");
    if (!token) return;

    let active = true;
    async function refresh() {
      try {
        const shared = await loadSharedAgent(id, token as string);
        if (!active) return;
        game.mergeSharedAgent(shared.agent, shared.rolls);
        setSharedError("");
      } catch (reason) {
        if (active) setSharedError((reason as Error).message);
      }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 2500);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [
    game.access.ready,
    game.access.shareToken,
    game.mergeSharedAgent,
    id,
    sharedToken,
  ]);
  if (!game.ready || !game.access.ready)
    return <div className="page">Carregando ficha…</div>;
  if (!canAccessAgent(game.access, id))
    return (
      <div className="page">
        <h1>Acesso bloqueado</h1>
        <p>Este link de jogador não autoriza o acesso a esta ficha.</p>
        {game.access.agentId && (
          <Link href={game.accessHref(`/agentes/${game.access.agentId}`)}>
            Abrir minha ficha
          </Link>
        )}
      </div>
    );
  if (!a && (game.access.shareToken || sharedToken))
    return (
      <div className="page">
        <h1>
          {sharedError
            ? "Não foi possível abrir a ficha compartilhada"
            : "Carregando ficha compartilhada…"}
        </h1>
        {sharedError && <p>{sharedError}</p>}
      </div>
    );
  if (!a)
    return (
      <div className="page">
        <h1>Link de jogador antigo ou incompleto</h1>
        <p>Peça ao mestre para clicar novamente em “Link do jogador”.</p>
        <Link href={game.accessHref("/")}>Agentes</Link>
      </div>
    );
  const agent = a,
    max = maximums(a),
    effective = effectiveAttributes(a),
    kind: Item["kind"] =
      section === "Armas"
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
      setResult(
        await game.roll(
          agent,
          label,
          attr,
          bonus,
          expression,
          false,
          null,
          game.access.shareToken || undefined,
        ),
      ),
    );
  }
  function test(s: string, bonus = 0, label = s) {
    void roll(
      label,
      effectiveAttributes(agent)[skillAttributes[s] || "INT"],
      skillBonus(agent, s).total + bonus,
    );
  }
  async function save(p: Partial<Agent>) {
    const updated =
      otherFace && faceAvailable && stored?.alternate
        ? {
            ...stored,
            alternate: {
              ...stored.alternate,
              face: faceFromAgent({ ...agent, ...p, nex: 35 }),
            },
          }
        : { ...agent, ...p };
    if (otherFace && faceAvailable && updated.alternate)
      validateAlternateFace(updated.alternate.face);
    await game.syncSharedAgent(updated, game.access.shareToken || undefined);
    await game.save("agents", updated);
  }
  async function changeResource(key: Resource, change: number) {
    if (!Number.isInteger(change) || Math.abs(change) > 10000)
      throw Error("Informe uma alteração inteira entre -10000 e 10000.");
    if (otherFace && faceAvailable) {
      await save({
        resources: {
          ...agent.resources,
          [key]: Math.max(
            0,
            Math.min(maximums(agent)[key], agent.resources[key] + change),
          ),
        },
      });
    } else {
      await game.adjustResource(
        agent,
        key,
        change,
        game.access.shareToken || undefined,
      );
    }
  }
  function removeItem(itemId: string) {
    void run(() =>
      save({
        inventory: agent.inventory.filter((entry) => entry.id !== itemId),
      }),
    );
  }
  async function copyPlayerLink() {
    await run(async () => {
      const credentials = await publishSharedAgent(stored || agent);
      setSharedToken(credentials.masterToken);
      const url = new URL(window.location.origin + `/agentes/${agent.id}`);
      url.searchParams.set("mode", "player");
      url.searchParams.set("agent", agent.id);
      url.searchParams.set("share", credentials.playerToken);
      await navigator.clipboard.writeText(url.toString());
      game.setNotice(
        "Ficha publicada e link do jogador copiado. Alterações e rolagens serão sincronizadas.",
      );
    });
  }
  function add() {
    setItem({
      id: crypto.randomUUID(),
      name: "",
      kind,
      quantity: 1,
      spaces: kind === "Arma" || kind === "Item" ? 1 : 0,
      category: kind === "Arma" ? "0" : undefined,
      damage: "",
      notes: "",
    });
  }
  function addAccessory(type: "Vestimenta" | "Utensílio") {
    setItem({
      id: crypto.randomUUID(),
      name: type,
      kind: "Item",
      accessoryType: type,
      equipped:
        type !== "Vestimenta" ||
        activeAccessories(agent).filter(
          (i) => accessoryType(i) === "Vestimenta",
        ).length < 2,
      quantity: 1,
      spaces: 1,
      damage: "",
      notes: "",
      category: "I",
      accessoryBonus: 2,
    });
  }
  const items = a.inventory.filter((i) =>
    section === "Inventário"
      ? i.kind === "Item" && i.subtype !== "Maldição"
      : section === "Armas"
        ? i.kind === "Arma" || !!accessoryType(i)
        : i.kind === kind,
  );
  return (
    <div
      className={`page sheet ${otherFace && faceAvailable ? "alternate-face" : ""}`}
    >
      <DiceRoller
        busy={busy}
        onRoll={(expression) => roll("Dados livres", 1, 0, expression)}
      />
      <Link className="back" href={game.accessHref("/")}>
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
          {!game.access.isPlayer && (
            <button onClick={() => void copyPlayerLink()}>
              <Copy size={16} />
              Link do jogador
            </button>
          )}
          <button
            onClick={() =>
              download(a.name + ".json", { version: 1, agent: stored || a })
            }
          >
            <Download size={16} />
            Exportar
          </button>
          <button onClick={() => setEditing(true)}>
            <Pencil size={16} />
            Editar ficha
          </button>
          <button onClick={() => setHistory(true)}>
            <History size={16} />
            Histórico
          </button>
        </div>
      </div>
      <div
        className={`sheet-layout ${section === "Resumo" ? "overview-mode" : ""}`}
      >
        {section !== "Resumo" && (
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
                    onClick={() => void roll(attributeNames[k], effective[k])}
                  >
                    <span>{k}</span>
                    <strong>{effective[k]}</strong>
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
                  Defesa
                  <strong>
                    {10 +
                      effective.AGI +
                      a.defenseBonus +
                      accessoryDefenseBonus(a)}
                  </strong>
                </div>
                <div>
                  Esquiva
                  <strong>
                    {10 +
                      effective.AGI +
                      a.defenseBonus +
                      accessoryDefenseBonus(a) +
                      skillBonus(a, "Reflexos").total}
                  </strong>
                </div>
                <div>
                  Bloqueio<strong>{skillBonus(a, "Fortitude").total}</strong>
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
          </aside>
        )}
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
          {section === "Resumo" ? (
            <CharacterOverview
              agent={a}
              maximums={max}
              busy={busy}
              onAttribute={(key) =>
                void roll(attributeNames[key], a.attributes[key])
              }
              onSkill={(name) => test(name)}
              onPortrait={(portrait) => save({ portrait })}
              onDoubleClickFace={
                faceAvailable
                  ? () => {
                      setOtherFace((current) => !current);
                      setSection("Resumo");
                      setResult(null);
                    }
                  : undefined
              }
            />
          ) : section === "Perícias" ? (
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
                O teste soma treinamento, ajuste de poder e bônus de acessórios
                ativos.
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
                      aria-label={`Rolar ${s}, bônus total ${skillBonus(a, s).total}`}
                      title={`Treinamento +${skillBonus(a, s).training}; poder ${skillBonus(a, s).adjustment >= 0 ? "+" : ""}${skillBonus(a, s).adjustment}${skillBonus(
                        a,
                        s,
                      )
                        .sources.map(
                          (source) => `; ${source.name} +${source.bonus}`,
                        )
                        .join("")}`}
                      onClick={() => test(s)}
                    >
                      <span>{s}</span>
                      <small>
                        {k} {a.attributes[k]}
                      </small>
                      <b>+{skillBonus(a, s).total}</b>
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
                <h2>{section}</h2>
                <div className="actions">
                  <button onClick={() => setCatalog(kind)}>Biblioteca</button>
                  <button onClick={add}>
                    <Plus size={16} />
                    Adicionar
                  </button>
                </div>
              </div>
              {section === "Armas" && (
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
                  Espaços ocupados: <b>{inventorySpaces(a)}</b>. Capacidade:{" "}
                  <b>{carryingCapacity(a)}</b>
                  {effective.FOR !== a.attributes.FOR
                    ? " (inclui +1 de Força por Pujança ativa)"
                    : ""}
                  .
                  {inventorySpaces(a) > carryingCapacity(a)
                    ? " Sobrecarregado: penalidade de carga; confira com o mestre."
                    : ""}
                </p>
              )}
              {section === "Armas" && (
                <div className="accessory-toolbar">
                  <strong>Acessórios</strong>
                  <span>
                    Vestimentas e utensílios também aparecem aqui para
                    configurar perícias e maldições.
                  </span>
                  <div className="actions">
                    <button onClick={() => addAccessory("Vestimenta")}>
                      + Vestimenta
                    </button>
                    <button onClick={() => addAccessory("Utensílio")}>
                      + Utensílio
                    </button>
                    <button onClick={() => setCatalog("Item")}>
                      Buscar na biblioteca
                    </button>
                  </div>
                </div>
              )}
              {items.length === 0 ? (
                <div className="empty">
                  <h3>
                    {section === "Armas"
                      ? "Nenhuma arma cadastrada"
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
                          {accessoryType(i)
                            ? `${accessoryType(i)} · ${i.equipped === false ? "sem uso" : "em uso"} · ${i.accessorySkill || "perícia a definir"} +${i.accessoryBonus || 2} · Categoria ${effectiveCategory(i)}`
                            : i.kind === "Arma"
                              ? `${weaponDamage(i) || "Dano não definido"} · Crítico ${weaponCritical(i) || "—"} · ${weaponRange(i) || "Alcance não definido"} · ${weaponSpaces(i)} espaços · Categoria ${effectiveCategory(i)}`
                              : i.kind === "Ritual"
                                ? `${i.circle || 1}º círculo · ${i.element || "Elemento não definido"} · ${i.cost || 0} ${a.determination ? "PD" : "PE"}`
                                : `${i.kind} · ${i.quantity} un.`}
                        </p>
                      </div>
                      <div className="item-controls">
                        <button
                          disabled={busy}
                          aria-label={"Editar " + i.name}
                          onClick={() => setItem(i)}
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          disabled={busy}
                          aria-label={"Remover " + i.name + " da ficha"}
                          title="Remover da ficha"
                          onClick={() => removeItem(i.id)}
                        >
                          <Trash2 size={16} /> Remover
                        </button>
                      </div>
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
                                weaponAttackBonus(i),
                                "Ataque · " + i.name,
                              )
                            }
                          >
                            <Dices size={16} />
                            Atacar · +
                            {skillBonus(a, i.attackSkill || "Luta").total +
                              weaponAttackBonus(i)}
                          </button>
                          <button
                            disabled={busy || !weaponDamage(i)}
                            onClick={() =>
                              void roll(
                                "Dano · " + i.name,
                                1,
                                0,
                                weaponDamage(i),
                              )
                            }
                          >
                            <Dices size={16} />
                            Rolar dano
                          </button>
                          <button onClick={() => setCurseTarget(i)}>
                            Adicionar maldição
                          </button>
                          <button onClick={() => setModificationTarget(i)}>
                            Adicionar modificação
                          </button>
                        </div>
                        {!!i.enhancements?.length && (
                          <div className="weapon-curses">
                            <div className="curse-summary">
                              <strong>
                                Maldições e modificações aplicadas
                              </strong>
                              <small>
                                Categoria final {effectiveCategory(i)}
                              </small>
                            </div>
                            {i.enhancements.map((enhancement) => (
                              <article key={enhancement.id}>
                                <div>
                                  <strong>{enhancement.name}</strong>
                                  <span>
                                    {[
                                      enhancement.subtype,
                                      enhancement.element,
                                      enhancement.source,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                  <button
                                    disabled={busy}
                                    aria-label={`Remover ${enhancement.name} de ${i.name}`}
                                    onClick={() =>
                                      void run(() =>
                                        save({
                                          inventory: a.inventory.map((entry) =>
                                            entry.id === i.id
                                              ? {
                                                  ...entry,
                                                  enhancements: (
                                                    entry.enhancements || []
                                                  ).filter(
                                                    (value) =>
                                                      value.id !==
                                                      enhancement.id,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        }),
                                      )
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
                    {!!accessoryType(i) && (
                      <>
                        <div className="actions">
                          <button
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                if (
                                  i.equipped === false &&
                                  accessoryType(i) === "Vestimenta" &&
                                  activeAccessories(a).filter(
                                    (entry) =>
                                      accessoryType(entry) === "Vestimenta",
                                  ).length >= 2
                                )
                                  throw Error(
                                    "Você já tem duas vestimentas ativas. Desative uma antes.",
                                  );
                                await save({
                                  inventory: a.inventory.map((entry) =>
                                    entry.id === i.id
                                      ? {
                                          ...entry,
                                          equipped: i.equipped === false,
                                        }
                                      : entry,
                                  ),
                                });
                              })
                            }
                          >
                            {i.equipped === false
                              ? accessoryType(i) === "Vestimenta"
                                ? "Vestir"
                                : "Empunhar"
                              : "Desativar bônus"}
                          </button>
                          <button onClick={() => setCurseTarget(i)}>
                            Adicionar maldição
                          </button>
                        </div>
                        <p className="item-meta">
                          {i.accessorySkill
                            ? `${i.accessorySkill} +${i.accessoryBonus || 2}`
                            : "Configure a perícia no editor."}
                          {i.extraSkill
                            ? ` · ${i.extraSkill} +${i.extraBonus || 2} (função adicional)`
                            : ""}
                        </p>
                        {!!i.enhancements?.length && (
                          <div className="weapon-curses">
                            <strong>
                              Maldições no acessório · categoria{" "}
                              {effectiveCategory(i)}
                            </strong>
                            {i.enhancements.map((enhancement) => (
                              <article key={enhancement.id}>
                                <div>
                                  <strong>{enhancement.name}</strong>
                                  <button
                                    aria-label={`Remover ${enhancement.name} de ${i.name}`}
                                    onClick={() =>
                                      void run(async () =>
                                        save({
                                          inventory: a.inventory.map((entry) =>
                                            entry.id === i.id
                                              ? {
                                                  ...entry,
                                                  enhancements: (
                                                    entry.enhancements || []
                                                  ).filter(
                                                    (value) =>
                                                      value.id !==
                                                      enhancement.id,
                                                  ),
                                                }
                                              : entry,
                                          ),
                                        }),
                                      )
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
          lockedNex={otherFace && faceAvailable ? 35 : undefined}
          onSave={(value) => save(value)}
          onClose={() => setEditing(false)}
          onRoll={(_, s) => test(s)}
        />
      )}
      {item && (
        <ItemForm
          item={item}
          requireCircle={otherFace && faceAvailable}
          onClose={() => setItem(null)}
          onSave={async (i) => {
            if (
              otherFace &&
              faceAvailable &&
              !isAllowedAtNex(i, a.className, 35)
            )
              throw Error(
                "Este ritual ou poder não está disponível no NEX 35%.",
              );
            const inventory = [...a.inventory.filter((x) => x.id !== i.id), i];
            const equipped = inventory.filter(
              (entry) =>
                accessoryType(entry) === "Vestimenta" &&
                entry.equipped !== false,
            );
            if (
              equipped.length > 2 &&
              accessoryType(i) === "Vestimenta" &&
              i.equipped !== false
            )
              throw Error(
                "No máximo duas vestimentas podem conceder bônus ao mesmo tempo.",
              );
            await save({ inventory });
          }}
        />
      )}
      {catalog && (
        <CatalogPicker
          kind={catalog}
          onClose={() => setCatalog(null)}
          onChoose={(i) =>
            void run(async () => {
              if (
                otherFace &&
                faceAvailable &&
                i.kind === "Ritual" &&
                !i.circle
              ) {
                setCatalog(null);
                setItem(i);
                game.setNotice(
                  "Defina o círculo deste ritual antes de adicioná-lo à face NEX 35%.",
                );
                return;
              }
              if (
                otherFace &&
                faceAvailable &&
                !isAllowedAtNex(i, a.className, 35)
              )
                throw Error(
                  "Este ritual ou poder não está disponível no NEX 35%.",
                );
              const type = accessoryType(i);
              const worn = activeAccessories(a).filter(
                (entry) => accessoryType(entry) === "Vestimenta",
              ).length;
              const added = type
                ? {
                    ...i,
                    accessoryType: type,
                    equipped: type !== "Vestimenta" || worn < 2,
                  }
                : i;
              await save({ inventory: [...agent.inventory, added] });
              if (type)
                game.setNotice(
                  `Acessório adicionado. Edite ${added.name} para escolher a perícia e o bônus.`,
                );
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
      {modificationTarget && (
        <WeaponModificationPicker
          target={modificationTarget}
          busy={busy}
          onClose={() => setModificationTarget(null)}
          onChoose={(modification: WeaponModification) =>
            void run(async () => {
              const target = a.inventory.find(
                (entry) => entry.id === modificationTarget.id,
              );
              if (!target || target.kind !== "Arma")
                throw Error("Arma não encontrada na ficha.");
              if (hasWeaponModification(target, modification.name))
                throw Error("Essa modificação já foi aplicada à arma.");
              await save({
                inventory: a.inventory.map((entry) =>
                  entry.id === target.id
                    ? {
                        ...entry,
                        enhancements: [
                          ...(entry.enhancements || []),
                          toWeaponModification(modification),
                        ],
                      }
                    : entry,
                ),
              });
              setModificationTarget(null);
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
                await changeResource(adjust, delta);
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
                await changeResource(key, -(useItem.cost || 0));
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
