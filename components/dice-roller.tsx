"use client";
import { useState } from "react";
import { Dices } from "lucide-react";
import { Modal } from "./ui";

export default function DiceRoller({
  busy,
  onRoll,
}: {
  busy: boolean;
  onRoll: (expression: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false),
    [quantity, setQuantity] = useState(1),
    [sides, setSides] = useState(20),
    [modifier, setModifier] = useState(0);
  const expression = `${quantity}d${sides}${modifier ? `${modifier > 0 ? "+" : ""}${modifier}` : ""}`;

  return (
    <>
      <button
        className="floating-dice"
        aria-label="Abrir rolador de dados"
        title="Rolar qualquer dado"
        onClick={() => setOpen(true)}
      >
        <Dices size={26} />
      </button>
      {open && (
        <Modal title="Rolador de dados" onClose={() => setOpen(false)}>
          <p className="help">
            Escolha qualquer quantidade e número de lados, incluindo d2, d3, d7
            e outros dados personalizados.
          </p>
          <div className="dice-presets">
            {[2, 4, 6, 8, 10, 12, 20, 100].map((value) => (
              <button key={value} onClick={() => setSides(value)}>
                d{value}
              </button>
            ))}
          </div>
          <div className="form-grid dice-fields">
            <label>
              Quantidade
              <input
                type="number"
                min={1}
                max={100}
                value={quantity}
                onChange={(event) => setQuantity(+event.target.value)}
              />
            </label>
            <label>
              Lados
              <input
                type="number"
                min={2}
                max={1000000}
                value={sides}
                onChange={(event) => setSides(+event.target.value)}
              />
            </label>
            <label className="span-all">
              Modificador
              <input
                type="number"
                min={-100000}
                max={100000}
                value={modifier}
                onChange={(event) => setModifier(+event.target.value)}
              />
            </label>
          </div>
          <div className="dice-expression">{expression}</div>
          <button
            className="primary dice-submit"
            disabled={
              busy ||
              quantity < 1 ||
              quantity > 100 ||
              sides < 2 ||
              sides > 1000000
            }
            onClick={() => void onRoll(expression)}
          >
            <Dices size={18} />
            Rolar {expression}
          </button>
        </Modal>
      )}
    </>
  );
}
