"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Flame,
  X,
  UsersRound,
  BookOpen,
  Skull,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { ExperienceProvider } from "./experience";
import { useStore } from "@/lib/use-store";
import { useThreatLibrary } from "@/lib/use-threat-library";
import { mergeThreatCatalog } from "@/lib/threat-library";
import type { Threat } from "@/lib/threats";
import {
  accessHref as buildAccessHref,
  parseAccessMode,
  type AccessMode,
} from "@/lib/access";
type GameContext = ReturnType<typeof useStore> & {
  threatLibrary: ReturnType<typeof useThreatLibrary>;
  allThreats: Threat[];
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
  const path = usePathname();
  if (path === "/apresentacao") return children;
  return (
    <ExperienceProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </ExperienceProvider>
  );
}

function WorkspaceShell({ children }: { children: ReactNode }) {
  const game = useStore(),
    path = usePathname(),
    [access, setAccess] = useState<AccessMode>({
      ready: false,
      isPlayer: false,
      agentId: null,
      shareToken: null,
    });
  useEffect(() => {
    setAccess(parseAccessMode(window.location.search));
  }, [path]);
  function accessHref(target: string) {
    return buildAccessHref(target, access);
  }
  const threatLibrary = useThreatLibrary(access.ready && !access.isPlayer);
  const allThreats = useMemo(
    () => mergeThreatCatalog(game.state.threats, threatLibrary.library.threats),
    [game.state.threats, threatLibrary.library.threats],
  );
  const value: GameContext = {
    ...game,
    access,
    accessHref,
    threatLibrary,
    allThreats,
  };
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
          <span>
            FÊNIX<small>ARQUIVOS DO IMPOSSÍVEL</small>
          </span>
          <b className="version-tag">2.3</b>
        </Link>
        <nav aria-label="Principal">
          {(access.isPlayer && access.agentId
            ? [[`/agentes/${access.agentId}`, "Minha ficha"]]
            : [
                ["/", "Agentes"],
                ["/campanhas", "Campanhas"],
                ["/biblioteca", "Biblioteca"],
                ["/ameacas", "Ameaças"],
              ]
          ).map(([url, label]) => (
            <Link
              key={url}
              href={accessHref(url)}
              className={
                (
                  url === "/"
                    ? !path.startsWith("/campanhas") &&
                      !path.startsWith("/biblioteca") &&
                      !path.startsWith("/ameacas")
                    : path.startsWith(url)
                )
                  ? "active"
                  : ""
              }
            >
              {url === "/campanhas" ? (
                <Layers size={16} />
              ) : url === "/biblioteca" ? (
                <BookOpen size={16} />
              ) : url === "/ameacas" ? (
                <Skull size={16} />
              ) : (
                <UsersRound size={16} />
              )}
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="mode">
        <ShieldCheck size={12} />
        {access.isPlayer
          ? "Modo jogador · ficha compartilhada e sincronizada"
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
        FÊNIX 2.3 · Toda história deixa uma marca.
        <span>Fichas de Ordem Paranormal · Projeto independente</span>
      </footer>
    </Context.Provider>
  );
}
