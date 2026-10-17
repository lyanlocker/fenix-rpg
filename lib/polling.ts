// Schedule the next request after completion, and stop while the page is hidden.
// If refresh explicitly returns false (no data changed), progressively slow down
// to one check per minute. A real update, tab re-entry or user mutation resumes
// frequent checks. This avoids thousands of unnecessary Supabase requests.
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
  let unchangedChecks = 0;
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
      const changed = await refresh();
      failures = 0;
      unchangedChecks = changed === false ? Math.min(unchangedChecks + 1, 5) : 0;
    } catch {
      failures = Math.min(failures + 1, 4);
    } finally {
      running = false;
      if (!stopped && !page.hidden) {
        timer = clock.setTimeout(
          () => void tick(),
          pending
            ? 0
            : Math.min(60000, intervalMs * 2 ** (failures || unchangedChecks)),
        );
      }
      pending = false;
    }
  }
  function visibility() {
    if (timer !== undefined) clock.clearTimeout(timer);
    if (!page.hidden) {
      unchangedChecks = 0;
      void tick();
    }
  }
  page.addEventListener("visibilitychange", visibility);
  void tick();
  return () => {
    stopped = true;
    if (timer !== undefined) clock.clearTimeout(timer);
    page.removeEventListener("visibilitychange", visibility);
  };
}
