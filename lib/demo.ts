import { newAgent, maximums, type ClassName } from "./rules";
import type { State } from "./model";
export function demoState(): State {
  const id = crypto.randomUUID();
  const names = [
    "Helena Vasconcelos",
    "Dante Moretti",
    "Cecília Azevedo",
    "Arthur Vidal",
    "Maya Torres",
    "Samuel Costa",
  ];
  const classes: ClassName[] = [
    "Ocultista",
    "Combatente",
    "Especialista",
    "Combatente",
    "Especialista",
    "Ocultista",
  ];
  const tracks = [
    "Conduíte",
    "Aniquilador",
    "Médica de campo",
    "Guerreiro",
    "Infiltradora",
    "Graduado",
  ];
  const agents = names.map((n, i) => {
    const a = newAgent(n);
    a.className = classes[i];
    a.track = tracks[i];
    a.nex = 65;
    a.campaign_id = id;
    a.origin = [
      "Acadêmica",
      "Militar",
      "Agente de saúde",
      "Policial",
      "Criminosa",
      "Religioso",
    ][i];
    a.color = [
      "#b698e1",
      "#df805f",
      "#77b6b1",
      "#d2ad66",
      "#8da8ce",
      "#b49bda",
    ][i];
    a.skills = {
      Investigação: 10,
      Percepção: 5,
      Vontade: 10,
      Iniciativa: 5,
      Luta: 5,
      Pontaria: 5,
      Ocultismo: i % 2 ? 0 : 10,
      Reflexos: 5,
      Fortitude: 5,
    };
    a.resources = maximums(a);
    a.resources.pv -= i * 4;
    return a;
  });
  return {
    agents,
    campaigns: [
      {
        id,
        name: "APOCALYPSIS",
        description:
          "Uma realidade fraturada. Seis agentes. Uma última chance de voltar.",
        element: "Energia",
        notes: "",
        rules: "Livro Básico",
      },
    ],
    rolls: [],
    encounters: [],
    brews: [],
  };
}
