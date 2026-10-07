// Schedule the next request after completion, and stop while the page is hidden.
// A visibility change triggers an immediate check without overlapping requests.
export function startVisiblePolling(
  refresh: () => Promise<unknown>,
  intervalMs: number,
  environment = { document, window },
) {
  let stopped = false;
  let running = false;
  let pending = false;
  let timer: number | undefined;
  let failures = 0;
  const { document: page, window: clock } = environment;
  async function tick() {
    if (stopped || page.hidden) return;
    if (running) {
      pending = true;
      return;
    }
    if (timer !== undefined) clock.clearTimeout(timer);
    running = true;
    try {
      await refresh();
      failures = 0;
    } catch {
      failures = Math.min(failures + 1, 4);
    } finally {
      running = false;
      if (!stopped && !page.hidden) {
        timer = clock.setTimeout(
          () => void tick(),
          pending ? 0 : Math.min(30000, intervalMs * 2 ** failures),
        );
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
