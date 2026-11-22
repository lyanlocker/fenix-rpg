import type { Item } from "./rules";

const gift = (
  id: string,
  name: string,
  element: string,
  cost: number,
  execution: string,
  notes: string,
  extra: Partial<Item> = {},
): Item => ({
  id: `jianghu-${id}`,
  name,
  element,
  cost,
  execution,
  notes,
  kind: "Item",
  quantity: 1,
  spaces: 1,
  damage: "",
  category: "III",
  subtype: "Item paranormal",
  source: "O Último Pecado · Jianghu",
  bookId: "jianghu",
  image: `/art/items/${id}.webp`,
  usesRemaining: 3,
  ...extra,
});

export const jianghuGifts = [
  gift(
    "carimbo-esquecimento",
    "Carimbo do Esquecimento",
    "Conhecimento",
    4,
    "Ação padrão",
    "Existência Indeferida. O portador ou um aliado voluntário em alcance curto deixa de ser reconhecido pelos inimigos por duas rodadas (ou um minuto fora de combate). Não pode ser escolhido diretamente como alvo hostil; efeitos de área funcionam normalmente. Aliados o reconhecem. Uma ação ofensiva encerra o efeito.",
    {
      range: "Curto",
      target: "Você ou aliado",
      duration: "2 rodadas / 1 minuto",
    },
  ),
  gift(
    "contador-eternidade",
    "Contador da Eternidade",
    "Morte",
    5,
    "Ação livre",
    "Um Instante Roubado. No próprio turno, recebe uma ação padrão e uma de movimento adicionais. Não acumula com outras habilidades que concedem ações adicionais neste turno.",
    { target: "Você", duration: "Turno" },
  ),
  gift(
    "luva-divida-carmesim",
    "Luva da Dívida Carmesim",
    "Sangue",
    4,
    "Reação",
    "Cobrança da Dívida. Quando você ou um aliado em alcance curto sofre dano, absorva até 30 pontos após resistências. No seu próximo turno, gaste uma ação de movimento para descarregar o valor armazenado como dano de Sangue em uma criatura em alcance curto (Fortitude reduz à metade). Se não descarregar até o fim do turno, você sofre o dano armazenado.",
    {
      range: "Curto",
      target: "Você ou aliado",
      resistance: "Fortitude reduz à metade",
    },
  ),
  gift(
    "chave-entreposto",
    "Chave do Entreposto",
    "Energia",
    5,
    "Ação padrão",
    "Desbloqueio da Realidade. Abra uma fissura em uma criatura em alcance médio: até o início do seu próximo turno ela sofre −5 na Defesa e −10 em todas as resistências a dano (sem anular imunidades). Sofre imediatamente 4d8 de Energia, Reflexos reduz à metade. As reduções independem do teste.",
    {
      range: "Médio",
      target: "Uma criatura",
      duration: "Até o início do próximo turno",
      damage: "4d8",
      resistance: "Reflexos reduz à metade",
    },
  ),
  gift(
    "ultima-palavra",
    "A Última Palavra",
    "Conhecimento",
    4,
    "Reação",
    "Retratação. Quando uma criatura em alcance curto declara ação hostil, Vontade evita a anulação da ação. Não pode anular a ação da mesma criatura mais de uma vez por cena. Fora de combate, pode fazer uma pergunta factual: se falhar em Vontade, a pessoa responde segundo o que realmente sabe, sem mentir deliberadamente.",
    { range: "Curto", target: "Uma criatura", resistance: "Vontade evita" },
  ),
  gift(
    "dado-destino",
    "Dado do Destino",
    "Energia",
    3,
    "Reação",
    "A Última Aposta. Quando você ou um aliado em alcance curto falha em um teste, lance 1d6: 1 = falha permanece e você sofre 2d6 de Energia; 2–3 = refaz o teste inteiro; 4–5 = +10 no resultado original; 6 = sucesso automático sem garantir crítico.",
    { range: "Curto", target: "Você ou aliado" },
  ),
];

export function giftDefinition(item: Item) {
  return jianghuGifts.find((gift) => gift.id === (item.catalogId || item.id));
}

export function giftUses(item: Item) {
  return giftDefinition(item)
    ? Math.max(0, Math.min(3, item.usesRemaining ?? 3))
    : undefined;
}
