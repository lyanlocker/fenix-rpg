import type { Agent, Attribute, Item } from "./rules";
import { effectiveAttributes } from "./rules";
import { combatItem, combatRuleName } from "./combat-metadata";
import type { ActionCost, GrantKind } from "./combat-actions";
import { reviewedPowerRule } from "./power-catalog";

export type PowerScope =
  | "all"
  | "weapon"
  | "melee"
  | "ranged"
  | "firearm"
  | "projectile"
  | "unarmed"
  | "ritual";
export type ModifierStat =
  | "attack"
  | "attackDice"
  | "testDice"
  | "damage"
  | "healing"
  | "defense"
  | "speed"
  | "baseDice"
  | "extraWeaponDice"
  | "attribute"
  | "skill"
  | "critical"
  | "criticalMultiplier"
  | "ritualCost"
  | "ritualDC";
export type PowerModifier = {
  stat: ModifierStat;
  scope: PowerScope;
  amount: string;
  attribute?: Attribute;
  skill?: string;
  element?: string;
  personalOnly?: boolean;
  saves?: string[];
};
export type PowerDuration =
  | "attack"
  | "ritual"
  | "test"
  | "turn"
  | "nextTurn"
  | "round"
  | "scene";
export type PowerChoice = {
  id: string;
  label: string;
  modifiers: PowerModifier[];
};
export type PowerRule = {
  action: ActionCost;
  pe: number;
  passive: boolean;
  always?: PowerModifier[];
  viaAction?: string;
  outsideCombat?: boolean;
  target: "self" | "ally" | "any";
  duration: PowerDuration;
  expires?: "nextTurnEnd";
  modifiers: PowerModifier[];
  grants: GrantKind[];
  condition?: string;
  limit?: "turn" | "round" | "scene";
  choices?: PowerChoice[];
  multiChoice?: boolean;
  special?:
    | "specialAttack"
    | "sneakAttack"
    | "perito"
    | "eclectic"
    | "moshPit"
    | "criticalPhrase";
  manifestation?: "bloodWeapon";
  warning?: string;
  manual?: boolean;
  blocked?: string;
  weaponChoice?: boolean;
  ritualChoice?: boolean;
  enemyChoice?: boolean;
  allowedSkills?: string[];
};
export type PowerSelection = {
  choices?: string[];
  choice?: string;
  steps?: number;
  attackSteps?: number;
  confirmed?: boolean;
  weaponId?: string;
  enemyId?: string;
};
export type ResolvedPower = PowerRule & { modifiers: PowerModifier[] };
export const normalizePower = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[–−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
const mod = (
  stat: ModifierStat,
  amount: string,
  scope: PowerScope = "all",
): PowerModifier => ({ stat, amount, scope });
const statNames: Record<ModifierStat, string> = {
  ritualCost: "custo do ritual (PE/PD)",
  ritualDC: "DT do ritual",
  attack: "ataque",
  attackDice: "d20 no ataque",
  testDice: "d20 no teste",
  extraWeaponDice: "dado(s) extras de dano da arma",
  criticalMultiplier: "multiplicador crítico",
  damage: "dano",
  healing: "cura",
  defense: "Defesa",
  speed: "deslocamento (m)",
  baseDice: "dado(s) da arma",
  attribute: "atributo",
  skill: "perícia",
  critical: "margem de ameaça",
};
export function modifierLabel(m: PowerModifier) {
  const scope: Record<PowerScope, string> = {
    all: "",
    weapon: " com armas",
    melee: " corpo a corpo",
    ranged: " à distância",
    firearm: " com armas de fogo",
    projectile: " com armas de disparo",
    unarmed: " desarmado",
    ritual: " de ritual",
  };
  return `${m.amount.startsWith("-") ? "" : "+"}${m.amount} ${m.skill || m.attribute || statNames[m.stat]}${scope[m.scope]}${m.element ? ` (${m.element})` : ""}${m.saves ? " · resistência: " + m.saves.join(" ou ") : ""}${m.personalOnly ? " · alcance pessoal, alvo você" : ""}`;
}
const badSources: Record<string, string> = {
  "book-097072eee969e547":
    "A descrição de Ser Expurgado mistura colunas de elementos. O mestre precisa conferir a fonte antes de definir o efeito.",
  "book-11d1a0dddcaf9ec5":
    "A descrição de Ser Mutilado mistura colunas. O mestre precisa conferir a fonte antes de definir o efeito.",
};
function scopeFor(text: string): PowerScope {
  return /ritua/.test(text)
    ? "ritual"
    : /desarmad/.test(text)
      ? "unarmed"
      : /corpo a corpo/.test(text)
        ? "melee"
        : /arma[s]? de fogo/.test(text)
          ? "firearm"
          : /distancia|disparo/.test(text)
            ? "ranged"
            : /arma|ataque/.test(text)
              ? "weapon"
              : "all";
}
export function actionFor(item: Item, text: string): ActionCost {
  const declared = normalizePower(item.execution || "");
  const action =
    declared ||
    text.match(
      /(?:gastar|gastando|gaste|usar|usando|usa|use|consome|exige|como)\s+(?:\d+ (?:pe|pd) e )?(?:uma?\s+)?acao\s+(?:de\s+)?(padrao|movimento|livre|completa)/,
    )?.[1] ||
    "";
  return /completa/.test(action)
    ? "full"
    : /padrao/.test(action)
      ? "standard"
      : /movimento/.test(action)
        ? "move"
        : "free";
}
function declaredCost(item: Item, text: string) {
  if (item.cost && item.cost > 0) return item.cost;
  const cost =
    text.match(
      /(?:gastar|gasta|gastando|gaste|usar|usa|usando|paga|pagar|custa|custo(?: de)?)\s+(?:(?:uma? acao (?:padrao|de movimento|completa|livre)|uma reacao|uma rodada) e\s+)?(\d+)\s*(?:pe|pd)\b/,
    ) || text.match(/(\d+)\s*(?:pe|pd)\s+e\s+(?:uma? )?acao/);
  return cost ? +cost[1] : 0;
}
function baseRule(item: Item, text: string): PowerRule {
  const pe = declaredCost(item, text);
  const duration: PowerDuration = /proximo turno/.test(text)
    ? "nextTurn"
    : /(?:fim|final|durante|neste|nesse) (?:deste |do |o |seu )?turno/.test(
          text,
        )
      ? "turn"
      : /(?:pela|na|durante a|fim da|final da) cena/.test(text)
        ? "scene"
        : /ritua/.test(text)
          ? "ritual"
          : /ataque|dano/.test(text)
            ? "attack"
            : "test";
  return {
    action: actionFor(item, text),
    pe,
    ...(!Number.isInteger(pe) || pe < 0 || pe > 999
      ? {
          blocked:
            "O custo deve ser um inteiro de 0 a 999 PE/PD; confira a descrição com o mestre.",
        }
      : {}),
    passive: false,
    target: "self",
    duration,
    modifiers: [],
    grants: [],
    ...(/uma vez por rodada/.test(text)
      ? { limit: "round" as const }
      : /uma vez por turno/.test(text)
        ? { limit: "turn" as const }
        : /uma vez por cena/.test(text)
          ? { limit: "scene" as const }
          : {}),
  };
}

/** Compile only explicit clauses, never execute a description as code. Catalog IDs
 * and current instance text are retained; affinity is opt-in, not inferred from a paragraph. */
export function powerRule(stored: Item, agent?: Agent): PowerRule {
  const item = combatItem(stored),
    name = normalizePower(combatRuleName(item));
  let raw = item.notes.split(/(?:Pr[eé]-requisito|Pr[eé] requisito)\s*:/i)[0];
  const affinity = item.notes.match(/Afinidade\s*:\s*([\s\S]*)/i)?.[1];
  raw = raw.split(/Afinidade\s*:/i)[0];
  const useAffinity = !!item.attuned && (agent?.nex ?? 0) >= 50;
  let text = normalizePower(raw);
  const rule = baseRule(item, text);
  const id = item.catalogId || item.id;
  if (badSources[id]) return { ...rule, blocked: badSources[id] };
  // Explicit, source-independent mechanics already identified by the complete rule name.
  if (name === "ataque especial")
    return {
      ...rule,
      pe: 2,
      duration: "attack",
      special: "specialAttack",
      condition:
        "Use no ataque que receberá os bônus. Cada parcela de +5 vai para ataque ou dano.",
    };
  if (name === "ataque furtivo")
    return {
      ...rule,
      pe: 1,
      duration: "attack",
      special: "sneakAttack",
      limit: "round",
      condition:
        "Seu ataque acertou um alvo desprevenido ou flanqueado, no alcance da habilidade. Ative após rolar o ataque e antes de rolar o dano.",
    };
  if (name === "golpe pesado")
    return {
      ...rule,
      passive: true,
      modifiers: [mod("baseDice", "1", "melee")],
    };
  if (name === "ritual potente")
    return {
      ...rule,
      passive: true,
      modifiers: [
        mod("damage", "INT", "ritual"),
        mod("healing", "INT", "ritual"),
      ],
    };
  if (name === "tiro certeiro")
    return {
      ...rule,
      passive: true,
      modifiers: [mod("damage", "AGI", "projectile")],
    };
  if (name === "golpe demolidor")
    return {
      ...rule,
      pe: 1,
      duration: "attack",
      modifiers: [mod("extraWeaponDice", "2", "weapon")],
      condition:
        "Este ataque usa a manobra quebrar ou tem como alvo um objeto.",
    };
  if (name === "combater com duas armas")
    return {
      ...rule,
      duration: "nextTurn",
      grants: ["attack"],
      condition:
        "Empunha uma arma em cada mão; uma é leve. Os dois ataques sofrem -1d20.",
      modifiers: [mod("attackDice", "-1", "weapon")],
    };
  if (name === "sangue fervente")
    return {
      ...rule,
      duration: "scene",
      condition: "Você está machucado (metade dos PV máximos ou menos).",
      choices: ["AGI", "FOR"].map((attribute) => ({
        id: attribute,
        label: `+${useAffinity ? 2 : 1} ${attribute}`,
        modifiers: [
          {
            ...mod("attribute", String(useAffinity ? 2 : 1)),
            attribute: attribute as Attribute,
          },
        ],
      })),
    };
  if (name === "arma de sangue")
    return useAffinity
      ? {
          ...rule,
          pe: 0,
          action: "free",
          passive: true,
          warning:
            "Sua arma permanente de Sangue aparece nas ações de ataque, com 1d10 de dano. O ataque adicional custa 1 PE, uma vez por turno, após agredir.",
        }
      : {
          ...rule,
          action: "move",
          pe: 2,
          duration: "scene",
          manifestation: "bloodWeapon",
          warning:
            "A arma leve de Sangue fica disponível nas ações de ataque até o fim da cena. Após agredir, o ataque adicional com ela custa 1 PE, uma vez por turno.",
        };
  if (name === "arma favorita")
    return {
      ...rule,
      passive: true,
      warning:
        "A escolha de arma e a redução de categoria pertencem ao inventário; não concedem bônus de dano por si só.",
    };
  if (name === "perito")
    return {
      ...rule,
      allowedSkills: [
        "acrobacia",
        "adestramento",
        "artes",
        "atletismo",
        "atualidades",
        "ciencias",
        "crime",
        "diplomacia",
        "enganacao",
        "fortitude",
        "furtividade",
        "iniciativa",
        "intimidacao",
        "intuicao",
        "investigacao",
        "medicina",
        "ocultismo",
        "percepcao",
        "pilotagem",
        "profissao",
        "reflexos",
        "religiao",
        "sobrevivencia",
        "tatica",
        "tecnologia",
        "vontade",
      ].filter((skill) => normalizePower(stored.name).includes(skill)),
      pe: 2,
      duration: "test",
      special: "perito",
      condition:
        "O teste usa uma das duas perícias escolhidas para Perito (exceto Luta e Pontaria).",
    };
  if (name === "combate defensivo")
    return {
      ...rule,
      action: "free",
      pe: 0,
      duration: "nextTurn",
      modifiers: [mod("attackDice", "-1", "weapon"), mod("defense", "5")],
      condition: "Você vai usar a ação agredir neste turno.",
    };
  if (name === "artista marcial")
    return {
      ...rule,
      passive: true,
      warning:
        "O ataque desarmado já usa 1d6, 1d8 em NEX 35% e 1d10 em NEX 70%, com a regra de arma ágil.",
    };
  if (name === "gatuno")
    return {
      ...rule,
      passive: true,
      modifiers: ["atletismo", "crime"].map((skill) => ({
        ...mod("skill", "5"),
        skill,
      })),
    };
  if (["tecnica secreta", "tecnica sublime"].includes(name))
    return {
      ...rule,
      action: "free",
      pe: 2,
      duration: "attack",
      weaponChoice: true,
      multiChoice: true,
      condition: "Selecione sua arma favorita. Cada efeito custa 2 PE.",
      choices: [
        {
          id: "destroyer",
          label: "Destruidor: +1 multiplicador de crítico",
          modifiers: [mod("criticalMultiplier", "1", "weapon")],
        },
        ...(name === "tecnica sublime" ||
        agent?.inventory.some(
          (x) => normalizePower(x.name) === "tecnica sublime",
        )
          ? [
              {
                id: "lethal",
                label: "Letal: +2 margem de ameaça (2 PE)",
                modifiers: [mod("critical", "2", "weapon")],
              },
              {
                id: "lethal2",
                label: "Letal duas vezes: +5 margem de ameaça (4 PE)",
                modifiers: [mod("critical", "5", "weapon")],
              },
            ]
          : []),
      ],
      warning:
        "Amplo e Perfurante exigem confirmar alvos e resistência com o mestre; não aumentam o dano rolado.",
    };
  if (name === "ataque extra")
    return {
      ...rule,
      action: "free",
      pe: 2,
      duration: "turn",
      limit: "round",
      grants: ["attack"],
      condition: "Você já realizou um ataque neste turno.",
    };
  if (name === "conjuracao marcial")
    return {
      ...rule,
      action: "free",
      pe: 2,
      duration: "turn",
      limit: "round",
      grants: ["meleeAttack"],
      condition:
        "Você executou um ritual de ação padrão neste turno. O crédito adicional só permite ataque corpo a corpo.",
    };
  if (name === "posicao de combate")
    return {
      ...rule,
      action: "free",
      pe: 2,
      duration: "turn",
      limit: "scene",
      grants: ["move"],
      condition: "Este é seu primeiro turno da cena de ação.",
    };
  if (name === "frase de efeito")
    return {
      ...rule,
      action: "free",
      pe: 2,
      duration: "attack",
      special: "criticalPhrase",
      condition:
        "Seu ataque foi um acerto crítico confirmado. Ative antes de rolar o dano.",
      warning:
        "Nesta sala, o jogador usa a habilidade no próprio turno; para alterar um crítico de um aliado fora dele, o mestre ainda precisa resolver a reação.",
    };
  const skillMods = (amount: string, names: string[]): PowerModifier[] =>
    names.map((skill) => ({ ...mod("skill", amount), skill }));
  const passive = (modifiers: PowerModifier[]): PowerRule => ({
    ...rule,
    action: "free",
    pe: 0,
    passive: true,
    modifiers,
  });
  if (["reflexos defensivos", "precognicao"].includes(name))
    return passive([
      mod("defense", "2"),
      ...skillMods("2", ["fortitude", "reflexos", "vontade"]),
    ]);
  if (name === "patrulha") return passive([mod("defense", "2")]);
  if (name === "mao pesada") return passive([mod("damage", "2", "melee")]);
  if (["para bellum", "balistica avancada"].includes(name))
    return passive([mod("damage", "2", "firearm")]);
  if (name === "tecnica letal") return passive([mod("critical", "2", "melee")]);
  if (name === "golpe de sorte")
    return passive([
      mod("critical", "1", "weapon"),
      ...(useAffinity ? [mod("criticalMultiplier", "1", "weapon")] : []),
    ]);
  if (name === "visao do oculto") return passive(skillMods("5", ["percepcao"]));
  if (name === "rituais eficientes")
    return passive([mod("ritualDC", "5", "ritual")]);
  if (name === "tatuagem ritualistica")
    return passive([
      { ...mod("ritualCost", "-1", "ritual"), personalOnly: true },
    ]);
  if (["mestre em elemento", "especialista em elemento"].includes(name)) {
    const elements = ["Sangue", "Morte", "Conhecimento", "Energia", "Medo"];
    const selected = elements.find(
      (x) =>
        normalizePower(item.element || "") === normalizePower(x) ||
        normalizePower(stored.name).includes(normalizePower(x)),
    );
    const effect = (element: string) => ({
      ...mod(
        name === "mestre em elemento" ? "ritualCost" : "ritualDC",
        name === "mestre em elemento" ? "-1" : "2",
        "ritual",
      ),
      element,
    });
    return selected
      ? passive([effect(selected)])
      : {
          ...rule,
          action: "free",
          pe: 0,
          duration: "scene",
          choices: elements.map((x) => ({
            id: x,
            label: x,
            modifiers: [effect(x)],
          })),
          condition:
            "Selecione o elemento escolhido quando adquiriu este poder.",
        };
  }
  if (name === "sentido tatico")
    return {
      ...rule,
      action: "move",
      pe: 2,
      duration: "scene",
      modifiers: [
        mod("defense", "INT"),
        ...skillMods("INT", ["fortitude", "reflexos", "vontade"]),
      ],
    };
  if (name === "iniciativa aprimorada")
    return {
      ...passive(skillMods("5", ["iniciativa"])),
      warning:
        "A ação adicional do primeiro turno já é concedida automaticamente.",
    };
  if (name === "sempre alerta")
    return {
      ...passive([]),
      warning:
        "A ação adicional do primeiro turno já é concedida automaticamente.",
    };
  if (name === "especialista em emergencias")
    return {
      ...passive(agent?.skills.Medicina ? skillMods("2", ["medicina"]) : []),
      warning:
        "Cicatrizantes usam movimento. Se ainda não for treinado em Medicina, registre o treinamento na ficha.",
    };
  if (name === "ferramenta de trabalho")
    return {
      ...rule,
      action: "free",
      pe: 0,
      duration: "scene",
      weaponChoice: true,
      modifiers: [
        mod("attack", "1", "weapon"),
        mod("damage", "1", "weapon"),
        mod("critical", "1", "weapon"),
      ],
      condition: "Selecione a arma escolhida como ferramenta da sua profissão.",
    };
  if (name === "maquina de matar")
    return {
      ...rule,
      action: "free",
      pe: 0,
      duration: "scene",
      weaponChoice: true,
      modifiers: [
        mod("critical", "2", "weapon"),
        mod("baseDice", "1", "weapon"),
      ],
      condition: "Selecione sua arma favorita.",
    };
  if (name === "mira de elite")
    return {
      ...rule,
      action: "free",
      pe: 0,
      duration: "scene",
      weaponChoice: true,
      modifiers: [mod("damage", "INT", "firearm")],
      condition: "A arma selecionada usa balas longas.",
    };
  if (name === "disparo letal")
    return {
      ...rule,
      action: "free",
      pe: 1,
      duration: "attack",
      expires: "nextTurnEnd",
      modifiers: [mod("critical", "2", "weapon")],
      condition:
        "Você realizou a ação mirar; o próximo ataque precisa acontecer até o fim do seu próximo turno.",
    };
  if (name === "hacker")
    return {
      ...rule,
      action: "free",
      pe: 0,
      duration: "test",
      modifiers: skillMods("5", ["tecnologia"]),
      condition:
        "Este teste de Tecnologia é para invadir um sistema. A invasão em si exige uma ação completa.",
    };
  if (name === "identificacao paranormal")
    return {
      ...rule,
      action: "free",
      pe: 0,
      duration: "test",
      modifiers: skillMods("10", ["ocultismo"]),
      condition:
        "Este teste identifica criatura, objeto ou ritual; não é o teste do Custo do Paranormal.",
    };
  if (name === "envolto em misterio")
    return {
      ...rule,
      action: "free",
      pe: 0,
      duration: "test",
      modifiers: skillMods("5", ["enganacao", "intimidacao"]),
      condition:
        "O alvo não é treinado em Ocultismo e o mestre autorizou o efeito sobre ele.",
    };
  if (name === "atraente")
    return {
      ...rule,
      action: "free",
      pe: 0,
      duration: "test",
      modifiers: skillMods("5", [
        "artes",
        "diplomacia",
        "enganacao",
        "intimidacao",
      ]),
      condition: "A pessoa pode se sentir fisicamente atraída por você.",
    };
  if (name === "desbravador")
    return {
      ...rule,
      action: "free",
      pe: 2,
      duration: "test",
      modifiers: skillMods("5", ["adestramento", "sobrevivencia"]),
      condition: "Você vai fazer um teste de Adestramento ou Sobrevivência.",
    };
  if (name === "magnum opus")
    return {
      ...rule,
      action: "free",
      pe: 0,
      duration: "test",
      modifiers: skillMods("5", [
        "adestramento",
        "artes",
        "diplomacia",
        "enganacao",
        "intimidacao",
        "intuicao",
        "percepcao",
        "religiao",
        "vontade",
      ]),
      condition:
        "A pessoa reconhece sua obra. O bônus vale apenas nos testes contra ela; encerre o efeito em outras situações.",
    };
  if (name === "atraves da lente")
    return {
      ...rule,
      action: "free",
      pe: 2,
      duration: "test",
      modifiers: skillMods("5", ["investigacao", "percepcao"]),
      condition:
        "Você procura pistas por uma câmera ou analisando fotos. O mestre acompanha a metade do deslocamento ao andar olhando pela lente.",
    };
  if (name === "vontade inabalavel")
    return {
      ...passive(skillMods("2", ["vontade"])),
      warning: "O aumento permanente de PE deve constar nos ajustes da ficha.",
    };
  if (name === "ensaio")
    return {
      ...rule,
      action: "free",
      pe: 0,
      target: "ally",
      duration: "scene",
      modifiers: [
        mod(
          "critical",
          String(
            (agent?.nex || 0) >= 99
              ? 4
              : (agent?.nex || 0) >= 65
                ? 3
                : (agent?.nex || 0) >= 40
                  ? 2
                  : 1,
          ),
          "weapon",
        ),
      ],
      condition:
        "Os personagens selecionados ensaiaram no interlúdio anterior. Este botão registra o benefício preparado; não realiza um interlúdio durante o combate.",
    };
  if (name === "mosh pit")
    return {
      ...rule,
      action: "free",
      pe: 0,
      target: "ally",
      duration: "scene",
      special: "moshPit",
      enemyChoice: true,
      condition:
        "Você flanqueia o inimigo selecionado. Selecione somente os personagens flanqueando ou adjacentes a ele; encerre o efeito se deixarem de cumprir essa posição.",
    };
  if (name.startsWith("instrumento eletrico de combate"))
    return {
      ...passive([]),
      warning:
        "Use a arma Instrumento Elétrico de Combate: ataque com Artes/PRE, 2d8 + PRE de dano de Energia. Preserve o bônus de PRE já escrito na fórmula da arma; não some duas vezes.",
    };
  const reviewed = reviewedPowerRule(name, item, agent, rule, useAffinity);
  if (reviewed) return reviewed;
  // Book entries include inherited styles, multi-column extracts and conditional
  // alternatives. Unreviewed entries remain selectable with explicit GM resolution;
  // they NEVER fall through to the free-text custom-power compiler.
  if (item.bookId || item.catalogId || item.id.startsWith("book-"))
    return {
      ...rule,
      manual: true,
      warning:
        "Esta habilidade precisa de uma regra específica do mestre para seus efeitos. O texto e os custos ficam registrados; configure os bônus em Efeitos de itens e habilidades antes de automatizá-los.",
      ...(/uma rodada|minuto|hora/.test(text)
        ? {
            blocked:
              "Esta execução leva mais tempo do que uma ação comum; configure a regra com o mestre.",
          }
        : {}),
    };
  // Explicit affinity replaces a numeric bonus only when the text states that replacement.
  if (useAffinity && affinity) {
    const af = normalizePower(affinity);
    if (/bonus (?:aumenta|que voce recebe.*aumenta)|em vez de/.test(af)) {
      const n = af.match(/(?:para|em vez de)\s*\+(\d+)/);
      if (n) text = text.replace(/\+\d+/, `+${n[1]}`);
    } else text += " " + af;
  }
  // A number belongs to the phrase immediately following it. Never scan an
  // entire paragraph for unrelated words such as attack/defense/damage.
  const skills: Record<string, string> = {
    acrobacia: "acrobacia",
    adestramento: "adestramento",
    artes: "artes",
    atletismo: "atletismo",
    atualidades: "atualidades",
    ciencias: "ciencias",
    crime: "crime",
    diplomacia: "diplomacia",
    enganacao: "enganacao",
    fortitude: "fortitude",
    furtividade: "furtividade",
    iniciativa: "iniciativa",
    intimidacao: "intimidacao",
    intuicao: "intuicao",
    investigacao: "investigacao",
    luta: "luta",
    medicina: "medicina",
    ocultismo: "ocultismo",
    percepcao: "percepcao",
    pilotagem: "pilotagem",
    pontaria: "pontaria",
    profissao: "profissao",
    reflexos: "reflexos",
    religiao: "religiao",
    sobrevivencia: "sobrevivencia",
    tatica: "tatica",
    tecnologia: "tecnologia",
    vontade: "vontade",
  };
  const attrNames: Record<string, Attribute> = {
    intelecto: "INT",
    agilidade: "AGI",
    forca: "FOR",
    presenca: "PRE",
    vigor: "VIG",
  };
  const clauses = text.split(/[.;\n]+/);
  let ambiguous = false;
  for (const clause of clauses) {
    // These clauses need a configured rule: examples, scaling, replacements,
    // recipients other than the user and optional sub-modes are not flat bonuses.
    if (
      /por exemplo|em nex|para cada|em vez|aumenta para|exceto|multiplica|dobra|escolha.*(?:elemento|opcao)|afinidade|discente|verdadeiro|pre-requisito/.test(
        clause,
      )
    ) {
      ambiguous ||= /[+-]\d/.test(clause);
      continue;
    }
    if (/aliado|inimigo|oponente|alvo (?:recebe|ganha|sofre)/.test(clause)) {
      ambiguous ||= /[+-]\d/.test(clause);
      continue;
    }
    const pattern =
      /(?:recebe|ganha|fornece|concede|sofre|possui)(?: um bonus de| uma penalidade de)?\s+([+-]\d+(?:d\d+)?|\d+d\d+)\s+(?:pontos? )?(?:em|na|nas|nos|no|de|aos|as)\s+([^.;]+)/g;
    for (const match of clause.matchAll(pattern)) {
      const value = match[1].replace(/^\+/, "");
      const phrase = match[2].split(
        /,| mas | porem | e (?:pode|recebe|ganha|sofre)| para | quando | enquanto /,
      )[0];
      const scope = scopeFor(phrase);
      if (/^todos os testes de ataque|^testes? de ataque|^ataque/.test(phrase))
        rule.modifiers.push(
          mod(
            value.endsWith("d20") ? "attackDice" : "attack",
            value.replace(/d20$/, ""),
            scope,
          ),
        );
      else if (/^(?:rolagens? de |rolagem de )?dano\b/.test(phrase))
        rule.modifiers.push(mod("damage", value, scope));
      else if (/^(?:rolagens? de |rolagem de )?cura\b/.test(phrase))
        rule.modifiers.push(mod("healing", value, scope));
      else if (/^defesa\b/.test(phrase))
        rule.modifiers.push(mod("defense", value));
      else if (/^(?:seu )?deslocamento\b/.test(phrase))
        rule.modifiers.push(mod("speed", value));
      else if (/^margem de ameaca/.test(phrase))
        rule.modifiers.push(mod("critical", value, scope));
      else if (/^testes de pericia/.test(phrase) && value.endsWith("d20"))
        rule.modifiers.push(mod("testDice", value.replace(/d20$/, "")));
      else {
        const target = phrase.replace(
          /^(?:testes de|testes?|seus testes de) /,
          "",
        );
        for (const word of target.split(/ e | ou /)) {
          const exact = word.trim();
          if (skills[exact])
            rule.modifiers.push({
              ...mod(
                value.endsWith("d20") ? "testDice" : "skill",
                value.replace(/d20$/, ""),
              ),
              skill: exact,
            });
          if (attrNames[exact])
            rule.modifiers.push({
              ...mod("attribute", value),
              attribute: attrNames[exact],
            });
        }
      }
    }
    const extra = clause.match(
      /(?:causa|causam|causar|adiciona|adicionar|soma|somar)\s+([+]?[0-9]+d[0-9]+)\s+(?:pontos de )?dano (?:extra|adicional)/,
    );
    if (extra)
      rule.modifiers.push(
        mod("damage", extra[1].replace(/^\+/, ""), scopeFor(clause)),
      );
    const grant = clause.match(
      /(?:recebe|ganha|obtem) (?:uma?|1|\+1) acao (padrao|de movimento|livre) (?:extra|adicional)/,
    );
    if (grant && !/apenas|somente|exclusiv|por turno|primeir/.test(clause))
      rule.grants.push(
        grant[1] === "padrao"
          ? "standard"
          : grant[1] === "livre"
            ? "free"
            : "move",
      );
    // Multiple alternatives require an explicit selection rather than stacking.
    if (/\bou\b/.test(clause) && rule.modifiers.length > 1) ambiguous = true;
  }
  rule.modifiers = [
    ...new Map(rule.modifiers.map((m) => [JSON.stringify(m), m])).values(),
  ];
  rule.grants = [...new Set(rule.grants)];
  if (ambiguous) {
    rule.modifiers = [];
    rule.grants = [];
  }
  const hasCondition =
    /\b(quando|enquanto|caso|se estiver|se usar|se fizer|apos|antes|ao acertar|ao atacar|ao causar|ao sofrer|contra um|contra alvos)\b/.test(
      text,
    );
  if (hasCondition) rule.condition = raw.trim();
  const explicitAction =
    !!item.execution?.trim() ||
    /acao (padrao|de movimento|completa|livre)|reacao/.test(text);
  rule.passive =
    !rule.pe &&
    !explicitAction &&
    !hasCondition &&
    !rule.grants.length &&
    !/pode gastar|pode usar|pode ativar/.test(text) &&
    !!rule.modifiers.length;
  if (rule.grants.length) rule.limit ||= "turn";
  if (!rule.modifiers.length && !rule.grants.length)
    Object.assign(rule, {
      manual: true,
      warning:
        "Esta descrição exige uma regra específica. O mestre pode configurar os efeitos de combate; a ativação isolada registra o texto e os custos, sem inventar bônus.",
    });
  if (
    /interludio|uma hora|um minuto|uma rodada|\d+ (?:minutos|horas|rodadas)/.test(
      text,
    )
  )
    rule.blocked =
      "Esta habilidade exige tempo fora das ações comuns de combate. O mestre pode configurar uma regra específica após conferir a descrição.";
  if (!rule.pe && /gastar[^.;]{0,40}(?:pe|pd)|custo variavel/.test(text))
    rule.blocked =
      "Confira o custo variável na descrição e configure a regra de combate antes de usar.";
  if (/reacao/.test(normalizePower(item.execution || "")))
    rule.condition = "Reação: confirme o gatilho indicado na descrição. " + raw;
  if (rule.modifiers.length) {
    try {
      configuredPowerRule(rule);
    } catch {
      rule.blocked =
        "Os bônus desta descrição excedem os formatos aceitos. Configure a regra com o mestre antes de usar.";
      rule.passive = false;
      rule.modifiers = [];
      rule.grants = [];
    }
  }
  return rule;
}

export function powerAmount(value: string, a: Agent) {
  if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (["AGI", "FOR", "INT", "PRE", "VIG"].includes(value))
    return effectiveAttributes(a)[value as Attribute];
  throw Error("Este bônus não é um valor fixo.");
}
export function eclecticMax(a: Agent) {
  const engineering = a.inventory.some(
    (i) =>
      i.kind === "Poder" &&
      i.quantity > 0 &&
      normalizePower(combatRuleName(i)) === "engenhosidade",
  );
  return engineering && a.nex >= 75 ? 3 : engineering && a.nex >= 40 ? 2 : 1;
}
export function resolvePower(
  item: Item,
  a: Agent,
  selection: PowerSelection = {},
  configured?: PowerRule,
): ResolvedPower {
  const rule = configured || powerRule(item, a);
  if (rule.blocked) throw Error(rule.blocked);
  if (rule.viaAction) throw Error(rule.viaAction);
  if (rule.passive)
    throw Error(
      "Este poder é passivo e já está aplicado; não precisa ativá-lo novamente.",
    );
  if (rule.condition && !selection.confirmed)
    throw Error(
      "Confirme que os requisitos e o gatilho da habilidade foram atendidos.",
    );
  const result = { ...rule, modifiers: [...rule.modifiers] };
  if (rule.choices?.length) {
    const ids = rule.multiChoice
      ? selection.choices || (selection.choice ? [selection.choice] : [])
      : [selection.choice];
    if (
      !ids.length ||
      new Set(ids).size !== ids.length ||
      (ids.includes("lethal") && ids.includes("lethal2"))
    )
      throw Error(
        "Escolha efeitos distintos; Letal simples e duplo são alternativas.",
      );
    for (const id of ids) {
      const choice = rule.choices.find((x) => x.id === id);
      if (!choice) throw Error("Escolha o efeito da habilidade.");
      result.modifiers.push(...choice.modifiers);
    }
    if (rule.multiChoice)
      result.pe = ids.reduce((sum, id) => sum + (id === "lethal2" ? 4 : 2), 0);
  }
  if (
    (rule.weaponChoice || rule.ritualChoice) &&
    !a.inventory.some(
      (i) =>
        i.id === selection.weaponId &&
        i.kind === (rule.ritualChoice ? "Ritual" : "Arma") &&
        i.quantity > 0,
    )
  )
    throw Error("Selecione o item beneficiado por esta habilidade.");
  if (rule.enemyChoice && !selection.enemyId)
    throw Error("Selecione o inimigo ao qual o bônus se aplica.");
  if (rule.special === "moshPit") {
    const steps = selection.steps ?? 1;
    if (!Number.isInteger(steps) || steps < 1 || steps > 5)
      throw Error(
        "Mosh Pit concede de 1d6 a 5d6, conforme os personagens cercando o inimigo.",
      );
    result.modifiers.push(mod("damage", `${steps}d6`, "weapon"));
  }
  if (!rule.multiChoice && selection.choice === "lethal2" && rule.weaponChoice)
    result.pe = 4;
  if (rule.special === "specialAttack") {
    const maximum = a.nex >= 85 ? 4 : a.nex >= 55 ? 3 : a.nex >= 25 ? 2 : 1;
    const steps = selection.steps ?? 1,
      attack = selection.attackSteps ?? steps;
    if (
      !Number.isInteger(steps) ||
      steps < 1 ||
      steps > maximum ||
      !Number.isInteger(attack) ||
      attack < 0 ||
      attack > steps
    )
      throw Error("Distribuição de Ataque Especial inválida para este NEX.");
    result.pe = steps + 1;
    if (attack)
      result.modifiers.push(mod("attack", String(attack * 5), "weapon"));
    if (steps - attack)
      result.modifiers.push(
        mod("damage", String((steps - attack) * 5), "weapon"),
      );
  } else if (rule.special === "sneakAttack") {
    const dice = a.nex >= 99 ? 4 : a.nex >= 65 ? 3 : a.nex >= 40 ? 2 : 1;
    result.modifiers.push(mod("damage", `${dice}d6`, "weapon"));
  } else if (rule.special === "perito") {
    const skill = selection.choice || "";
    if (
      !skill ||
      ["luta", "pontaria"].includes(normalizePower(skill)) ||
      !Object.keys(a.skills).some(
        (x) => normalizePower(x) === normalizePower(skill),
      )
    )
      throw Error("Escolha uma perícia válida para Perito.");
    if (
      rule.allowedSkills?.length &&
      !rule.allowedSkills.includes(normalizePower(skill))
    )
      throw Error("Esta perícia não foi escolhida para Perito na ficha.");
    if (!a.skills[skill]) throw Error("Perito exige uma perícia treinada.");
    const max = a.nex >= 85 ? 4 : a.nex >= 55 ? 3 : a.nex >= 25 ? 2 : 1;
    const steps = selection.steps ?? 1;
    if (!Number.isInteger(steps) || steps < 1 || steps > max)
      throw Error("Ampliação de Perito indisponível neste NEX.");
    result.pe = steps + 1;
    result.modifiers.push({
      ...mod("skill", `1d${4 + 2 * steps}`),
      skill: normalizePower(skill),
    });
  } else if (rule.special === "eclectic") {
    const skill = selection.choice || "",
      steps = selection.steps ?? 1;
    const max = eclecticMax(a);
    if (
      !Number.isInteger(steps) ||
      steps < 1 ||
      steps > max ||
      !(skill in a.skills)
    )
      throw Error("Escolha uma perícia e um grau disponível para Eclético.");
    const difference = steps * 5 - a.skills[skill];
    if (difference <= 0)
      throw Error(
        "Sua ficha já tem esse grau de treinamento ou um grau superior.",
      );
    result.pe = steps * 2;
    result.modifiers.push({
      ...mod("skill", String(difference)),
      skill: normalizePower(skill),
    });
  }
  return result;
}

/** Only the GM's saved encounter rule can supply numerical effects. Commands
 * from a player contain choices, never bonus values or a replacement rule. */
export function configuredPowerRule(config: {
  action: ActionCost;
  pe: number;
  target: PowerRule["target"];
  modifiers?: PowerModifier[];
  duration?: PowerDuration;
  condition?: string;
  limit?: PowerRule["limit"];
  passive?: boolean;
}): PowerRule {
  const stats = Object.keys(statNames),
    scopes = [
      "all",
      "weapon",
      "melee",
      "ranged",
      "firearm",
      "projectile",
      "unarmed",
      "ritual",
    ];
  if (
    !Number.isInteger(config.pe) ||
    config.pe < 0 ||
    config.pe > 999 ||
    !["standard", "move", "free", "full"].includes(config.action)
  )
    throw Error("Custo da regra de combate inválido.");
  if (!config.modifiers?.length || config.modifiers.length > 20)
    throw Error("Configure entre 1 e 20 efeitos.");
  for (const m of config.modifiers) {
    if (!stats.includes(m.stat) || !scopes.includes(m.scope))
      throw Error("Tipo de bônus inválido.");
    if (
      !(m.stat === "speed" && /^[+-]?\d{1,3}(?:\.[05])?$/.test(m.amount)) &&
      !/^(?:[+-]?\d{1,3}|(?:[1-9]\d?|100)d(?:[2-9]|[1-9]\d{1,2})|AGI|FOR|INT|PRE|VIG)$/.test(
        m.amount,
      )
    )
      throw Error("Use um número, atributo ou dados como 1d6 no bônus.");
    if (
      /d/.test(m.amount) &&
      !["attack", "damage", "healing", "skill"].includes(m.stat)
    )
      throw Error("Este efeito exige um valor fixo, não uma rolagem.");
    if (
      m.stat === "attribute" &&
      !["AGI", "FOR", "INT", "PRE", "VIG"].includes(m.attribute || "")
    )
      throw Error("Selecione o atributo beneficiado.");
    if (m.stat === "skill" && (!m.skill?.trim() || m.skill.length > 100))
      throw Error("Selecione a perícia beneficiada.");
    if (
      [
        "baseDice",
        "extraWeaponDice",
        "critical",
        "criticalMultiplier",
      ].includes(m.stat) &&
      !/^[1-9]\d?$/.test(m.amount)
    )
      throw Error("Dados e crítico exigem um inteiro positivo de até 99.");
  }
  if (
    ![
      "attack",
      "ritual",
      "test",
      "turn",
      "nextTurn",
      "round",
      "scene",
    ].includes(config.duration || "")
  )
    throw Error("Escolha a duração do efeito.");
  if (!["self", "ally", "any"].includes(config.target))
    throw Error("Alvo da regra inválido.");
  if (
    config.passive &&
    (config.condition?.trim() ||
      config.target !== "self" ||
      config.pe > 0 ||
      config.action !== "free")
  )
    throw Error(
      "Passivos automáticos exigem alvo próprio, custo zero e nenhuma condição de ativação.",
    );
  return {
    action: config.action,
    pe: config.pe,
    passive: !!config.passive && config.pe === 0,
    target: config.target,
    duration: config.duration!,
    modifiers: config.modifiers,
    grants: [],
    condition: config.condition,
    limit: config.limit,
  };
}
