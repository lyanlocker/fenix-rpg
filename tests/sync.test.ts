import { test } from "node:test";
import assert from "node:assert/strict";
import { startVisiblePolling } from "../lib/polling";
import { createSharedAgentSync } from "../lib/share";
import { newAgent } from "../lib/rules";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function environment() {
  const page = new EventTarget() as EventTarget & { hidden: boolean };
  page.hidden = false;
  let id = 0;
  const timers = new Map<number, { callback: () => void; delay: number }>();
  const clock = {
    setTimeout(callback: () => void, delay: number) {
      timers.set(++id, { callback, delay });
      return id;
    },
    clearTimeout(timer: number) {
      timers.delete(timer);
    },
  };
  return {
    page,
    timers,
    env: { document: page, window: clock } as unknown as Parameters<
      typeof startVisiblePolling
    >[3],
  };
}

test("polling waits for completion, suspends hidden pages and resumes once", async () => {
  const { page, timers, env } = environment();
  let calls = 0;
  let finish: () => void = () => {};
  const stop = startVisiblePolling(
    () => {
      calls++;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
    2500,
    60000,
    env,
  );
  assert.equal(calls, 1);
  assert.equal(timers.size, 0);
  page.hidden = true;
  page.dispatchEvent(new Event("visibilitychange"));
  finish();
  await flush();
  assert.equal(timers.size, 0);
  page.hidden = false;
  page.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls, 2);
  page.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls, 2);
  stop();
  finish();
  await flush();
  assert.equal(timers.size, 0);
});

test("polling backs off on failure and resets after successful synchronization", async () => {
  const { timers, env } = environment();
  let failed = true;
  const stop = startVisiblePolling(
    async () => {
      if (failed) throw Error("offline");
    },
    2500,
    60000,
    env,
  );
  await flush();
  const first = [...timers.values()][0];
  assert.equal(first.delay, 5000);
  timers.clear();
  failed = false;
  first.callback();
  await flush();
  assert.equal([...timers.values()][0].delay, 2500);
  stop();
  assert.equal(timers.size, 0);
});

test("shared patches preserve both portraits and never replay cached sheets on a roll", async () => {
  const original = globalThis.fetch;
  const agent = newAgent("Teste");
  agent.alternate = {
    approvedCampaignId: crypto.randomUUID(),
    face: { ...newAgent("Face"), nex: 35 },
  };
  const requests: Record<string, unknown>[] = [];
  const responses = [
    {
      versions: { agent: "1" },
      unchanged: false,
      role: "player",
      agent,
      portraits: {
        main: "data:image/png;base64,AAAA",
        alternate: "data:image/png;base64,BBBB",
      },
      rolls: [],
    },
    { versions: { agent: "1" }, unchanged: true, role: "player" },
    {
      versions: { agent: "1", rolls: "1" },
      unchanged: false,
      role: "player",
      rolls: [{ id: "roll" }],
    },
    {
      versions: { agent: "2" },
      unchanged: false,
      role: "player",
      agent: { ...agent, resources: { ...agent.resources, pv: 3 } },
      portraits: {},
    },
    {
      versions: { agent: "3" },
      unchanged: false,
      role: "player",
      agent,
      portraits: { main: "" },
    },
  ];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json(responses.shift());
  };
  try {
    const sync = createSharedAgentSync(agent.id, "a".repeat(64));
    const initial = await sync();
    assert.equal(initial?.agent?.portrait, "data:image/png;base64,AAAA");
    assert.equal(
      initial?.agent?.alternate?.face.portrait,
      "data:image/png;base64,BBBB",
    );
    assert.equal(await sync(), null);
    const roll = await sync();
    assert.equal(roll?.agent, undefined);
    assert.equal(roll?.rolls?.[0].id, "roll");
    const changed = await sync();
    assert.equal(changed?.agent?.resources.pv, 3);
    assert.equal(changed?.agent?.portrait, initial?.agent?.portrait);
    assert.equal(
      changed?.agent?.alternate?.face.portrait,
      initial?.agent?.alternate?.face.portrait,
    );
    assert.equal((await sync())?.agent?.portrait, "");
    assert.equal(requests[0].known_versions, null);
    assert.deepEqual(requests[1].known_versions, { agent: "1" });
    const other = createSharedAgentSync(agent.id, "b".repeat(64));
    responses.push({ versions: {}, unchanged: true, role: "player" } as never);
    await other();
    assert.equal(requests.at(-1)?.known_versions, null);
  } finally {
    globalThis.fetch = original;
  }
});


test("quiet responses increase the pause but stop at the idle ceiling", async () => {
  const { timers, env } = environment();
  const stop = startVisiblePolling(async () => false, 2500, 15000, env);
  await flush();
  let first = [...timers.values()][0];
  assert.equal(first.delay, 5000);
  timers.clear();
  first.callback();
  await flush();
  first = [...timers.values()][0];
  assert.equal(first.delay, 10000);
  timers.clear();
  first.callback();
  await flush();
  assert.equal([...timers.values()][0].delay, 15000);
  stop();
});

test("HTTP 402 quota and 429 throttling errors enforce longer cooldowns", async () => {
  for (const [status, delay] of [[402, 15 * 60_000], [429, 5 * 60_000]]) {
    const { page, timers, env } = environment();
    let requests = 0;
    const stop = startVisiblePolling(async () => {
      requests++;
      throw Object.assign(new Error("quota"), { status });
    }, 2500, 15000, env);
    await flush();
    assert.equal(requests, 1);
    assert.ok([...timers.values()][0].delay >= delay - 1000);
    page.hidden = true;
    page.dispatchEvent(new Event("visibilitychange"));
    page.hidden = false;
    page.dispatchEvent(new Event("visibilitychange"));
    assert.equal(requests, 1);
    assert.ok([...timers.values()][0].delay >= delay - 1000);
    stop();
  }
});
