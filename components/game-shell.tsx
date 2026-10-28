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
          <span>
            FÊNIX<small>ARQUIVOS DO IMPOSSÍVEL</small>
          </span>
          <b className="version-tag">2.0</b>
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
        FÊNIX 2.0 · Toda história deixa uma marca.
        <span>Fichas de Ordem Paranormal · Projeto independente</span>
      </footer>
    </Context.Provider>
  );
}
