import type { ClassName } from "./rules";
export const attributeNames = {
  AGI: "Agilidade",
  FOR: "Força",
  INT: "Intelecto",
  PRE: "Presença",
  VIG: "Vigor",
};
export const classGuide: Record<
  ClassName,
  {
    description: string;
    skills: string;
    proficiencies: string;
    tracks: string[];
  }
> = {
  Combatente: {
    description:
      "Enfrenta ameaças diretamente, com mais Vida e acesso a armas táticas.",
    skills:
      "Luta ou Pontaria, Fortitude ou Reflexos e mais 1 + Intelecto perícias. Some as da origem.",
    proficiencies: "Armas simples e táticas; proteções leves.",
    tracks: [
      "Aniquilador",
      "Comandante de Campo",
      "Guerreiro",
      "Operações Especiais",
      "Tropa de Choque",
    ],
  },
  Especialista: {
    description:
      "Resolve problemas com conhecimento, investigação e um repertório amplo de perícias.",
    skills:
      "7 + Intelecto perícias à escolha, além das concedidas pela origem.",
    proficiencies: "Armas simples e proteções leves.",
    tracks: [
      "Atirador de Elite",
      "Infiltrador",
      "Médico de Campo",
      "Negociador",
      "Técnico",
    ],
  },
  Ocultista: {
    description:
      "Manipula o paranormal por meio de rituais e conhecimento do Outro Lado.",
    skills:
      "Ocultismo e Vontade, mais 3 + Intelecto perícias à escolha. Some as da origem.",
    proficiencies: "Armas simples.",
    tracks: [
      "Conduíte",
      "Flagelador",
      "Graduado",
      "Intuitivo",
      "Lâmina Paranormal",
    ],
  },
  Sobrevivente: {
    description:
      "Uma pessoa comum diante do horror. Avança por estágios de sobrevivente.",
    skills:
      "1 + Intelecto perícias à escolha, além das concedidas pela origem.",
    proficiencies: "Armas simples.",
    tracks: [],
  },
};
export const originSkills: Record<string, string[]> = {
  Acadêmico: ["Ciências", "Investigação"],
  "Agente de Saúde": ["Intuição", "Medicina"],
  Amnésico: [],
  Artista: ["Artes", "Enganação"],
  Atleta: ["Acrobacia", "Atletismo"],
  Chef: ["Fortitude", "Profissão"],
  Criminoso: ["Crime", "Furtividade"],
  "Cultista Arrependido": ["Ocultismo", "Religião"],
  Desgarrado: ["Fortitude", "Sobrevivência"],
  Engenheiro: ["Profissão", "Tecnologia"],
  Executivo: ["Diplomacia", "Profissão"],
  Investigador: ["Investigação", "Percepção"],
  Lutador: ["Luta", "Reflexos"],
  Magnata: ["Diplomacia", "Pilotagem"],
  Mercenário: ["Iniciativa", "Intimidação"],
  Militar: ["Pontaria", "Tática"],
  Operário: ["Fortitude", "Profissão"],
  Policial: ["Percepção", "Pontaria"],
  Religioso: ["Religião", "Vontade"],
  "Servidor Público": ["Intuição", "Vontade"],
  "Teórico da Conspiração": ["Investigação", "Ocultismo"],
  "T.I.": ["Investigação", "Tecnologia"],
  "Trabalhador Rural": ["Adestramento", "Sobrevivência"],
  Trambiqueiro: ["Crime", "Enganação"],
  Universitário: ["Atualidades", "Investigação"],
  Vítima: ["Reflexos", "Vontade"],
};
