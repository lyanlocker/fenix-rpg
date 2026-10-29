"use client";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { Plus, Search, Skull, Upload, Download } from "lucide-react";
import { useGame } from "./game-shell";
import { Modal, download } from "./ui";
import { GithubThreatPanel } from "./github-threat-panel";
import { ThreatImageEditor, ThreatImagePicker } from "./threat-image-editor";
import { bookNames } from "@/lib/books";
import { normalize } from "@/lib/catalog";
import { threatArtwork, threatArtId, threatArtCount } from "@/lib/threat-art";
import {
  ThreatArtwork,
  ThreatArtButton,
  ThreatArtViewer,
} from "./threat-artwork";
import {
  elementColors,
  parseThreatImport,
  threatElements,
  type Threat,
} from "@/lib/threats";

export function ThreatDetails({
  threat: t,
  onClose,
  onChoose,
}: {
  threat: Threat;
  onClose: () => void;
  onChoose?: (t: Threat) => void;
}) {
  const game = useGame();
  const artId = threatArtId(t, game.threatLibrary.library.art);
  const artwork = threatArtwork(artId, game.threatLibrary.library.art);
  return (
    <Modal title={t.name} onClose={onClose} wide>
      {artId && (
        <figure className="threat-detail-art">
          <ThreatArtwork artId={artId} artwork={artwork} name={t.name} full />
          <figcaption>
            {artwork?.bookId === "custom"
              ? "Imagem personalizada do catálogo"
              : `Ilustração original · página ${artwork?.page}`}
          </figcaption>
        </figure>
      )}
      <p className="threat-source">
        {bookNames[t.bookId] || "Ameaça própria"}
        {t.page > 0 ? ` · página ${t.page}` : ""}
      </p>
      <p style={{ color: elementColors[t.element] }}>
        {[t.element, ...t.secondaryElements].join(" · ")} · {t.kind}
      </p>
      <div className="threat-stat-grid">
        <div>
          <small>VD</small>
          <strong>{t.vd ?? "—"}</strong>
        </div>
        <div>
          <small>PV</small>
          <strong>{t.pv ?? "—"}</strong>
        </div>
        <div>
          <small>Defesa</small>
          <strong>{t.defense ?? "—"}</strong>
        </div>
        <div>
          <small>Iniciativa</small>
          <strong>{t.initiative || "Especial"}</strong>
        </div>
      </div>
      <div className="threat-stat-grid">
        {Object.entries(t.attributes).map(([key, value]) => (
          <div key={key}>
            <small>{key}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="threat-tests">
        {Object.entries(t.tests).map(([key, value]) => (
          <span key={key}>
            {key}: <b>{value}</b>
          </span>
        ))}
      </div>
      {t.attacks.length > 0 && (
        <>
          <h3>Ataques</h3>
          {t.attacks.map((a, i) => (
            <p key={i}>
              <strong>{a.name}</strong> · Teste {a.test} · Dano {a.damage}
            </p>
          ))}
        </>
      )}
      {t.pv === null && (
        <p className="hint">
          Manifestação sem ficha numérica. Consulte sua mecânica especial na
          referência.
        </p>
      )}
      <h3>Referência de regras e ações</h3>
      <p className="threat-rules">
        {t.details || "Nenhuma descrição cadastrada."}
      </p>
      {onChoose && (
        <footer className="modal-footer">
          <button
            className="primary"
            disabled={t.pv === null}
            onClick={() => onChoose(t)}
          >
            Adicionar ao combate
          </button>
        </footer>
      )}
    </Modal>
  );
}

function ThreatEditor({
  threat,
  onClose,
}: {
  threat?: Threat;
  onClose: () => void;
}) {
  const game = useGame();
  const [t, setT] = useState<Threat>(
    threat || {
      id: crypto.randomUUID(),
      name: "",
      element: "Realidade",
      secondaryElements: [],
      kind: "Criatura",
      vd: 20,
      pv: 30,
      defense: 15,
      initiative: "1d20",
      attributes: {},
      tests: {},
      attacks: [],
      details: "",
      bookId: "custom",
      page: 0,
    },
  );
  const [error, setError] = useState("");
  const [image, setImage] = useState("");
  const [processing, setProcessing] = useState(false);
  const sync = game.threatLibrary;
  return (
    <Modal
      title={threat ? "Editar ameaça própria" : "Nova ameaça"}
      onClose={() => {
        if (!sync.busy) onClose();
      }}
      wide
    >
      {!sync.connected && <GithubThreatPanel />}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (processing || sync.busy || !sync.connected) return;
          try {
            const [checked] = parseThreatImport({ version: 1, threats: [t] });
            await sync.publish({
              action: "save",
              threats: [checked],
              ...(image ? { image } : {}),
            });
            await game.save("threats", checked);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <ThreatImagePicker
          value={image}
          original={
            threatArtwork(threatArtId(t, sync.library.art), sync.library.art)
              ?.thumbnail
          }
          onChange={setImage}
          onBusy={setProcessing}
        />
        <label>
          Nome
          <input
            required
            maxLength={150}
            value={t.name}
            onChange={(e) => setT({ ...t, name: e.target.value })}
          />
        </label>
        <div className="form-grid">
          <label>
            Elemento
            <select
              value={t.element}
              onChange={(e) =>
                setT({ ...t, element: e.target.value as Threat["element"] })
              }
            >
              {threatElements.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </label>
          <label>
            Tipo
            <select
              value={t.kind}
              onChange={(e) => setT({ ...t, kind: e.target.value })}
            >
              {["Criatura", "Pessoa", "Animal"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          {(["vd", "pv", "defense"] as const).map((key, i) => (
            <label key={key}>
              {["VD", "PV máximos", "Defesa"][i]}
              <input
                type="number"
                min={0}
                max={1000000}
                required
                value={t[key] ?? 0}
                onChange={(e) => setT({ ...t, [key]: Number(e.target.value) })}
              />
            </label>
          ))}
          <label>
            Teste de iniciativa
            <input
              maxLength={60}
              placeholder="2d20+5"
              value={t.initiative}
              onChange={(e) => setT({ ...t, initiative: e.target.value })}
            />
          </label>
        </div>
        <h3>Ataques</h3>
        {t.attacks.map((attack, i) => (
          <div className="threat-attack-form" key={i}>
            <label>
              Nome
              <input
                value={attack.name}
                maxLength={150}
                onChange={(e) =>
                  setT({
                    ...t,
                    attacks: t.attacks.map((a, j) =>
                      j === i ? { ...a, name: e.target.value } : a,
                    ),
                  })
                }
              />
            </label>
            <label>
              Teste
              <input
                value={attack.test}
                maxLength={60}
                placeholder="2d20+5"
                onChange={(e) =>
                  setT({
                    ...t,
                    attacks: t.attacks.map((a, j) =>
                      j === i ? { ...a, test: e.target.value } : a,
                    ),
                  })
                }
              />
            </label>
            <label>
              Dano
              <input
                value={attack.damage}
                maxLength={60}
                placeholder="2d6+3"
                onChange={(e) =>
                  setT({
                    ...t,
                    attacks: t.attacks.map((a, j) =>
                      j === i ? { ...a, damage: e.target.value } : a,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              onClick={() =>
                setT({ ...t, attacks: t.attacks.filter((_, j) => j !== i) })
              }
            >
              Remover ataque
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={t.attacks.length >= 50}
          onClick={() =>
            setT({
              ...t,
              attacks: [
                ...t.attacks,
                { name: "Ataque", test: "1d20", damage: "1d6" },
              ],
            })
          }
        >
          Adicionar ataque
        </button>
        <label>
          Ações, resistências e regras especiais
          <textarea
            rows={9}
            maxLength={100000}
            value={t.details}
            onChange={(e) => setT({ ...t, details: e.target.value })}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-footer">
          <button
            className="primary"
            disabled={!sync.connected || sync.busy || processing}
          >
            {sync.busy ? "Enviando…" : "Salvar ameaça no GitHub"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function ThreatContent({
  onChoose,
}: {
  onChoose?: (t: Threat) => void;
}) {
  const game = useGame();
  const [q, setQ] = useState(""),
    [onlyIllustrated, setOnlyIllustrated] = useState(false),
    [artPreview, setArtPreview] = useState<{ id: string; name: string } | null>(
      null,
    ),
    [element, setElement] = useState("Todos"),
    [book, setBook] = useState(""),
    [vd, setVd] = useState(""),
    [page, setPage] = useState(0),
    [details, setDetails] = useState<Threat | null>(null),
    [editing, setEditing] = useState<Threat | "new" | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const [imageEditing, setImageEditing] = useState<Threat | null>(null);
  const [importing, setImporting] = useState(false);
  const sync = game.threatLibrary;
  const artFor = (t: Threat) => threatArtId(t, sync.library.art);
  const entries = game.allThreats;
  const filtered = useMemo(
    () =>
      entries.filter(
        (t) =>
          (element === "Todos" ||
            t.element === element ||
            t.secondaryElements.includes(element)) &&
          (!book || t.bookId === book) &&
          (!vd || (t.vd !== null && t.vd <= Number(vd))) &&
          (!onlyIllustrated || !!threatArtId(t, sync.library.art)) &&
          normalize(t.name).includes(normalize(q)),
      ),
    [entries, q, element, book, vd, onlyIllustrated, sync.library.art],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 24)),
    current = Math.min(page, pages - 1);
  function choose(t: Threat) {
    setDetails(null);
    onChoose?.(t);
  }
  async function importFile(file?: File) {
    if (!file) return;
    let saved = 0;
    setImporting(true);
    try {
      if (!sync.connected)
        throw Error("Conecte seu GitHub antes de importar criaturas.");
      if (file.size > 20000000) throw Error("O catálogo deve ter até 20 MB.");
      const items = parseThreatImport(JSON.parse(await file.text())).map(
        (t) => ({
          ...t,
          artId: artFor(t),
          id: crypto.randomUUID(),
          bookId: "custom",
        }),
      );
      for (let index = 0; index < items.length; index += 20) {
        const batch = items.slice(index, index + 20);
        await sync.publish({ action: "save", threats: batch });
        for (const t of batch) await game.save("threats", t);
        saved += batch.length;
      }
      game.setNotice(`${saved} ameaças enviadas ao GitHub.`);
    } catch (e) {
      game.setNotice(
        `${saved ? `${saved} ameaças já foram salvas. ` : ""}${(e as Error).message}`,
      );
    } finally {
      setImporting(false);
      if (upload.current) upload.current.value = "";
    }
  }
  if (!game.access.ready || !game.ready) return <p>Carregando ameaças…</p>;
  if (game.access.isPlayer)
    return <p>O catálogo de ameaças está disponível para o mestre.</p>;
  return (
    <>
      {!onChoose && <GithubThreatPanel />}
      {!onChoose && (
        <div className="threat-actions">
          <button className="primary" onClick={() => setEditing("new")}>
            <Plus size={16} />
            Nova ameaça
          </button>
          <button
            disabled={importing || sync.busy || !sync.connected}
            onClick={() => upload.current?.click()}
          >
            <Upload size={16} />
            Importar
          </button>
          <button
            onClick={() =>
              download("fenix-ameacas.json", {
                version: 1,
                threats: entries.map((t) => ({ ...t, artId: artFor(t) })),
              })
            }
          >
            <Download size={16} />
            Exportar catálogo
          </button>
          <input
            ref={upload}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void importFile(e.target.files?.[0])}
          />
        </div>
      )}
      <div className="threat-elements" aria-label="Elementos">
        <button
          aria-pressed={element === "Todos"}
          onClick={() => {
            setElement("Todos");
            setPage(0);
          }}
        >
          Todos
        </button>
        {threatElements.map((e) => (
          <button
            key={e}
            aria-pressed={element === e}
            style={{ "--element": elementColors[e] } as CSSProperties}
            onClick={() => {
              setElement(e);
              setPage(0);
            }}
          >
            {e}{" "}
            <small>
              {
                entries.filter(
                  (t) => t.element === e || t.secondaryElements.includes(e),
                ).length
              }
            </small>
          </button>
        ))}
      </div>
      <div className="list-tools threat-tools">
        <label className="threat-search">
          <Search size={17} />
          <input
            aria-label="Buscar ameaça"
            value={q}
            placeholder="Buscar ameaça…"
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <select
          aria-label="Livro de origem"
          value={book}
          onChange={(e) => {
            setBook(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Todos os livros</option>
          {Array.from(new Set(entries.map((t) => t.bookId))).map((id) => (
            <option key={id} value={id}>
              {bookNames[id] || "Ameaças próprias"}
            </option>
          ))}
        </select>
        <label>
          VD máximo
          <input
            type="number"
            min={0}
            max={1000000}
            value={vd}
            onChange={(e) => {
              setVd(e.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      <p className="muted small">
        {filtered.length} ameaças encontradas · página {current + 1} de {pages}
      </p>
      <div className="threat-gallery-options">
        <label>
          <input
            type="checkbox"
            checked={onlyIllustrated}
            onChange={(event) => {
              setOnlyIllustrated(event.target.checked);
              setPage(0);
            }}
          />{" "}
          Somente com ilustração
        </label>
        <span>{threatArtCount} artes dos livros no acervo</span>
      </div>
      <div className="threat-grid">
        {filtered.slice(current * 24, current * 24 + 24).map((t) => (
          <article
            className="threat-card"
            key={t.id}
            style={{ "--element": elementColors[t.element] } as CSSProperties}
          >
            {artFor(t) ? (
              <ThreatArtButton
                artId={artFor(t)!}
                artwork={threatArtwork(artFor(t), sync.library.art)}
                name={t.name}
                onOpen={() => setArtPreview({ id: artFor(t)!, name: t.name })}
              />
            ) : (
              <ThreatArtwork name={t.name} />
            )}
            <div className="threat-symbol">
              <Skull size={18} />
              <span>{t.vd === null ? "Especial" : `VD ${t.vd}`}</span>
            </div>
            <div>
              <p className="threat-element">
                {t.element}
                {t.secondaryElements.length
                  ? ` · ${t.secondaryElements.join(" · ")}`
                  : ""}
              </p>
              <h3>{t.name}</h3>
              <p className="muted small">
                {t.kind} · {bookNames[t.bookId] || "Ameaça própria"}
              </p>
              <div className="threat-values">
                <span>
                  PV <b>{t.pv ?? "—"}</b>
                </span>
                <span>
                  Defesa <b>{t.defense ?? "—"}</b>
                </span>
              </div>
            </div>
            <div className="threat-card-actions">
              <button onClick={() => setDetails(t)}>Ver ficha</button>
              {onChoose && (
                <button disabled={t.pv === null} onClick={() => choose(t)}>
                  Adicionar
                </button>
              )}
              {!onChoose && (
                <button onClick={() => setImageEditing(t)}>
                  {artFor(t) ? "Trocar imagem" : "Adicionar imagem"}
                </button>
              )}
              {!onChoose && t.bookId === "custom" && (
                <>
                  <button onClick={() => setEditing(t)}>Editar</button>
                  {!sync.library.threats.some((x) => x.id === t.id) && (
                    <button onClick={() => void game.remove("threats", t.id)}>
                      Remover local
                    </button>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <p className="empty">Nenhuma ameaça corresponde aos filtros.</p>
      )}
      {pages > 1 && (
        <div className="threat-pagination">
          <button disabled={current === 0} onClick={() => setPage(current - 1)}>
            Anterior
          </button>
          <span>
            {current + 1} / {pages}
          </span>
          <button
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Próxima
          </button>
        </div>
      )}
      {artPreview && (
        <ThreatArtViewer
          artId={artPreview.id}
          artwork={threatArtwork(artPreview.id, sync.library.art)}
          name={artPreview.name}
          onClose={() => setArtPreview(null)}
        />
      )}
      {imageEditing && (
        <ThreatImageEditor
          threat={imageEditing}
          onClose={() => setImageEditing(null)}
        />
      )}
      {details && (
        <ThreatDetails
          threat={details}
          onClose={() => setDetails(null)}
          onChoose={onChoose ? choose : undefined}
        />
      )}
      {editing && (
        <ThreatEditor
          threat={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
export default function Threats() {
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ARQUIVOS DO MESTRE</p>
          <h1>Ameaças</h1>
          <p>Criaturas e ameaças da Realidade, organizadas por elemento.</p>
        </div>
      </div>
      <ThreatContent />
    </div>
  );
}
