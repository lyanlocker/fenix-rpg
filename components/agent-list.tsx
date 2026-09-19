"use client";
import { useState, useRef } from "react";
import Link from "next/link";
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
      if (file.size > 2000000) throw Error("Limite de 2 MB por ficha.");
      const a = validateAgentImport(JSON.parse(await file.text()));
      await game.save("agents", {
        ...a,
        id: crypto.randomUUID(),
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
        <Link className="primary" href="/agentes/novo">
          <Plus size={18} />
          Criar personagem
        </Link>
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
          Importar ficha
        </button>
        <input
          hidden
          ref={input}
          type="file"
          accept=".json"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </div>
      {!game.ready ? (
        <p>Carregando fichas…</p>
      ) : (
        <div className="agent-grid">
          {game.state.agents
            .filter((a) =>
              a.name.toLocaleLowerCase().includes(q.toLocaleLowerCase()),
            )
            .map((a) => (
              <Link className="agent-card" key={a.id} href={"/agentes/" + a.id}>
                <div className="portrait" style={{ color: a.color }}>
                  <UserRound size={42} strokeWidth={1} />
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
