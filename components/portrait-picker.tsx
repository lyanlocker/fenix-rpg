"use client";
import Image from "next/image";
import { useRef, useState } from "react";
import { ImagePlus, Trash2, UserRound } from "lucide-react";
import { preparePortrait } from "@/lib/images";

export default function PortraitPicker({
  value,
  name,
  color,
  onChange,
  compact = false,
}: {
  value?: string;
  name: string;
  color: string;
  onChange: (value: string) => void | Promise<void>;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  async function choose(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await onChange(await preparePortrait(file));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={`portrait-picker ${compact ? "compact" : ""}`}>
      <div className="portrait-preview" style={{ color }}>
        {value ? (
          <Image
            unoptimized
            fill
            sizes={compact ? "180px" : "420px"}
            src={value}
            alt={`Aparência de ${name || "personagem"}`}
          />
        ) : (
          <UserRound strokeWidth={1} aria-hidden />
        )}
      </div>
      <div className="portrait-actions">
        <button disabled={busy} onClick={() => input.current?.click()}>
          <ImagePlus size={16} />
          {value ? "Trocar imagem" : "Adicionar aparência"}
        </button>
        {value && (
          <button
            disabled={busy}
            className="danger"
            onClick={() => void onChange("")}
          >
            <Trash2 size={15} />
            Remover
          </button>
        )}
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      {error && <p className="error">{error}</p>}
      {!compact && (
        <small>Salva na ficha e incluída nos arquivos de exportação.</small>
      )}
    </div>
  );
}
