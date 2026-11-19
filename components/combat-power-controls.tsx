"use client";
import type { Agent } from "@/lib/rules";
import {
  modifierLabel,
  normalizePower,
  resolvePower,
  eclecticMax,
  type PowerRule,
  type PowerSelection,
} from "@/lib/power-rules";
import type { Item } from "@/lib/rules";
export default function CombatPowerControls({
  rule,
  item,
  agent,
  value,
  onChange,
}: {
  rule: PowerRule;
  item: Item;
  agent: Agent;
  value: PowerSelection;
  onChange: (value: PowerSelection) => void;
}) {
  const max =
    agent.nex >= 85 ? 4 : agent.nex >= 55 ? 3 : agent.nex >= 25 ? 2 : 1;
  let effects = rule.modifiers;
  try {
    effects = resolvePower(
      item,
      agent,
      { ...value, confirmed: true },
      rule,
    ).modifiers;
  } catch {}
  return (
    <div className="arena-power-controls">
      {rule.viaAction && <p className="hint">{rule.viaAction}</p>}
      {!!rule.always?.length && (
        <p className="hint">
          Sempre aplicado: {rule.always.map(modifierLabel).join(", ")}.
        </p>
      )}
      {rule.passive && !rule.viaAction && (
        <p className="hint">
          Passivo: já é considerado automaticamente quando se aplica. Não
          consome ação nem PE.
        </p>
      )}
      {rule.blocked && (
        <p role="status" className="hint arena-error">
          {rule.blocked}
        </p>
      )}
      {rule.choices && !rule.multiChoice && (
        <label>
          Efeito escolhido
          <select
            value={value.choice || ""}
            onChange={(e) => onChange({ ...value, choice: e.target.value })}
          >
            <option value="">Selecione o bônus</option>
            {rule.choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {rule.multiChoice && (
        <div>
          <strong>Efeitos da técnica</strong>
          {rule.choices?.map((choice) => (
            <label className="check" key={choice.id}>
              <input
                type="checkbox"
                checked={value.choices?.includes(choice.id) || false}
                onChange={(e) =>
                  onChange({
                    ...value,
                    choices: e.target.checked
                      ? [
                          ...(value.choices || []).filter(
                            (id) =>
                              !(
                                (choice.id === "lethal" && id === "lethal2") ||
                                (choice.id === "lethal2" && id === "lethal")
                              ),
                          ),
                          choice.id,
                        ]
                      : (value.choices || []).filter((id) => id !== choice.id),
                  })
                }
              />
              {choice.label}
            </label>
          ))}
        </div>
      )}
      {rule.special === "specialAttack" && (
        <div className="form-grid">
          <label>
            Intensidade
            <select
              value={value.steps || 1}
              onChange={(e) =>
                onChange({
                  ...value,
                  steps: +e.target.value,
                  attackSteps: Math.min(
                    value.attackSteps ?? 1,
                    +e.target.value,
                  ),
                })
              }
            >
              {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                <option value={n} key={n}>
                  +{n * 5} total · {n + 1} PE/PD
                </option>
              ))}
            </select>
          </label>
          <label>
            Distribuir no ataque
            <select
              value={value.attackSteps ?? 1}
              onChange={(e) =>
                onChange({ ...value, attackSteps: +e.target.value })
              }
            >
              {Array.from({ length: (value.steps || 1) + 1 }, (_, n) => (
                <option key={n} value={n}>
                  +{n * 5} ataque / +{((value.steps || 1) - n) * 5} dano
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {(rule.weaponChoice || rule.ritualChoice) && (
        <label>
          {rule.ritualChoice ? "Ritual predileto" : "Arma beneficiada"}
          <select
            value={value.weaponId || ""}
            onChange={(e) => onChange({ ...value, weaponId: e.target.value })}
          >
            <option value="">
              Selecione {rule.ritualChoice ? "o ritual" : "a arma"}
            </option>
            {agent.inventory
              .filter(
                (i) =>
                  i.quantity > 0 &&
                  i.kind === (rule.ritualChoice ? "Ritual" : "Arma"),
              )
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {rule.special === "eclectic" && (
        <div className="form-grid">
          <label>
            Treinamento de Eclético
            <select
              value={value.steps || 1}
              onChange={(e) =>
                onChange({ ...value, steps: +e.target.value, choice: "" })
              }
            >
              {Array.from({ length: eclecticMax(agent) }, (_, i) => i + 1).map(
                (n) => (
                  <option value={n} key={n}>
                    {["Treinado (+5)", "Veterano (+10)", "Expert (+15)"][n - 1]}{" "}
                    · {n * 2} PE/PD
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Perícia
            <select
              value={value.choice || ""}
              onChange={(e) => onChange({ ...value, choice: e.target.value })}
            >
              <option value="">Selecione a perícia</option>
              {Object.keys(agent.skills)
                .filter((s) => agent.skills[s] < (value.steps || 1) * 5)
                .map((s) => (
                  <option key={s}>{s}</option>
                ))}
            </select>
          </label>
        </div>
      )}
      {rule.special === "perito" && (
        <label>
          Intensidade de Perito
          <select
            value={value.steps || 1}
            onChange={(e) => onChange({ ...value, steps: +e.target.value })}
          >
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                1d{4 + 2 * n} · {n + 1} PE/PD
              </option>
            ))}
          </select>
        </label>
      )}
      {rule.special === "perito" && (
        <label>
          Perícia escolhida para Perito
          <select
            value={value.choice || ""}
            onChange={(e) => onChange({ ...value, choice: e.target.value })}
          >
            <option value="">Selecione a perícia</option>
            {Object.keys(agent.skills)
              .filter(
                (s) =>
                  agent.skills[s] > 0 &&
                  !["Luta", "Pontaria"].includes(s) &&
                  (!rule.allowedSkills?.length ||
                    rule.allowedSkills.includes(normalizePower(s))),
              )
              .map((s) => (
                <option key={s}>{s}</option>
              ))}
          </select>
        </label>
      )}
      {!!effects.length && (
        <div className="hint">
          <strong>Efeitos aplicados pelo combate</strong>
          <ul>
            {effects.map((m, i) => (
              <li key={i}>{modifierLabel(m)}</li>
            ))}
          </ul>
          <small>
            {
              {
                attack: "No próximo ataque compatível",
                ritual: "No próximo ritual compatível",
                test: "No próximo teste compatível",
                turn: "Até terminar este turno",
                round: "Até o fim da rodada atual",
                nextTurn: "Até o início do seu próximo turno",
                scene: "Até encerrar o efeito ou o combate",
              }[rule.duration]
            }
            {rule.limit
              ? ` · limite por ${rule.limit === "round" ? "rodada" : rule.limit === "scene" ? "cena" : "turno"}`
              : ""}
            {rule.expires === "nextTurnEnd"
              ? " · expira no fim do seu próximo turno"
              : ""}
          </small>
        </div>
      )}
      {rule.condition && !rule.passive && (
        <label className="check">
          <input
            type="checkbox"
            checked={!!value.confirmed}
            onChange={(e) =>
              onChange({ ...value, confirmed: e.target.checked })
            }
          />
          {rule.condition} Confirmo que o requisito foi atendido.
        </label>
      )}
      {rule.warning && <p className="hint">{rule.warning}</p>}
    </div>
  );
}
