"use client";

import { AnimatePresence, motion } from "motion/react";
import { Dices, X } from "lucide-react";
import type { Roll } from "@/lib/model";
import { useExperience } from "./experience";

export default function RollReveal({
  result,
  onClose,
}: {
  result: Roll | null;
  onClose: () => void;
}) {
  const { reduced, duration } = useExperience();
  return (
    <AnimatePresence>
      {result && (
        <motion.div
          key={result.id}
          className="roll-reveal"
          role="status"
          initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration }}
        >
          <div className="roll-reveal-heading">
            <Dices size={18} />
            <span>RESULTADO CONFIRMADO</span>
            <button aria-label="Fechar resultado" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <div className="roll-reveal-main">
            <div>
              <h3>{result.label}</h3>
              <p>{result.agentName}</p>
              <small>{result.expression}</small>
            </div>
            <motion.strong
              initial={{ scale: reduced ? 1 : 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration }}
              className="roll-total"
            >
              {result.total}
            </motion.strong>
          </div>
          <div
            className="rolled-dice"
            aria-label={`Dados individuais: ${result.dice.join(", ")}`}
          >
            {result.dice.map((die, index) => (
              <span key={index}>{die}</span>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
