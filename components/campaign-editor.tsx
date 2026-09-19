"use client";
import { useState } from "react";
import type { Campaign } from "@/lib/model";
import { Modal } from "./ui";
export default function CampaignEditor({
  campaign,
  onSave,
  onClose,
}: {
  campaign: Campaign;
  onSave: (c: Campaign) => Promise<void>;
  onClose: () => void;
}) {
  const [c, setC] = useState(campaign),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Dossiê da campanha" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave(c);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nome da campanha
          <input
            required
            maxLength={100}
            value={c.name}
            onChange={(e) => setC({ ...c, name: e.target.value })}
          />
        </label>
        <label>
          Descrição
          <textarea
            value={c.description}
            onChange={(e) => setC({ ...c, description: e.target.value })}
          />
        </label>
        <div className="form-grid">
          <label>
            Elemento
            <select
              value={c.element}
              onChange={(e) => setC({ ...c, element: e.target.value })}
            >
              {["Energia", "Sangue", "Morte", "Conhecimento", "Medo"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Referência de regras
            <select
              value={c.rules}
              onChange={(e) => setC({ ...c, rules: e.target.value })}
            >
              <option>Livro Básico</option>
              <option>Sobrevivendo ao Horror</option>
              <option>Regras da mesa</option>
            </select>
          </label>
        </div>
        <label>
          Notas compartilhadas
          <textarea
            rows={5}
            value={c.notes}
            onChange={(e) => setC({ ...c, notes: e.target.value })}
          />
        </label>
        <p className="muted small">
          A referência identifica a mesa; a variante de recursos é configurada
          em cada ficha.
        </p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <footer className="modal-footer">
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar campanha"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
