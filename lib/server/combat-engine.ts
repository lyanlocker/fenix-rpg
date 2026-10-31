import {
  check,
  damage,
  die,
  effectiveAttributes,
  skillBonus,
  maximums,
  type Agent,
  type Item,
} from "../rules";
import type { Encounter, Participant } from "../model";
import {
  weaponAttackBonus,
  weaponDamage,
  weaponCritical,
  weaponType,
} from "../weapon-modifications";
import { maxRitualCircle } from "../alternate";
import { advanceTurn } from "../combat";
import {
  actionAvailable,
  budgetFor,
  combatFace,
  combatOptions,
  emptyLedger,
  effortLimit,
  hasPower,
  hasMedicineKit,
  maxTargets,
  medicBoostLimit,
  normalizeCombatName,
  turnKey,
  type ActionCost,
  type CombatCommand,
  type CombatEvent,
} from "../combat-actions";
export type CombatContext = {
  role: "master" | "player";
  actorId: string | null;
  encounter: Encounter;
  revision: number;
  sheets: Record<string, Agent>;
  sheetVersions: Record<string, string>;
};
export type AgentCombatPatch = {
  id: string;
  face: "main" | "alternate";
  version: string;
  resources: Agent["resources"];
  adjustments: Agent["adjustments"];
  conditions: string[];
  inventory: Item[];
};
export class CombatError extends Error {}
function fail(message: string): never {
  throw new CombatError(message);
}
export function executeCombatCommand(
  context: CombatContext,
  command: CombatCommand,
  actorId: string,
  roll = die,
  now = new Date().toISOString(),
  eventId = crypto.randomUUID(),
) {
  let e = structuredClone(context.encounter);
  const sheets = structuredClone(context.sheets);
  if (!e.started) fail("O combate já foi encerrado.");
  e.combat ||= emptyLedger();
  const ledger = e.combat;
  const p = e.participants.find((p) => p.id === actorId);
  if (!p) fail("Participante não encontrado.");
  if (
    context.role === "player" &&
    (context.actorId !== p.id || p.playerAccess === false)
  )
    fail("Esta ficha não foi liberada para o combate.");
  if (context.role === "player" && !e.active) fail("O combate está pausado.");
  const faceOf = (p: Participant) =>
    p.agentId && sheets[p.agentId]
      ? combatFace(sheets[p.agentId], p)
      : undefined;
  const face = faceOf(p),
    changed = new Map<string, { p: Participant; a: Agent }>();
  function saveFace(p: Participant, a: Agent) {
    if (!p.agentId) return;
    const original = sheets[p.agentId];
    if (p.face === "alternate")
      original.alternate!.face = {
        ...original.alternate!.face,
        resources: a.resources,
        adjustments: a.adjustments,
        conditions: a.conditions,
        inventory: a.inventory,
      };
    else sheets[p.agentId] = a;
    changed.set(p.agentId, { p, a });
  }
  function hp(target: Participant, value: number, absolute = false) {
    const a = faceOf(target),
      current = a?.resources.pv ?? target.pv,
      max = a ? maximums(a).pv : target.maxPv;
    target.pv = Math.max(0, Math.min(max, absolute ? value : current + value));
    target.maxPv = max;
    if (a) {
      a.resources.pv = target.pv;
      saveFace(target, a);
    }
    return target.pv - current;
  }
  const event: CombatEvent = {
    id: eventId,
    actorId: p.id,
    actor: p.name,
    targetIds: [],
    label: "",
    text: "",
    round: e.round,
    secret: p.hidden,
    createdAt: now,
    rolls: [],
  };
  function addRoll(label: string, r: ReturnType<typeof check>) {
    event.rolls.push({ label, ...r });
    return r;
  }
  function test(
    a: Agent,
    skill: string,
    attr: "INT" | "FOR" | "AGI" | "PRE",
    bonus = 0,
  ) {
    return addRoll(
      skill,
      check(
        Math.min(10, effectiveAttributes(a)[attr]),
        skillBonus(a, skill).total + bonus,
        roll,
      ),
    );
  }
  if (command.kind === "resolve") {
    if (context.role !== "master")
      fail("Somente o mestre pode resolver esta ação.");
    const pending = ledger.events.find(
      (x) => x.id === command.eventId && x.pending && !x.resolved,
    );
    if (!pending) fail("Esta ação já foi resolvida ou não existe.");
    event.label = `Resolução · ${pending.label}`;
    event.targetIds = pending.targetIds;
    event.secret = pending.secret;
    if (pending.pending === "damage") {
      const target = e.participants.find((t) => t.id === pending.targetIds[0]);
      if (!target) fail("O alvo saiu do combate.");
      const amount = command.amount;
      if (!Number.isInteger(amount) || amount! < 0 || amount! > 100000)
        fail("Informe o dano final, de 0 a 100.000.");
      hp(target, -amount!);
      event.text = `${amount} de dano final em ${target.name}. ${command.note || ""}`;
    } else event.text = command.note || "Efeito conferido pelo mestre.";
    pending.resolved = true;
  } else {
    if (!e.active) fail("Retome o combate para executar ações.");
    if (e.participants[e.turn]?.id !== p.id)
      fail("Aguarde o turno deste personagem.");
    if (!face)
      fail("Use os controles de ameaça do mestre para este participante.");
    if (
      face.resources.pv <= 0 ||
      face.conditions.some((c) => /^(morto|inconsciente|paralisado)$/i.test(c))
    )
      fail(
        "Este personagem não pode agir nesta condição. O mestre pode ajustar a ficha.",
      );
    const budget = budgetFor(e, p, face);
    ledger.budgets[p.id] = budget;
    const key = turnKey(e);
    for (const x of ledger.effects)
      if (
        x.targetId === p.id &&
        x.appliedKey !== key &&
        !(x.timing === "next" && x.createdKey === key)
      )
        x.appliedKey = key;
    ledger.effects = ledger.effects.filter(
      (x) =>
        x.timing === "sustained" || x.appliedKey !== key || x.targetId !== p.id,
    );
    const upkeep = ledger.effects.filter(
      (x) =>
        x.sourceId === p.id &&
        x.timing === "sustained" &&
        x.createdKey !== key &&
        x.upkeepKey !== key,
    );
    function pay(cost: number, minimum = cost) {
      if (!Number.isInteger(cost) || cost < 0 || cost > 999)
        fail("Custo inválido.");
      const resource = face!.determination ? "pd" : "pe";
      if (face!.resources[resource] < cost)
        fail("Pontos de esforço/determinação insuficientes.");
      const limit = effortLimit(face!);
      if (
        budget.spentPe + cost > limit &&
        !(budget.spentPe === 0 && cost === minimum)
      )
        fail(`Limite de ${limit} pontos por turno excedido.`);
      face!.resources[resource] -= cost;
      budget.spentPe += cost;
      saveFace(p!, face!);
    }
    function spend(cost: ActionCost, ritual = false, attack = false) {
      if (!actionAvailable(budget, cost, ritual, attack))
        fail("Esta ação já foi gasta neste turno.");
      const standard = () => {
        if (!ritual && budget.restricted > 0) budget.restricted--;
        else budget.standard--;
      };
      if (cost === "standard") {
        if (attack && budget.attack > 0) budget.attack--;
        else standard();
      }
      if (cost === "move") {
        if (budget.move > 0) budget.move--;
        else standard();
      }
      if (cost === "full") {
        standard();
        budget.move--;
      }
    }
    function once(id: string, limit?: "turn" | "round" | "scene") {
      if (!limit) return;
      const scope =
          limit === "scene" ? e.id : limit === "round" ? String(e.round) : key,
        useKey = `${p!.id}:${id}`;
      if (ledger.uses[useKey] === scope)
        fail("Este efeito já foi usado no período permitido.");
      ledger.uses[useKey] = scope;
    }
    if (command.kind === "sustain" || command.kind === "stopEffect") {
      const effect = ledger.effects.find(
        (x) =>
          x.id === command.eventId &&
          x.sourceId === p.id &&
          x.timing === "sustained",
      );
      if (!effect) fail("Efeito sustentado não encontrado.");
      event.label = effect.name;
      if (command.kind === "sustain") {
        if (!upkeep.includes(effect))
          fail("Este ritual já está sustentado neste turno.");
        pay(1);
        effect.upkeepKey = key;
        event.text = "Ritual sustentado: 1 ponto gasto.";
      } else {
        ledger.effects = ledger.effects.filter((x) => x.id !== effect.id);
        event.text = "Sustentação encerrada.";
        const b = ledger.budgets[effect.targetId];
        if (b?.key === key && effect.appliedKey === key) {
          if (effect.grant === "move") b.move = Math.max(0, b.move - 1);
          if (effect.grant === "standard") {
            const k = effect.noRitual ? "restricted" : "standard";
            b[k] = Math.max(0, b[k] - 1);
          }
        }
      }
    } else {
      if (upkeep.length)
        fail("Sustente ou encerre seus rituais antes de agir neste turno.");
      if (budget.ended) fail("Seu turno já foi encerrado.");
      if (command.kind === "end") {
        budget.ended = true;
        event.label = "Encerrar turno";
        event.text = `${p.name} concluiu o turno.`;
        e = advanceTurn(e);
      } else {
        const option = combatOptions(face, e.combatRules).find(
          (o) => o.id === command.optionId,
        );
        if (!option) fail("Esta ação não está disponível na ficha.");
        const targets = [...new Set(command.targetIds || [])].map((id) => {
          const t = e.participants.find((t) => t.id === id);
          if (!t || (context.role === "player" && t.hidden && t.id !== p.id))
            fail("Alvo indisponível.");
          return t;
        });
        if (option.target === "self") {
          if (
            targets.length &&
            (targets.length !== 1 || targets[0].id !== p.id)
          )
            fail("Este efeito só pode ser usado em você.");
          targets.splice(0, targets.length, p);
        }
        if (option.target !== "none" && !targets.length)
          fail("Selecione o alvo.");
        if (targets.length > maxTargets(option, face))
          fail("Quantidade de alvos excedida.");
        if (option.target === "ally" && targets.some((t) => !t.agentId))
          fail("Selecione um personagem aliado.");
        if (option.effect === "attack" && targets[0]?.id === p.id)
          fail("Escolha outro participante para atacar.");
        const name = normalizeCombatName(option.name),
          ritual = option.item?.kind === "Ritual";
        let cost = option.pe,
          formula = option.formula,
          grant = option.grant,
          action = option.action;
        if (name === "estrategista" || name === "oficial comandante") {
          if (targets.some((t) => t.id === p.id))
            fail("Esta habilidade afeta seus aliados.");
          if (name === "estrategista") cost *= targets.length;
        }
        const boost = command.boost || 0;
        if (name === "paramedico") {
          if (
            !Number.isInteger(boost) ||
            boost < 0 ||
            boost > medicBoostLimit(face)
          )
            fail("Ampliação de cura indisponível neste NEX.");
          cost += boost;
          formula = `${2 + boost}d10`;
        } else if (boost) fail("Esta ação não aceita ampliação de cura.");
        if (command.variant === "discente") {
          if (!ritual || !["cicatrizacao", "velocidade mortal"].includes(name))
            fail("Este aprimoramento precisa de resolução do mestre.");
          if (maxRitualCircle(face.className, face.nex) < 2)
            fail("É necessário acesso ao 2º círculo.");
          if (name === "cicatrizacao") {
            cost += 2;
            formula = "5d8+5";
          } else {
            cost += 3;
            grant = "standard";
          }
        }
        if (name === "surto de adrenalina") {
          if (command.grant && !["standard", "move"].includes(command.grant))
            fail("Escolha ação padrão ou movimento.");
          grant = command.grant || "standard";
        } else if (command.grant && command.grant !== grant)
          fail("A ação concedida é definida pela habilidade.");
        if (
          ritual &&
          (option.item!.circle || 1) > maxRitualCircle(face.className, face.nex)
        )
          fail("Ritual indisponível neste NEX.");
        if (command.accelerate) {
          if (!ritual || !hasPower(face, "Acelerar Ritual"))
            fail("Acelerar Ritual não está disponível.");
          once("Acelerar Ritual", "round");
          action = "free";
          cost += 4;
        }
        if (command.extraAttack) {
          if (
            option.effect !== "attack" ||
            !hasPower(face, "Ataque Extra") ||
            !budget.attacked
          )
            fail(
              "Ataque Extra exige um ataque anterior neste turno e a habilidade na ficha.",
            );
          once("Ataque Extra", "round");
          action = "free";
          cost += 2;
        }
        once(option.id, option.limit);
        spend(action, !!ritual, option.effect === "attack");
        pay(cost, option.pe);
        event.label = option.name;
        event.targetIds = targets.map((t) => t.id);
        event.secret ||= targets.some((t) => t.hidden);
        event.text = `${option.name}${targets.length ? ` → ${targets.map((t) => t.name).join(", ")}` : ""}.`;
        if (
          ritual &&
          normalizeCombatName(option.item!.element || "") !== "medo"
        ) {
          const result = test(face, "Ocultismo", "INT"),
            dt = 20 + cost;
          if (result.total < dt) {
            const resource = face.determination ? "pd" : "san";
            face.resources[resource] = Math.max(
              0,
              face.resources[resource] -
                cost -
                (face.determination && result.total <= dt - 5 ? 1 : 0),
            );
            if (result.total <= dt - 5 && !face.determination) {
              face.adjustments.san -= 1;
              face.resources.san = Math.min(
                face.resources.san,
                maximums(face).san,
              );
            }
            event.text += ` Custo do Paranormal: ${result.total}/DT ${dt}; perda de ${cost} ${face.determination ? "PD" : "SAN"}${result.total <= dt - 5 ? (face.determination ? " e 1 PD" : " e −1 SAN máxima") : ""}.`;
            saveFace(p, face);
          }
        }
        if (option.consume && option.item) {
          face.inventory =
            option.item.quantity === 1
              ? face.inventory.filter((i) => i.id !== option.item!.id)
              : face.inventory.map((i) =>
                  i.id === option.item!.id
                    ? { ...i, quantity: i.quantity - 1 }
                    : i,
                );
          saveFace(p, face);
        }
        if (option.effect === "attack") {
          const item = option.item!,
            skill =
              item.attackSkill ||
              (weaponType(item) === "Corpo a corpo" ? "Luta" : "Pontaria"),
            melee = weaponType(item) === "Corpo a corpo",
            agile =
              melee &&
              ([
                "faca",
                "punhal",
                "cajado",
                "nunchaku",
                "florete",
                "katana",
              ].includes(normalizeCombatName(item.name)) ||
                (item.id === "unarmed" && hasPower(face, "Artista Marcial")));
          const attr =
              skill === "Pontaria" ||
              (agile &&
                effectiveAttributes(face).AGI > effectiveAttributes(face).FOR)
                ? "AGI"
                : "FOR",
            result = test(face, skill, attr, weaponAttackBonus(item));
          let expr = weaponDamage(item);
          if (melee && item.id !== "unarmed" && hasPower(face, "Golpe Pesado"))
            expr = expr.replace(
              /^(\d+)d/,
              (_, n: string) => `${Math.min(100, +n + 1)}d`,
            );
          const critical = /^(?:(\d+)\s*\/\s*)?x(\d+)$/i.exec(
              weaponCritical(item) || "20/x2",
            ),
            natural =
              effectiveAttributes(face)[attr] === 0
                ? Math.min(...result.dice)
                : Math.max(...result.dice);
          if (critical && natural >= Number(critical[1] || 20)) {
            expr = expr.replace(
              /^(\d+)d/,
              (_, n: string) => `${Math.min(100, +n * +critical[2])}d`,
            );
            event.text += " Ameaça de crítico: confirme o acerto.";
          }
          if (melee) {
            const fixed =
              Number(/([+-]\d+)$/.exec(expr)?.[1] || 0) +
              effectiveAttributes(face)[agile ? attr : "FOR"];
            expr =
              expr.replace(/([+-]\d+)$/, "") + (fixed >= 0 ? "+" : "") + fixed;
          }
          const dmg = addRoll("Dano proposto", damage(expr, roll));
          event.proposedDamage = Math.max(0, dmg.total);
          event.pending = "damage";
          event.text += ` Ataque ${result.total}; dano proposto ${event.proposedDamage}. O mestre confirma acerto, reações e resistências.`;
          budget.attacked = true;
        } else if (option.effect === "firstAid") {
          const t = targets[0],
            tf = faceOf(t);
          if (
            !tf ||
            t.id === p.id ||
            (!tf.conditions.some(
              (c) => normalizeCombatName(c) === "morrendo",
            ) &&
              tf.resources.pv > 0)
          )
            fail("Primeiros socorros exige um aliado morrendo.");
          const dt = 20 + 5 * (ledger.stabilized[t.id] || 0),
            result = test(
              face,
              "Medicina",
              "INT",
              hasMedicineKit(face) ? 0 : -5,
            );
          if (result.total >= dt) {
            hp(t, 1, true);
            tf.conditions = tf.conditions.filter(
              (c) =>
                !["morrendo", "inconsciente"].includes(normalizeCombatName(c)),
            );
            t.conditions = tf.conditions.join(", ");
            saveFace(t, tf);
            ledger.stabilized[t.id] = (ledger.stabilized[t.id] || 0) + 1;
            event.text += ` Sucesso (${result.total}/DT ${dt}): estabilizado com 1 PV.`;
          } else event.text += ` Falha (${result.total}/DT ${dt}).`;
        } else if (option.effect === "heal") {
          let success = true;
          if (option.medicine) {
            const r = test(
              face,
              "Medicina",
              "INT",
              (hasMedicineKit(face) ? 0 : -5) +
                (targets[0].id === p.id ? -5 : 0),
            );
            success = r.total >= (option.difficulty || 20);
            event.text += ` Medicina ${r.total}/DT ${option.difficulty || 20}.`;
          }
          if (success && formula) {
            const r = addRoll("Cura", damage(formula, roll)),
              bonus =
                ritual && hasPower(face, "Ritual Potente")
                  ? effectiveAttributes(face).INT
                  : 0,
              actual = hp(targets[0], Math.max(0, r.total + bonus));
            event.text += ` Recuperou ${actual} PV (rolagem ${r.total}${bonus ? ` + ${bonus}` : ""}, limitada ao máximo).`;
            if (name === "cicatrizacao")
              event.text += " O alvo envelhece 1 ano.";
          }
        } else if (option.effect === "grant" && grant) {
          for (const t of targets) {
            if (
              option.timing === "sustained" &&
              ledger.effects.some(
                (x) => x.targetId === t.id && x.name === option.name,
              )
            )
              fail(
                "Este alvo já recebe este ritual; efeitos iguais não se acumulam.",
              );
            ledger.effects.push({
              id: `${eventId}:${t.id}`,
              sourceId: p.id,
              targetId: t.id,
              name: option.name,
              grant,
              noRitual: !!option.noRitual,
              timing: option.timing || "now",
              createdKey: key,
              upkeepKey: key,
            });
          }
          event.text += ` Ação ${grant === "standard" ? "padrão" : grant === "move" ? "de movimento" : grant === "attack" ? "somente para atacar" : "livre"}${option.timing === "next" ? " no próximo turno" : option.timing === "sustained" ? " a cada turno enquanto sustentado" : " adicional"}${option.noRitual ? "; não permite rituais" : ""}.`;
        } else if (option.effect === "generic" || option.effect === "ritual") {
          event.pending = "interpretation";
          event.text +=
            " Ação e custo registrados; efeito aguardando resolução do mestre.";
        }
        if (command.note) event.text += ` ${command.note}`;
      }
    }
  }
  event.text = event.text.slice(0, 1800);
  ledger.events = [...ledger.events, event].slice(-40);
  e.combat = { ...ledger, effects: e.combat?.effects || ledger.effects };
  const present = new Set(e.participants.map((p) => p.id));
  e.combat.effects = e.combat.effects.filter(
    (x) => present.has(x.sourceId) && present.has(x.targetId),
  );
  if (e.combat.effects.length > 300)
    fail("Encerre efeitos antigos antes de adicionar outros.");
  const patches: AgentCombatPatch[] = [...changed.values()].map(({ p, a }) => ({
    id: p.agentId!,
    face: p.face || "main",
    version: context.sheetVersions[p.agentId!],
    resources: a.resources,
    adjustments: a.adjustments,
    conditions: a.conditions,
    inventory: a.inventory,
  }));
  return { encounter: e, patches, event };
}
