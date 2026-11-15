import { skillAttributes, type Agent, type Item } from "./rules";
import type { PowerModifier, PowerRule } from "./power-rules";

/** Reviewed mechanics, separate from the free-text compiler. A condition is
 * deliberately explicit when the room cannot observe the fictional trigger. */
export function reviewedPowerRule(
  name: string,
  item: Item,
  agent: Agent | undefined,
  base: PowerRule,
  affinity: boolean,
): PowerRule | undefined {
  const skill = (
    names: string[],
    amount: string,
    dice = false,
  ): PowerModifier[] =>
    names.map((skill) => ({
      stat: dice ? "testDice" : "skill",
      scope: "all",
      skill,
      amount,
    }));
  const passive = (
    modifiers: PowerModifier[],
    warning?: string,
  ): PowerRule => ({
    ...base,
    action: "free",
    pe: 0,
    passive: true,
    modifiers,
    warning,
  });
  const conditionalTest = (
    pe: number,
    modifiers: PowerModifier[],
    condition: string,
  ): PowerRule => ({
    ...base,
    action: "free",
    pe,
    duration: "test",
    modifiers,
    condition,
  });
  if (name === "sensitivo")
    return passive(
      skill(["Diplomacia", "Intimidação", "Intuição"], "5"),
      affinity
        ? "Em um teste oposto, o mestre aplica a penalidade de −1d20 ao oponente."
        : undefined,
    );
  if (name === "tecnica medicinal")
    return passive([{ stat: "healing", scope: "all", amount: "INT" }]);
  if (name === "sangue de ferro")
    return passive(
      affinity ? skill(["Fortitude"], "5") : [],
      "O aumento permanente de PV deve constar nos ajustes da ficha. Com afinidade, o mestre considera a imunidade a venenos e doenças.",
    );
  if (name === "pernas para que te quero")
    return passive([
      {
        stat: "speed",
        scope: "all",
        amount: (agent?.stage || 1) >= 4 ? "3" : "1.5",
      },
    ]);
  if (name === "mente sa")
    return conditionalTest(
      0,
      skill(["Fortitude", "Reflexos", "Vontade"], "5"),
      "Este é um teste de resistência contra um efeito paranormal.",
    );
  const flatSkills: Record<string, [string[], string, boolean?]> = {
    "amigo dos animais": [["Adestramento"], "1", true],
    "vinculo natural": [["Adestramento"], "1", true],
    astronauta: [["Fortitude"], "2"],
    "treinamento espacial": [["Fortitude"], "2"],
    policial: [["Vontade"], "2"],
    "vigilia noturna": [["Vontade"], "2"],
    "adaptacao climatica": [["Fortitude"], "2"],
    "muito sorrateiro": [["Furtividade"], "3"],
  };
  // These named origins refer to the Arsenal's alternate powers, not the base
  // book's PatruIha/other origin benefits that share an origin name.
  if (
    flatSkills[name] &&
    (item.bookId === "05" ||
      !["amigo dos animais", "astronauta", "policial"].includes(name))
  )
    return passive(skill(...flatSkills[name]));
  if (
    ["desgarrado", "adaptado ao ambiente"].includes(name) &&
    item.bookId === "05"
  )
    return {
      ...base,
      pe: 1,
      action: "free",
      duration: "scene",
      modifiers: skill(
        Object.keys(agent?.skills || {}).filter((s) => !agent?.skills[s]),
        "2",
      ),
    };
  if (name === "ladrao silencioso")
    return passive(
      skill(["Crime"], "2"),
      "O furto especial de movimento e 1 PE ainda é resolvido pelo mestre.",
    );
  if (name === "falso conforto")
    return passive(
      skill(["Adestramento", "Artes", "Diplomacia", "Enganação"], "2"),
      affinity
        ? "O mestre confere o bônus condicional à DT contra Vontade e alvos impressionados."
        : undefined,
    );
  if (name === "bronco")
    return {
      ...base,
      action: "free",
      pe: 0,
      duration: "attack",
      modifiers: [{ stat: "attack", scope: "weapon", amount: "2" }],
      condition:
        "O alvo está flanqueado ou sob uma condição de paralisia ou dos sentidos.",
    };
  if (name === "palavras afiadas")
    return {
      ...base,
      action: "free",
      pe: 1,
      duration: "attack",
      modifiers: [{ stat: "damage", scope: "weapon", amount: "INT" }],
      warning:
        "A preparação de afinidade em interlúdio exige a regra específica do mestre; esta ativação vale para um ataque.",
    };
  if (name === "monologo")
    return conditionalTest(
      0,
      skill(["Diplomacia", "Enganação", "Intimidação"], "2"),
      "Você está falando para múltiplos alvos.",
    );
  if (name === "corte de carne")
    return {
      ...base,
      action: "free",
      pe: 0,
      duration: "scene",
      weaponChoice: true,
      modifiers: [{ stat: "damage", scope: "melee", amount: "FOR" }],
      condition:
        "A arma selecionada é uma faca, facão ou arma leve/de uma mão que causa Corte. O bônus completa o dobro de FOR; a primeira parcela já faz parte do dano corpo a corpo.",
    };
  if (name === "confianca bioquimica") {
    const amount = affinity ? "5" : "2";
    return {
      ...base,
      action: "free",
      pe: 0,
      duration: "scene",
      modifiers: [
        ...skill(Object.keys(skillAttributes), amount),
        { stat: "damage", scope: "melee", amount },
        { stat: "defense", scope: "all", amount },
      ],
      condition:
        "Você está sob uma condição de fadiga no combate. Encerre o efeito assim que essa condição deixar de valer.",
    };
  }
  if (name === "especialista em protecao leve")
    return {
      ...base,
      action: "free",
      pe: 0,
      duration: "scene",
      modifiers: [
        ...skill(["Reflexos"], "2"),
        { stat: "defense", scope: "all", amount: "2" },
      ],
      condition:
        "Você está usando proteção leve; encerre o efeito se retirar ou trocar a proteção.",
    };
  if (name === "primeira impressao")
    return {
      ...conditionalTest(
        0,
        skill(
          ["Diplomacia", "Enganação", "Intimidação", "Intuição"],
          "2",
          true,
        ),
        "Este é seu primeiro teste de uma dessas quatro perícias nesta cena.",
      ),
      limit: "scene",
    };
  if (name === "saber e poder" || name === "110%") {
    const allowed = name === "110%" ? ["FOR", "AGI"] : ["INT"];
    const skills = Object.entries(skillAttributes).filter(
      ([s, a]) =>
        allowed.includes(a) &&
        !(name === "110%" && ["Luta", "Pontaria"].includes(s)),
    );
    return {
      ...conditionalTest(
        2,
        [],
        `O teste usa ${allowed.join(" ou ")} como atributo-base.`,
      ),
      choices: skills.map(([s]) => ({
        id: s,
        label: s,
        modifiers: skill([s], "5"),
      })),
    };
  }
  if (name === "processo otimizado" || name === "faro para pistas")
    return {
      ...conditionalTest(
        name === "faro para pistas" ? 1 : 2,
        [],
        name === "faro para pistas"
          ? "Este é um teste para procurar pistas."
          : "Este teste faz parte de um teste estendido ou da revisão de documentos.",
      ),
      ...(name === "faro para pistas" ? { limit: "scene" as const } : {}),
      choices: Object.keys(skillAttributes).map((s) => ({
        id: s,
        label: s,
        modifiers: skill([s], "5"),
      })),
    };
  if (name === "acalentar")
    return {
      ...conditionalTest(
        0,
        skill(["Religião"], "5"),
        "Você está usando Religião para acalmar uma pessoa.",
      ),
      warning:
        "Após o teste, o mestre aplica 1d6 + PRE de recuperação de Sanidade à pessoa acalmada.",
    };
  if (name === "ecletico")
    return {
      ...base,
      pe: 2,
      action: "free",
      duration: "test",
      special: "eclectic",
    };
  if (name === "ritual predileto")
    return {
      ...base,
      pe: 0,
      action: "free",
      duration: "scene",
      ritualChoice: true,
      modifiers: [{ stat: "ritualCost", scope: "ritual", amount: "-1" }],
      condition:
        "Selecione o ritual escolhido quando adquiriu Ritual Predileto.",
    };
  if (name === "atirar para matar")
    return passive(
      [],
      "O dano de um crítico com arma de fogo é maximizado automaticamente; o mestre ainda confirma o acerto.",
    );
  if (name === "racionalidade inflexivel" || name === "olhar sinistro")
    return passive(
      [],
      name === "racionalidade inflexivel"
        ? "Vontade usa INT quando ele é maior que PRE. O aumento permanente de PE deve constar nos ajustes da ficha."
        : "Ocultismo usa PRE quando ele é maior que INT; você ainda pode editar os dados antes de rolar.",
    );
  if (name === "vitalidade reforcada")
    return passive(
      skill(["Fortitude"], "2"),
      "O aumento permanente de PV deve constar nos ajustes da ficha.",
    );
  if (name === "pancada forte")
    return {
      ...base,
      action: "free",
      pe: 1,
      duration: "attack",
      modifiers: [{ stat: "attackDice", scope: "weapon", amount: "1" }],
      ...(agent?.className !== "Sobrevivente"
        ? {
            blocked:
              "Pancada Forte é substituída ao concluir o treinamento de classe; confira essa mudança na ficha.",
          }
        : {}),
    };
  if (name === "manual do sobrevivente" || name === "maos no volante")
    return {
      ...conditionalTest(
        2,
        [],
        name === "manual do sobrevivente"
          ? "Este teste resiste a armadilhas, clima, doenças, fome, sede, fumaça, sono, sufocamento ou veneno."
          : "Você está pilotando e vai fazer um teste de Pilotagem ou resistência.",
      ),
      choices: (name === "maos no volante"
        ? ["Pilotagem", "Fortitude", "Reflexos", "Vontade"]
        : Object.keys(skillAttributes)
      ).map((s) => ({ id: s, label: s, modifiers: skill([s], "5") })),
    };
  if (
    [
      "potencia maxima",
      "fluxo de poder",
      "presenca poderosa",
      "encarar a morte",
      "engenhosidade",
    ].includes(name)
  )
    return passive(
      [],
      {
        "potencia maxima":
          "Dobra automaticamente os bônus de Ataque Especial nos ataques corpo a corpo.",
        "fluxo de poder":
          "O combate já permite sustentar dois rituais; pague os custos de ambos.",
        "presenca poderosa":
          "PRE já aumenta o limite de PE apenas para rituais, sem aumentar sua DT.",
        "encarar a morte":
          "O limite de PE da cena já inclui +1 (ou +3 com afinidade).",
        engenhosidade:
          "As opções de Eclético passam a incluir veterano/expert nos NEX indicados.",
      }[name],
    );
  return undefined;
}
