"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X, Plus, Minus, Flame } from "lucide-react";
import {
  maximums,
  resourceKeys,
  resourceLabels,
  type Agent,
  type Resource,
} from "@/lib/rules";
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Flame size={27} strokeWidth={1.4} />
      </span>
      <span>
        FÊNIX<small>ARQUIVOS DA ORDEM</small>
      </span>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      className={wide ? "modal wide" : "modal"}
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-inner">
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Fechar" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Flame size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function ResourceBars({
  agent,
  onChange,
}: {
  agent: Agent;
  onChange?: (r: Resource, n: number) => void;
}) {
  const max = maximums(agent);
  return (
    <div className="resources">
      {resourceKeys(agent).map((r) => (
        <div key={r} className={"resource " + r}>
          <div className="resource-label">
            <span>{resourceLabels[r]}</span>
            <span>
              <b>{agent.resources[r]}</b>
              <small> / {max[r]}</small>
            </span>
          </div>
          <div className="resource-line">
            {onChange ? (
              <button
                className="resource-adjust"
                aria-label={`Diminuir ${resourceLabels[r]} de ${agent.name}`}
                onClick={() => onChange(r, Math.max(0, agent.resources[r] - 1))}
              >
                <Minus size={12} />
              </button>
            ) : null}
            <div className="bar">
              <span
                style={{
                  width:
                    Math.min(
                      100,
                      Math.max(
                        0,
                        (agent.resources[r] / Math.max(1, max[r])) * 100,
                      ),
                    ) + "%",
                }}
              />
            </div>
            {onChange ? (
              <button
                className="resource-adjust"
                aria-label={`Aumentar ${resourceLabels[r]} de ${agent.name}`}
                onClick={() =>
                  onChange(r, Math.min(max[r], agent.resources[r] + 1))
                }
              >
                <Plus size={12} />
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
export function initials(s: string) {
  return s
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("");
}
export function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
