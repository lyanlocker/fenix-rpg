"use client";
import { useMemo, useState } from "react";
import { bookCatalog, bookNames } from "@/lib/books";
import { normalize } from "@/lib/catalog";
import { curseElement, isAccessoryCurse, isWeaponCurse } from "@/lib/curses";
import { accessoryType, type Item } from "@/lib/rules";
import { useGame } from "./game-shell";
import RuleDetails from "./rule-details";
import { Modal } from "./ui";

export default function CursePicker({
  target,
  onChoose,
  onClose,
}: {
  target: Item;
  onChoose: (curse: Item) => void;
  onClose: () => void;
}) {
  const game = useGame(),
    accessory = !!accessoryType(target),
    [search, setSearch] = useState(""),
    [source, setSource] = useState(""),
    [page, setPage] = useState(0);
  const entries = useMemo(
    () =>
      [...game.state.brews, ...bookCatalog].filter(
        accessory ? isAccessoryCurse : isWeaponCurse,
      ),
    [game.state.brews, accessory],
  );
  const applied = new Set(
    (target.enhancements || []).map(
      (entry) => entry.catalogId || `${entry.source}/${entry.name}`,
    ),
  );
  const filtered = entries.filter(
    (entry) =>
      (!source || entry.bookId === source) &&
      normalize(`${entry.name} ${entry.source} ${entry.notes}`).includes(
        normalize(search),
      ),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 12)),
    current = Math.min(page, pages - 1);
  return (
    <Modal wide title={`Aplicar maldição em ${target.name}`} onClose={onClose}>
      <p className="help">
        A maldição fica vinculada {accessory ? "ao acessório" : "à arma"}. A
        primeira aumenta a categoria em II; cada maldição adicional aumenta em
        I.
      </p>
      <div className="list-tools">
        <input
          autoFocus
          aria-label="Buscar maldição"
          placeholder="Buscar maldição…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Fonte da maldição"
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            setPage(0);
          }}
        >
          <option value="">Todos os livros</option>
          {Object.entries(bookNames).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div className="catalog-results">
        {filtered.slice(current * 12, (current + 1) * 12).map((entry) => {
          const key = entry.catalogId || entry.id,
            already =
              applied.has(key) || applied.has(`${entry.source}/${entry.name}`);
          return (
            <article className="sheet-item" key={entry.id}>
              <div className="section-title">
                <div>
                  <h3>{entry.name}</h3>
                  <p>
                    {curseElement(entry) || "Elemento variável"} ·{" "}
                    {entry.source}
                    {entry.page ? ` · PDF p. ${entry.page}` : ""}
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={already}
                  onClick={() => onChoose(entry)}
                >
                  {already
                    ? "Já aplicada"
                    : `Aplicar ${accessory ? "ao acessório" : "à arma"}`}
                </button>
              </div>
              <RuleDetails item={entry} />
            </article>
          );
        })}
      </div>
      <nav className="catalog-pagination" aria-label="Paginação das maldições">
        <button disabled={current === 0} onClick={() => setPage(current - 1)}>
          Anterior
        </button>
        <span>
          Página {current + 1} de {pages}
        </span>
        <button
          disabled={current >= pages - 1}
          onClick={() => setPage(current + 1)}
        >
          Próxima
        </button>
      </nav>
    </Modal>
  );
}
