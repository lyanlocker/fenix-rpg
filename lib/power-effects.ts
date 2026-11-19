import {
  effectiveAttributes,
  skillAttributes,
  accessoryDefenseBonus,
  maximums,
  type Agent,
  type Attribute,
  type Item,
} from "./rules";
import type { Encounter, Participant } from "./model";
import type { CombatEffect, CombatRule } from "./combat-actions";
import { turnKey } from "./combat-actions";
import { combatRuleName, combatSkillAttribute } from "./combat-metadata";
import { weaponType } from "./weapon-modifications";
import {
  powerRule,
  configuredPowerRule,
  powerAmount,
  normalizePower,
  type PowerModifier,
  type PowerDuration,
} from "./power-rules";
export type AppliedPower = {
  itemId: string;
  ruleName?: string;
  weaponId?: string;
  injuredOnly?: boolean;
  enemyId?: string;
  duration: PowerDuration;
  manifestation?: "bloodWeapon";
  expires?: "nextTurnEnd";
  modifiers: PowerModifier[];
};
export type BonusRoll = {
  source: string;
  formula: string;
  criticalBase?: number;
  sides?: number;
};
export type Contribution = PowerModifier & {
  source: string;
  effectId?: string;
  weaponId?: string;
  enemyId?: string;
};
export function powerEffectActive(effect: CombatEffect, e: Encounter) {
  if (!effect.power) return true;
  const key = turnKey(e);
  if (effect.power.duration === "round")
    return effect.createdKey.split(":")[0] === String(e.round);
  if (effect.power.duration === "turn") return effect.createdKey === key;
  if (effect.power.duration === "nextTurn")
    return (
      effect.createdKey === key ||
      e.participants[e.turn]?.id !== effect.sourceId
    );
  return true;
}
export function passivePowerContributions(
  a: Agent,
  rules?: Record<string, CombatRule>,
): Contribution[] {
  const result: Contribution[] = [];
  const sources = new Set<string>();
  for (const item of a.inventory) {
    if (
      item.kind !== "Poder" ||
      item.quantity < 1 ||
      (item.nex || 0) > a.nex ||
      ((item.stage || 1) > a.stage && a.className === "Sobrevivente")
    )
      continue;
    const element =
      item.element ||
      item.name.match(/sangue|morte|energia|conhecimento|medo/i)?.[0] ||
      "";
    const source = `${normalizePower(combatRuleName(item))}:${normalizePower(element)}`;
    if (sources.has(source)) continue;
    sources.add(source);
    const config = rules?.[item.id];
    const rule =
      config?.effect === "power"
        ? configuredPowerRule(config)
        : powerRule(item, a);
    const permanent = rule.passive ? rule.modifiers : rule.always || [];
    if (!rule.blocked || !rule.passive)
      result.push(...permanent.map((m) => ({ ...m, source: item.name })));
  }
  return result;
}
export function powerContributions(
  a: Agent,
  e: Encounter,
  p: Pick<Participant, "id">,
): Contribution[] {
  const result = passivePowerContributions(a, e.combatRules);
  for (const effect of e.combat?.effects || []) {
    if (
      effect.targetId !== p.id ||
      !effect.power ||
      !powerEffectActive(effect, e) ||
      (effect.power.injuredOnly && a.resources.pv > maximums(a).pv / 2)
    )
      continue;
    result.push(
      ...effect.power.modifiers.map((m) => ({
        ...m,
        source: effect.name,
        effectId: effect.id,
        weaponId: effect.power!.weaponId,
        enemyId: effect.power!.enemyId,
      })),
    );
  }
  return result;
}
export function appliesTo(
  m: PowerModifier & { weaponId?: string },
  item?: Item,
) {
  if (m.weaponId && m.weaponId !== item?.id) return false;
  if (
    m.element &&
    normalizePower(m.element) !== normalizePower(item?.element || "")
  )
    return false;
  if (m.personalOnly && normalizePower(item?.range || "") !== "pessoal")
    return false;
  if (m.saves) {
    const resistance = normalizePower(item?.resistance || "").split(/[^a-z]+/);
    if (!m.saves.some((s) => resistance.includes(normalizePower(s))))
      return false;
  }
  if (m.scope === "all") return true;
  if (m.scope === "ritual") return item?.kind === "Ritual";
  if (item?.kind !== "Arma") return false;
  if (m.scope === "weapon") return true;
  if (m.scope === "unarmed") return item.id === "unarmed";
  const type = weaponType(item);
  if (m.scope === "melee")
    return (
      type === "Corpo a corpo" &&
      (m.stat !== "baseDice" || item.id !== "unarmed")
    );
  if (m.scope === "projectile") return type === "Disparo";
  if (m.scope === "firearm") return type === "Arma de fogo";
  return type !== "Corpo a corpo";
}
export function fixedBonus(
  ms: Contribution[],
  stat: PowerModifier["stat"],
  a: Agent,
  item?: Item,
  field?: string,
) {
  return ms
    .filter(
      (m) =>
        m.stat === stat &&
        appliesTo(m, item) &&
        (stat !== "attribute" || m.attribute === field) &&
        (!["skill", "testDice"].includes(stat) ||
          !m.skill ||
          normalizePower(m.skill) === normalizePower(field || "")),
    )
    .reduce(
      (sum, m) =>
        /^\d+d\d+$/.test(m.amount) ? sum : sum + powerAmount(m.amount, a),
      0,
    );
}
export function bonusRolls(
  ms: Contribution[],
  stat: "damage" | "healing" | "attack" | "skill",
  a: Agent,
  item?: Item,
  field?: string,
  critical = 1,
): BonusRoll[] {
  const output: BonusRoll[] = [];
  for (const m of ms) {
    if (!appliesTo(m, item)) continue;
    if (["baseDice", "extraWeaponDice"].includes(m.stat) && stat === "damage") {
      const die = item?.damage.match(/\d+d(\d+)/i);
      if (die)
        output.push({
          source: m.source,
          formula: `${powerAmount(m.amount, a) * (m.stat === "baseDice" ? critical : 1)}d${die[1]}`,
          ...(m.stat === "baseDice"
            ? { criticalBase: powerAmount(m.amount, a), sides: +die[1] }
            : {}),
        });
    } else if (
      m.stat === stat &&
      (!["skill", "testDice"].includes(stat) ||
        !m.skill ||
        normalizePower(m.skill) === normalizePower(field || ""))
    ) {
      const formula = /^\d+d\d+$/.test(m.amount)
        ? m.amount
        : String(
            powerAmount(m.amount, a) +
              (["AGI", "FOR", "INT", "PRE", "VIG"].includes(m.amount)
                ? fixedBonus(ms, "attribute", a, item, m.amount)
                : 0),
          );
      output.push({ source: m.source, formula });
    }
  }
  return output;
}
export function consumePowerEffects(
  e: Encounter,
  p: Pick<Participant, "id">,
  used: "attack" | "ritual" | "test",
  contributions: Contribution[],
  item?: Item,
  skill?: string,
  attribute?: Attribute,
) {
  const consumed = new Set(
    contributions
      .filter(
        (m) =>
          m.effectId &&
          appliesTo(m, item) &&
          (used !== "test" ||
            (((m.stat === "attribute" && m.attribute === attribute) ||
              m.stat === "testDice" ||
              m.stat === "skill") &&
              (!m.skill ||
                normalizePower(m.skill) === normalizePower(skill || "")))),
      )
      .map((m) => m.effectId),
  );
  if (e.combat)
    e.combat.effects = e.combat.effects.filter(
      (x) =>
        !(
          x.targetId === p.id &&
          x.power?.duration === used &&
          consumed.has(x.id)
        ),
    );
}
export function validatePowerCondition(item: Item, a: Agent) {
  if (
    normalizePower(combatRuleName(item)) === "sangue fervente" &&
    a.resources.pv > maximums(a).pv / 2
  )
    throw Error("Sangue Fervente exige estar machucado.");
}
export function attributeForAttack(
  a: Agent,
  item: Item,
  ms: Contribution[] = [],
): Attribute {
  const base = effectiveAttributes(a);
  const attr = {
      ...base,
      AGI: base.AGI + fixedBonus(ms, "attribute", a, item, "AGI"),
      FOR: base.FOR + fixedBonus(ms, "attribute", a, item, "FOR"),
    },
    melee = weaponType(item) === "Corpo a corpo";
  const agile =
    melee &&
    (["faca", "punhal", "cajado", "nunchaku", "florete", "katana"].includes(
      normalizePower(item.name),
    ) ||
      (item.id === "unarmed" &&
        a.inventory.some((i) => normalizePower(i.name) === "artista marcial")));
  if (
    item.attackSkill &&
    !["Luta", "Pontaria"].includes(item.attackSkill) &&
    skillAttributes[item.attackSkill]
  )
    return combatSkillAttribute(a, item.attackSkill);
  return item.attackSkill === "Pontaria" ||
    !melee ||
    (agile && attr.AGI > attr.FOR)
    ? "AGI"
    : "FOR";
}

export function combatDefense(
  a: Agent,
  e: Encounter,
  p: Pick<Participant, "id" | "defense">,
) {
  const modifiers = powerContributions(a, e, p);
  const base =
    p.defense ??
    10 + effectiveAttributes(a).AGI + a.defenseBonus + accessoryDefenseBonus(a);
  return (
    base +
    fixedBonus(modifiers, "defense", a) +
    fixedBonus(modifiers, "attribute", a, undefined, "AGI")
  );
}
