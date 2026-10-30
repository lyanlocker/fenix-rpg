"use client";
import { useRef, useState } from "react";
import { useGame } from "./game-shell";
import { Modal } from "./ui";
import { GithubThreatPanel } from "./github-threat-panel";
import { prepareImage } from "@/lib/prepare-threat-image";
import { threatArtId, threatArtwork } from "@/lib/threat-art";
import type { Threat } from "@/lib/threats";

export function ThreatImagePicker({
  value,
  original,
  onChange,
  onBusy,
}: {
  value: string;
  original?: string;
  onChange: (value: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  const generation = useRef(0);
  return (
    <div className="threat-image-picker">
      {(value || original) && (
        <img
          src={value || original}
          alt="Prévia da imagem da criatura"
          className="threat-image-preview"
        />
      )}
      <label>
        Imagem da criatura
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={processing}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const current = ++generation.current;
            setProcessing(true);
            onBusy(true);
            setError("");
            try {
              const data = await prepareImage(file);
              if (current === generation.current) onChange(data);
            } catch (e) {
              if (current === generation.current)
                setError((e as Error).message);
            } finally {
              if (current === generation.current) {
                setProcessing(false);
                onBusy(false);
              }
            }
          }}
        />
      </label>
      <small>
        PNG, JPEG ou WebP, até 20 MB. A imagem será reduzida antes do envio.
      </small>
      {processing && <p role="status">Preparando imagem…</p>}
      {value && (
        <button type="button" onClick={() => onChange("")}>
          Desfazer escolha
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

export function ThreatImageEditor({
  threat,
  onClose,
}: {
  threat: Threat;
  onClose: () => void;
}) {
  const game = useGame();
  const sync = game.threatLibrary;
  const [image, setImage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const artwork = threatArtwork(
    threatArtId(threat, sync.library.art),
    sync.library.art,
  );
  async function save(restore = false) {
    setError("");
    try {
      if (
        threat.bookId === "custom" &&
        !sync.library.threats.some((t) => t.id === threat.id)
      ) {
        await sync.publish({ action: "save", threats: [threat], image });
      } else {
        await sync.publish({
          action: "image",
          id: threat.id,
          ...(restore ? { restore: true } : { image }),
        });
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={`Imagem de ${threat.name}`}
      onClose={() => {
        if (!sync.busy) onClose();
      }}
      wide
    >
      {!sync.connected && <GithubThreatPanel />}
      <p>
        A imagem aparecerá na galeria, no combate do mestre e na apresentação.
        As estatísticas da criatura serão preservadas.
      </p>
      <ThreatImagePicker
        value={image}
        original={artwork?.src}
        onChange={setImage}
        onBusy={setProcessing}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <footer className="modal-footer">
        {Object.hasOwn(sync.library.art, threat.id) && (
          <button
            disabled={sync.busy || processing || !sync.connected}
            onClick={() => void save(true)}
          >
            Restaurar imagem original
          </button>
        )}
        <button
          className="primary"
          disabled={!image || !sync.connected || sync.busy || processing}
          onClick={() => void save()}
        >
          {sync.busy ? "Enviando…" : "Salvar imagem no GitHub"}
        </button>
      </footer>
    </Modal>
  );
}
