"use client";
import { useRef, useState } from "react";
import { ImagePlus, RotateCcw } from "lucide-react";
import type { Item } from "@/lib/rules";
import { prepareItemImage } from "@/lib/prepare-item-image";
import ItemArtwork from "./item-artwork";
export default function ItemImagePicker({
  item,
  onChange,
  onBusy,
}: {
  item: Item;
  onChange: (value: string | undefined) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function choose(file?: File) {
    if (!file) return;
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      onChange(await prepareItemImage(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy?.(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <section className="item-image-picker span-all" aria-label="Imagem do item">
      <ItemArtwork item={item} large />
      <div>
        <strong>
          {item.kind === "Ritual"
            ? "Símbolo do ritual"
            : "Imagem do equipamento"}
        </strong>
        <p className="hint">
          PNG, JPEG ou WebP. A imagem é reduzida antes de salvar.
        </p>
        <div className="actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={16} />
            {busy
              ? "Preparando…"
              : item.image
                ? "Trocar imagem"
                : "Adicionar imagem"}
          </button>
          {item.image && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onChange(undefined)}
            >
              <RotateCcw size={16} />
              {item.kind === "Ritual"
                ? "Restaurar símbolo da fonte"
                : "Remover imagem"}
            </button>
          )}
        </div>
        <input
          ref={input}
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => void choose(e.target.files?.[0])}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
