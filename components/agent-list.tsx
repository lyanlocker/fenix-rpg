"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus, ArrowRight, Upload, UserRound, Search } from "lucide-react";
import { useGame } from "./game-shell";
import { validateAgentImport } from "@/lib/validation";
export default function AgentList() {
  const game = useGame(),
    [q, setQ] = useState(""),
    input = useRef<HTMLInputElement>(null);
  async function upload(file?: File) {
    if (!file) return;
    try {
      if (file.size > 4000000) throw Error("Limite de 4 MB por ficha.");
      const a = validateAgentImport(JSON.parse(await file.text()));
      if (game.access.isPlayer && a.id !== game.access.agentId)
        throw Error(
          "Este arquivo não corresponde à ficha autorizada pelo link.",
        );
      await game.save("agents", {
        ...a,
        id: game.access.isPlayer ? a.id : crypto.randomUUID(),
        owner_id: undefined,
        campaign_id: null,
      });
      game.setNotice("Ficha importada como nova cópia.");
    } catch (e) {
      game.setNotice((e as Error).message);
    } finally {
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SUAS HISTÓRIAS</p>
          <h1>Agentes</h1>
          <p>Escolha um personagem e abra sua ficha para jogar.</p>
        </div>
        {!game.access.isPlayer && (
          <Link className="primary" href="/agentes/novo">
            <Plus size={18} />
            Criar personagem
          </Link>
        )}
      </div>
      <div className="list-tools">
        <label className="search">
          <Search size={18} />
          <input
            aria-label="Buscar personagem"
            placeholder="Buscar personagem…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <button onClick={() => input.current?.click()}>
          <Upload size={16} />
          {game.access.isPlayer ? "Importar minha ficha" : "Importar ficha"}
        </button>
        <input
          hidden
          ref={input}
          type="file"
          accept=".json"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </div>
      {!game.ready || !game.access.ready ? (
        <p>Carregando fichas…</p>
      ) : game.access.isPlayer && !game.access.agentId ? (
        <div className="empty">
          <h2>Link de jogador incompleto</h2>
          <p>Peça ao mestre um link que identifique a ficha autorizada.</p>
        </div>
      ) : (
        <div className="agent-grid">
          {game.state.agents
            .filter(
              (a) => !game.access.isPlayer || a.id === game.access.agentId,
            )
            .filter((a) =>
              a.name.toLocaleLowerCase().includes(q.toLocaleLowerCase()),
            )
            .map((a) => (
              <Link
                className="agent-card"
                key={a.id}
                href={game.accessHref("/agentes/" + a.id)}
              >
                <div className="portrait" style={{ color: a.color }}>
                  {a.portrait ? (
                    <Image
                      unoptimized
                      fill
                      sizes="(max-width: 760px) 100vw, 380px"
                      src={a.portrait}
                      alt={`Aparência de ${a.name}`}
                    />
                  ) : (
                    <UserRound size={42} strokeWidth={1} />
                  )}
                </div>
                <div className="agent-summary">
                  <h2>{a.name}</h2>
                  <p>
                    {a.className} ·{" "}
                    {a.className === "Sobrevivente"
                      ? `Estágio ${a.stage}`
                      : `NEX ${a.nex}%`}
                  </p>
                  <small>
                    {a.track || a.origin || "Personagem independente"}
                  </small>
                </div>
                <span className="open-sheet">
                  Abrir ficha
                  <ArrowRight size={17} />
                </span>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
