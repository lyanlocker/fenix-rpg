import { startVisiblePolling } from "./polling";

type Scope = { agent: string; token: string } | { campaign: string; token: string };
type Observer = (connected: boolean, changed: boolean) => void;
type Shared = { observers: Set<Observer>; connected: boolean; stop: () => void };
const connections = new Map<string, Shared>();

// A character sheet, combat and bonds share one Firebase connection per
// credential. Authentication remains in memory, not in persistent browser storage.
function connect(scope: Scope, observer: Observer): () => void {
  const key = JSON.stringify(scope);
  let existing = connections.get(key);
  if (existing) {
    existing.observers.add(observer);
    observer(existing.connected, false);
    return () => release(key, observer);
  }
  const entry: Shared = { observers: new Set([observer]), connected: false, stop: () => {} };
  connections.set(key, entry);
  let closed = false, cleanup = () => {}, timer: ReturnType<typeof setTimeout> | undefined;
  const notify = (connected: boolean, changed = false) => {
    entry.connected = connected;
    for (const listener of entry.observers) listener(connected, changed);
  };
  async function open() {
    if (closed) return;
    cleanup();
    notify(false);
    const controller = new AbortController();
    cleanup = () => controller.abort();
    try {
      const result = await fetch("/api/realtime/session", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify(scope), signal: controller.signal,
      });
      if (!result.ok) throw Error("Realtime unavailable");
      const session = await result.json();
      if (closed || !Array.isArray(session.paths) || !session.paths.length || session.paths.length > 2) return;
      const [appSdk, authSdk, dbSdk] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/database")]);
      if (closed) return;
      const app = appSdk.initializeApp(session.config, `fenix-live-${crypto.randomUUID()}`);
      const cleanups: Array<() => void> = [];
      cleanup = () => { controller.abort(); cleanups.forEach(stop => stop()); void appSdk.deleteApp(app).catch(() => {}); };
      const auth = authSdk.initializeAuth(app, { persistence: authSdk.inMemoryPersistence });
      await authSdk.signInWithCustomToken(auth, session.token);
      if (closed) return;
      const db = dbSdk.getDatabase(app);
      const ready = new Set<string>();
      let online = false, denied = false;
      // Without a validated campaign subscription, retain the previous poll
      // interval so joining a newly registered combat is still detected quickly.
      const campaignCovered = (session.paths as string[]).some(path => path.includes("/campaign/"));
      const status = (changed = false) => notify(!closed && !denied && online && campaignCovered && ready.size === session.paths.length, changed);
      const fail = () => { denied = true; status(); };
      cleanups.push(dbSdk.onValue(dbSdk.ref(db, ".info/connected"), snap => { online = snap.val() === true; status(); }, fail));
      for (const path of session.paths as string[]) {
        cleanups.push(dbSdk.onValue(dbSdk.ref(db, path), () => { ready.add(path); status(true); }, fail));
      }
      timer = setTimeout(() => void open(), Math.max(60_000, Math.min(12 * 60_000, Number(session.expiresAt) - Date.now() - 60_000)));
    } catch {
      cleanup();
      notify(false);
      if (!closed) timer = setTimeout(() => void open(), 60_000);
    }
  }
  entry.stop = () => { closed = true; if (timer) clearTimeout(timer); cleanup(); };
  void open();
  return () => release(key, observer);
}

function release(key: string, observer: Observer) {
  const entry = connections.get(key);
  if (!entry) return;
  entry.observers.delete(observer);
  if (!entry.observers.size) { entry.stop(); connections.delete(key); }
}

export function startRealtimePolling(refresh: () => Promise<unknown>, interval: number, maxIdle: number, scope: Scope | null) {
  if (!scope || process.env.NEXT_PUBLIC_FENIX_REALTIME !== "firebase") return startVisiblePolling(refresh, interval, maxIdle);
  return startVisiblePolling(refresh, interval, maxIdle, { document, window }, {
    subscribe: observer => connect(scope, observer),
    safetyInterval: 30_000,
  });
}
