"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import TvStatic from "./tv-static";
import type { Delivery } from "@/lib/act-two";
export default function AnomalyOverlay({
  effect,
  theme,
  acknowledge,
  onExpire,
  preview = false,
}: {
  effect: Delivery | null;
  theme: number;
  acknowledge?: (id: string) => void;
  onExpire: (id: string) => void;
  preview?: boolean;
}) {
  const callbacks = useRef({ acknowledge, onExpire });
  useEffect(() => {
    callbacks.current = { acknowledge, onExpire };
  }, [acknowledge, onExpire]);
  useEffect(() => {
    if (!effect) return;
    const { id, deadline } = effect;
    function deliver() {
      if (deadline !== null && Date.now() >= deadline)
        callbacks.current.onExpire(id);
      else if (!document.hidden) callbacks.current.acknowledge?.(id);
    }
    deliver();
    document.addEventListener("visibilitychange", deliver);
    const timer =
      deadline === null
        ? undefined
        : window.setTimeout(
            () => callbacks.current.onExpire(id),
            Math.max(0, deadline - Date.now()),
          );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", deliver);
    };
  }, [effect]);

  const s = effect?.settings;
  const layers = s?.effects ?? (s ? [s.preset] : []);
  const darkness = Math.max(
    theme,
    layers.includes("indicio") ? (s?.intensity ?? 0) : 0,
  );
  const style = { "--act-strength": s?.intensity ?? theme } as CSSProperties;
  return createPortal(
    <>
      {layers.includes("olhos") && (
        <div
          className="act-backdrop"
          key={"face-" + effect?.id}
          data-position={s?.position}
          aria-hidden="true"
          style={style}
        >
          <div className="act-face" />
        </div>
      )}
      <aside
        className={"act-overlay" + (preview ? " act-preview" : "")}
        aria-label={preview ? "Prévia do mestre" : "Manifestação na ficha"}
        data-position={s?.position}
        style={style}
      >
        {darkness > 0 && (
          <div
            className="act-stain"
            aria-hidden="true"
            style={{ "--act-strength": darkness } as CSSProperties}
          />
        )}
        {s && (
          <div key={effect.id} className="act-film">
            {layers.includes("maos") && (
              <div className="act-hands" aria-hidden="true">
                {Array.from({ length: s.intensity === 3 ? 3 : 2 }, (_, i) => (
                  <div key={i} className="act-wrist">
                    <i />
                  </div>
                ))}
              </div>
            )}
            {layers.includes("ruido") && <TvStatic />}
            {layers.includes("pergunta") && s.text?.trim() && (
              <p className="act-whisper" role="status">
                {s.text}
              </p>
            )}
          </div>
        )}
      </aside>
    </>,
    document.body,
  );
}
