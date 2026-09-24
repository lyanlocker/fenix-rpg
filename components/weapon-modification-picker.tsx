"use client";

import { useState } from "react";
import { normalize } from "@/lib/catalog";
import {
  availableModifications,
  hasWeaponModification,
  weaponType,
  type WeaponModification,
} from "@/lib/weapon-modifications";
import type { Item } from "@/lib/rules";
import { Modal } from "./ui";

export default function WeaponModificationPicker({
  target,
  busy,
  onChoose,
  onClose,
}: {
  target: Item;
  busy: boolean;
  onChoose: (modification: WeaponModification) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const entries = availableModifications(target).filter((entry) =>
    normalize(`${entry.name} ${entry.notes}`).includes(normalize(search)),
  );
  return (
    <Modal wide title={`Modificar ${target.name}`} onClose={onClose}>
      <p className="help">
        Tipo: {weaponType(target)}. Cada modificação aumenta a categoria em I. A
        mesma modificação não pode ser aplicada duas vezes. As regras abaixo são
        do Livro de Regras, tabela 3.5 (p. 60–61).
      </p>
      <input
        autoFocus
        aria-label="Buscar modificação"
        placeholder="Buscar modificação…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="catalog-results">
        {entries.map((entry) => (
          <article className="sheet-item" key={entry.name}>
            <div className="section-title">
              <div>
                <h3>{entry.name}</h3>
                <p>{entry.notes}</p>
              </div>
              <button
                className="primary"
                disabled={busy || hasWeaponModification(target, entry.name)}
                onClick={() => onChoose(entry)}
              >
                {hasWeaponModification(target, entry.name)
                  ? "Já aplicada"
                  : "Aplicar à arma"}
              </button>
            </div>
          </article>
        ))}
        {!entries.length && <p>Nenhuma modificação encontrada.</p>}
      </div>
    </Modal>
  );
}
