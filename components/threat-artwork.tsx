"use client";
import { useState } from "react";
import { Skull, Expand } from "lucide-react";
import { threatArtwork } from "@/lib/threat-art";
import { bookNames } from "@/lib/books";
import { Modal } from "./ui";
import type { ThreatArtwork as Artwork } from "@/lib/threat-art";

export function ThreatArtwork({
  artId,
  name,
  full = false,
  decorative = false,
  artwork,
}: {
  artId?: string;
  name: string;
  full?: boolean;
  decorative?: boolean;
  artwork?: Artwork;
}) {
  const art = artwork || threatArtwork(artId);
  const src = art ? (full ? art.src : art.thumbnail) : "";
  const [failed, setFailed] = useState("");
  return (
    <div
      className={`threat-artwork ${art && failed !== src ? "has-art" : "without-art"}`}
    >
      {art && failed !== src ? (
        <img
          src={src}
          width={full ? art.width : art.thumbnailWidth}
          height={full ? art.height : art.thumbnailHeight}
          alt={decorative ? "" : `Ilustração de ${name}`}
          loading={full ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(src)}
        />
      ) : (
        <div
          className="threat-art-fallback"
          aria-hidden={decorative || undefined}
        >
          <Skull strokeWidth={1} size={48} />
          {!decorative && <span>Sem ilustração disponível</span>}
        </div>
      )}
    </div>
  );
}

export function ThreatArtViewer({
  artId,
  name,
  onClose,
  artwork,
}: {
  artId: string;
  name: string;
  onClose: () => void;
  artwork?: Artwork;
}) {
  const art = artwork || threatArtwork(artId);
  return (
    <Modal title={name} onClose={onClose} wide>
      <div className="threat-art-viewer">
        <ThreatArtwork artId={artId} artwork={art} name={name} full />
      </div>
      {art && (
        <p className="threat-art-credit">
          {art.bookId === "custom"
            ? "Imagem personalizada do catálogo"
            : `Ilustração original · ${bookNames[art.bookId]} · página ${art.page}`}
        </p>
      )}
    </Modal>
  );
}

export function ThreatArtButton({
  artId,
  name,
  onOpen,
  artwork,
}: {
  artId: string;
  name: string;
  onOpen: () => void;
  artwork?: Artwork;
}) {
  return (
    <button
      className="threat-art-button"
      aria-label={`Ampliar ilustração de ${name}`}
      onClick={onOpen}
    >
      <ThreatArtwork artId={artId} artwork={artwork} name={name} decorative />
      <span>
        <Expand size={14} /> Ampliar arte
      </span>
    </button>
  );
}
