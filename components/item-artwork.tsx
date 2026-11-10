"use client";
import { useState } from "react";
import Image from "next/image";
import { Expand } from "lucide-react";
import type { Item } from "@/lib/rules";
import { itemArtwork, itemArtworkSource } from "@/lib/item-art";
import { Modal } from "./ui";
export default function ItemArtwork({
  item,
  large = false,
}: {
  item: Item;
  large?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [failed, setFailed] = useState("");
  const art = itemArtwork(item);
  if (!art)
    return item.kind === "Ritual" ? (
      <p className="item-art-empty">Sem símbolo cadastrado nesta fonte.</p>
    ) : null;
  return (
    <>
      <button
        type="button"
        className={`item-artwork ${large ? "large" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={`Ampliar ${item.kind === "Ritual" ? "símbolo" : "imagem"} de ${item.name}`}
        title={itemArtworkSource(art)}
      >
        {failed === art.src ? (
          <span>Imagem indisponível</span>
        ) : (
          <Image
            unoptimized
            src={art.thumbnail}
            alt={`${item.kind === "Ritual" ? "Símbolo" : "Imagem"} de ${item.name}`}
            width={art.thumbnailWidth || art.width}
            height={art.thumbnailHeight || art.height}
            loading="lazy"
            onError={() => setFailed(art.src)}
          />
        )}
        <span>
          <Expand size={14} /> Ampliar
        </span>
      </button>
      {open && (
        <Modal title={item.name} onClose={() => setOpen(false)} wide>
          <div className="item-art-full">
            <Image
              unoptimized
              src={art.src}
              alt={item.name}
              width={art.width}
              height={art.height}
            />
          </div>
          <p className="hint">{itemArtworkSource(art)}</p>
        </Modal>
      )}
    </>
  );
}
