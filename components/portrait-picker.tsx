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
  hero = false,
  onDoubleClickFace,
}: {
  value?: string;
  name: string;
  color: string;
  onChange: (value: string) => void | Promise<void>;
  compact?: boolean;
  hero?: boolean;
  onDoubleClickFace?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    lastTap = useRef(0),
    lastToggle = useRef(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  function switchFace() {
    if (!onDoubleClickFace || Date.now() - lastToggle.current < 600) return;
    lastToggle.current = Date.now();
    onDoubleClickFace();
  }

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
    <div
      className={`portrait-picker ${compact ? "compact" : ""} ${hero ? "hero" : ""}`}
    >
      <div
        className="portrait-preview"
        style={{ color }}
        onDoubleClick={onDoubleClickFace ? switchFace : undefined}
        onTouchEnd={
          onDoubleClickFace
            ? (event) => {
                if (Date.now() - lastTap.current < 400) {
                  event.preventDefault();
                  switchFace();
                }
                lastTap.current = Date.now();
              }
            : undefined
        }
        onKeyDown={
          onDoubleClickFace
            ? (event) => {
                if (event.key !== "Enter") return;
                if (Date.now() - lastTap.current < 500) switchFace();
                lastTap.current = Date.now();
              }
            : undefined
        }
        role={onDoubleClickFace ? "button" : undefined}
        tabIndex={onDoubleClickFace ? 0 : undefined}
        aria-label={onDoubleClickFace ? "Aparência do personagem" : undefined}
      >
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
        <button
          disabled={busy}
          aria-label={value ? "Trocar imagem" : "Adicionar aparência"}
          title={value ? "Trocar imagem" : "Adicionar aparência"}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={16} />
          <span>{value ? "Trocar imagem" : "Adicionar aparência"}</span>
        </button>
        {value && (
          <button
            disabled={busy}
            className="danger"
            aria-label="Remover imagem"
            title="Remover imagem"
            onClick={() => void onChange("")}
          >
            <Trash2 size={15} />
            <span>Remover</span>
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
      {!compact && !hero && (
        <small>Salva na ficha e incluída nos arquivos de exportação.</small>
      )}
    </div>
  );
}
