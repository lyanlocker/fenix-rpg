"use client";

import { useEffect, useRef, useState } from "react";
import {
  Heart,
  Brain,
  Zap,
  Minus,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import {
  resourceKeys,
  resourceLabels,
  type Agent,
  type Resource,
} from "@/lib/rules";

function ResourceControl({
  resource,
  value,
  maximum,
  busy,
  onChange,
  onAdjust,
}: {
  resource: Resource;
  value: number;
  maximum: number;
  busy: boolean;
  onChange: (resource: Resource, delta: number) => void;
  onAdjust: (resource: Resource) => void;
}) {
  const previous = useRef(value);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    const change = value - previous.current;
    previous.current = value;
    if (!change) return;
    setDelta(change);
    const timer = setTimeout(() => setDelta(0), 1600);
    return () => clearTimeout(timer);
  }, [value]);
  const Icon = resource === "pv" ? Heart : resource === "san" ? Brain : Zap;
  const percent = Math.max(0, Math.min(100, (value / (maximum || 1)) * 100));
  return (
    <div className={`resource-control ${resource}`}>
      <div className="resource-control-label">
        <Icon size={16} />
        <span>{resourceLabels[resource]}</span>
        <strong aria-live="polite">
          {value}
          <small> / {maximum}</small>
        </strong>
        {!!delta && (
          <span
            key={value}
            className={`resource-change ${delta > 0 ? "gain" : "loss"}`}
            aria-hidden
          >
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </div>
      <div
        className="resource-meter"
        role="progressbar"
        aria-label={resourceLabels[resource]}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={maximum || 1}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="resource-control-actions">
        <button
          disabled={busy || value <= 0}
          aria-label={`Diminuir ${resourceLabels[resource]}`}
          onClick={() => onChange(resource, -1)}
        >
          <Minus size={14} />
        </button>
        <button
          disabled={busy}
          className="resource-adjust-value"
          aria-label={`Ajustar ${resourceLabels[resource]}`}
          onClick={() => onAdjust(resource)}
        >
          <SlidersHorizontal size={13} />
          <span>Ajustar</span>
        </button>
        <button
          disabled={busy || value >= maximum}
          aria-label={`Recuperar ${resourceLabels[resource]}`}
          onClick={() => onChange(resource, 1)}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export default function ResourceStrip({
  agent,
  maximums,
  busy,
  onChange,
  onAdjust,
}: {
  agent: Agent;
  maximums: Record<Resource, number>;
  busy: boolean;
  onChange: (resource: Resource, delta: number) => void;
  onAdjust: (resource: Resource) => void;
}) {
  return (
    <section className="resource-strip" aria-label="Recursos da ficha">
      {resourceKeys(agent).map((resource) => (
        <ResourceControl
          key={resource}
          resource={resource}
          value={agent.resources[resource]}
          maximum={maximums[resource]}
          busy={busy}
          onChange={onChange}
          onAdjust={onAdjust}
        />
      ))}
    </section>
  );
}
