"use client";
import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flame, X } from "lucide-react";
import { useStore } from "@/lib/use-store";
const Context = createContext<ReturnType<typeof useStore> | null>(null);
export function useGame() {
  const game = useContext(Context);
  if (!game) throw Error("Contexto indisponível");
  return game;
}
export default function GameShell({ children }: { children: ReactNode }) {
  const game = useStore(),
    path = usePathname();
  return (
    <Context.Provider value={game}>
      <a className="skip" href="#content">
        Ir ao conteúdo
      </a>
      <header className="topbar">
        <Link className="logo" href="/">
          <Flame size={24} />
          FÊNIX
        </Link>
        <nav aria-label="Principal">
          {[
            ["/", "Agentes"],
            ["/campanhas", "Campanhas"],
            ["/biblioteca", "Biblioteca"],
          ].map(([url, label]) => (
            <Link
              key={url}
              href={url}
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
        Sem cadastro · salvo neste navegador · exporte suas fichas para backup
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
