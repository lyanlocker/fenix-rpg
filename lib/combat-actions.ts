import {
  powerRule,
  configuredPowerRule,
  type PowerRule,
  type PowerSelection,
  type PowerModifier,
  type PowerDuration,
} from "./power-rules";
import type { AppliedPower, BonusRoll } from "./power-effects";
import { ALTERNATE_FACE_ENABLED } from "./features";
import { combatItem, combatRuleName, ritualDamage } from "./combat-metadata";
import type { AttackMode } from "./combat-dice";
import type { Agent, Item } from "./rules";
import type { Encounter, Participant } from "./model";
import { effectiveAttributes } from "./rules";
export type ActionCost = "standard" | "move" | "free" | "full";
export type GrantKind = "standard" | "move" | "attack" | "meleeAttack" | "free";
export const actionLabels: Record<ActionCost, string> = {
  standard: "Padrão",
  move: "Movimento",
  free: "Livre",
  full: "Completa",
};
export type CombatRule = {
  itemId: string;
  name: string;
  action: ActionCost;
  pe: number;
  effect: "heal" | "grant" | "power";
  modifiers?: PowerModifier[];
  duration?: PowerDuration;
  condition?: string;
  passive?: boolean;
  formula?: string;
  grant?: GrantKind;
  target: "self" | "ally" | "any";
  timing: "now" | "next" | "sustained" | "scene";
  limit: "turn" | "round" | "scene";
  consume: boolean;
  medicine: boolean;
  difficulty: number;
  noRitual: boolean;
  note: string;
};
export type Budget = {
  key: string;
  standard: number;
  move: number;
  restricted: number;
  restrictedMove?: number;
  movementOnly?: number;
  attack: number;
  meleeAttack?: number;
  spentPe: number;
  attacked: boolean;
  attackCount?: number;
  latestAttackId?: string;
  ended: boolean;
};
export type CombatEffect = {
  power?: AppliedPower;
  id: string;
  sourceId: string;
  targetId: string;
  name: string;
  grant: GrantKind;
  noRitual: boolean;
  timing: "now" | "next" | "sustained" | "scene";
  createdKey: string;
  appliedKey?: string;
  upkeepKey?: string;
};
export type CombatEvent = {
  sourceItemId?: string;
  itemKind?: Item["kind"];
  action?: ActionCost;
  id: string;
  actorId: string;
  actor: string;
  targetIds: string[];
  label: string;
  text: string;
  round: number;
  secret: boolean;
  createdAt: string;
  rolls: { label: string; expression: string; dice: number[]; total: number }[];
  pending?: "damage" | "interpretation";
  proposedDamage?: number;
  damageRoll?: {
    formula: string;
    turn: string;
    done: boolean;
    sourceItemId?: string;
    critical?: number;
    maximum?: boolean;
    bonuses?: BonusRoll[];
  };
  turnKey?: string;
  resolved?: boolean;
};
export type CombatLedger = {
  budgets: Record<string, Budget>;
  uses: Record<string, string>;
  effects: CombatEffect[];
  events: CombatEvent[];
  stabilized: Record<string, number>;
};
export type CombatCommand = {
  skill?: string;
  power?: PowerSelection;
  kind:
    | "use"
    | "end"
    | "sustain"
    | "stopEffect"
    | "resolve"
    | "delay"
    | "damage";
  afterId?: string;
  attackDice?: string;
  attackMode?: AttackMode;
  damageDice?: string;
  skipDamage?: boolean;
  optionId?: string;
  targetIds?: string[];
  variant?: "base" | "discente";
  boost?: number;
  extraAttack?: boolean;
  followUpHitId?: string;
  accelerate?: boolean;
  grant?: GrantKind;
  eventId?: string;
  amount?: number;
  note?: string;
};
export type CombatOption = {
  bloodAttack?: boolean;
  power?: PowerRule;
  id: string;
  name: string;
  action: ActionCost;
  pe: number;
  item?: Item;
  effect:
    | "attack"
    | "firstAid"
    | "heal"
    | "grant"
    | "ritual"
    | "generic"
    | "move"
    | "free"
    | "investigate"
    | "custom"
    | "power";
  target: "self" | "ally" | "any" | "none";
  formula?: string;
  grant?: GrantKind;
  noRitual?: boolean;
  timing?: "now" | "next" | "sustained" | "scene";
  limit?: "turn" | "round" | "scene";
  consume?: boolean;
  medicine?: boolean;
  difficulty?: number;
  description: string;
  rule?: CombatRule;
};
export const normalizeCombatName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const minimumNex: Record<string, number> = {
  paramedico: 10,
  "surto de adrenalina": 65,
  estrategista: 40,
  "oficial comandante": 99,
  "ataque extra": 40,
  "segurar o gatilho": 60,
  "acelerar ritual": 40,
  "iniciativa aprimorada": 10,
  "sempre alerta": 99,
  "fluxo de poder": 60,
};
function eligible(a: Agent, i: Item) {
  return (
    i.quantity > 0 &&
    !(a.className === "Sobrevivente" && (i.stage || 1) > a.stage) &&
    Math.max(
      i.nex || 0,
      i.kind === "Poder"
        ? minimumNex[normalizeCombatName(combatRuleName(i))] || 0
        : 0,
    ) <= a.nex
  );
}
export function hasPower(
  a: Agent,
  name: string,
  overrides?: Record<string, CombatRule>,
) {
  return a.inventory.some(
    (i) =>
      i.kind === "Poder" &&
      !overrides?.[i.id] &&
      normalizeCombatName(combatRuleName(i)) === normalizeCombatName(name) &&
      eligible(a, i),
  );
}
export function hasMedicineKit(a: Agent) {
  return a.inventory.some(
    (i) =>
      i.quantity > 0 &&
      i.kind === "Item" &&
      /kit/.test(normalizeCombatName(combatRuleName(i))) &&
      /medic/.test(normalizeCombatName(i.name + " " + i.notes)),
  );
}
export function combatFace(a: Agent, p: Pick<Participant, "face">): Agent {
  if (!ALTERNATE_FACE_ENABLED || p.face !== "alternate") return a;
  if (!a.alternate || a.alternate.approvedCampaignId !== a.campaign_id)
    throw Error("Face alternativa não autorizada.");
  return { ...a, ...a.alternate.face };
}
export function turnKey(
  e: Pick<Encounter, "round" | "turnSerial" | "turn" | "participants">,
) {
  return `${e.round}:${e.participants[e.turn]?.id || ""}:${e.turnSerial || 0}`;
}
export function emptyLedger(): CombatLedger {
  return { budgets: {}, uses: {}, effects: [], events: [], stabilized: {} };
}
export function budgetFor(e: Encounter, p: Participant, a?: Agent): Budget {
  const key = turnKey(e),
    old = e.combat?.budgets[p.id];
  const b: Budget =
    old?.key === key
      ? { ...old }
      : {
          key,
          standard: 1,
          move: 1,
          restricted: 0,
          restrictedMove: 0,
          attack: 0,
          spentPe: 0,
          attacked: false,
          ended: false,
        };
  // Older encounters may still store standard credits in the restricted bucket.
  b.standard += b.restricted;
  b.restricted = 0;
  if (old?.key !== key && a && e.round === 1) {
    if (hasPower(a, "Iniciativa Aprimorada")) b.move++;
    if (hasPower(a, "Sempre Alerta")) b.standard++;
    if (
      a.nex >= 50 &&
      a.inventory.some(
        (i) =>
          i.attuned &&
          i.kind === "Poder" &&
          eligible(a, i) &&
          !e.combatRules?.[i.id] &&
          normalizeCombatName(combatRuleName(i)) === "velocidade do caos",
      )
    )
      b.movementOnly = 1;
  }
  for (const effect of e.combat?.effects || []) {
    if (
      effect.targetId !== p.id ||
      effect.appliedKey === key ||
      (effect.timing === "next" && effect.createdKey === key)
    )
      continue;
    if (effect.grant === "standard") b.standard++;
    if (effect.grant === "move") {
      if (effect.noRitual) b.restrictedMove = (b.restrictedMove || 0) + 1;
      else b.move++;
    }
    if (effect.grant === "attack") b.attack++;
    if (effect.grant === "meleeAttack")
      b.meleeAttack = (b.meleeAttack || 0) + 1;
  }
  return b;
}
/** Only a rolled attack whose hit the player confirms can continue the sequence. */
export function firearmFollowUp(
  events: CombatEvent[],
  budget: Budget,
  actorId: string,
  weaponId: string,
  targetId?: string,
) {
  const last = events.findLast(
    (x) =>
      x.turnKey === budget.key &&
      x.actorId === actorId &&
      x.itemKind === "Arma" &&
      x.damageRoll,
  );
  if (
    !last ||
    (budget.latestAttackId && budget.latestAttackId !== last.id) ||
    last.sourceItemId !== weaponId ||
    last.targetIds[0] !== targetId ||
    !last.rolls.some((roll) => roll.label === "Dano")
  )
    return;
  const count =
    budget.attackCount ?? countTurnAttacks(events, budget.key, actorId);
  return { hitId: last.id, cost: 2 * count };
}
export function countTurnAttacks(
  events: CombatEvent[],
  key: string,
  actorId: string,
) {
  return events.filter(
    (x) =>
      x.turnKey === key &&
      x.actorId === actorId &&
      x.itemKind === "Arma" &&
      x.damageRoll,
  ).length;
}
export function actionAvailable(
  b: Budget,
  cost: ActionCost,
  ritual = false,
  attack = false,
  melee = false,
  moving = false,
) {
  if (b.ended) return false;
  const s = b.standard + b.restricted;
  const m = b.move + (ritual ? 0 : b.restrictedMove || 0);
  return (
    cost === "free" ||
    (cost === "move"
      ? m + s + (moving ? b.movementOnly || 0 : 0) > 0
      : cost === "full"
        ? s > 0 && m + s >= 2
        : s > 0 ||
          (attack && (b.attack > 0 || (melee && (b.meleeAttack || 0) > 0))))
  );
}
export function executionCost(text = ""): ActionCost | null {
  const n = normalizeCombatName(text);
  if (/reacao|minuto|hora|rodadas|turnos|\d+\s+acoes/.test(n)) return null;
  return /completa/.test(n)
    ? "full"
    : /padrao/.test(n)
      ? "standard"
      : /movimento/.test(n)
        ? "move"
        : /livre/.test(n)
          ? "free"
          : null;
}
export function combatOptions(
  a: Agent,
  rules: Record<string, CombatRule> = {},
  actorEffects: CombatEffect[] = [],
): CombatOption[] {
  const unarmed: Item = {
    id: "unarmed",
    name: "Ataque desarmado",
    kind: "Arma",
    quantity: 1,
    spaces: 0,
    damage: hasPower(a, "Artista Marcial")
      ? a.nex >= 70
        ? "1d10"
        : a.nex >= 35
          ? "1d8"
          : "1d6"
      : "1d3",
    attackSkill: "Luta",
    weaponType: "Corpo a corpo",
    critical: "20/x2",
    notes:
      "Normalmente causa dano não letal. Artista Marcial permite dano letal e usa as regras de arma ágil.",
  };
  const options: CombatOption[] = [
    {
      id: "unarmed",
      name: unarmed.name,
      item: unarmed,
      action: "standard",
      pe: 0,
      effect: "attack",
      target: "any",
      description: unarmed.notes,
    },
    {
      id: "move",
      name: "Deslocar-se",
      action: "move",
      pe: 0,
      effect: "move",
      target: "none",
      description:
        "Uma ação de movimento. O mestre acompanha distância e posicionamento.",
    },
    {
      id: "interact",
      name: "Interagir",
      action: "move",
      pe: 0,
      effect: "generic",
      target: "none",
      description:
        "Interaja com um objeto ou com o ambiente usando uma ação de movimento.",
    },
    {
      id: "free",
      name: "Falar / ação livre",
      action: "free",
      pe: 0,
      effect: "free",
      target: "none",
      description:
        "Ações livres não têm uma cota fixa. Limites específicos continuam valendo.",
    },
    {
      id: "firstAid",
      name: "Primeiros socorros",
      action: "standard",
      pe: 0,
      effect: "firstAid",
      target: "ally",
      description: `Medicina (INT), DT 20 + 5 por estabilização nesta cena. Retira morrendo e inconsciente e deixa com 1 PV. ${hasMedicineKit(a) ? "Kit de Medicina disponível." : "Sem kit: −5 no teste."}`,
    },
  ];
  const bloodPowers = a.inventory.filter(
    (i) =>
      i.kind === "Poder" &&
      eligible(a, i) &&
      normalizeCombatName(combatRuleName(i)) === "arma de sangue" &&
      !rules[i.id],
  );
  const permanentBlood = bloodPowers.some((i) => i.attuned && a.nex >= 50);
  if (
    permanentBlood ||
    bloodPowers.some((i) =>
      actorEffects.some(
        (x) =>
          x.power?.manifestation === "bloodWeapon" && x.power.itemId === i.id,
      ),
    )
  ) {
    const bloodWeapon: Item = {
      id: "blood-weapon",
      name: "Arma de Sangue",
      kind: "Arma",
      quantity: 1,
      spaces: 0,
      damage: permanentBlood ? "1d10" : "1d6",
      attackSkill: "Luta",
      weaponType: "Corpo a corpo",
      critical: "20/x2",
      element: "Sangue",
      notes:
        "Arma simples, leve, de Sangue. Não precisa ser empunhada. O dano base recebe FOR como nos demais ataques corpo a corpo.",
    };
    const attack: CombatOption = {
      id: bloodWeapon.id,
      name: "Atacar com Arma de Sangue",
      item: bloodWeapon,
      action: "standard",
      pe: 0,
      effect: "attack",
      target: "any",
      description: bloodWeapon.notes,
    };
    options.push(attack, {
      ...attack,
      id: "blood-weapon-extra",
      name: "Arma de Sangue · ataque adicional",
      action: "free",
      pe: 1,
      limit: "turn",
      bloodAttack: true,
      description:
        "Uma vez por turno, após usar agredir: ataque adicional exclusivamente com sua Arma de Sangue, por 1 PE.",
    });
  }
  options.push({
    id: "investigate",
    name: "Investigar",
    action: "full",
    pe: 0,
    effect: "investigate",
    target: "none",
    description:
      "Procurar pistas durante o combate: ação completa e teste de Investigação com INT. O mestre determina o que pode ser descoberto neste tempo e a DT; pesquisas demoradas podem exigir mais ações.",
  });
  for (const action of Object.keys(actionLabels) as ActionCost[])
    options.push({
      id: `custom:${action}`,
      name: "Ação avulsa",
      action,
      pe: 0,
      effect: "custom",
      target: "none",
      description:
        "Descreva uma ação não listada. O custo corresponde à aba escolhida; o mestre confere alcance, efeitos e eventual teste.",
    });
  for (const stored of a.inventory) {
    const item = combatItem(stored);
    if (!eligible(a, item)) continue;
    const name = normalizeCombatName(combatRuleName(item)),
      custom = rules[item.id],
      base = {
        id: item.id,
        name: item.name,
        item,
        pe: item.cost || 0,
        description: item.notes,
      };
    if (custom?.itemId === item.id) {
      options.push({
        ...base,
        ...custom,
        id: item.id,
        rule: custom,
        ...(custom.effect === "power"
          ? { power: configuredPowerRule(custom) }
          : {}),
        description: custom.note || item.notes,
      });
      continue;
    }
    if (item.kind === "Arma") {
      options.push({
        ...base,
        action: executionCost(item.execution) || "standard",
        effect: "attack",
        target: "any",
      });
      continue;
    }
    if (item.kind === "Item" && name === "cicatrizante") {
      options.push({
        ...base,
        action: hasPower(a, "Especialista em Emergências")
          ? "move"
          : "standard",
        effect: "heal",
        target: "any",
        formula: "2d8+2",
        consume: true,
        pe: 0,
      });
      continue;
    }
    if (item.kind === "Poder" && name === "paramedico") {
      if (hasMedicineKit(a))
        options.push({
          ...base,
          action: "standard",
          effect: "heal",
          target: "ally",
          formula: "2d10",
          pe: 2,
        });
      continue;
    }
    if (
      item.kind === "Poder" &&
      ["iniciativa aprimorada", "sempre alerta"].includes(name)
    ) {
      options.push({
        ...base,
        action: "free",
        effect: "power",
        target: "self",
        power: {
          ...powerRule(item, a),
          passive: true,
          warning:
            "A ação adicional já é concedida automaticamente no primeiro turno.",
        },
      });
      continue;
    }
    if (item.kind === "Poder" && name === "surto temporal") {
      options.push({
        ...base,
        action: "free",
        effect: "grant",
        target: "self",
        grant: "standard",
        timing: "now",
        pe: 3,
        limit: item.attuned && a.nex >= 50 ? "turn" : "scene",
      });
      continue;
    }
    if (item.kind === "Poder" && name === "surto de adrenalina") {
      options.push({
        ...base,
        action: "free",
        effect: "grant",
        target: "self",
        grant: "standard",
        timing: "now",
        pe: 5,
        limit: "round",
      });
      continue;
    }
    if (
      item.kind === "Poder" &&
      (name === "estrategista" || name === "oficial comandante")
    ) {
      options.push({
        ...base,
        action: "standard",
        effect: "grant",
        target: "ally",
        grant: name === "estrategista" ? "move" : "standard",
        timing: "next",
        pe: name === "estrategista" ? 1 : 5,
      });
      continue;
    }
    if (item.kind === "Item" && name === "cranio espiral") {
      options.push({
        ...base,
        action: "free",
        effect: "grant",
        target: "self",
        grant: "standard",
        timing: "now",
        pe: 0,
        limit: "round",
        description: `${base.description} Empunhe o crânio. A ação é concedida mesmo se o teste falhar; o mestre acompanha a DT cumulativa do dia, envelhecimento e impedimento de novo uso.`,
      });
      continue;
    }
    if (item.kind === "Poder") {
      const power = powerRule(item, a);
      options.push({
        ...base,
        pe: power.pe,
        action: power.action,
        effect: "power",
        target: power.target,
        power,
      });
      continue;
    }
    const extra =
      name === "velocidade mortal" ? null : extraActionFromText(item);
    if (extra) {
      options.push({ ...base, ...extra, effect: "grant" });
      continue;
    }
    if (item.kind === "Ritual") {
      const action = executionCost(item.execution);
      if (!action) continue;
      options.push({
        ...base,
        action,
        formula: ritualDamage(item) || undefined,
        target:
          normalizeCombatName(item.target || "") === "voce" ? "self" : "any",
        effect:
          name === "cicatrizacao"
            ? "heal"
            : name === "velocidade mortal"
              ? "grant"
              : "ritual",
        ...(name === "cicatrizacao" ? { pe: 1, formula: "3d8+3" } : {}),
        ...(name === "velocidade mortal"
          ? {
              pe: 3,
              grant: "move" as const,
              timing: "sustained" as const,
              noRitual: true,
            }
          : {}),
      });
      continue;
    }
    const action = executionCost(
      item.execution ||
        item.notes.match(
          /(?:gastar|usar|gaste|use) (?:uma )?ação (padrão|de movimento|livre|completa)/i,
        )?.[0],
    );
    if (action)
      options.push({ ...base, action, effect: "generic", target: "any" });
  }
  return options;
}
export function effortLimit(a: Agent, ritual = false) {
  const death = a.inventory.find(
    (i) =>
      eligible(a, i) &&
      normalizeCombatName(combatRuleName(i)) === "encarar a morte",
  );
  return (
    (a.className === "Sobrevivente"
      ? a.stage
      : a.nex === 99
        ? 20
        : Math.max(1, Math.floor(a.nex / 5))) +
    (death ? (death.attuned && a.nex >= 50 ? 3 : 1) : 0) +
    (hasPower(a, "Dedicação") ? 1 : 0) +
    (ritual && hasPower(a, "Presença Poderosa")
      ? effectiveAttributes(a).PRE
      : 0)
  );
}
export function medicBoostLimit(a: Agent) {
  return [40, 65, 99].filter((n) => a.nex >= n).length;
}
export function maxTargets(o: CombatOption, a: Agent) {
  if (
    o.item &&
    ["ensaio", "mosh pit"].includes(normalizeCombatName(combatRuleName(o.item)))
  )
    return 100;
  return normalizeCombatName(o.name) === "estrategista"
    ? Math.max(1, effectiveAttributes(a).INT)
    : normalizeCombatName(o.name) === "oficial comandante"
      ? 100
      : 1;
}

/** Only unconditional, explicit +1 action text. Conditional/mode-specific rules stay with the GM editor. */
export function extraActionFromText(
  item: Item,
): Pick<
  CombatOption,
  "action" | "grant" | "target" | "timing" | "noRitual" | "limit"
> | null {
  const text = normalizeCombatName(item.notes).replace(/\s+/g, " ");
  if (
    /\b(caso|se|quando|apos|antes|enquanto|afinidade|discente|verdadeiro|teste|testes|rolar|rolagem|rodadas|primeiro|primeira|interludio)\b|apenas|somente|ao acertar|ao atacar|ao causar|ao sofrer|ou de movimento|ou uma acao|a cada \d/.test(
      text,
    )
  )
    return null;
  const unrestrictedText = text.replace(
    /(?:esta acao )?nao pode ser usada para conjurar rituais[.]?/,
    "",
  );
  if (
    /nao (?:pode|permite)|para (?:atacar|agredir|conjurar|deslocar)|por \d+|durante \d+/.test(
      unrestrictedText,
    )
  )
    return null;
  const matches = [
    ...text.matchAll(
      /(?:voce|o alvo|o usuario|um aliado) (?:recebe|ganha|obtem|pode realizar) (?:(?:uma?|1) acao (padrao|de movimento|livre) (?:adicional|extra)|\+1 acao (padrao|de movimento|livre))/g,
    ),
  ];
  const match = matches.length === 1 ? matches[0] : null;
  const action = executionCost(item.execution);
  if (!match || !action) return null;
  const timing = /sustentada/.test(normalizeCombatName(item.duration || ""))
    ? "sustained"
    : /proximo turno/.test(text)
      ? "next"
      : /(?:cada|por|todos os) turno/.test(text) &&
          /cena/.test(text + " " + normalizeCombatName(item.duration || ""))
        ? "scene"
        : /(?:cada|por|todos os) turno/.test(text)
          ? null
          : "now";
  if (!timing) return null;
  const kind = match[1] || match[2];
  return {
    action,
    grant:
      kind === "padrao"
        ? "standard"
        : kind === "de movimento"
          ? "move"
          : "free",
    target: /^(voce|o usuario)/.test(match[0]) ? "self" : "any",
    timing,
    noRitual: /nao (?:pode|permite)[^.]*ritua/.test(text),
    limit: /uma vez por cena/.test(text)
      ? "scene"
      : /uma vez por rodada/.test(text)
        ? "round"
        : "turn",
  };
}

/** Keep every unresolved event and only the latest completed history entries. */
export function retainCombatEvents(
  events: CombatEvent[],
  history = 40,
): CombatEvent[] {
  let remaining = history;
  return events
    .toReversed()
    .filter((event) => {
      if (event.pending && !event.resolved) return true;
      return remaining-- > 0;
    })
    .reverse();
}
