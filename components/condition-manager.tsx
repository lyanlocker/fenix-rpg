"use client";
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { conditionByName, conditionDefinitions } from "@/lib/conditions";
import { Modal } from "./ui";

export default function ConditionManager({
  conditions,
  onChange,
}: {
  conditions: string[];
  onChange: (conditions: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false);
  const available = useMemo(
    () =>
      conditionDefinitions.filter(
        (condition) =>
          !conditions.includes(condition.name) &&
          condition.name
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()),
      ),
    [conditions, search],
  );
  async function update(next: string[]) {
    setBusy(true);
    try {
      await onChange(next);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="condition-manager" aria-labelledby="conditions-title">
      <div className="condition-heading">
        <h3 id="conditions-title">Condições</h3>
        <button disabled={busy} onClick={() => setOpen(true)}>
          <Plus size={14} />
          Adicionar
        </button>
      </div>
      {!conditions.length ? (
        <p className="hint">Nenhuma condição ativa.</p>
      ) : (
        <div className="active-conditions">
          {conditions.map((name) => {
            const definition = conditionByName.get(name);
            return (
              <article className="condition-card" key={name}>
                <div>
                  <strong>{name}</strong>
                  {definition?.family && <small>{definition.family}</small>}
                  <button
                    disabled={busy}
                    aria-label={`Remover ${name}`}
                    onClick={() =>
                      void update(conditions.filter((value) => value !== name))
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
                <p>
                  {definition?.description ||
                    "Condição personalizada. Consulte as anotações da mesa para seus efeitos."}
                </p>
              </article>
            );
          })}
        </div>
      )}
      {open && (
        <Modal wide title="Adicionar condição" onClose={() => setOpen(false)}>
          <label>
            Buscar condição
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ex.: Sangrando"
            />
          </label>
          <div className="condition-catalog">
            {available.map((condition) => (
              <article key={condition.name}>
                <div>
                  <strong>{condition.name}</strong>
                  {condition.family && <small>{condition.family}</small>}
                </div>
                <p>{condition.description}</p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void update([...conditions, condition.name])}
                >
                  Adicionar
                </button>
              </article>
            ))}
          </div>
          {!available.length && (
            <p className="empty">Nenhuma condição disponível com essa busca.</p>
          )}
        </Modal>
      )}
    </section>
  );
}
