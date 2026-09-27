"use client";
import type { InfectionStatus } from "@/lib/share";

export default function InfectionBar({
  infection,
  busy,
  onAdjust,
}: {
  infection: InfectionStatus;
  busy: boolean;
  onAdjust: (delta: -1 | 1) => void;
}) {
  return (
    <div className="infection-bar" aria-label="Barra de Infecção">
      <div className="infection-heading">
        <span>Infecção</span>
        <strong>
          {infection.value} <small>/ 100</small>
        </strong>
      </div>
      <progress aria-label="Infecção" value={infection.value} max={100} />
      <div className="infection-controls">
        <button
          type="button"
          disabled={busy || infection.value === 0}
          aria-label="Diminuir Infecção em um ponto"
          onClick={() => onAdjust(-1)}
        >
          −
        </button>
        <button
          type="button"
          disabled={busy || infection.value === 100}
          aria-label="Aumentar Infecção em um ponto"
          onClick={() => onAdjust(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
