import { neon } from "@neondatabase/serverless";
import { supabaseRpc } from "../share";

type PgType = "uuid" | "text" | "integer" | "boolean" | "jsonb";
type Argument = readonly [
  name: string,
  type: PgType,
  optional?: boolean,
  nullable?: boolean,
];
type Specification = readonly Argument[];

const sheetKey = [
  ["requested_agent_id", "uuid"],
  ["share_token", "text"],
] as const;
const masterSheetKey = [
  ["requested_agent_id", "uuid"],
  ["master_token", "text"],
] as const;
const roomKey = [
  ["requested_campaign_id", "uuid"],
  ["master_token", "text"],
] as const;
const serverKey = [
  ["server_token", "text"],
  ["access_token", "text"],
  ["requested_agent_id", "uuid", false, true],
  ["requested_campaign_id", "uuid", false, true],
] as const;

// Every operation is explicitly mapped to one Postgres signature. No SQL
// identifiers or casts are ever taken from a browser request.
const publicCalls: Readonly<Record<string, Specification>> = {
  fenix_act_member: [
    ...sheetKey,
    ["known", "text", true, true],
    ["ack", "uuid", true, true],
  ],
  fenix_act_master: [
    ...roomKey,
    ["operation", "text", true],
    ["command", "jsonb", true],
  ],
  fenix_act_use_gift: [...sheetKey, ["item_id", "text"], ["event_id", "uuid"]],
  fenix_publish_agent: [
    ["agent_data", "jsonb"],
    ["supplied_master_token", "text", true, true],
    ["supplied_player_token", "text", true, true],
  ],
  fenix_load_shared_agent: sheetKey,
  fenix_sync_shared_agent: [
    ...sheetKey,
    ["known_versions", "jsonb", true, true],
    ["status_only", "boolean", true],
  ],
  fenix_patch_shared_agent: [
    ...sheetKey,
    ["expected_data", "jsonb"],
    ["changed_data", "jsonb"],
  ],
  fenix_roll_shared: [
    ...sheetKey,
    ["agent_name", "text"],
    ["roll_label", "text"],
    ["attribute_value", "integer"],
    ["bonus", "integer"],
    ["damage_expression", "text", true],
  ],
  fenix_update_infection: [
    ...sheetKey,
    ["operation", "text"],
    ["change", "integer"],
  ],
  fenix_delete_shared_agent: masterSheetKey,
  fenix_load_master_combat: roomKey,
  fenix_load_player_combat: sheetKey,
  fenix_sync_master_combat: [...roomKey, ["known_version", "text", true, true]],
  fenix_sync_player_combat: [
    ...sheetKey,
    ["known_version", "text", true, true],
  ],
  fenix_save_combat: [
    ...roomKey,
    ["encounter_data", "jsonb"],
    ["expected_revision", "integer"],
    ["agent_keys", "jsonb", true],
  ],
  fenix_adjust_combat_hp: [
    ...roomKey,
    ["requested_encounter_id", "uuid"],
    ["participant_id", "uuid"],
    ["change", "integer"],
  ],
  fenix_clear_combat: [...roomKey, ["requested_encounter_id", "uuid"]],
  fenix_combat_initiative: [
    ...sheetKey,
    ["requested_encounter_id", "uuid"],
    ["initiative_value", "integer", true, true],
  ],
  fenix_combat_portrait: [...sheetKey, ["participant_id", "uuid"]],
  fenix_campaign_bonds: [
    ...sheetKey,
    ["operation", "text", true],
    ["ally_id", "uuid", true, true],
    ["value", "integer", true, true],
  ],
  fenix_register_bond_roster: [...roomKey, ["agent_keys", "jsonb"]],
};

const serverCalls: Readonly<Record<string, Specification>> = {
  fenix_act_commit_gift: [
    ...serverKey,
    ["requested_encounter_id", "uuid"],
    ["expected_revision", "integer"],
    ["next_encounter", "jsonb"],
    ["agent_changes", "jsonb"],
    ["gift_agent", "uuid"],
    ["gift_id", "text"],
    ["event_id", "uuid"],
  ],
  fenix_combat_context: serverKey,
  fenix_combat_context_with_bonds: serverKey,
  fenix_commit_combat_action: [
    ...serverKey,
    ["requested_encounter_id", "uuid"],
    ["expected_revision", "integer"],
    ["next_encounter", "jsonb"],
    ["agent_changes", "jsonb"],
  ],
};

export class RpcError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function encode(value: unknown, type: PgType, nullable: boolean) {
  if (value === null && nullable) return null;
  const valid =
    type === "uuid"
      ? typeof value === "string" && uuid.test(value)
      : type === "text"
        ? typeof value === "string" && value.length <= 16384
        : type === "integer"
          ? typeof value === "number" &&
            Number.isInteger(value) &&
            value >= -2147483648 &&
            value <= 2147483647
          : type === "boolean"
            ? typeof value === "boolean"
            : value !== null && typeof value === "object";
  if (!valid) throw new RpcError("Argumentos inválidos.", 400);
  return type === "jsonb" ? JSON.stringify(value) : value;
}

export function prepareRpc(name: string, body: unknown, internal = false) {
  const spec = Object.hasOwn(publicCalls, name)
    ? publicCalls[name]
    : internal && Object.hasOwn(serverCalls, name)
      ? serverCalls[name]
      : undefined;
  if (!spec) throw new RpcError("Operação indisponível.", 404);
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new RpcError("Argumentos inválidos.", 400);
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !spec.some(([arg]) => key === arg)))
    throw new RpcError("Argumentos inválidos.", 400);
  const inputs: unknown[] = [];
  const expressions: string[] = [];
  for (const [arg, type, optional = false, nullable = false] of spec) {
    if (!Object.hasOwn(input, arg)) {
      if (optional) continue;
      throw new RpcError("Argumentos incompletos.", 400);
    }
    inputs.push(encode(input[arg], type, nullable));
    expressions.push(`${arg} => $${inputs.length}::${type}`);
  }
  return {
    query: `SELECT public.${name}(${expressions.join(", ")}) AS result`,
    inputs,
  };
}

export function neonEnabled() {
  return process.env.NEXT_PUBLIC_FENIX_BACKEND === "neon";
}

export async function neonRpc<T>(
  name: string,
  body: unknown,
  internal = false,
): Promise<T> {
  if (!neonEnabled())
    throw new RpcError("Backend alternativo indisponível.", 503);
  const connection = process.env.FENIX_DATABASE_URL;
  if (!connection)
    throw new RpcError("Backend alternativo não configurado.", 503);
  const { query, inputs } = prepareRpc(name, body, internal);
  try {
    const sql = neon(connection);
    const rows = await sql.query(query, inputs, {
      fetchOptions: { cache: "no-store", signal: AbortSignal.timeout(18000) },
    });
    if (rows.length !== 1) throw new RpcError("Resposta inválida.", 502);
    return rows[0].result as T;
  } catch (error) {
    if (error instanceof RpcError) throw error;
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    // Never expose connection errors, SQL statements, parameters or details.
    if (code === "40001" || code === "40P01")
      throw new RpcError("A ficha ou o combate mudou. Tente novamente.", 409);
    if (code === "42883") throw new RpcError("Operação indisponível.", 404);
    if (code === "42501" || code === "P0001")
      throw new RpcError(
        "Ação não permitida. Confira o acesso e o estado atual.",
        403,
      );
    if (code.startsWith("22") || code.startsWith("23"))
      throw new RpcError("Dados inválidos.", 400);
    if (code === "53000") throw new RpcError("Limite do banco atingido.", 402);
    throw new RpcError("Não foi possível conectar ao banco.", 503);
  }
}

// Internal combat calls never traverse the public RPC HTTP endpoint.
export function serverRpc<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<T> {
  return neonEnabled()
    ? neonRpc<T>(name, body, true)
    : supabaseRpc<T>(name, body);
}
