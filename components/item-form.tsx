"use client";
import { useState } from "react";
import { Modal } from "./ui";
import { skillAttributes, damage, accessoryType, type Item } from "@/lib/rules";
import { effectiveCategory } from "@/lib/curses";
export default function ItemForm({
  item,
  onSave,
  onClose,
}: {
  item: Item;
  onSave: (i: Item) => Promise<void>;
  onClose: () => void;
}) {
  const [i, setI] = useState(item),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const accessory = accessoryType(i);
  const text = (key: keyof Item, label: string, placeholder = "") => (
    <label key={key}>
      {label}
      <input
        maxLength={100}
        placeholder={placeholder}
        value={String(i[key] ?? "")}
        onChange={(e) => setI({ ...i, [key]: e.target.value })}
      />
    </label>
  );
  const area = (key: "notes" | "discente" | "verdadeiro", label: string) => (
    <label className="span-all">
      {label}
      <textarea
        rows={4}
        maxLength={10000}
        value={i[key] || ""}
        onChange={(e) => setI({ ...i, [key]: e.target.value })}
      />
    </label>
  );
  async function submit() {
    setError("");
    if (!i.name.trim()) return setError("Informe o nome.");
    if (accessory && !i.accessorySkill)
      return setError("Selecione a perícia beneficiada pelo acessório.");
    if (accessory && i.accessorySkill === i.extraSkill)
      return setError("A função adicional deve beneficiar outra perícia.");
    try {
      if (i.damage) damage(i.damage, () => 1);
      setBusy(true);
      await onSave({ ...i, name: i.name.trim() });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title={item.name || `Adicionar ${item.kind.toLowerCase()}`}
      onClose={onClose}
    >
      <fieldset disabled={busy}>
        <div className="form-grid">
          {text("name", "Nome")}
          {text("source", "Fonte / autoria")}
          {text("category", "Categoria")}
          {i.kind === "Item" && (
            <label>
              Tipo de acessório
              <select
                value={accessory || ""}
                onChange={(e) =>
                  setI({
                    ...i,
                    accessoryType: (e.target.value ||
                      undefined) as Item["accessoryType"],
                    equipped: !!e.target.value,
                  })
                }
              >
                <option value="">Item comum</option>
                <option value="Vestimenta">Vestimenta</option>
                <option value="Utensílio">Utensílio</option>
              </select>
            </label>
          )}
          {accessory && (
            <>
              <label className="check span-all">
                <input
                  type="checkbox"
                  checked={i.equipped !== false}
                  onChange={(e) => setI({ ...i, equipped: e.target.checked })}
                />
                {accessory === "Vestimenta"
                  ? "Vestida (bônus ativo)"
                  : "Empunhado (bônus ativo)"}
              </label>
              {(i.enhancements || []).some(
                (entry) =>
                  entry.bookId === "01" &&
                  ["Vitalidade", "Esforço Adicional"].includes(entry.name),
              ) && (
                <label className="check span-all">
                  <input
                    type="checkbox"
                    checked={!!i.attuned}
                    onChange={(e) => setI({ ...i, attuned: e.target.checked })}
                  />
                  Efeito após um dia de uso ativado (Vitalidade/Esforço
                  Adicional)
                </label>
              )}
              <label>
                Perícia beneficiada
                <select
                  value={i.accessorySkill || ""}
                  onChange={(e) =>
                    setI({ ...i, accessorySkill: e.target.value })
                  }
                >
                  <option value="">Selecione uma perícia</option>
                  {Object.keys(skillAttributes)
                    .filter((s) => s !== "Luta" && s !== "Pontaria")
                    .map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                </select>
              </label>
              <label>
                Bônus do acessório
                <select
                  value={i.accessoryBonus || 2}
                  onChange={(e) =>
                    setI({ ...i, accessoryBonus: +e.target.value as 2 | 5 })
                  }
                >
                  <option value={2}>+2 básico</option>
                  <option value={5}>+5 aprimorado (categoria +I)</option>
                </select>
              </label>
              <label>
                Função adicional (opcional)
                <select
                  value={i.extraSkill || ""}
                  onChange={(e) =>
                    setI({ ...i, extraSkill: e.target.value || undefined })
                  }
                >
                  <option value="">Nenhuma</option>
                  {Object.keys(skillAttributes)
                    .filter(
                      (s) =>
                        s !== "Luta" &&
                        s !== "Pontaria" &&
                        s !== i.accessorySkill,
                    )
                    .map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                </select>
              </label>
              {i.extraSkill && (
                <label>
                  Bônus da função adicional
                  <select
                    value={i.extraBonus || 2}
                    onChange={(e) =>
                      setI({ ...i, extraBonus: +e.target.value as 2 | 5 })
                    }
                  >
                    <option value={2}>+2</option>
                    <option value={5}>+5 aprimorado (categoria +I)</option>
                  </select>
                </label>
              )}
              <p className="hint span-all">
                O bônus da perícia entra nos testes quando o acessório está em
                uso. Máximo de duas vestimentas ativas. Categoria efetiva:{" "}
                {effectiveCategory(i)}.
              </p>
            </>
          )}
          {i.kind === "Arma" && (
            <>
              <label>
                Perícia de ataque
                <select
                  value={i.attackSkill || "Luta"}
                  onChange={(e) => setI({ ...i, attackSkill: e.target.value })}
                >
                  {Object.keys(skillAttributes).map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
              <label>
                Bônus adicional no ataque
                <input
                  type="number"
                  min={-100}
                  max={100}
                  value={i.attackBonus || 0}
                  onChange={(e) =>
                    setI({
                      ...i,
                      attackBonus: Math.max(
                        -100,
                        Math.min(100, Math.trunc(+e.target.value)),
                      ),
                    })
                  }
                />
              </label>
              {text("damage", "Dano", "Ex.: 1d6+2")}
              {text("critical", "Crítico", "Ex.: 19/x2")}
              {text("range", "Alcance", "Ex.: curto")}
              <p className="hint span-all">
                Ataque usa atributo e treinamento da perícia. Inclua Força e
                outros bônus aplicáveis na expressão de dano. Críticos são
                manuais.
              </p>
            </>
          )}
          {(i.kind === "Ritual" || i.kind === "Poder") && (
            <>
              <label>
                Custo em PE / PD
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={i.cost || 0}
                  onChange={(e) =>
                    setI({
                      ...i,
                      cost: Math.max(
                        0,
                        Math.min(999, Math.trunc(+e.target.value)),
                      ),
                    })
                  }
                />
              </label>
              {text("execution", "Execução / ação")}
              {text("range", "Alcance")}
              {text("target", "Alvo / área")}
              {text("duration", "Duração")}
              {text("damage", "Dano ou cura (opcional)", "Ex.: 2d6")}
              {i.kind === "Ritual" && (
                <>
                  {text("element", "Elemento")}
                  <label>
                    Círculo
                    <select
                      value={i.circle || 1}
                      onChange={(e) => setI({ ...i, circle: +e.target.value })}
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </>
          )}
          {(i.kind === "Item" || i.kind === "Arma") && (
            <>
              <label>
                Quantidade
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={i.quantity}
                  onChange={(e) =>
                    setI({
                      ...i,
                      quantity: Math.max(
                        1,
                        Math.min(999, Math.trunc(+e.target.value)),
                      ),
                    })
                  }
                />
              </label>
              <label>
                Espaços por unidade
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={i.spaces}
                  onChange={(e) =>
                    setI({
                      ...i,
                      spaces: Math.max(0, Math.min(100, +e.target.value)),
                    })
                  }
                />
              </label>
            </>
          )}
          {area("notes", "Descrição e efeito")}
          {i.kind === "Ritual" && (
            <>
              {area("discente", "Forma discente — efeito, custo e requisitos")}
              {area(
                "verdadeiro",
                "Forma verdadeira — efeito, custo e requisitos",
              )}
            </>
          )}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="wizard-actions">
        <button onClick={onClose}>Cancelar</button>
        <button className="primary" disabled={busy} onClick={submit}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </Modal>
  );
}
