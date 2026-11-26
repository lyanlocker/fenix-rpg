"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import type { Delivery, Preset } from "@/lib/act-two";

gsap.registerPlugin(CustomEase);
const approach = CustomEase.create(
  "approach",
  "M0,0 C0.16,0 0.18,0.51 0.4,0.52 0.57,0.53 0.6,0.55 0.69,0.76 0.79,0.98 0.88,1 1,1",
);
const whispers: Record<Preset, string> = {
  indicio: "Você ouviu também?",
  olhos: "Da última vez, você olhou para o outro lado.",
  maos: "Você lavou as mãos. Eu ainda estava lá.",
  ruido: "Tem outra respiração entre uma palavra sua e a próxima.",
  pergunta: "Quando contou o que aconteceu, de quem você apagou o nome?",
};

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
  const root = useRef<HTMLElement>(null);
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

  useEffect(() => {
    if (!effect || !root.current) return;
    const media = gsap.matchMedia();
    media.add(
      "(prefers-reduced-motion: no-preference)",
      () => {
        const timeline = gsap.timeline();
        timeline
          .from(".act-film", { opacity: 0, duration: 0.48 })
          .from(
            ".act-apparition",
            { scale: 1.14, xPercent: 3, duration: 1.4, ease: approach },
            0,
          )
          .from(".act-whisper", { opacity: 0, y: 5, duration: 0.5 }, 0.18);
      },
      root,
    );
    return () => media.revert();
  }, [effect]);

  const s = effect?.settings;
  return createPortal(
    <aside
      ref={root}
      className={"act-overlay" + (preview ? " act-preview" : "")}
      data-preset={s?.preset}
      data-position={s?.position}
      data-motif={s?.motif}
      aria-label={preview ? "Prévia do mestre" : "Manifestação na ficha"}
      style={{ "--act-strength": s?.intensity || theme } as CSSProperties}
    >
      {theme > 0 && (
        <div
          className="act-stain"
          aria-hidden="true"
          style={{ opacity: 0.32 + theme * 0.13 }}
        />
      )}
      {s && (
        <div className="act-film" key={effect.id}>
          <div className="act-apparition" aria-hidden="true" />
          <div className="act-emulsion" aria-hidden="true" />
          <p role="status" className="act-whisper">
            {s.text?.trim() || whispers[s.preset]}
          </p>
        </div>
      )}
    </aside>,
    document.body,
  );
}
