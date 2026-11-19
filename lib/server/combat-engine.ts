import { combatRuleName, combatSkillAttribute } from "../combat-metadata";
import { resolvePower, modifierLabel, powerAmount } from "../power-rules";
import {
  powerContributions,
  powerEffectActive,
  fixedBonus,
  bonusRolls,
  consumePowerEffects,
  validatePowerCondition,
  attributeForAttack,
  type BonusRoll,
} from "../power-effects";
import { adjustedAttackPool } from "../combat-dice";
import { ALTERNATE_FACE_ENABLED } from "../features";
import {
  rollAttackDice,
  rollDamageDice,
  weaponRollSuggestion,
} from "../combat-dice";
import {
  check,
  damage,
  die,
  effectiveAttributes,
  skillBonus,
  skillAttributes,
  type Attribute,
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
import { advanceTurn, delayTurn } from "../combat";
import {
  actionAvailable,
  firearmFollowUp,
  countTurnAttacks,
  retainCombatEvents,
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
  if (
    !ALTERNATE_FACE_ENABLED &&
    e.participants.some((x) => x.face === "alternate")
  )
    fail(
      "A face NEX 35 foi desativada. O mestre precisa restaurar as fichas originais nos controles do combate.",
    );
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
  ledger.effects = ledger.effects.filter((x) => powerEffectActive(x, e));
  const contributions = face ? powerContributions(face, e, p) : [];
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
    turnKey: turnKey(e),
    rolls: [],
  };
  function addRoll(label: string, r: ReturnType<typeof check>) {
    event.rolls.push({ label, ...r });
    return r;
  }
  function augmented(
    base: ReturnType<typeof check>,
    bonuses: BonusRoll[],
    maximize = false,
  ) {
    const result = { ...base, dice: [...base.dice] };
    for (const bonus of bonuses) {
      const value = /^-?\d+$/.test(bonus.formula)
        ? {
            expression: bonus.formula,
            dice: [] as number[],
            total: Number(bonus.formula),
          }
        : safeDice(() =>
            rollDamageDice(bonus.formula, maximize ? (s) => s : roll),
          );
      if (!Number.isFinite(value.total) || Math.abs(value.total) > 100000)
        fail("Bônus fora do limite de rolagem.");
      result.total += value.total;
      result.dice.push(...value.dice);
      result.expression += ` ${value.total >= 0 ? "+" : ""}${value.total} (${bonus.source}: ${bonus.formula})`;
    }
    return result;
  }
  function test(a: Agent, skill: string, attr: Attribute, bonus = 0) {
    attr = combatSkillAttribute(a, skill, attr);
    const count = Math.max(
      0,
      effectiveAttributes(a)[attr] +
        fixedBonus(contributions, "attribute", a, undefined, attr),
    );
    const pool = safeDice(() =>
      adjustedAttackPool(
        `${count || 2}d20+0`,
        count ? "highest" : "lowest",
        fixedBonus(contributions, "testDice", a, undefined, skill),
      ),
    );
    const base = safeDice(() =>
      rollAttackDice(pool.expression, pool.mode, roll),
    );
    base.total += skillBonus(a, skill).total + bonus;
    base.expression += ` +${skillBonus(a, skill).total + bonus}`;
    const result = addRoll(
      skill,
      augmented(base, bonusRolls(contributions, "skill", a, undefined, skill)),
    );
    consumePowerEffects(e, p!, "test", contributions, undefined, skill, attr);
    ledger.effects = e.combat!.effects;
    return result;
  }
  function safeDice<T>(action: () => T): T {
    try {
      return action();
    } catch (error) {
      return fail((error as Error).message);
    }
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
      event.text = `${amount} de dano final em ${target.name}. ${pending.damageRoll && !pending.damageRoll.done ? "Valor definido pelo mestre antes da rolagem de dano. " : ""}${command.note || ""}`;
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
      [...face.conditions, ...p.conditions.split(",")].some((c) =>
        /^(morto|inconsciente|paralisado|atordoado)$/.test(
          normalizeCombatName(c),
        ),
      )
    )
      fail(
        "Este personagem não pode agir nesta condição. O mestre pode ajustar a ficha.",
      );
    if (command.kind === "delay") {
      if (ledger.budgets[p.id]?.key === turnKey(e))
        fail(
          "Atrase antes de realizar qualquer ação ou sustentação neste turno.",
        );
      if (!command.afterId)
        fail("Escolha o aliado depois de quem deseja agir.");
      e = safeDice(() =>
        delayTurn(
          e,
          p.id,
          command.afterId!,
          -skillBonus(face, "Iniciativa").total,
        ),
      );
      event.label = "Atrasar ação";
      event.targetIds = [command.afterId];
      event.text = `${p.name} passa a agir depois de ${e.participants.find((t) => t.id === command.afterId)!.name}, na iniciativa ${e.participants.find((t) => t.id === p.id)!.initiative}, pelo restante do combate. Seu turno foi adiado, sem gastar ações.`;
    } else {
      const key = turnKey(e);
      function settleBudget() {
        const next = budgetFor(e, p!, face);
        ledger.budgets[p!.id] = next;
        for (const x of ledger.effects)
          if (
            x.targetId === p!.id &&
            x.appliedKey !== key &&
            !(x.timing === "next" && x.createdKey === key)
          )
            x.appliedKey = key;
        ledger.effects = ledger.effects.filter(
          (x) =>
            x.timing === "sustained" ||
            x.timing === "scene" ||
            x.appliedKey !== key ||
            x.targetId !== p!.id,
        );
        return next;
      }
      let budget = settleBudget();
      const upkeep = ledger.effects.filter(
        (x) =>
          x.sourceId === p.id &&
          x.timing === "sustained" &&
          x.createdKey !== key &&
          x.upkeepKey !== key,
      );
      function pay(cost: number, minimum = cost, ritual = false) {
        if (!Number.isInteger(cost) || cost < 0 || cost > 999)
          fail("Custo inválido.");
        const resource = face!.determination ? "pd" : "pe";
        if (face!.resources[resource] < cost)
          fail("Pontos de esforço/determinação insuficientes.");
        const limit = effortLimit(face!, ritual);
        if (
          cost > 0 &&
          budget.spentPe + cost > limit &&
          !(budget.spentPe === 0 && cost === minimum)
        )
          fail(`Limite de ${limit} pontos por turno excedido.`);
        face!.resources[resource] -= cost;
        budget.spentPe += cost;
        saveFace(p!, face!);
      }
      function spend(
        cost: ActionCost,
        ritual = false,
        attack = false,
        melee = false,
        moving = false,
      ) {
        if (!actionAvailable(budget, cost, ritual, attack, melee, moving))
          fail("Esta ação já foi gasta neste turno.");
        const standard = () => {
          if (budget.restricted > 0) budget.restricted--;
          else budget.standard--;
        };
        if (cost === "standard") {
          if (attack && melee && (budget.meleeAttack || 0) > 0)
            budget.meleeAttack!--;
          else if (attack && budget.attack > 0) budget.attack--;
          else standard();
        }
        const movement = () => {
          if (!ritual && (budget.restrictedMove || 0) > 0)
            budget.restrictedMove!--;
          else if (budget.move > 0) budget.move--;
          else standard();
        };
        if (cost === "move") {
          if (moving && (budget.movementOnly || 0) > 0) budget.movementOnly!--;
          else movement();
        }
        if (cost === "full") {
          standard();
          movement();
        }
      }
      function once(id: string, limit?: "turn" | "round" | "scene") {
        if (!limit) return;
        const scope =
            limit === "scene"
              ? e.id
              : limit === "round"
                ? String(e.round)
                : key,
          useKey = `${p!.id}:${id}`;
        if (ledger.uses[useKey] === scope)
          fail("Este efeito já foi usado no período permitido.");
        ledger.uses[useKey] = scope;
      }
      if (command.kind === "damage") {
        const pending = ledger.events.find(
          (x) =>
            x.id === command.eventId &&
            x.actorId === p.id &&
            x.pending === "damage" &&
            !x.resolved &&
            x.damageRoll &&
            !x.damageRoll.done,
        );
        if (!pending || pending.damageRoll!.turn !== key)
          fail(
            "Esta rolagem de dano não está disponível neste turno ou já foi realizada.",
          );
        event.label = `Dano · ${pending.label}`;
        event.targetIds = pending.targetIds;
        event.secret = pending.secret;
        if (command.skipDamage) {
          pending.proposedDamage = 0;
          pending.resolved = true;
          event.text = "Ataque/efeito marcado sem dano pelo jogador.";
        } else {
          if (!command.damageDice?.trim())
            fail("Informe os dados de dano antes de rolar.");
          const result = addRoll(
            "Dano",
            augmented(
              safeDice(() =>
                rollDamageDice(
                  command.damageDice!,
                  pending.damageRoll!.maximum ? (s) => s : roll,
                ),
              ),
              pending.damageRoll!.bonuses || [],
              pending.damageRoll!.maximum,
            ),
          );
          pending.proposedDamage = Math.max(0, result.total);
          pending.rolls.push({ label: "Dano", ...result });
          event.text = `${result.expression}: ${result.total}. O mestre confirma resistências e dano final.`;
        }
        pending.damageRoll!.done = true;
      } else if (command.kind === "sustain" || command.kind === "stopEffect") {
        const effect = ledger.effects.find(
          (x) =>
            x.id === command.eventId &&
            x.sourceId === p.id &&
            (x.timing === "sustained" ||
              (command.kind === "stopEffect" && x.timing === "scene")),
        );
        if (!effect) fail("Efeito sustentado não encontrado.");
        event.label = effect.name;
        if (command.kind === "sustain") {
          if (!upkeep.includes(effect))
            fail("Este ritual já está sustentado neste turno.");
          pay(1);
          effect.upkeepKey = key;
          event.text =
            "Ritual sustentado: 1 ponto gasto como ação livre. Nenhuma ação padrão ou de movimento foi consumida.";
        } else {
          ledger.effects = ledger.effects.filter((x) => x.id !== effect.id);
          event.text =
            effect.timing === "sustained"
              ? "Sustentação encerrada."
              : "Efeito encerrado.";
          const b = ledger.budgets[effect.targetId];
          if (b?.key === key && effect.appliedKey === key) {
            if (effect.grant === "move") {
              const k = effect.noRitual ? "restrictedMove" : "move";
              b[k] = Math.max(0, (b[k] || 0) - 1);
            }
            if (effect.grant === "meleeAttack")
              b.meleeAttack = Math.max(0, (b.meleeAttack || 0) - 1);
            if (effect.grant === "attack") b.attack = Math.max(0, b.attack - 1);
            if (effect.grant === "standard") {
              b.standard = Math.max(0, b.standard - 1);
            }
          }
        }
      } else {
        if (upkeep.length)
          fail("Sustente ou encerre seus rituais antes de agir neste turno.");
        if (budget.ended) fail("Seu turno já foi encerrado.");
        if (command.kind === "end") {
          if (
            ledger.events.some(
              (x) =>
                x.actorId === p.id &&
                x.damageRoll?.turn === key &&
                x.targetIds.some((id) =>
                  e.participants.some(
                    (target) =>
                      target.id === id &&
                      (!target.hidden || target.id === p.id),
                  ),
                ) &&
                !x.damageRoll.done &&
                !x.resolved,
            )
          )
            fail(
              "Role o dano pendente ou marque Sem dano antes de concluir o turno.",
            );
          budget.ended = true;
          event.label = "Encerrar turno";
          event.text = `${p.name} concluiu o turno.`;
          e = advanceTurn(e);
        } else {
          const option = combatOptions(
            face,
            e.combatRules,
            ledger.effects.filter((x) => x.targetId === p.id),
          ).find((o) => o.id === command.optionId);
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
          if (option.effect === "custom" && !command.note?.trim())
            fail("Descreva a ação avulsa.");
          const name = normalizeCombatName(
              option.item ? combatRuleName(option.item) : option.name,
            ),
            ritual = option.item?.kind === "Ritual";
          if (command.skill && option.effect !== "custom")
            fail("Este teste só pode ser escolhido na ação avulsa.");
          let resolvedPower;
          if (option.effect === "power") {
            safeDice(() => validatePowerCondition(option.item!, face));
            resolvedPower = safeDice(() =>
              resolvePower(
                option.item!,
                face,
                option.power?.special === "moshPit"
                  ? { ...command.power, steps: Math.min(5, targets.length) }
                  : command.power,
                option.power,
              ),
            );
            if (resolvedPower.enemyChoice) {
              const enemy = e.participants.find(
                (x) => x.id === command.power?.enemyId,
              );
              if (
                !enemy ||
                targets.some((t) => t.id === enemy.id) ||
                (context.role === "player" && enemy.hidden)
              )
                fail("Inimigo indisponível para este efeito.");
            }
            if (
              name !== "combater com duas armas" &&
              ledger.effects.some(
                (x) =>
                  x.sourceId === p.id &&
                  x.power &&
                  (x.power.itemId === option.item!.id ||
                    (x.power?.ruleName || normalizeCombatName(x.name)) ===
                      name ||
                    (["tecnica secreta", "tecnica sublime"].includes(name) &&
                      ["tecnica secreta", "tecnica sublime"].includes(
                        x.power.ruleName || "",
                      ))),
              )
            )
              fail(
                "Esta habilidade já está ativa. Use ou encerre o efeito antes de ativá-la novamente.",
              );
          } else if (command.power)
            fail("Estas escolhas são exclusivas de habilidades e poderes.");
          let cost = resolvedPower?.pe ?? option.pe,
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
            if (
              !ritual ||
              !["cicatrizacao", "velocidade mortal"].includes(name)
            )
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
            (option.item!.circle || 1) >
              maxRitualCircle(face.className, face.nex)
          )
            fail("Ritual indisponível neste NEX.");
          if (command.accelerate) {
            if (!ritual || !hasPower(face, "Acelerar Ritual", e.combatRules))
              fail("Acelerar Ritual não está disponível.");
            once("Acelerar Ritual", "round");
            action = "free";
            cost += 4;
          }
          if (command.followUpHitId) {
            const follow = firearmFollowUp(
              ledger.events,
              budget,
              p.id,
              option.item?.id || "",
              targets[0]?.id,
            );
            if (
              command.extraAttack ||
              option.effect !== "attack" ||
              !option.item ||
              weaponType(option.item) !== "Arma de fogo" ||
              !hasPower(face, "Segurar o Gatilho", e.combatRules) ||
              !follow ||
              follow.hitId !== command.followUpHitId
            )
              fail(
                "Segurar o Gatilho exige o último acerto do turno, com a mesma arma de fogo e o mesmo alvo.",
              );
            action = "free";
            cost += follow.cost;
          }
          if (command.extraAttack) {
            if (
              option.bloodAttack ||
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
          if (
            option.bloodAttack &&
            !ledger.events.some(
              (x) =>
                x.actorId === p.id &&
                x.turnKey === key &&
                x.itemKind === "Arma" &&
                x.action === "standard",
            )
          )
            fail(
              "O ataque adicional de Arma de Sangue exige usar agredir neste turno.",
            );
          if (
            name === "primeira impressao" &&
            ledger.events.some(
              (x) =>
                x.actorId === p.id &&
                x.rolls.some((r) =>
                  [
                    "diplomacia",
                    "enganacao",
                    "intimidacao",
                    "intuicao",
                  ].includes(normalizeCombatName(r.label)),
                ),
            )
          )
            fail("O primeiro teste dessas perícias na cena já ocorreu.");
          if (name === "posicao de combate" && e.round !== 1)
            fail(
              "Posição de Combate só está disponível no primeiro turno da cena.",
            );
          if (
            name === "conjuracao marcial" &&
            !ledger.events.some(
              (x) =>
                x.actorId === p.id &&
                x.turnKey === key &&
                x.itemKind === "Ritual" &&
                x.action === "standard",
            )
          )
            fail(
              "Conjuração Marcial exige um ritual de ação padrão neste turno.",
            );
          if (name === "combater com duas armas") {
            const copies = new Set(
              face.inventory
                .filter((i) => normalizeCombatName(combatRuleName(i)) === name)
                .map((i) => i.id),
            );
            const last = ledger.events.findLastIndex(
              (x) =>
                x.actorId === p.id &&
                x.turnKey === key &&
                copies.has(x.sourceItemId || ""),
            );
            const completed =
              last < 0 ||
              ledger.events
                .slice(last + 1)
                .filter((x) => x.actorId === p.id && x.itemKind === "Arma")
                .length >= 2;
            if (
              budget.standard + budget.restricted < 1 ||
              budget.attack > 0 ||
              !completed
            )
              fail(
                "Use os dois ataques do par anterior e tenha uma ação padrão disponível para iniciar outro par.",
              );
          }
          if (name === "ataque extra" && !budget.attacked)
            fail("Ataque Extra exige um ataque anterior neste turno.");
          once(
            name === "ataque extra" ? "Ataque Extra" : option.id,
            resolvedPower?.limit || option.limit,
          );
          const ritualModifiers = contributions.filter(
            (m) =>
              !m.personalOnly ||
              (targets.length === 1 && targets[0].id === p.id),
          );
          const ritualDiscount = ritual
            ? fixedBonus(ritualModifiers, "ritualCost", face, option.item)
            : 0;
          if (ritual) cost = Math.max(cost > 0 ? 1 : 0, cost + ritualDiscount);
          const usesAttackCredit =
            option.effect === "attack" &&
            action === "standard" &&
            (budget.attack > 0 ||
              ((budget.meleeAttack || 0) > 0 &&
                !!option.item &&
                weaponType(option.item) === "Corpo a corpo"));
          spend(
            action,
            !!ritual,
            option.effect === "attack",
            !!option.item && weaponType(option.item) === "Corpo a corpo",
            option.effect === "move",
          );
          pay(
            cost,
            ritual
              ? Math.max(option.pe > 0 ? 1 : 0, option.pe + ritualDiscount)
              : option.pe,
            !!ritual,
          );
          event.label = option.name;
          event.sourceItemId = option.item?.id;
          event.itemKind = option.item?.kind;
          event.action = usesAttackCredit ? "free" : action;
          event.targetIds = targets.map((t) => t.id);
          event.secret ||= targets.some((t) => t.hidden);
          event.text = `${option.name}${targets.length ? ` → ${targets.map((t) => t.name).join(", ")}` : ""}.`;
          if (command.followUpHitId)
            event.text += ` Segurar o Gatilho: acerto anterior confirmado, custo de ${cost} ${face.determination ? "PD" : "PE"}.`;
          if (ritual) {
            const dc =
              10 +
              (face.className === "Sobrevivente"
                ? face.stage
                : face.nex === 99
                  ? 20
                  : Math.max(1, Math.floor(face.nex / 5))) +
              effectiveAttributes(face).PRE +
              fixedBonus(contributions, "attribute", face, option.item, "PRE") +
              fixedBonus(contributions, "ritualDC", face, option.item);
            event.text += ` DT do ritual: ${dc}. Custo: ${cost} ${face.determination ? "PD" : "PE"}${ritualDiscount ? ` (ajuste de ${ritualDiscount})` : ""}.`;
          }
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
          if (option.effect === "power" && resolvedPower) {
            const resolved = resolvedPower;
            const modifiers = resolved.modifiers.map((m) => ({
              ...m,
              amount: /^[+-]?\d+$|^\d+d\d+$/.test(m.amount)
                ? m.amount
                : String(powerAmount(m.amount, face)),
            }));
            let attached = false;
            if (resolved.special === "criticalPhrase") {
              const pending = [...ledger.events]
                .reverse()
                .find(
                  (x) =>
                    x.actorId === p.id &&
                    x.turnKey === key &&
                    (x.damageRoll?.critical || 1) > 1 &&
                    !x.damageRoll!.done &&
                    !x.resolved,
                );
              if (!pending?.damageRoll)
                fail(
                  "Confirme seu acerto crítico e ative Frase de Efeito antes de rolar o dano.",
                );
              once(`criticalPhrase:${pending.id}`, "scene");
              const weapon = combatOptions(
                face,
                e.combatRules,
                ledger.effects.filter((x) => x.targetId === p.id),
              ).find((x) => x.id === pending.damageRoll!.sourceItemId)?.item;
              if (!weapon) fail("Arma indisponível.");
              const delta =
                pending.damageRoll.critical! < effectiveAttributes(face).PRE
                  ? 2
                  : 1;
              const base = /^(\d+)d(\d+)/.exec(weaponDamage(weapon));
              if (!base)
                fail(
                  "O dano da arma precisa ter dados para ampliar o crítico.",
                );
              const additions: BonusRoll[] = [
                {
                  source: "Frase de Efeito",
                  formula: `${+base[1] * delta}d${base[2]}`,
                },
              ];
              for (const b of pending.damageRoll.bonuses || [])
                if (b.criticalBase && b.sides)
                  additions.push({
                    source: `Frase de Efeito · ${b.source}`,
                    formula: `${b.criticalBase * delta}d${b.sides}`,
                  });
              pending.damageRoll.bonuses = [
                ...(pending.damageRoll.bonuses || []),
                ...additions,
              ];
              pending.damageRoll.critical! += delta;
              event.text += ` Multiplicador crítico aumentado em +${delta}; dados adicionais anexados ao dano.`;
              attached = true;
            }
            if (resolved.special === "sneakAttack") {
              const pending = [...ledger.events]
                .reverse()
                .find(
                  (x) =>
                    x.actorId === p.id &&
                    x.turnKey === key &&
                    x.damageRoll?.sourceItemId &&
                    !x.damageRoll.done &&
                    !x.resolved,
                );
              if (!pending?.damageRoll)
                fail(
                  "Faça o ataque, confirme que acertou o alvo elegível e ative Ataque Furtivo antes de rolar o dano.",
                );
              const weapon = combatOptions(
                face,
                e.combatRules,
                ledger.effects.filter((x) => x.targetId === p.id),
              ).find((x) => x.id === pending.damageRoll!.sourceItemId)?.item;
              if (!weapon)
                fail("A arma deste ataque não está mais disponível.");
              pending.damageRoll.bonuses = [
                ...(pending.damageRoll.bonuses || []),
                ...bonusRolls(
                  modifiers.map((m) => ({ ...m, source: option.name })),
                  "damage",
                  face,
                  weapon,
                ),
              ];
              attached = true;
              event.targetIds = pending.targetIds;
              event.text +=
                " Bônus anexado ao dano do ataque já realizado, sem nova rolagem de ataque.";
            }
            for (const target of targets) {
              if (
                (modifiers.length || resolved.manifestation) &&
                !attached &&
                !(
                  name === "combater com duas armas" &&
                  ledger.effects.some(
                    (x) => x.sourceId === p.id && x.power?.ruleName === name,
                  )
                )
              )
                ledger.effects.push({
                  id: `${eventId}:power:${target.id}`,
                  sourceId: p.id,
                  targetId: target.id,
                  name: option.name,
                  grant: "free",
                  noRitual: false,
                  timing: "scene",
                  createdKey: key,
                  power: {
                    itemId: option.item!.id,
                    ruleName: name,
                    duration: resolved.duration,
                    ...(resolved.manifestation
                      ? { manifestation: resolved.manifestation }
                      : {}),
                    ...(resolved.expires ? { expires: resolved.expires } : {}),
                    modifiers,
                    ...(resolved.weaponChoice || resolved.ritualChoice
                      ? { weaponId: command.power?.weaponId }
                      : {}),
                    ...(resolved.enemyChoice
                      ? { enemyId: command.power?.enemyId }
                      : {}),
                    ...(name === "sangue fervente"
                      ? { injuredOnly: true }
                      : {}),
                  },
                });
              for (const [index, extra] of resolved.grants.entries())
                ledger.effects.push({
                  id: `${eventId}:grant:${index}:${target.id}`,
                  sourceId: p.id,
                  targetId: target.id,
                  name: option.name,
                  grant: extra,
                  noRitual: false,
                  timing: "now",
                  createdKey: key,
                });
            }
            budget = settleBudget();
            if (resolved.manifestation)
              event.text +=
                " Arma de Sangue manifestada; selecione-a nas ações de ataque.";
            event.text += modifiers.length
              ? ` Efeito aplicado: ${modifiers.map(modifierLabel).join("; ")}.`
              : "";
            event.text += resolved.grants.length
              ? ` Ações adicionais concedidas: ${resolved.grants.join(", ")}.`
              : "";
            if (resolved.condition)
              event.text += " Gatilho e requisitos confirmados pelo jogador.";
            if (resolved.warning) {
              if (resolved.manual) event.pending = "interpretation";
              event.text += ` ${resolved.warning}`;
            }
          } else if (option.effect === "attack") {
            const attackContributions = contributions.filter(
              (m) => !m.enemyId || m.enemyId === targets[0].id,
            );
            if (
              hasPower(face, "Potência Máxima") &&
              weaponType(option.item!) === "Corpo a corpo"
            ) {
              for (const m of attackContributions) {
                const source = ledger.effects.find((x) => x.id === m.effectId);
                if (
                  source?.power?.ruleName === "ataque especial" &&
                  ["attack", "damage"].includes(m.stat)
                )
                  m.amount = String(Number(m.amount) * 2);
              }
            }
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
            const attr = attributeForAttack(face, item, attackContributions),
              baseAttr = attributeForAttack(face, item);
            const suggestion = weaponRollSuggestion(face, item);
            const attributeBonus = fixedBonus(
              attackContributions,
              "attribute",
              face,
              item,
              attr,
            );
            const poolDelta =
              effectiveAttributes(face)[attr] -
              effectiveAttributes(face)[baseAttr] +
              attributeBonus +
              fixedBonus(attackContributions, "attackDice", face, item) +
              fixedBonus(attackContributions, "testDice", face, item, skill);
            const attackPool = safeDice(() =>
              adjustedAttackPool(
                command.attackDice || suggestion.attack,
                command.attackMode || suggestion.mode,
                poolDelta,
              ),
            );
            const baseAttack = safeDice(() =>
              rollAttackDice(attackPool.expression, attackPool.mode, roll),
            );
            const result = addRoll(
              skill,
              augmented(baseAttack, [
                ...bonusRolls(attackContributions, "attack", face, item),
                ...bonusRolls(attackContributions, "skill", face, item, skill),
              ]),
            );
            let expr = weaponDamage(item);

            const critical = /^(?:(\d+)\s*\/\s*)?x(\d+)$/i.exec(
                weaponCritical(item) || "20/x2",
              ),
              natural =
                attackPool.mode === "lowest"
                  ? Math.min(...baseAttack.dice)
                  : Math.max(...baseAttack.dice);
            let criticalMultiplier = 1;
            if (
              critical &&
              natural >=
                Math.max(
                  1,
                  Number(critical[1] || 20) -
                    fixedBonus(attackContributions, "critical", face, item),
                )
            ) {
              criticalMultiplier =
                +critical[2] +
                fixedBonus(
                  attackContributions,
                  "criticalMultiplier",
                  face,
                  item,
                );
              expr = expr.replace(
                /^(\d+)d/,
                (_, n: string) => `${Math.min(100, +n * criticalMultiplier)}d`,
              );
              event.text += " Ameaça de crítico: confirme o acerto.";
            }
            if (melee) {
              const fixed =
                Number(/([+-]\d+)$/.exec(expr)?.[1] || 0) +
                effectiveAttributes(face)[agile ? attr : "FOR"];
              expr =
                expr.replace(/([+-]\d+)$/, "") +
                (fixed >= 0 ? "+" : "") +
                fixed;
            }
            const damageBonuses = bonusRolls(
              attackContributions,
              "damage",
              face,
              item,
              undefined,
              criticalMultiplier,
            );
            if (melee) {
              const damageAttributeBonus = fixedBonus(
                attackContributions,
                "attribute",
                face,
                item,
                agile ? attr : "FOR",
              );
              if (damageAttributeBonus)
                damageBonuses.push({
                  source: "Atributo de combate",
                  formula: String(damageAttributeBonus),
                });
            }
            event.damageRoll = {
              formula: expr,
              turn: key,
              done: false,
              sourceItemId: item.id,
              critical: criticalMultiplier,
              maximum:
                criticalMultiplier > 1 &&
                weaponType(item) === "Arma de fogo" &&
                hasPower(face, "Atirar para Matar"),
              bonuses: damageBonuses,
            };
            consumePowerEffects(e, p, "attack", attackContributions, item);
            consumePowerEffects(
              e,
              p,
              "test",
              attackContributions,
              item,
              skill,
              attr,
            );
            ledger.effects = e.combat!.effects;
            event.pending = "damage";
            event.text += ` Ataque ${result.total}. Escolha os dados e clique em Rolar dano; o mestre confirma acerto, reações e resistências.`;
            budget.attackCount =
              (budget.attackCount ??
                countTurnAttacks(ledger.events, key, p.id)) + 1;
            budget.latestAttackId = event.id;
            budget.attacked = true;
          } else if (option.effect === "investigate") {
            let result;
            if (command.attackDice) {
              const pool = safeDice(() =>
                adjustedAttackPool(
                  command.attackDice!,
                  command.attackMode || "highest",
                  fixedBonus(
                    contributions,
                    "attribute",
                    face,
                    undefined,
                    "INT",
                  ) +
                    fixedBonus(
                      contributions,
                      "testDice",
                      face,
                      undefined,
                      "Investigação",
                    ),
                ),
              );
              result = addRoll(
                "Investigação",
                augmented(
                  safeDice(() =>
                    rollAttackDice(pool.expression, pool.mode, roll),
                  ),
                  bonusRolls(
                    contributions,
                    "skill",
                    face,
                    undefined,
                    "Investigação",
                  ),
                ),
              );
              consumePowerEffects(
                e,
                p,
                "test",
                contributions,
                undefined,
                "Investigação",
                "INT",
              );
              ledger.effects = e.combat!.effects;
            } else result = test(face, "Investigação", "INT");
            event.pending = "interpretation";
            event.text += ` Investigação (INT): ${result.total}. O mestre define a DT e o que pode ser descoberto neste tempo.`;
          } else if (option.effect === "firstAid") {
            const t = targets[0],
              tf = faceOf(t);
            if (
              !tf ||
              t.id === p.id ||
              (![...tf.conditions, ...t.conditions.split(",")].some(
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
                  !["morrendo", "inconsciente"].includes(
                    normalizeCombatName(c),
                  ),
              );
              t.conditions = [
                ...new Set([
                  ...t.conditions.split(",").map((c) => c.trim()),
                  ...tf.conditions,
                ]),
              ]
                .filter(
                  (c) =>
                    c &&
                    !["morrendo", "inconsciente"].includes(
                      normalizeCombatName(c),
                    ),
                )
                .join(", ");
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
              const r = addRoll(
                  "Cura",
                  augmented(
                    safeDice(() => rollDamageDice(formula!, roll)),
                    bonusRolls(contributions, "healing", face, option.item),
                  ),
                ),
                actual = hp(targets[0], Math.max(0, r.total));
              event.text += ` Recuperou ${actual} PV (rolagem ${r.total}, limitada ao máximo).`;
              if (ritual) {
                consumePowerEffects(e, p, "ritual", contributions, option.item);
                ledger.effects = e.combat!.effects;
              }
              if (name === "cicatrizacao")
                event.text += " O alvo envelhece 1 ano.";
            }
          } else if (option.effect === "grant" && grant) {
            for (const t of targets) {
              if (
                (option.timing === "sustained" || option.timing === "scene") &&
                ledger.effects.some(
                  (x) =>
                    x.targetId === t.id &&
                    (x.power?.ruleName || normalizeCombatName(x.name)) === name,
                )
              )
                fail(
                  "Este alvo já recebe este ritual; efeitos iguais não se acumulam.",
                );
              if (option.timing === "sustained") {
                const active = new Set(
                  ledger.effects
                    .filter(
                      (x) => x.sourceId === p.id && x.timing === "sustained",
                    )
                    .map((x) => x.id.split(":")[0]),
                );
                if (
                  !active.has(eventId) &&
                  active.size >= (hasPower(face, "Fluxo de Poder") ? 2 : 1)
                )
                  fail(
                    "Encerre um ritual sustentado antes de manter outro. Fluxo de Poder permite dois.",
                  );
              }
              ledger.effects.push({
                id: `${eventId}:${t.id}`,
                sourceId: p.id,
                targetId: t.id,
                name: option.name,
                grant,
                noRitual: grant !== "standard" && !!option.noRitual,
                timing: option.timing || "now",
                createdKey: key,
                upkeepKey: key,
              });
            }
            budget = settleBudget();
            if (name === "cranio espiral") {
              event.pending = "interpretation";
              event.text +=
                " Crânio empunhado: o mestre confere Vontade (DT 15 + 5 por uso adicional no dia). A ação vale mesmo em falha; envelhecimento e proibição de novo uso no dia dependem do teste.";
            }
            event.text += ` Ação ${grant === "standard" ? "padrão" : grant === "move" ? "de movimento" : grant === "attack" ? "somente para atacar" : "livre"}${option.timing === "next" ? " no próximo turno" : option.timing === "sustained" ? " a cada turno enquanto sustentado" : option.timing === "scene" ? " a cada turno até encerrar o efeito" : " adicional"}${option.noRitual && grant !== "standard" ? "; não permite rituais" : ""}.`;
          } else if (option.effect === "ritual" && option.formula) {
            safeDice(() => rollDamageDice(option.formula!, () => 1));
            event.damageRoll = {
              formula: option.formula,
              turn: key,
              done: false,
              bonuses: bonusRolls(contributions, "damage", face, option.item),
            };
            consumePowerEffects(e, p, "ritual", contributions, option.item);
            ledger.effects = e.combat!.effects;
            event.pending = "damage";
            event.text +=
              " Execução e custo registrados. Escolha os dados e role o dano; o mestre confere resistência e demais efeitos.";
          } else if (option.effect === "custom" && command.skill) {
            const skill = command.skill,
              attr = combatSkillAttribute(face, skill);
            if (!skillAttributes[skill]) fail("Perícia inválida.");
            let r;
            if (command.attackDice) {
              const pool = safeDice(() =>
                adjustedAttackPool(
                  command.attackDice!,
                  command.attackMode || "highest",
                  fixedBonus(
                    contributions,
                    "attribute",
                    face,
                    undefined,
                    attr,
                  ) +
                    fixedBonus(
                      contributions,
                      "testDice",
                      face,
                      undefined,
                      skill,
                    ),
                ),
              );
              r = addRoll(
                skill,
                augmented(
                  safeDice(() =>
                    rollAttackDice(pool.expression, pool.mode, roll),
                  ),
                  bonusRolls(contributions, "skill", face, undefined, skill),
                ),
              );
              consumePowerEffects(
                e,
                p,
                "test",
                contributions,
                undefined,
                skill,
                attr,
              );
              ledger.effects = e.combat!.effects;
            } else r = test(face, skill, attr);
            event.pending = "interpretation";
            event.text += ` ${skill}: ${r.total}. O mestre define a DT e o resultado narrativo.`;
          } else if (option.effect === "move") {
            const extra = fixedBonus(contributions, "speed", face);
            event.text += ` Deslocamento disponível: ${Math.max(0, 9 + extra)} m${extra ? ` (${extra > 0 ? "+" : ""}${extra} m de efeitos)` : ""}. O mestre confere terreno e posicionamento.`;
          } else if (
            option.effect === "custom" ||
            option.effect === "generic" ||
            option.effect === "ritual"
          ) {
            event.pending = "interpretation";
            event.text +=
              " Ação e custo registrados; efeito aguardando resolução do mestre.";
          }
          if (command.note) event.text += ` ${command.note}`;
        }
      }
    }
  }
  event.text = event.text.slice(0, 1800);
  ledger.events = retainCombatEvents([...ledger.events, event]);
  if (ledger.events.filter((x) => x.pending && !x.resolved).length > 100)
    fail(
      "O mestre precisa resolver as ações pendentes antes de registrar novas pendências.",
    );
  e.combat = { ...ledger, effects: e.combat?.effects || ledger.effects };
  const present = new Set(e.participants.map((p) => p.id));
  e.combat.effects = e.combat.effects.filter(
    (x) =>
      present.has(x.sourceId) &&
      present.has(x.targetId) &&
      powerEffectActive(x, e) &&
      (!x.power?.injuredOnly ||
        (() => {
          const target = e.participants.find((t) => t.id === x.targetId);
          const a = target && faceOf(target);
          return !!a && a.resources.pv <= maximums(a).pv / 2;
        })()),
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
