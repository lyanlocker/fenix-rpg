"use client";
import { useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
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
    [selected, setSelected] = useState<string[]>(conditions),
    [busy, setBusy] = useState(false);
  const visible = useMemo(
    () =>
      conditionDefinitions.filter(
        (condition) =>
          condition.name
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()),
      ),
    [search],
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
        <button
          disabled={busy}
          onClick={() => {
            setSelected(conditions);
            setSearch("");
            setOpen(true);
          }}
        >
          <SlidersHorizontal size={14} />
          Selecionar
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
        <Modal title="Selecionar condições" onClose={() => setOpen(false)}>
          <p className="help">
            Marque somente as condições ativas. Os efeitos aparecem abaixo de
            Bloqueio após salvar.
          </p>
          <label>
            Buscar condição
            <input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ex.: Sangrando"
            />
          </label>
          <div className="condition-selector">
            {visible.map((condition) => (
              <label key={condition.name}>
                <input
                  type="checkbox"
                  checked={selected.includes(condition.name)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, condition.name]
                        : current.filter((name) => name !== condition.name),
                    )
                  }
                />
                <div>
                  <strong>{condition.name}</strong>
                  {condition.family && <small>{condition.family}</small>}
                  <p>{condition.description}</p>
                </div>
              </label>
            ))}
          </div>
          {!visible.length && (
            <p className="empty">Nenhuma condição encontrada.</p>
          )}
          <div className="modal-footer">
            <button onClick={() => setOpen(false)}>Cancelar</button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void (async () => {
                  await update(selected);
                  setOpen(false);
                })()
              }
            >
              Salvar condições ({selected.length})
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
