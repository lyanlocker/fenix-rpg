/** Live Data API verification, using synthetic data only.
 * Cleanup the exact fixture ID printed/stored in /tmp/fenix-sync-fixture.json.
 */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import {
  createSharedAgentSync,
  rpc,
  saveSharedAgent,
  updateSharedInfection,
  rollSharedAgent,
} from "../lib/share";
import { newAgent } from "../lib/rules";

async function verify() {
  const fixture = newAgent("Verificação da sincronização");
  fixture.nex = 35;
  fixture.campaign_id = crypto.randomUUID();
  fixture.resources.pv = 30;
  fixture.portrait = "data:image/png;base64," + "A".repeat(350000);
  const keys = await rpc<{ master_token: string; player_token: string }>(
    "fenix_publish_agent",
    { agent_data: fixture },
  );
  writeFileSync(
    "/tmp/fenix-sync-fixture.json",
    JSON.stringify({
      id: fixture.id,
      campaignId: fixture.campaign_id,
      ...keys,
    }),
    { mode: 0o600 },
  );
  const original = globalThis.fetch;
  const sizes: number[] = [];
  globalThis.fetch = async (input, init) => {
    const response = await original(input, init);
    const path = String(input);
    if (path.endsWith("/fenix_sync_shared_agent"))
      sizes.push(Buffer.byteLength(await response.clone().text()));
    return response;
  };
  try {
    const player = createSharedAgentSync(fixture.id, keys.player_token);
    const master = createSharedAgentSync(fixture.id, keys.master_token, true);
    assert.equal((await player())?.agent?.portrait, fixture.portrait);
    const initial = sizes.at(-1)!;
    assert.equal(await player(), null);
    const idle = sizes.at(-1)!;
    assert.ok(idle < 1000);
    await rollSharedAgent(fixture, keys.player_token, "Teste 1d2", 1, 0, "1d2");
    const rolled = await player();
    assert.equal(rolled?.agent, undefined);
    assert.ok(rolled?.rolls?.length);
    fixture.resources.pv = 27;
    await saveSharedAgent(fixture, keys.master_token);
    const hp = await player();
    assert.equal(hp?.agent?.resources.pv, 27);
    assert.equal(hp?.agent?.portrait, fixture.portrait);
    const hpBytes = sizes.at(-1)!;
    assert.ok(hpBytes < initial / 10);
    await updateSharedInfection(fixture.id, keys.master_token, "enable");
    await updateSharedInfection(fixture.id, keys.player_token, "adjust", 1);
    const infection = await player();
    assert.equal(infection?.infection?.value, 1);
    assert.equal(infection?.agent, undefined);
    const feed = await master();
    assert.equal(feed?.agent, undefined);
    assert.equal(feed?.rolls, undefined);
    assert.ok(feed?.alternate_edits?.length);
    await assert.rejects(() =>
      createSharedAgentSync(fixture.id, keys.player_token, true)(),
    );
    console.log(
      JSON.stringify({
        fixtureId: fixture.id,
        initialBytes: initial,
        idleBytes: idle,
        hpBytes,
        idleReductionPercent: ((1 - idle / initial) * 100).toFixed(2),
        result:
          "Live sync, player/master permissions, portraits, rolls, PV and infection passed",
      }),
    );
  } finally {
    globalThis.fetch = original;
  }
}
void verify().catch((error) => {
  console.error(String(error).replace(/[a-f0-9]{64}/g, "[test-token]"));
  process.exitCode = 1;
});
