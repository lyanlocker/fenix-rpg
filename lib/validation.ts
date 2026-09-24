import { z } from "zod";
import type { Agent } from "./rules";
const num = z.number().finite();
const resource = z.object({ pv: num, pe: num, san: num, pd: num });
const enhancement = z.object({
  id: z.string(),
  catalogId: z.string().optional(),
  name: z.string().max(150),
  subtype: z.string().max(100),
  notes: z.string().max(50000),
  source: z.string().max(200).optional(),
  bookId: z.string().max(100).optional(),
  page: num.int().positive().optional(),
  requirements: z.string().max(2000).optional(),
  element: z.string().max(100).optional(),
});
const schema = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(100),
  className: z.enum([
    "Combatente",
    "Especialista",
    "Ocultista",
    "Sobrevivente",
  ]),
  campaign_id: z.string().nullable(),
  origin: z.string().max(150),
  originId: z.string().optional(),
  trackId: z.string().optional(),
  track: z.string().max(100),
  nex: z
    .number()
    .refine((n) => n === 0 || n === 99 || (n >= 5 && n <= 95 && n % 5 === 0)),
  stage: z.number().int().min(1).max(5),
  determination: z.boolean(),
  attributes: z.object({
    AGI: num.int().min(0).max(10),
    FOR: num.int().min(0).max(10),
    INT: num.int().min(0).max(10),
    PRE: num.int().min(0).max(10),
    VIG: num.int().min(0).max(10),
  }),
  skills: z.record(z.number().refine((n) => [0, 5, 10, 15].includes(n))),
  skillAdjustments: z.record(num.int().min(-100).max(100)).optional(),
  resources: resource,
  adjustments: resource,
  defenseBonus: num,
  inventory: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().max(150),
        kind: z.enum(["Item", "Arma", "Ritual", "Poder"]),
        quantity: num.int().min(1),
        spaces: num.min(0),
        damage: z.string().max(100),
        notes: z.string().max(50000),
        catalogId: z.string().optional(),
        subtype: z.string().max(100).optional(),
        bookId: z.string().max(100).optional(),
        page: num.int().positive().optional(),
        requirements: z.string().max(2000).optional(),
        className: z.string().max(100).optional(),
        track: z.string().max(150).optional(),
        origin: z.string().max(150).optional(),
        nex: num.int().min(0).max(99).optional(),
        stage: num.int().min(1).max(5).optional(),
        resistance: z.string().max(300).optional(),
        attackSkill: z.string().max(100).optional(),
        attackBonus: num.int().min(-100).max(100).optional(),
        weaponType: z
          .enum(["Corpo a corpo", "Disparo", "Arma de fogo"])
          .optional(),
        critical: z.string().max(100).optional(),
        range: z.string().max(100).optional(),
        category: z.string().max(100).optional(),
        source: z.string().max(200).optional(),
        cost: num.int().min(0).max(999).optional(),
        execution: z.string().max(100).optional(),
        duration: z.string().max(100).optional(),
        target: z.string().max(200).optional(),
        element: z.string().max(100).optional(),
        circle: num.int().min(0).max(4).optional(),
        discente: z.string().max(50000).optional(),
        verdadeiro: z.string().max(50000).optional(),
        enhancements: z.array(enhancement).max(20).optional(),
        accessoryType: z.enum(["Vestimenta", "Utensílio"]).optional(),
        equipped: z.boolean().optional(),
        attuned: z.boolean().optional(),
        accessorySkill: z.string().max(100).optional(),
        accessoryBonus: z.union([z.literal(2), z.literal(5)]).optional(),
        extraSkill: z.string().max(100).optional(),
        extraBonus: z.union([z.literal(2), z.literal(5)]).optional(),
      }),
    )
    .max(500),
  notes: z.string().max(50000),
  conditions: z.array(z.string().max(100)).max(50),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  portrait: z
    .string()
    .max(2100000)
    .refine(
      (value) => !value || /^data:image\/(?:png|jpeg|webp);base64,/.test(value),
    )
    .optional(),
});
export function validateAgentImport(raw: unknown): Agent {
  const result = z
    .object({ version: z.literal(1), agent: schema })
    .safeParse(raw);
  if (!result.success)
    throw Error(
      "Arquivo incompatível. Importe uma ficha JSON exportada pelo Fênix.",
    );
  return result.data.agent;
}
