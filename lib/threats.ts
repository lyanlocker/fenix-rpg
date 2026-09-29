import raw from "./data/threat-catalog.json";
import { z } from "zod";
import type { Attribute } from "./rules";
export const threatElements = [
  "Sangue",
  "Morte",
  "Conhecimento",
  "Energia",
  "Medo",
  "Realidade",
] as const;
export type ThreatElement = (typeof threatElements)[number];
export type Threat = {
  id: string;
  name: string;
  element: ThreatElement;
  secondaryElements: string[];
  kind: string;
  vd: number | null;
  pv: number | null;
  defense: number | null;
  initiative: string;
  attributes: Partial<Record<Attribute, number>>;
  tests: Record<string, string>;
  attacks: { name: string; test: string; damage: string }[];
  details: string;
  bookId: string;
  page: number;
  pdfPage?: number;
};
export const threatCatalog = raw as Threat[];
export const elementColors: Record<ThreatElement, string> = {
  Sangue: "#ef777f",
  Morte: "#b6b1cf",
  Conhecimento: "#e8c56d",
  Energia: "#b68afa",
  Medo: "#e7e8ed",
  Realidade: "#79bdaf",
};
const integer = z.number().int().min(0).max(1000000);
const schema = z.object({
  id: z.string().max(200),
  name: z.string().trim().min(1).max(150),
  element: z.enum(threatElements),
  secondaryElements: z.array(z.string().max(50)).max(6),
  kind: z.string().max(60),
  vd: integer.nullable(),
  pv: integer.nullable(),
  defense: integer.nullable(),
  initiative: z.string().max(60),
  attributes: z.record(z.number().int().min(0).max(10)),
  tests: z.record(z.string().max(100)),
  attacks: z
    .array(
      z.object({
        name: z.string().max(150),
        test: z.string().max(60),
        damage: z.string().max(60),
      }),
    )
    .max(50),
  details: z.string().max(100000),
  bookId: z.string().max(50),
  page: integer,
  pdfPage: integer.optional(),
});
export function parseThreatImport(value: unknown): Threat[] {
  const result = z
    .object({ version: z.literal(1), threats: z.array(schema).max(1000) })
    .safeParse(value);
  if (!result.success)
    throw Error("Importe um catálogo de ameaças exportado pelo Fênix.");
  return result.data.threats as Threat[];
}
/** Printed -2d20 means roll two dice and retain the lowest. Ordinary pools retain the highest. */
export function parseThreatTest(expression: string) {
  const m = /^([–−-]?)(\d+)d20(?:([+-])(\d+))?$/.exec(
    expression.replace(/\s/g, ""),
  );
  if (!m || +m[2] < 1 || +m[2] > 10)
    throw Error("Este teste exige consulta à referência de regras.");
  return {
    attribute: m[1] ? 0 : +m[2],
    bonus: (m[3] === "-" ? -1 : 1) * +(m[4] || 0),
  };
}
