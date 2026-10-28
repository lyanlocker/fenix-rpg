"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { MotionConfig, useReducedMotion } from "motion/react";
import { SlidersHorizontal } from "lucide-react";
import { Modal } from "./ui";

type MotionLevel = "full" | "subtle" | "reduced";
const ExperienceContext = createContext({
  level: "full" as MotionLevel,
  reduced: false,
  duration: 0.28,
});
export const useExperience = () => useContext(ExperienceContext);

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [level, setLevel] = useState<MotionLevel>("full");
  const [open, setOpen] = useState(false);
  const systemReduced = useReducedMotion();
  const reduced = systemReduced === true || level === "reduced";
  useEffect(() => {
    try {
      const saved = localStorage.getItem("fenix.motion.v2");
      if (saved === "full" || saved === "subtle" || saved === "reduced")
        setLevel(saved);
    } catch {
      /* Preferences are optional when storage is blocked. */
    }
  }, []);
  const duration = reduced ? 0 : level === "subtle" ? 0.16 : 0.28;
  function select(value: MotionLevel) {
    setLevel(value);
    try {
      localStorage.setItem("fenix.motion.v2", value);
    } catch {
      /* In-memory preference still works. */
    }
  }
  return (
    <ExperienceContext.Provider value={{ level, reduced, duration }}>
      <MotionConfig
        reducedMotion={reduced ? "always" : "user"}
        transition={{ duration }}
      >
        <div className="experience" data-motion={reduced ? "reduced" : level}>
          {children}
          <button
            className="experience-settings"
            aria-label="Preferências visuais"
            onClick={() => setOpen(true)}
          >
            <SlidersHorizontal size={16} />
            <span>Experiência</span>
          </button>
          {open && (
            <Modal title="Sua experiência" onClose={() => setOpen(false)}>
              <p>
                Escolha o ritmo visual da sua mesa. As preferências ficam neste
                navegador.
              </p>
              <div className="motion-options">
                {(
                  [
                    [
                      "full",
                      "Cinematográfico",
                      "Transições, realce de turno e transformação de face.",
                    ],
                    [
                      "subtle",
                      "Discreto",
                      "Movimentos curtos para acompanhar as ações.",
                    ],
                    [
                      "reduced",
                      "Sem movimento",
                      "Resultados imediatos, com todos os recursos disponíveis.",
                    ],
                  ] as const
                ).map(([value, title, description]) => (
                  <button
                    key={value}
                    aria-pressed={level === value}
                    onClick={() => select(value)}
                  >
                    <strong>{title}</strong>
                    <span>{description}</span>
                  </button>
                ))}
              </div>
              {systemReduced && (
                <p className="help">
                  A preferência de movimento reduzido do seu dispositivo está
                  ativa e será respeitada.
                </p>
              )}
            </Modal>
          )}
        </div>
      </MotionConfig>
    </ExperienceContext.Provider>
  );
}
