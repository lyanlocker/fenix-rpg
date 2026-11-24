import { createHash, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { z } from "zod";

export const realtimeAccess = z.object({
  agent: z.string().uuid().optional(),
  campaign: z.string().uuid().optional(),
  token: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().refine((v) => !!v.agent !== !!v.campaign);
type Access = z.infer<typeof realtimeAccess>;
type Scope = { agent: string | null; campaign: string | null };
const appName = "fenix-notifications";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export function realtimeEnabled() {
  return process.env.NEXT_PUBLIC_FENIX_REALTIME === "firebase" &&
    process.env.NEXT_PUBLIC_FENIX_BACKEND === "neon";
}

function settings() {
  const environment = process.env.FENIX_FIREBASE_ENV;
  if (environment !== "preview" && environment !== "production") throw Error("Missing realtime environment");
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== environment) throw Error("Realtime environment mismatch");
  const credential = JSON.parse(process.env.FENIX_FIREBASE_SERVICE_ACCOUNT || "null");
  const config = JSON.parse(process.env.FENIX_FIREBASE_WEB_CONFIG || "null");
  if (!credential?.project_id || config?.projectId !== credential.project_id || !config?.databaseURL || !config?.apiKey) throw Error("Missing realtime configuration");
  const app = getApps().find(a => a.name === appName) || initializeApp({
    credential: cert(credential), databaseURL: config.databaseURL, projectId: config.projectId,
  }, appName);
  return { app, config, environment };
}

async function scope(access: Access): Promise<Scope> {
  if (!process.env.FENIX_DATABASE_URL) throw Error("Missing database");
  const sql = neon(process.env.FENIX_DATABASE_URL);
  const [row] = await sql`select public.fenix_realtime_scope(${access.agent || null}::uuid,${access.campaign || null}::uuid,${access.token}::text) as result`;
  return row.result as Scope;
}

export async function createRealtimeSession(access: Access) {
  const allowed = await scope(access);
  const { app, config, environment } = settings();
  const until = Date.now() + 15 * 60_000;
  const agent = allowed.agent ? digest(`agent:${allowed.agent}`) : null;
  const campaign = allowed.campaign ? digest(`campaign:${allowed.campaign}`) : null;
  const uid = `fenix_${digest(`${environment}:${access.agent || access.campaign}:${access.token}`)}`;
  const token = await getAuth(app).createCustomToken(uid, { environment, agent, campaign, until });
  const paths = [agent && `signals/${environment}/agent/${agent}`, campaign && `signals/${environment}/campaign/${campaign}`].filter(Boolean);
  return { token, config: { apiKey: config.apiKey, appId: config.appId, authDomain: config.authDomain, projectId: config.projectId, databaseURL: config.databaseURL }, paths, expiresAt: until };
}

const mutations = new Set([
  "fenix_patch_shared_agent", "fenix_roll_shared", "fenix_update_infection", "fenix_delete_shared_agent",
  "fenix_save_combat", "fenix_adjust_combat_hp", "fenix_clear_combat", "fenix_combat_initiative",
  "fenix_campaign_bonds", "fenix_register_bond_roster", "fenix_commit_combat_action",
]);

// Only successful, authorized mutations send a random invalidation signal. The
// database is authoritative and Firebase outages cannot fail an already committed action.
export async function signalRealtime(name: string, raw: unknown) {
  if (!realtimeEnabled() || !mutations.has(name) || !raw || typeof raw !== "object") return;
  const input = raw as Record<string, unknown>;
  if (name === "fenix_campaign_bonds" && (!input.operation || input.operation === "read")) return;
  const check = realtimeAccess.safeParse({
    ...(input.requested_agent_id ? { agent: input.requested_agent_id } : { campaign: input.requested_campaign_id }),
    token: input.share_token || input.master_token || input.access_token,
  });
  if (!check.success) return;
  try {
    // Deletes may already have removed the authorization row. The safety poll
    // remains enabled; never publish an unauthenticated campaign signal.
    const allowed = await scope(check.data);
    const { app, environment } = settings();
    const updates: Record<string, string> = {};
    const nonce = randomUUID();
    if (allowed.agent) updates[`signals/${environment}/agent/${digest(`agent:${allowed.agent}`)}`] = nonce;
    if (allowed.campaign) updates[`signals/${environment}/campaign/${digest(`campaign:${allowed.campaign}`)}`] = nonce;
    if (Object.keys(updates).length) await Promise.race([
      getDatabase(app).ref().update(updates),
      new Promise((_, reject) => setTimeout(() => reject(Error("Realtime timeout")), 1500)),
    ]);
  } catch { /* polling is the fallback; do not expose auth or database details */ }
}
