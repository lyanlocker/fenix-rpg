"use client";
import { useState, useRef, useMemo } from "react";
import { Plus, Upload, Download } from "lucide-react";
import { useGame } from "./game-shell";
import { parseCatalog, normalize } from "@/lib/catalog";
import { bookCatalog, bookNames } from "@/lib/books";
import type { Item } from "@/lib/rules";
import { Modal, download } from "./ui";
import ItemForm from "./item-form";
import RuleDetails from "./rule-details";
export function LibraryContent({
  kind,
  onChoose,
}: {
  kind?: Item["kind"];
  onChoose?: (i: Item) => void;
}) {
  const game = useGame(),
    [q, setQ] = useState(""),
    [filter, setFilter] = useState(kind || "Todos"),
    [source, setSource] = useState(""),
    [subtype, setSubtype] = useState(""),
    [element, setElement] = useState(""),
    [page, setPage] = useState(0),
    [editing, setEditing] = useState<Item | null>(null),
    input = useRef<HTMLInputElement>(null);
  const entries = useMemo(
    () => [...game.state.brews, ...bookCatalog],
    [game.state.brews],
  );
  const filtered = useMemo(
    () =>
      entries.filter(
        (i) =>
          (filter === "Todos" || i.kind === filter) &&
          (!onChoose || i.subtype !== "Maldição") &&
          (!source || i.bookId === source) &&
          (!subtype || i.subtype === subtype) &&
          (!element || i.element === element) &&
          normalize(
            [i.name, i.source, i.track, i.className, i.origin].join(" "),
          ).includes(normalize(q)),
      ),
    [entries, filter, source, subtype, element, q, onChoose],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 24)),
    current = Math.min(page, pages - 1),
    subtypes = [
      ...new Set(
        entries
          .filter((i) => filter === "Todos" || i.kind === filter)
          .map((i) => i.subtype)
          .filter(Boolean),
      ),
    ].sort();
  async function upload(file?: File) {
    if (!file) return;
    try {
      if (file.size > 20000000) throw Error("A biblioteca deve ter até 20 MB.");
      const items = parseCatalog(JSON.parse(await file.text()));
      for (const i of items)
        await game.save("brews", {
          ...i,
          id: crypto.randomUUID(),
          version: 1,
          source: i.source || "Importado",
        });
      game.setNotice(items.length + " registros importados.");
    } catch (e) {
      game.setNotice((e as Error).message);
    } finally {
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <div className="list-tools">
        <input
          aria-label="Buscar na biblioteca"
          placeholder="Buscar por nome, classe ou trilha…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
        />
        {!kind && (
          <select
            aria-label="Tipo de conteúdo"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSubtype("");
              setPage(0);
            }}
          >
            {["Todos", "Arma", "Item", "Poder", "Ritual"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        )}
      </div>
      <div className="catalog-filters">
        <label>
          Fonte
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
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
        </label>
        <label>
          Categoria
          <select
            value={subtype}
            onChange={(e) => {
              setSubtype(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todas as categorias</option>
            {subtypes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Elemento
          <select
            value={element}
            onChange={(e) => {
              setElement(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todos os elementos</option>
            {["Sangue", "Morte", "Conhecimento", "Energia", "Medo"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="actions">
        <button
          onClick={() =>
            setEditing({
              id: crypto.randomUUID(),
              name: "",
              kind:
                kind ||
                (filter === "Todos" ? "Item" : (filter as Item["kind"])),
              quantity: 1,
              spaces: 0,
              damage: "",
              notes: "",
              source: "Conteúdo próprio",
            })
          }
        >
          <Plus size={16} />
          Criar conteúdo
        </button>
        <button onClick={() => input.current?.click()}>
          <Upload size={16} />
          Importar biblioteca
        </button>
        <button
          onClick={() =>
            download("Fenix-biblioteca.json", { version: 1, items: entries })
          }
        >
          <Download size={16} />
          Exportar biblioteca
        </button>
        <input
          ref={input}
          type="file"
          accept=".json"
          hidden
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </div>
      <p className="hint">
        {filtered.length.toLocaleString("pt-BR")} resultados. Versões de livros
        diferentes permanecem identificadas pela fonte. Maldições são aplicadas
        pela própria arma, e não adicionadas como itens separados.
      </p>
      <div className="catalog-results">
        {filtered.slice(current * 24, (current + 1) * 24).map((i) => (
          <article className="sheet-item" key={i.id}>
            <div className="section-title">
              <div>
                <h3>{i.name}</h3>
                <p>
                  {i.subtype || i.kind} · {i.source || "Conteúdo próprio"}
                  {i.page ? " · PDF p. " + i.page : ""}
                </p>
              </div>
              {onChoose ? (
                <button
                  className="primary"
                  onClick={() =>
                    onChoose({
                      ...i,
                      catalogId: i.catalogId || i.id,
                      id: crypto.randomUUID(),
                    })
                  }
                >
                  Adicionar à ficha
                </button>
              ) : (
                <button
                  onClick={() =>
                    setEditing({
                      ...i,
                      id: crypto.randomUUID(),
                      name: i.name + " (cópia)",
                    })
                  }
                >
                  Criar cópia
                </button>
              )}
            </div>
            {i.kind === "Arma" && (
              <p>
                {i.damage || "Dano conforme descrição"} · Crítico{" "}
                {i.critical || "—"} · Alcance {i.range || "—"} · Categoria{" "}
                {i.category || "—"}
              </p>
            )}
            <RuleDetails item={i} />
          </article>
        ))}
      </div>
      {!filtered.length && (
        <p className="empty">
          Nenhum conteúdo encontrado. Experimente outro nome ou filtro.
        </p>
      )}
      <nav className="catalog-pagination" aria-label="Paginação da biblioteca">
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
      {editing && (
        <ItemForm
          item={editing}
          onClose={() => setEditing(null)}
          onSave={async (i) =>
            game.save("brews", {
              ...i,
              source: i.source || "Conteúdo próprio",
              version: 1,
            })
          }
        />
      )}
    </>
  );
}
export function CatalogPicker({
  kind,
  onChoose,
  onClose,
}: {
  kind: Item["kind"];
  onChoose: (i: Item) => void;
  onClose: () => void;
}) {
  return (
    <Modal wide title="Biblioteca" onClose={onClose}>
      <LibraryContent
        kind={kind}
        onChoose={(i) => {
          onChoose(i);
          onClose();
        }}
      />
    </Modal>
  );
}
export default function Library() {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">REGRAS À MÃO</p>
          <h1>Biblioteca</h1>
          <p>Consulte, crie e importe conteúdo. Sem conta ou cadastro.</p>
        </div>
      </div>
      <LibraryContent />
    </div>
  );
}
