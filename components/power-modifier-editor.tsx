"use client";
import type { CombatRule } from "@/lib/combat-actions";
import type { PowerModifier } from "@/lib/power-rules";
import { skillAttributes, type Attribute } from "@/lib/rules";
export default function PowerModifierEditor({
  rule,
  onChange,
}: {
  rule: CombatRule;
  onChange: (patch: Partial<CombatRule>) => void;
}) {
  const modifiers = rule.modifiers || [];
  const patch = (index: number, value: Partial<PowerModifier>) =>
    onChange({
      modifiers: modifiers.map((m, n) =>
        n === index ? { ...m, ...value } : m,
      ),
    });
  return (
    <div className="span-all arena-power-controls">
      <label>
        Duração
        <select
          value={rule.duration || "attack"}
          onChange={(e) =>
            onChange({ duration: e.target.value as CombatRule["duration"] })
          }
        >
          <option value="attack">Próximo ataque compatível</option>
          <option value="ritual">Próximo ritual compatível</option>
          <option value="test">Próximo teste compatível</option>
          <option value="round">Até o fim da rodada</option>
          <option value="turn">Até o fim deste turno</option>
          <option value="nextTurn">
            Até o início do próximo turno do usuário
          </option>
          <option value="scene">Até encerrar o efeito ou combate</option>
        </select>
      </label>
      <label>
        Condição para ativar
        <input
          maxLength={600}
          value={rule.condition || ""}
          onChange={(e) => onChange({ condition: e.target.value })}
          placeholder="Ex.: alvo desprevenido; arma favorita"
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={!!rule.passive}
          disabled={
            !rule.passive &&
            (rule.pe > 0 ||
              rule.target !== "self" ||
              rule.action !== "free" ||
              !!rule.condition?.trim())
          }
          onChange={(e) => onChange({ passive: e.target.checked })}
        />
        Passivo permanente, sem custo nem condição de ativação
      </label>
      <p className="hint">
        Use exatamente os bônus da descrição. Dados extras da arma não
        multiplicam no crítico; dados base adicionais multiplicam. Um bônus na
        rolagem de ataque é diferente de acrescentar d20 ao teste.
      </p>
      {modifiers.map((m, n) => (
        <div className="form-grid" key={n}>
          <label>
            Efeito {n + 1}
            <select
              value={m.stat}
              onChange={(e) =>
                patch(n, { stat: e.target.value as PowerModifier["stat"] })
              }
            >
              <option value="attack">Bônus no resultado do ataque</option>
              <option value="attackDice">Quantidade de d20 no ataque</option>
              <option value="damage">Dano adicional</option>
              <option value="healing">Cura adicional</option>
              <option value="ritualCost">Ajuste de custo de ritual</option>
              <option value="ritualDC">DT de ritual</option>
              <option value="defense">Defesa</option>
              <option value="speed">Deslocamento (metros)</option>
              <option value="baseDice">Dados base adicionais da arma</option>
              <option value="extraWeaponDice">Dados extras da arma</option>
              <option value="critical">Margem de ameaça</option>
              <option value="criticalMultiplier">
                Multiplicador de crítico
              </option>
              <option value="attribute">Atributo temporário</option>
              <option value="skill">Bônus em perícia</option>
              <option value="testDice">Quantidade de d20 nos testes</option>
            </select>
          </label>
          <label>
            Valor ou dados
            <input
              value={m.amount}
              maxLength={16}
              required
              onChange={(e) => patch(n, { amount: e.target.value })}
              placeholder="2, -1, 1d6 ou INT"
            />
          </label>
          <label>
            Aplicar a
            <select
              value={m.scope}
              onChange={(e) =>
                patch(n, { scope: e.target.value as PowerModifier["scope"] })
              }
            >
              <option value="all">Todas as fontes compatíveis</option>
              <option value="weapon">Armas</option>
              <option value="melee">Corpo a corpo</option>
              <option value="ranged">À distância</option>
              <option value="firearm">Armas de fogo</option>
              <option value="projectile">Armas de disparo</option>
              <option value="unarmed">Desarmado</option>
              <option value="ritual">Rituais</option>
            </select>
          </label>
          {m.stat === "attribute" && (
            <label>
              Atributo
              <select
                value={m.attribute || ""}
                onChange={(e) =>
                  patch(n, { attribute: e.target.value as Attribute })
                }
              >
                <option value="">Selecione</option>
                {["AGI", "FOR", "INT", "PRE", "VIG"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          )}
          {(m.stat === "skill" || m.stat === "testDice") && (
            <label>
              Perícia
              <select
                value={m.skill || ""}
                onChange={(e) => patch(n, { skill: e.target.value })}
              >
                <option value="">
                  {m.stat === "testDice" ? "Todas" : "Selecione"}
                </option>
                {Object.keys(skillAttributes).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() =>
              onChange({ modifiers: modifiers.filter((_, i) => n !== i) })
            }
          >
            Remover efeito {n + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={modifiers.length >= 20}
        onClick={() =>
          onChange({
            modifiers: [
              ...modifiers,
              { stat: "damage", scope: "weapon", amount: "1d6" },
            ],
          })
        }
      >
        Adicionar bônus
      </button>
    </div>
  );
}
