// Schedule requests only while visible and never overlap them.
// A dynamic interval lets combat refresh frequently while idle pages stay quiet.
// Quota/traffic errors trigger a real cooldown (including across tab visibility).
export function startVisiblePolling(
  refresh: () => Promise<unknown>,
  intervalMs: number | (() => number),
  environment = { document, window },
) {
  let stopped = false;
  let running = false;
  let pending = false;
  let timer: number | undefined;
  let failures = 0;
  let cooldownUntil = 0;
  const { document: page, window: clock } = environment;

  function schedule(delay: number) {
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = clock.setTimeout(() => void tick(), Math.max(0, delay));
  }

  async function tick() {
    if (stopped || page.hidden) return;
    if (running) {
      pending = true;
      return;
    }
    if (timer !== undefined) {
      clock.clearTimeout(timer);
      timer = undefined;
    }
    if (Date.now() < cooldownUntil) {
      schedule(cooldownUntil - Date.now());
      return;
    }

    running = true;
    try {
      await refresh();
      failures = 0;
      cooldownUntil = 0;
    } catch (error) {
      failures = Math.min(failures + 1, 4);
      const status = (error as { status?: number } | null)?.status;
      if (status === 402) {
        // Supabase Free plan has exhausted its quota: do not keep retrying.
        cooldownUntil = Date.now() + 15 * 60_000;
      } else if (status === 429) {
        cooldownUntil = Date.now() + 5 * 60_000;
      }
    } finally {
      running = false;
      if (!stopped && !page.hidden) {
        const interval = typeof intervalMs === "function" ? intervalMs() : intervalMs;
        const backoff = Math.min(120_000, Math.max(1_000, interval) * 2 ** failures);
        const next = pending ? 0 : backoff;
        schedule(Math.max(next, cooldownUntil - Date.now()));
      }
      pending = false;
    }
  }

  function visibility() {
    if (timer !== undefined) clock.clearTimeout(timer);
    if (!page.hidden) void tick();
  }

  page.addEventListener("visibilitychange", visibility);
  void tick();

  return () => {
    stopped = true;
    if (timer !== undefined) clock.clearTimeout(timer);
    page.removeEventListener("visibilitychange", visibility);
  };
}
