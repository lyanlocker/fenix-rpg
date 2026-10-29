"use client";
import { useState } from "react";
import { Skull, Expand } from "lucide-react";
import { threatArtwork } from "@/lib/threat-art";
import { bookNames } from "@/lib/books";
import { Modal } from "./ui";

export function ThreatArtwork({
  artId,
  name,
  full = false,
  decorative = false,
}: {
  artId?: string;
  name: string;
  full?: boolean;
  decorative?: boolean;
}) {
  const art = threatArtwork(artId);
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
}: {
  artId: string;
  name: string;
  onClose: () => void;
}) {
  const art = threatArtwork(artId);
  return (
    <Modal title={name} onClose={onClose} wide>
      <div className="threat-art-viewer">
        <ThreatArtwork artId={artId} name={name} full />
      </div>
      {art && (
        <p className="threat-art-credit">
          Ilustração original · {bookNames[art.bookId]} · página {art.page}
        </p>
      )}
    </Modal>
  );
}

export function ThreatArtButton({
  artId,
  name,
  onOpen,
}: {
  artId: string;
  name: string;
  onOpen: () => void;
}) {
  return (
    <button
      className="threat-art-button"
      aria-label={`Ampliar ilustração de ${name}`}
      onClick={onOpen}
    >
      <ThreatArtwork artId={artId} name={name} decorative />
      <span>
        <Expand size={14} /> Ampliar arte
      </span>
    </button>
  );
}
