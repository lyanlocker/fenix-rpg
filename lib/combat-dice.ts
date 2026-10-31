import {
  check,
  die,
  effectiveAttributes,
  skillBonus,
  type Agent,
  type Item,
} from "./rules";
import {
  weaponAttackBonus,
  weaponDamage,
  weaponType,
} from "./weapon-modifications";
export type AttackMode = "highest" | "lowest";
export function parseAttackDice(text: string) {
  const value = text.toLowerCase().replace(/\s/g, "");
  const m = /^(\d{1,2})d20([+-]\d{1,4})?$/.exec(value);
  if (!m || +m[1] < 1 || +m[1] > 10 || Math.abs(Number(m[2] || 0)) > 1000)
    throw Error("Ataque: use de 1 a 10d20 e bônus de até 1.000, como 3d20+5.");
  return { count: +m[1], bonus: Number(m[2] || 0) };
}
export function rollAttackDice(
  text: string,
  mode: AttackMode = "highest",
  roll = die,
) {
  const { count, bonus } = parseAttackDice(text);
  if (mode !== "highest" && mode !== "lowest")
    throw Error("Escolha o maior ou o menor dado.");
  const dice = Array.from({ length: count }, () => roll(20));
  return {
    expression: `${count}d20 (${mode === "highest" ? "maior" : "menor"}) ${bonus >= 0 ? "+" : ""}${bonus}`,
    dice,
    total: (mode === "highest" ? Math.max(...dice) : Math.min(...dice)) + bonus,
  };
}
export function rollDamageDice(
  text: string,
  roll = die,
): ReturnType<typeof check> {
  const value = text.toLowerCase().replace(/\s/g, "");
  if (
    !value ||
    value.length > 80 ||
    !/^(?:\d+d\d+|\d+)(?:[+-](?:\d+d\d+|\d+))*$/.test(value)
  )
    throw Error("Dano: use uma expressão como 2d6+3 ou 2d6+1d4+3.");
  const terms = value.match(/[+-]?[^+-]+/g)!;
  let count = 0,
    total = 0;
  const dice: number[] = [];
  const parsed = terms.map((term) => {
    const sign = term.startsWith("-") ? -1 : 1;
    const parts = term.replace(/^[+-]/, "").split("d").map(Number);
    if (parts.length === 1) {
      if (parts[0] > 100000) throw Error("Bônus de dano excede 100.000.");
      return { sign, count: 0, sides: 0, fixed: parts[0] };
    }
    const [n, sides] = parts;
    count += n;
    if (n < 1 || count > 100 || sides < 2 || sides > 1000000)
      throw Error("Use até 100 dados, com 2 a 1.000.000 lados.");
    return { sign, count: n, sides, fixed: 0 };
  });
  for (const t of parsed) {
    total += t.sign * t.fixed;
    for (let i = 0; i < t.count; i++) {
      const d = roll(t.sides);
      dice.push(t.sign * d);
      total += t.sign * d;
    }
  }
  return { expression: value, dice, total };
}
export function weaponRollSuggestion(a: Agent, item: Item) {
  const attributes = effectiveAttributes(a),
    melee = weaponType(item) === "Corpo a corpo";
  const name = item.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const martial = a.inventory.some(
    (i) => i.kind === "Poder" && i.quantity > 0 && i.name === "Artista Marcial",
  );
  const agile =
    melee &&
    (["faca", "punhal", "cajado", "nunchaku", "florete", "katana"].includes(
      name,
    ) ||
      (item.id === "unarmed" && martial));
  const skill = item.attackSkill || (melee ? "Luta" : "Pontaria");
  const attr =
    skill === "Pontaria" || (agile && attributes.AGI > attributes.FOR)
      ? "AGI"
      : "FOR";
  const bonus = skillBonus(a, skill).total + weaponAttackBonus(item);
  let damage = weaponDamage(item);
  if (melee) {
    const fixed =
      Number(/([+-]\d+)$/.exec(damage)?.[1] || 0) +
      attributes[agile ? attr : "FOR"];
    damage = damage.replace(/([+-]\d+)$/, "") + (fixed >= 0 ? "+" : "") + fixed;
  }
  return {
    attack: `${Math.min(10, attributes[attr] || 2)}d20${bonus >= 0 ? "+" : ""}${bonus}`,
    mode: (attributes[attr] === 0 ? "lowest" : "highest") as AttackMode,
    damage,
    skill,
  };
}
