import type { Metadata } from "next";
import "./globals.css";
import GameShell from "@/components/game-shell";
export const metadata: Metadata = {
  title: "Fênix — Sua próxima história",
  description:
    "Agentes, campanhas e sessões de Ordem Paranormal em um só lugar.",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <GameShell>{children}</GameShell>
      </body>
    </html>
  );
}
