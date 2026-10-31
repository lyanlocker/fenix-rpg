import { z } from "zod";
import { rpc } from "@/lib/share";
import {
  executeCombatCommand,
  CombatError,
  type CombatContext,
} from "@/lib/server/combat-engine";
import {
  assertSameOrigin,
  readBoundedJson,
  SyncError,
} from "@/lib/server/github-session";
export const runtime = "nodejs";
export const maxDuration = 60;
const schema = z
  .object({
    agentId: z.string().uuid().optional(),
    campaignId: z.string().uuid().optional(),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    encounterId: z.string().uuid(),
    revision: z.number().int().min(0),
    actorId: z.string().uuid().optional(),
    command: z
      .object({
        kind: z.enum([
          "use",
          "end",
          "sustain",
          "stopEffect",
          "resolve",
          "delay",
          "damage",
        ]),
        afterId: z.string().uuid().optional(),
        attackDice: z.string().trim().min(1).max(40).optional(),
        attackMode: z.enum(["highest", "lowest"]).optional(),
        damageDice: z.string().trim().min(1).max(80).optional(),
        skipDamage: z.boolean().optional(),
        optionId: z.string().max(200).optional(),
        targetIds: z.array(z.string().uuid()).max(100).optional(),
        variant: z.enum(["base", "discente"]).optional(),
        boost: z.number().int().min(0).max(3).optional(),
        extraAttack: z.boolean().optional(),
        accelerate: z.boolean().optional(),
        grant: z.enum(["standard", "move", "attack", "free"]).optional(),
        eventId: z.string().max(100).optional(),
        amount: z.number().int().min(0).max(100000).optional(),
        note: z.string().trim().max(300).optional(),
      })
      .strict(),
  })
  .strict()
  .refine((v) => !!v.agentId !== !!v.campaignId);
const headers = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (process.env.VERCEL_ENV === "preview")
      throw new SyncError("Use o site publicado para ações de combate.", 403);
    const secret = process.env.FENIX_COMBAT_SERVER_SECRET;
    if (!secret || secret.length < 48)
      throw new SyncError(
        "O combate interativo está sendo configurado. O mestre ainda pode usar os controles da campanha.",
        503,
      );
    const parsed = schema.safeParse(await readBoundedJson(request, 16000));
    if (!parsed.success) throw new SyncError("Dados da ação inválidos.", 400);
    const input = parsed.data;
    const credentials = {
      server_token: secret,
      access_token: input.token,
      requested_agent_id: input.agentId || null,
      requested_campaign_id: input.campaignId || null,
    };
    const context = await rpc<CombatContext>(
      "fenix_combat_context",
      credentials,
    );
    if (
      context.encounter.id !== input.encounterId ||
      context.revision !== input.revision
    )
      throw new SyncError(
        "O combate mudou. Aguarde a sincronização e tente novamente.",
        409,
      );
    const actorId = context.role === "player" ? context.actorId : input.actorId;
    if (!actorId) throw new SyncError("Selecione quem está agindo.", 400);
    const result = executeCombatCommand(context, input.command, actorId);
    const payload = await rpc("fenix_commit_combat_action", {
      ...credentials,
      requested_encounter_id: input.encounterId,
      expected_revision: input.revision,
      next_encounter: result.encounter,
      agent_changes: result.patches,
    });
    return Response.json(payload, { headers });
  } catch (error) {
    if (error instanceof SyncError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      );
    if (error instanceof CombatError)
      return Response.json({ error: error.message }, { status: 400, headers });
    const conflict = /mudou|atualiza/i.test(
      error instanceof Error ? error.message : "",
    );
    return Response.json(
      {
        error: conflict
          ? "O combate ou uma ficha mudou. Aguarde a sincronização e tente novamente."
          : "Não foi possível executar a ação. Confira o acesso e a conexão e tente novamente.",
      },
      { status: conflict ? 409 : 403, headers },
    );
  }
}
