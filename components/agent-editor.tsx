"use client";
import { useState } from "react";
import { Dices, Plus, Trash2, Download, Shield } from "lucide-react";
import {
  attributes,
  skillAttributes,
  maximums,
  maximumFormula,
  carryingCapacity,
  inventorySpaces,
  skillBonus,
  effectiveAttributes,
  accessoryDefenseBonus,
  resourceLabels,
  resourceKeys,
  type Agent,
  type ClassName,
  type Item,
  type Resource,
} from "@/lib/rules";
import type { Campaign } from "@/lib/model";
import { Modal, download } from "./ui";
import CharacterOptions from "./character-options";
import PortraitPicker from "./portrait-picker";
export default function AgentEditor({
  agent,
  campaigns,
  onSave,
  onClose,
  onRoll,
  readOnly = false,
  lockedNex,
}: {
  agent: Agent;
  campaigns: Campaign[];
  onSave: (a: Agent) => Promise<void>;
  onClose: () => void;
  onRoll: (a: Agent, s: string) => void;
  readOnly?: boolean;
  lockedNex?: number;
}) {
  const [a, setA] = useState<Agent>(() => structuredClone(agent)),
    [tab, setTab] = useState("Ficha"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const max = maximums(a);
  function update<K extends keyof Agent>(k: K, v: Agent[K]) {
    setA((p) => ({ ...p, [k]: v }));
  }
  async function save() {
    setError("");
    if (!a.name.trim()) return setError("Informe o nome do agente.");
    setBusy(true);
    try {
      await onSave({
        ...a,
        name: a.name.trim(),
        resources: Object.fromEntries(
          Object.entries(a.resources).map(([k, v]) => [
            k,
            Math.min(max[k as Resource], Math.max(0, v)),
          ]),
        ) as Agent["resources"],
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function itemUpdate(id: string, patch: Partial<Item>) {
    update(
      "inventory",
      a.inventory.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
  }
  return (
    <Modal wide title={a.name || "Novo agente"} onClose={onClose}>
      <nav className="tabs" aria-label="Seções da ficha">
        {["Ficha", "Perícias", "Inventário", "Anotações"].map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <fieldset disabled={readOnly || busy} className="editor-fields">
        {tab === "Ficha" ? (
          <>
            <PortraitPicker
              compact
              value={a.portrait}
              name={a.name}
              color={a.color}
              onChange={(portrait) => update("portrait", portrait)}
            />
            <div className="form-grid">
              <label>
                Nome
                <input
                  value={a.name}
                  maxLength={100}
                  onChange={(e) => update("name", e.target.value)}
                />
              </label>
              <label>
                Classe
                <select
                  value={a.className}
                  onChange={(e) => {
                    const cls = e.target.value as ClassName;
                    setA((p) => ({
                      ...p,
                      className: cls,
                      track: "",
                      trackId: undefined,
                      nex:
                        lockedNex ??
                        (cls === "Sobrevivente" ? 0 : Math.max(5, p.nex)),
                    }));
                  }}
                >
                  {[
                    "Combatente",
                    "Especialista",
                    "Ocultista",
                    "Sobrevivente",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              {a.className === "Sobrevivente" ? (
                <label>
                  Estágio
                  <select
                    value={a.stage}
                    onChange={(e) => update("stage", +e.target.value)}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  NEX
                  <select
                    disabled={lockedNex !== undefined}
                    value={a.nex}
                    onChange={(e) => update("nex", +e.target.value)}
                  >
                    {[
                      ...Array.from({ length: 19 }, (_, i) => (i + 1) * 5),
                      99,
                    ].map((n) => (
                      <option value={n} key={n}>
                        {n}%
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Campanha
                <select
                  disabled={lockedNex !== undefined}
                  value={a.campaign_id || ""}
                  onChange={(e) =>
                    update("campaign_id", e.target.value || null)
                  }
                >
                  <option value="">Sem campanha</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <CharacterOptions agent={a} onChange={setA} editing />
            <h3>Atributos</h3>
            <div className="attribute-edit">
              {attributes.map((k) => (
                <label key={k}>
                  {k}
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={a.attributes[k]}
                    onChange={(e) =>
                      update("attributes", {
                        ...a.attributes,
                        [k]: Math.min(10, Math.max(0, +e.target.value)),
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <p className="muted small">
              Distribuição livre para fichas existentes. Poderes, origem e
              efeitos especiais podem exigir ajustes manuais.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={a.determination}
                onChange={(e) => update("determination", e.target.checked)}
              />{" "}
              Usar Determinação — Sobrevivendo ao Horror
            </label>
            <div className="resource-editor">
              {resourceKeys(a).map((k) => (
                <div key={k}>
                  <label>
                    {resourceLabels[k]} atual
                    <input
                      type="number"
                      min={0}
                      value={a.resources[k]}
                      onChange={(e) =>
                        update("resources", {
                          ...a.resources,
                          [k]: Math.max(0, +e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Ajuste do máximo
                    <input
                      type="number"
                      value={a.adjustments[k]}
                      onChange={(e) =>
                        update("adjustments", {
                          ...a.adjustments,
                          [k]: +e.target.value,
                        })
                      }
                    />
                  </label>
                  <span className="muted">
                    Máximo calculado: <b>{max[k]}</b>
                    <small className="resource-formula">
                      {maximumFormula(a, k)}
                    </small>
                  </span>
                </div>
              ))}
            </div>
            <button
              className="button secondary"
              onClick={() => update("resources", max)}
            >
              Restaurar recursos ao máximo
            </button>
            <div className="form-grid spaced">
              <label>
                Bônus de Defesa
                <input
                  type="number"
                  value={a.defenseBonus}
                  onChange={(e) => update("defenseBonus", +e.target.value)}
                />
              </label>
              <p className="defense">
                <Shield size={20} /> Defesa{" "}
                <b>
                  {10 +
                    effectiveAttributes(a).AGI +
                    a.defenseBonus +
                    accessoryDefenseBonus(a)}
                </b>
              </p>
            </div>
          </>
        ) : null}
        {tab === "Perícias" ? (
          <>
            <p className="muted">
              Treinamento: +5 (treinado), +10 (veterano), +15 (expert). Ajustes
              de poderes e equipamentos aparecem separados e entram nas
              rolagens.
            </p>
            <div className="skills-grid">
              {Object.entries(skillAttributes).map(([s, attr]) => (
                <div key={s} className="skill-row">
                  <span>
                    <small>{attr}</small>
                    {s}
                  </span>
                  <select
                    aria-label={`Treinamento em ${s}`}
                    value={a.skills[s] || 0}
                    onChange={(e) =>
                      update("skills", { ...a.skills, [s]: +e.target.value })
                    }
                  >
                    {[0, 5, 10, 15].map((n) => (
                      <option key={n} value={n}>
                        {n === 0
                          ? "Destreinado"
                          : n === 5
                            ? "Treinado +5"
                            : n === 10
                              ? "Veterano +10"
                              : "Expert +15"}
                      </option>
                    ))}
                  </select>
                  <label>
                    <span className="sr-only">Bônus de poder em {s}</span>
                    <input
                      type="number"
                      min={-100}
                      max={100}
                      aria-label={`Ajuste de poder em ${s}`}
                      title="Bônus permanente de poder ou efeito especial, separado do equipamento"
                      value={a.skillAdjustments?.[s] || 0}
                      onChange={(e) =>
                        update("skillAdjustments", {
                          ...a.skillAdjustments,
                          [s]: Math.max(
                            -100,
                            Math.min(100, Math.trunc(+e.target.value || 0)),
                          ),
                        })
                      }
                    />
                  </label>
                  <strong title="Treinamento + poder + acessórios ativos">
                    Total {skillBonus(a, s).total >= 0 ? "+" : ""}
                    {skillBonus(a, s).total}
                  </strong>
                  <button
                    className="icon-btn"
                    title={`Rolar ${s}`}
                    aria-label={`Rolar ${s}`}
                    onClick={() => onRoll(agent, s)}
                  >
                    <Dices size={17} />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}
        {tab === "Inventário" ? (
          <>
            <div className="section-line">
              <p className="muted">
                {inventorySpaces(a)} espaços utilizados · capacidade{" "}
                {carryingCapacity(a)}
                {effectiveAttributes(a).FOR !== a.attributes.FOR
                  ? " (inclui Pujança)"
                  : ""}
              </p>
              <button
                className="button secondary"
                onClick={() =>
                  update("inventory", [
                    ...a.inventory,
                    {
                      id: crypto.randomUUID(),
                      name: "Novo item",
                      kind: "Item",
                      quantity: 1,
                      spaces: 1,
                      damage: "",
                      notes: "",
                    },
                  ])
                }
              >
                <Plus size={16} />
                Adicionar
              </button>
            </div>
            {a.inventory
              .filter((i) => i.subtype !== "Maldição")
              .map((i) => (
                <div className="item-editor" key={i.id}>
                  <div className="form-grid">
                    <label>
                      Nome
                      <input
                        value={i.name}
                        onChange={(e) =>
                          itemUpdate(i.id, { name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Tipo
                      <select
                        value={i.kind}
                        onChange={(e) =>
                          itemUpdate(i.id, {
                            kind: e.target.value as Item["kind"],
                          })
                        }
                      >
                        {["Item", "Arma", "Ritual", "Poder"].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Quantidade
                      <input
                        type="number"
                        min={1}
                        value={i.quantity}
                        onChange={(e) =>
                          itemUpdate(i.id, {
                            quantity: Math.max(1, +e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Espaços por unidade
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={i.spaces}
                        onChange={(e) =>
                          itemUpdate(i.id, {
                            spaces: Math.max(0, +e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Dano (ex.: 2d6+3)
                      <input
                        value={i.damage}
                        onChange={(e) =>
                          itemUpdate(i.id, { damage: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Descrição e efeitos
                    <textarea
                      value={i.notes}
                      onChange={(e) =>
                        itemUpdate(i.id, { notes: e.target.value })
                      }
                    />
                  </label>
                  <button
                    className="button danger"
                    onClick={() =>
                      update(
                        "inventory",
                        a.inventory.filter((x) => x.id !== i.id),
                      )
                    }
                  >
                    <Trash2 size={14} /> Remover item
                  </button>
                </div>
              ))}
          </>
        ) : null}
        {tab === "Anotações" ? (
          <>
            <label>
              História e notas da ficha
              <textarea
                rows={10}
                value={a.notes}
                onChange={(e) => update("notes", e.target.value)}
              />
            </label>
            <p className="muted small">
              Visíveis para os participantes da campanha vinculada.
            </p>
            <p className="help">
              Condições ativas: <b>{a.conditions.join(", ") || "nenhuma"}</b>.
              Adicione e remova condições diretamente abaixo de Bloqueio, na
              ficha.
            </p>
          </>
        ) : null}
      </fieldset>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      <footer className="modal-footer">
        <button
          className="button secondary"
          onClick={() =>
            download(a.name.replace(/[^a-zA-Z0-9]/g, "-") + ".json", {
              version: 1,
              agent: a,
            })
          }
        >
          <Download size={16} />
          Exportar ficha
        </button>
        {readOnly ? (
          <span className="muted">
            Ficha de outro jogador · somente leitura
          </span>
        ) : (
          <button className="button primary" disabled={busy} onClick={save}>
            {busy ? "Salvando…" : "Salvar ficha"}
          </button>
        )}
      </footer>
    </Modal>
  );
}
