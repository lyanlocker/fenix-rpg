import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareRpc, RpcError } from "../lib/server/neon-rpc";

const id = "00000000-0000-4000-8000-000000000001";
const token = "a".repeat(64);

test("Neon RPC uses fixed typed parameters and preserves optional defaults", () => {
  const result = prepareRpc("fenix_publish_agent", {
    agent_data: { id, name: "Test" },
  });
  assert.equal(
    result.query,
    "SELECT public.fenix_publish_agent(agent_data => $1::jsonb) AS result",
  );
  assert.deepEqual(result.inputs, [JSON.stringify({ id, name: "Test" })]);
  const sync = prepareRpc("fenix_sync_shared_agent", {
    requested_agent_id: id,
    share_token: token,
    known_versions: null,
    status_only: false,
  });
  assert.deepEqual(sync.inputs, [id, token, null, false]);
});

test("Neon RPC rejects unknown and server-only calls in browser scope", () => {
  for (const name of [
    "unknown",
    "constructor",
    "fenix_commit_combat_action",
    "fenix_combat_context",
    "fenix_combat_context_with_bonds",
  ]) {
    assert.throws(
      () => prepareRpc(name, {}),
      (error: unknown) => error instanceof RpcError && error.status === 404,
    );
  }
  const call = prepareRpc(
    "fenix_combat_context",
    {
      server_token: token,
      access_token: token,
      requested_agent_id: id,
      requested_campaign_id: null,
    },
    true,
  );
  assert.equal(call.inputs[3], null);
});

test("Neon RPC validates argument names, required fields and types", () => {
  const invalid = [
    { requested_agent_id: id },
    { requested_agent_id: "invalid", share_token: token },
    { requested_agent_id: id, share_token: 1 },
    { requested_agent_id: id, share_token: token, extra: true },
  ];
  for (const body of invalid)
    assert.throws(
      () => prepareRpc("fenix_load_shared_agent", body),
      (error: unknown) => error instanceof RpcError && error.status === 400,
    );
});
