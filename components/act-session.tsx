"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { rpc } from "@/lib/share";
import { startVisiblePolling } from "@/lib/polling";
import type { Board, MemberReply, Delivery } from "@/lib/act-two";
const Overlay = dynamic(() => import("./anomaly-overlay"), { ssr: false });
type Session = {
  board: Board | null;
  sync: string;
  error: string;
  refresh: () => void;
};
const Context = createContext<Session>({
  board: null,
  sync: "",
  error: "",
  refresh: () => {},
});
export const useAct = () => useContext(Context);
export function ActSession({
  id,
  token,
  present,
  children,
}: {
  id: string | null;
  token: string | null;
  present: boolean;
  children: ReactNode;
}) {
  const [board, setBoard] = useState<Board | null>(null),
    [sync, setSync] = useState(""),
    [error, setError] = useState(""),
    [effect, setEffect] = useState<Delivery | null>(null),
    [theme, setTheme] = useState(0);
  const refresh = useRef(() => {}),
    ack = useRef(""),
    expired = useRef("");
  useEffect(() => {
    if (!id || !token || process.env.NEXT_PUBLIC_FENIX_BACKEND !== "neon")
      return;
    let alive = true,
      request = 0,
      known = "",
      enrolled = false;
    async function read() {
      const version = ++request;
      try {
        const value = await rpc<MemberReply | null>("fenix_act_member", {
          requested_agent_id: id,
          share_token: token,
          ack: ack.current || null,
          known: known || null,
        });
        if (!alive || version !== request) return false;
        setSync(new Date().toLocaleTimeString("pt-BR"));
        setError("");
        enrolled = !!value;
        if (!value) {
          setBoard(null);
          setTheme(0);
          setEffect(null);
          known = "";
          return false;
        }
        if (value.members) {
          known = value.version;
          setBoard({
            title: value.title,
            version: known,
            average: value.average,
            members: value.members,
          });
        }
        if (!present) return !!value.members;
        setTheme(value.theme ? value.intensity : 0);
        const e = value.effect;
        if (!e || e.id === expired.current) setEffect(null);
        else
          setEffect((old) => {
            if (old?.id === e.id) return old;
            if (!e.settings) return null;
            return {
              id: e.id,
              settings: e.settings,
              deadline: e.remaining === null ? null : Date.now() + e.remaining,
            };
          });
        return !!value.members || !!e || value.theme;
      } catch (e) {
        if (alive && version === request) {
          setError((e as Error).message);
          if ((e as { status?: number }).status === 403) {
            setBoard(null);
            setEffect(null);
            setTheme(0);
            known = "";
          }
        }
        throw e;
      }
    }
    refresh.current = () => {
      void read().catch(() => {});
    };
    const stop = startVisiblePolling(read, 2000, () =>
      enrolled ? 2750 : 60000,
    );
    return () => {
      alive = false;
      refresh.current = () => {};
      stop();
    };
  }, [id, token, present]);
  function acknowledge(event: string) {
    if (ack.current === event) return;
    ack.current = event;
    refresh.current();
  }
  return (
    <Context.Provider
      value={{ board, sync, error, refresh: () => refresh.current() }}
    >
      {children}
      {present && (effect || theme > 0) && (
        <Overlay
          effect={effect}
          theme={theme}
          onExpire={(id) => {
            expired.current = id;
            setEffect((old) => (old?.id === id ? null : old));
          }}
          acknowledge={acknowledge}
        />
      )}
    </Context.Provider>
  );
}
