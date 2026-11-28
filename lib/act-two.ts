export type Member = {
  id: string;
  name: string;
  value: number;
  portrait: string | null;
};
export type Board = {
  title: string;
  version: string;
  members: Member[];
  average: number | null;
};
export type Preset = "olhos" | "maos" | "ruido" | "pergunta" | "indicio";
export const effectNames: Record<Preset, string> = {
  indicio: "Escuridão",
  maos: "Mãos brancas",
  olhos: "Rosto da Melancolia",
  ruido: "Interferência",
  pergunta: "Fala",
};
export type Settings = {
  effects?: Preset[];
  preset: Preset;
  position: "cantos" | "lateral" | "topo";
  intensity: number;
  text?: string;
  motif?: string;
};
export type Delivery = {
  id: string;
  settings: Settings;
  deadline: number | null;
};
export type MemberReply = Omit<Board, "members"> & {
  members: Member[] | null;
  theme: boolean;
  intensity: number;
  effect: {
    id: string;
    remaining: number | null;
    settings: Settings | null;
  } | null;
};
export function signed(n: number, places = 0) {
  return n.toLocaleString("pt-BR", {
    signDisplay: "always",
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}
export function standing(n: number) {
  if (n < -60) return "Inimigo";
  if (n < -30) return "Suspeito";
  if (n < -10) return "Malvisto";
  if (n <= 10) return "Desconhecido";
  if (n <= 30) return "Respeitado";
  if (n <= 60) return "Confiável";
  return "Protetor";
}
export function projectedAverage(
  members: Member[],
  ids: string[],
  amount: number,
  absolute: boolean,
) {
  if (!members.length) return null;
  return (
    members.reduce(
      (sum, m) =>
        sum +
        (ids.includes(m.id)
          ? Math.max(-100, Math.min(100, absolute ? amount : m.value + amount))
          : m.value),
      0,
    ) / members.length
  );
}
