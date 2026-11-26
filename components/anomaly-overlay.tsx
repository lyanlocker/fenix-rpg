"use client";
import { useEffect, useState, useRef } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Delivery } from "@/lib/act-two";
export default function AnomalyOverlay({
  effect,
  theme,
  reduced,
  dismiss,
  acknowledge,
  preference,
  preview = false,
}: {
  effect: Delivery | null;
  theme: number;
  reduced: boolean;
  dismiss: () => void;
  acknowledge?: (id: string) => void;
  preference?: (v: boolean) => void;
  preview?: boolean;
}) {
  const system = useReducedMotion(),
    still = reduced || system;
  const [visible, setVisible] = useState(true),
    handlers = useRef({ dismiss, acknowledge });
  handlers.current = { dismiss, acknowledge };
  useEffect(() => {
    function change() {
      setVisible(!document.hidden);
    }
    change();
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => {
    if (!visible || !effect) return;
    const remaining =
      effect.deadline === null ? null : effect.deadline - Date.now();
    if (remaining !== null && remaining <= 0) {
      handlers.current.dismiss();
      return;
    }
    handlers.current.acknowledge?.(effect.id);
    if (remaining !== null) {
      const timer = setTimeout(() => handlers.current.dismiss(), remaining);
      return () => clearTimeout(timer);
    }
  }, [visible, effect]);
  useEffect(() => {
    if (!visible || preview || still || !theme) return;
    document.body.classList.add("act-shadow");
    return () => document.body.classList.remove("act-shadow");
  }, [theme, visible, still, preview]);
  if (!visible) return null;
  const s = effect?.settings;
  return (
    <aside
      aria-label={preview ? "Prévia do mestre" : "Manifestação na ficha"}
      className={
        "act-overlay " +
        (preview ? "act-preview " : "") +
        "act-" +
        (s?.position || "cantos")
      }
      style={
        {
          "--act-alpha": 0.16 + (s?.intensity || theme) * 0.09,
        } as React.CSSProperties
      }
    >
      {s && !still && (
        <motion.div
          className={
            "act-decoration act-" + s.preset + " motif-" + (s.motif || "")
          }
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {s.preset === "olhos" &&
            Array.from(
              { length: Math.min(s.motif ? 2 : 3, s.intensity) },
              (_, i) => (
                <svg key={i} viewBox="0 0 100 48">
                  <path d="M3 24Q50 -17 97 24Q50 64 3 24Z" fill="#beb3cf" />
                  <ellipse cx="50" cy="24" rx="9" ry="17" fill="#312c40" />
                </svg>
              ),
            )}
          {s.preset === "maos" &&
            Array.from({ length: Math.min(2, s.intensity) }, (_, i) => (
              <svg key={i} viewBox="0 0 90 115">
                <path
                  fill="#aaa1ba"
                  d="M24 114L23 88Q15 78 9 56Q7 48 13 50L26 65L17 28Q16 19 23 22L34 50L29 13Q29 6 35 9L44 47L44 6Q46 0 51 6L54 48L60 15Q62 9 66 15L63 58L72 41Q79 35 78 44L68 84L58 99L59 115Z"
                />
              </svg>
            ))}
        </motion.div>
      )}
      <div className="act-caption">
        {preview && <small>Prévia local</small>}
        <span role="status">
          {s?.text ||
            (effect ? "Uma presença observa a ficha." : "Sombra na ficha")}
        </span>
        {effect && <button onClick={dismiss}>Fechar efeito</button>}
        {preference && (
          <button aria-pressed={reduced} onClick={() => preference(!reduced)}>
            {reduced ? "Modo reduzido ativo" : "Reduzir efeitos"}
          </button>
        )}
      </div>
    </aside>
  );
}
