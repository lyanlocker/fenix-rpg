export type ConditionDefinition = {
  name: string;
  description: string;
  family?: string;
};

export const conditionDefinitions: ConditionDefinition[] = [
  {
    name: "Abalado",
    description:
      "Sofre −1d20 em testes. Se ficar abalado novamente, fica apavorado.",
    family: "Medo",
  },
  {
    name: "Agarrado",
    description:
      "Fica desprevenido e imóvel, sofre −1d20 em ataques e só pode atacar com armas leves. Ataques à distância contra o alvo agarrado têm 50% de chance de atingir o alvo errado.",
    family: "Paralisia",
  },
  {
    name: "Alquebrado",
    description: "O custo de habilidades e rituais aumenta em 1 PE ou PD.",
    family: "Mental",
  },
  {
    name: "Apavorado",
    description:
      "Sofre −2d20 em perícias e deve fugir da fonte do medo. Se não puder fugir, pode agir, mas não se aproximar voluntariamente dela.",
    family: "Medo",
  },
  {
    name: "Asfixiado",
    description:
      "Não pode respirar. Após VIG rodadas, faz Fortitude por rodada (DT 5, +5 por teste anterior); ao falhar, fica inconsciente e perde 1d6 PV por rodada até respirar ou morrer.",
  },
  {
    name: "Atordoado",
    description: "Fica desprevenido e não pode realizar ações.",
    family: "Mental",
  },
  {
    name: "Caído",
    description:
      "Sofre −2d20 em ataques corpo a corpo, deslocamento cai para 1,5m, Defesa −5 contra corpo a corpo e +5 contra ataques à distância.",
  },
  {
    name: "Cego",
    description:
      "Fica desprevenido e lento, não observa com Percepção, sofre −2d20 em perícias de AGI ou FOR e seus alvos têm camuflagem total.",
    family: "Sentidos",
  },
  {
    name: "Confuso",
    description:
      "No início do turno, role 1d6: 1 move em direção aleatória; 2–3 não age; 4–5 ataca o ser mais próximo; 6 encerra a condição.",
    family: "Mental",
  },
  {
    name: "Debilitado",
    description:
      "Sofre −2d20 em testes de AGI, FOR e VIG. Se receber a condição novamente, fica inconsciente.",
  },
  {
    name: "Desprevenido",
    description: "Sofre −5 na Defesa e −1d20 em Reflexos.",
  },
  {
    name: "Doente",
    description:
      "Está sob efeito de uma doença. Consulte a doença para seus efeitos e duração.",
  },
  {
    name: "Em Chamas",
    description:
      "Sofre 1d6 de fogo no início do turno. Pode gastar uma ação padrão para apagar as chamas; imersão em água também apaga.",
  },
  {
    name: "Enjoado",
    description:
      "Só pode realizar uma ação padrão ou uma ação de movimento por rodada, não ambas.",
  },
  {
    name: "Enlouquecendo",
    description:
      "Ao iniciar três turnos nessa condição na mesma cena, fica insano. Diplomacia ou cura de Sanidade pode encerrar a condição.",
    family: "Mental",
  },
  {
    name: "Enredado",
    description: "Fica lento e vulnerável e sofre −1d20 em ataques.",
    family: "Paralisia",
  },
  {
    name: "Envenenado",
    description:
      "O efeito depende do veneno e pode causar condição ou dano recorrente. Se a duração não for indicada, permanece pela cena.",
  },
  {
    name: "Esmorecido",
    description: "Sofre −2d20 em testes de INT e PRE.",
    family: "Mental",
  },
  {
    name: "Exausto",
    description:
      "Fica debilitado, lento e vulnerável. Se ficar exausto novamente, fica inconsciente.",
    family: "Fadiga",
  },
  {
    name: "Fascinado",
    description:
      "Sofre −2d20 em Percepção e só pode observar a fonte da fascinação. Ação hostil encerra o efeito; acordar o alvo exige uma ação padrão.",
    family: "Mental",
  },
  {
    name: "Fatigado",
    description:
      "Fica fraco e vulnerável. Se ficar fatigado novamente, fica exausto.",
    family: "Fadiga",
  },
  {
    name: "Fraco",
    description:
      "Sofre −1d20 em testes de AGI, FOR e VIG. Se ficar fraco novamente, fica debilitado.",
  },
  {
    name: "Frustrado",
    description:
      "Sofre −1d20 em testes de INT e PRE. Se ficar frustrado novamente, fica esmorecido.",
    family: "Mental",
  },
  {
    name: "Imóvel",
    description: "Todas as formas de deslocamento são reduzidas a 0m.",
    family: "Paralisia",
  },
  {
    name: "Inconsciente",
    description:
      "Fica indefeso e não pode realizar ações nem reações. Acordar o alvo exige uma ação padrão.",
  },
  {
    name: "Indefeso",
    description:
      "É considerado desprevenido, sofre −10 na Defesa, falha automaticamente em Reflexos e pode sofrer golpe de misericórdia.",
  },
  {
    name: "Lento",
    description:
      "Deslocamentos são reduzidos à metade e não pode correr nem fazer investida.",
    family: "Paralisia",
  },
  {
    name: "Machucado",
    description: "Está com metade ou menos dos PV máximos.",
  },
  {
    name: "Morrendo",
    description:
      "Está com 0 PV. Se iniciar três turnos morrendo na mesma cena, morre. Medicina ou efeitos específicos encerram a condição.",
  },
  {
    name: "Ofuscado",
    description: "Sofre −1d20 em ataques e em Percepção.",
    family: "Sentidos",
  },
  {
    name: "Paralisado",
    description:
      "Fica imóvel e indefeso e só pode realizar ações puramente mentais.",
    family: "Paralisia",
  },
  { name: "Pasmo", description: "Não pode realizar ações.", family: "Mental" },
  {
    name: "Perturbado",
    description:
      "Na primeira vez em que fica perturbado na cena, recebe um efeito de insanidade.",
  },
  {
    name: "Petrificado",
    description: "Fica inconsciente e recebe resistência a dano 10.",
  },
  {
    name: "Sangrando",
    description:
      "No início do turno, faz VIG DT 20. Em sucesso remove a condição; em falha perde 1d6 PV. Medicina DT 20 com ação completa também estabiliza.",
  },
  {
    name: "Surdo",
    description:
      "Não faz Percepção para ouvir, sofre −2d20 em Iniciativa e está em condição ruim para lançar rituais.",
    family: "Sentidos",
  },
  {
    name: "Surpreendido",
    description: "Fica desprevenido e não pode realizar ações.",
  },
  { name: "Vulnerável", description: "Sofre −2 na Defesa." },
];

export const conditionByName = new Map(
  conditionDefinitions.map((condition) => [condition.name, condition]),
);
