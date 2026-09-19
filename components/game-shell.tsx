"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, X } from "lucide-react";
import { useStore } from "@/lib/use-store";
import {
  accessHref as buildAccessHref,
  parseAccessMode,
  type AccessMode,
} from "@/lib/access";
type GameContext = ReturnType<typeof useStore> & {
  access: AccessMode;
  accessHref: (path: string) => string;
};
const Context = createContext<GameContext | null>(null);
export function useGame() {
  const game = useContext(Context);
  if (!game) throw Error("Contexto indisponível");
  return game;
}
export default function GameShell({ children }: { children: ReactNode }) {
  const game = useStore(),
    path = usePathname(),
    [access, setAccess] = useState<AccessMode>({
      ready: false,
      isPlayer: false,
      agentId: null,
    });
  useEffect(() => {
    setAccess(parseAccessMode(window.location.search));
  }, [path]);
  function accessHref(target: string) {
    return buildAccessHref(target, access);
  }
  const value: GameContext = { ...game, access, accessHref };
  return (
    <Context.Provider value={value}>
      <a className="skip" href="#content">
        Ir ao conteúdo
      </a>
      <header className="topbar">
        <Link
          className="logo"
          href={accessHref(
            access.isPlayer && access.agentId
              ? `/agentes/${access.agentId}`
              : "/",
          )}
        >
          <Flame size={24} />
          FÊNIX
        </Link>
        <nav aria-label="Principal">
          {(access.isPlayer && access.agentId
            ? [[`/agentes/${access.agentId}`, "Minha ficha"]]
            : [
                ["/", "Agentes"],
                ["/campanhas", "Campanhas"],
                ["/biblioteca", "Biblioteca"],
              ]
          ).map(([url, label]) => (
            <Link
              key={url}
              href={accessHref(url)}
              className={
                (
                  url === "/"
                    ? !path.startsWith("/campanhas") &&
                      !path.startsWith("/biblioteca")
                    : path.startsWith(url)
                )
                  ? "active"
                  : ""
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="mode">
        {access.isPlayer
          ? "Modo jogador · acesso limitado à ficha autorizada neste navegador"
          : "Sem cadastro · salvo neste navegador · exporte suas fichas para backup"}
      </div>
      {game.notice && (
        <div role="alert" className="notice">
          {game.notice}
          <button
            aria-label="Dispensar aviso"
            onClick={() => game.setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <main id="content">{children}</main>
      <footer className="site-footer">
        Fênix · Fichas de Ordem Paranormal · Projeto independente
      </footer>
    </Context.Provider>
  );
}
