import { maximums, skillAttributes, type Agent, type Item } from "./rules";
import type { PowerModifier, PowerRule } from "./power-rules";

// These SaH powers give training, or +2 if the character was already trained
// when acquiring the power. Legacy sheets do not record that acquisition order.
const survivorTraining: Record<string, string> = {
  acrobatico: "Acrobacia",
  atletico: "Atletismo",
  "detector de mentiras": "Intuição",
  informado: "Atualidades",
  interrogador: "Intimidação",
  "mentiroso nato": "Enganação",
  observador: "Investigação",
  persuasivo: "Diplomacia",
  "pesquisador cientifico": "Ciências",
  "personalidade esoterica": "Ocultismo",
  "sentidos agucados": "Percepção",
  sorrateiro: "Furtividade",
  "dedos ageis": "Crime",
  talentoso: "Artes",
  sobrevivencialista: "Sobrevivência",
};

const progressionPowers = new Set([
  "armamento pesado",
  "protecao pesada",
  "transcender",
  "treinamento em pericia",
  "aumento de atributo",
  "grau de treinamento",
  "versatilidade",
  "a favorita",
  "aprender ritual",
  "expansao de conhecimento",
  "saber ampliado",
  "canalizar o medo",
  "medo tangivel",
  "conhecendo o medo",
  "presenca do medo",
  "lamina do medo",
  "escolhido pelo outro lado",
  "tracos do outro lado",
  "mochila de utilidades",
  "ferramenta favorita",
  "inventario otimizado",
  "patrocinador da ordem",
  "o crime compensa",
]);
const interludePowers: Record<string, Set<string>> = {
  "01": new Set(["criar selo", "ingrediente secreto"]),
  "05": new Set([
    "palavras do bem",
    "treinamento caotico",
    "tratamento preventivo",
    "agente de saude",
    "cozinha eficiente",
    "chef",
    "aula de reforco",
    "professor",
    "pesquisa direcionada",
    "t.i.",
    "sem tempo irmao",
    "universitario",
  ]),
  "07": new Set(["contatos oportunos", "farmaceutico de campo"]),
};

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
  if (item.bookId === "01" && progressionPowers.has(name))
    return {
      ...base,
      pe: 0,
      outsideCombat: true,
      blocked:
        "Este benefício é escolhido ou registrado na ficha durante a progressão ou a preparação da missão.",
    };
  if (interludePowers[item.bookId || ""]?.has(name))
    return {
      ...base,
      outsideCombat: true,
      blocked:
        "A preparação desta habilidade exige um interlúdio. Confira na descrição os custos e a duração do benefício já preparado.",
    };
  if (name === "segurar o gatilho" || name === "acelerar ritual")
    return {
      ...base,
      pe: 0,
      action: "free",
      viaAction:
        name === "acelerar ritual"
          ? "Na ação de conjurar o ritual, marque Acelerar Ritual para gastar mais 4 PE ou PD e usar uma ação livre, uma vez por rodada."
          : "Role o dano do ataque que acertou. Selecione a mesma arma de fogo e o mesmo alvo. Confirme o acerto para usar Segurar o Gatilho. O custo é 2 PE ou PD por ataque já feito no turno.",
    };
  if (name === "ninja urbano")
    return passive([
      { stat: "damage", scope: "melee", amount: "2" },
      { stat: "damage", scope: "projectile", amount: "2" },
    ]);
  const allSkills = Object.keys(skillAttributes);
  const speed = (amount: string): PowerModifier => ({
    stat: "speed",
    scope: "all",
    amount,
  });
  if (item.bookId === "07") {
    const trainedSkill = survivorTraining[name];
    if (trainedSkill) {
      const training = agent?.skills[trainedSkill] || 0;
      return {
        ...base,
        action: "free",
        pe: 0,
        duration: "scene",
        limit: undefined,
        always:
          name === "atletico"
            ? [speed("3")]
            : name === "observador"
              ? skill(["Intuição"], "INT")
              : [],
        choices: [
          ...(training < 5
            ? [
                {
                  id: "training",
                  label:
                    "Aprendi com o poder e o treinamento ainda não consta na ficha",
                  modifiers: skill([trainedSkill], String(5 - training)),
                },
              ]
            : []),
          ...(training >= 5
            ? [
                {
                  id: "prior",
                  label: "Eu já era treinado ao adquirir o poder. Aplicar +2",
                  modifiers: skill([trainedSkill], "2"),
                },
              ]
            : []),
        ],
        condition:
          "Confira o histórico do personagem. Ative somente se o bônus indicado ainda falta na ficha.",
        warning:
          "Este ajuste vale na sala de combate. Consulte a descrição para os outros usos do poder.",
      };
    }
    if (
      name === "luto habitual" ||
      name === "encontrar a verdade" ||
      name === "teimosia obstinada"
    ) {
      const chosen =
        name === "luto habitual"
          ? "Medicina"
          : name === "encontrar a verdade"
            ? "Investigação"
            : "Vontade";
      return conditionalTest(
        2,
        skill([chosen], "5"),
        name === "luto habitual"
          ? "O teste de Medicina é para primeiros socorros ou necropsia."
          : name === "teimosia obstinada"
            ? "O efeito causa uma condição mental ou tenta mudar sua categoria de atitude."
            : "Você vai fazer um teste de Investigação.",
      );
    }
    if (name === "poder da amizade" || name === "nao e fantasia, e cosplay!")
      return {
        ...conditionalTest(
          0,
          [{ stat: "skill", scope: "all", amount: "2" }],
          name === "poder da amizade"
            ? "Seu melhor amigo está em alcance médio e vocês podem trocar olhares. Encerre o efeito se isso mudar."
            : "Seu cosplay tem relação com o próximo teste.",
        ),
        duration: name === "poder da amizade" ? "scene" : "test",
      };
    if (name === "luta ou fuga")
      return passive(
        skill(["Vontade"], "2"),
        "O mestre acompanha os 2 PE temporários quando surge a referência à premonição.",
      );
    if (name === "mutacao" || name === "companheiro animal")
      return {
        ...base,
        action: "free",
        pe: 0,
        duration: "scene",
        always: name === "mutacao" ? skill(["Diplomacia"], "-1", true) : [],
        condition:
          name === "mutacao"
            ? "Selecione a perícia física escolhida ao adquirir a mutação."
            : "Selecione a perícia aprovada pelo mestre para seu companheiro presente.",
        choices: allSkills
          .filter(
            (s) =>
              name !== "mutacao" ||
              ["FOR", "AGI", "VIG"].includes(skillAttributes[s]),
          )
          .map((s) => ({ id: s, label: s, modifiers: skill([s], "2") })),
        warning:
          name === "mutacao"
            ? "O mestre considera RD 2 ao confirmar o dano."
            : "Os demais benefícios do aliado e os efeitos da perda dele dependem do mestre.",
      };
  }
  if (name === "minha dor me impulsiona")
    return {
      ...conditionalTest(
        1,
        skill(["Acrobacia", "Atletismo", "Furtividade"], "1d6"),
        "Você vai fazer um teste de Acrobacia, Atletismo ou Furtividade.",
      ),
      ...(agent && maximums(agent).pv - agent.resources.pv < 5
        ? { blocked: "É necessário ter perdido pelo menos 5 PV." }
        : {}),
    };
  if (name === "correria desesperada" || name === "fuga obstinada")
    return {
      ...conditionalTest(
        0,
        [{ stat: "testDice", scope: "all", amount: "1" }],
        name === "correria desesperada"
          ? "O próximo teste é para fugir em uma perseguição."
          : "O próximo teste é para fugir de um inimigo.",
      ),
      ...(name === "correria desesperada"
        ? { always: [speed("3")] }
        : {
            warning: "Em perseguição, a presa pode acumular até quatro falhas.",
          }),
    };
  if (name === "tecnicas de contencao" || name === "lutador marcial")
    return {
      ...conditionalTest(
        name === "tecnicas de contencao" ? 2 : 0,
        skill(["Luta"], name === "tecnicas de contencao" ? "5" : "2"),
        "O próximo teste de Luta é uma manobra de combate.",
      ),
      ...(name === "lutador marcial"
        ? {
            warning:
              "Resolva a imobilização com uma ação completa e o teste oposto indicado na descrição.",
          }
        : {}),
    };
  if (item.bookId === "05") {
    if (name === "grudar o cano" || name === "finalizacao brutal")
      return {
        ...base,
        pe: 0,
        action: "free",
        duration: "attack",
        enemyChoice: true,
        modifiers:
          name === "grudar o cano"
            ? [{ stat: "criticalMultiplier", scope: "firearm", amount: "1" }]
            : [
                { stat: "attackDice", scope: "weapon", amount: "1" },
                { stat: "critical", scope: "weapon", amount: "1" },
              ],
        condition:
          name === "grudar o cano"
            ? "Você vai atirar no alvo selecionado e está adjacente a ele."
            : "O Estilo Bruto está ativo e o alvo selecionado está Machucado.",
      };
    if (name === "conjuracao corporal" || name === "letrado no oculto")
      return passive(
        [
          {
            stat: "ritualDC",
            scope: "ritual",
            amount: "2",
            saves:
              name === "conjuracao corporal"
                ? ["Fortitude", "Reflexos"]
                : ["Vontade"],
          },
        ],
        name === "conjuracao corporal"
          ? "A substituição opcional do atributo por PRE no teste de resistência ainda depende do mestre."
          : "A rolagem adicional depois de ver o resultado do teste ainda depende do mestre.",
      );
    if (name === "disparada")
      return {
        ...base,
        pe: 1,
        action: "free",
        duration: "round",
        modifiers: [speed("4.5")],
        warning:
          "Na investida, substitua o bônus habitual de +1d20 por +5 no teste.",
      };
    if (name === "precisao")
      return {
        ...base,
        pe: 0,
        action: "free",
        duration: "round",
        enemyChoice: true,
        weaponChoice: true,
        modifiers: [
          { stat: "critical", scope: "ranged", amount: "1" },
          { stat: "extraWeaponDice", scope: "ranged", amount: "1" },
        ],
        condition: "Você já mirou no alvo selecionado com esta arma.",
      };
    if (name === "arma amada")
      return {
        ...base,
        pe: 0,
        action: "free",
        duration: "scene",
        weaponChoice: true,
        modifiers: [{ stat: "damage", scope: "weapon", amount: "2" }],
        condition: "Esta é a arma escolhida para A Favorita.",
        warning:
          "Some +5 ao resistir a uma tentativa de separar você dessa arma.",
      };
    if (name === "tanque camuflado")
      return {
        ...base,
        pe: 0,
        action: "free",
        duration: "scene",
        modifiers: [
          speed("3"),
          ...skill(["Acrobacia", "Atletismo", "Furtividade"], "2"),
        ],
        condition:
          "Você está sem proteção pesada. Encerre o efeito ao vesti-la.",
      };
    if (name === "percepcao holistica")
      return passive(
        skill(["Percepção", "Intuição"], "2"),
        "Use uma ação de movimento para examinar a Membrana. O mestre informa o resultado.",
      );
    if (name === "velocidade super-humana" || name === "velocidade do caos")
      return passive(
        [speed(name === "velocidade do caos" && affinity ? "9" : "3")],
        name === "velocidade do caos"
          ? "Confira na ficha o acréscimo de AGI aos PE totais. Com afinidade, use Deslocar-se para gastar seu deslocamento extra no primeiro turno."
          : "O mestre verifica o trajeto e aplica Desprevenido ao próximo alvo quando cabível.",
      );
    if (name === "fugindo para viver")
      return conditionalTest(
        0,
        skill(["Acrobacia", "Atletismo"], "2"),
        "Você está fugindo.",
      );
    if (name === "ta tudo bem")
      return conditionalTest(
        0,
        skill(["Diplomacia"], "1", true),
        "O teste de Diplomacia é para acalmar uma pessoa.",
      );
    if (name === "mateiro" || name === "ervas medicinais")
      return conditionalTest(
        0,
        skill(["Fortitude"], "2"),
        "Este teste resiste a doença ou veneno.",
      );
    if (name === "gauderio abutre" || name === "gangue armada")
      return conditionalTest(
        0,
        skill(["Intimidação"], "5"),
        "Você já possuía a proficiência e empunha uma arma de fogo.",
      );
    if (name === "magnata" || name === "carteirada")
      return {
        ...conditionalTest(
          0,
          skill(
            allSkills.filter(
              (s) => skillAttributes[s] === "PRE" && s !== "Vontade",
            ),
            "5",
          ),
          "Você está usando seu poder econômico em um teste baseado em Presença, exceto Vontade.",
        ),
        limit: "scene",
      };
    if (name === "bencao luminosa" || name === "conforto obscuro") {
      const amount = affinity ? "2" : "1";
      return {
        ...base,
        pe: 0,
        action: "free",
        duration: "scene",
        condition:
          "Selecione a iluminação atual. Encerre o efeito quando a iluminação mudar.",
        choices: [
          {
            id: "bonus",
            label:
              name === "bencao luminosa"
                ? "Sob a luz do Sol"
                : "Lua visível no céu",
            modifiers: [{ stat: "skill", scope: "all", amount }],
          },
          {
            id: "penalty",
            label:
              name === "bencao luminosa"
                ? "Fora da luz do Sol"
                : "Céu tomado pelo Sol",
            modifiers: [{ stat: "skill", scope: "all", amount: "-" + amount }],
          },
        ],
      };
    }
  }
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
