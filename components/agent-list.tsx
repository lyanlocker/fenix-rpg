"use client";
import { useState, useRef, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Plus,
  ArrowRight,
  Upload,
  UserRound,
  Search,
  UsersRound,
  Layers,
  Dices,
} from "lucide-react";
import { motion } from "motion/react";
import { maximums, resourceKeys } from "@/lib/rules";
import { useExperience } from "./experience";
import { useGame } from "./game-shell";
import { validateAgentImport } from "@/lib/validation";
export default function AgentList() {
  const game = useGame(),
    [q, setQ] = useState(""),
    [classFilter, setClassFilter] = useState("Todas"),
    input = useRef<HTMLInputElement>(null);
  const { reduced, duration } = useExperience();
  const available = game.state.agents.filter(
    (a) => !game.access.isPlayer || a.id === game.access.agentId,
  );
  const classes = ["Todas", ...new Set(available.map((a) => a.className))];
  const filtered = available.filter(
    (a) =>
      (classFilter === "Todas" || a.className === classFilter) &&
      `${a.name} ${a.className} ${a.track} ${a.origin}`
        .toLocaleLowerCase()
        .includes(q.toLocaleLowerCase()),
  );
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
    <div className="page agents-page">
      <div className="page-heading agents-hero">
        <div>
          <p className="eyebrow">ARQUIVO VIVO · FÊNIX 2.1</p>
          <h1>
            O impossível
            <br />
            <em>tem seus agentes.</em>
          </h1>
          <p>Suas histórias. Suas marcas. A próxima sessão começa aqui.</p>
        </div>
        {!game.access.isPlayer && (
          <Link className="primary" href="/agentes/novo">
            <Plus size={18} />
            Criar personagem
          </Link>
        )}
      </div>
      <div className="workspace-stats" aria-label="Resumo do arquivo">
        <span>
          <UsersRound size={17} />
          <strong>{available.length}</strong> agentes
        </span>
        {!game.access.isPlayer && (
          <span>
            <Layers size={17} />
            <strong>{game.state.campaigns.length}</strong> campanhas
          </span>
        )}
        <span>
          <Dices size={17} />
          Pronto para a próxima história
        </span>
      </div>
      <div className="section-title agents-section-title">
        <div>
          <p className="eyebrow">SELECIONE UM DOSSIÊ</p>
          <h2>Seus agentes</h2>
        </div>
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
      <div className="agent-filters" aria-label="Filtrar por classe">
        {classes.map((name) => (
          <button
            key={name}
            aria-pressed={classFilter === name}
            onClick={() => setClassFilter(name)}
          >
            {name}
            <span>
              {name === "Todas"
                ? available.length
                : available.filter((a) => a.className === name).length}
            </span>
          </button>
        ))}
      </div>
      {!game.ready || !game.access.ready ? (
        <p role="status">Carregando fichas…</p>
      ) : game.access.isPlayer && !game.access.agentId ? (
        <div className="empty">
          <h2>Link de jogador incompleto</h2>
          <p>Peça ao mestre um link que identifique a ficha autorizada.</p>
        </div>
      ) : !filtered.length ? (
        <div className="empty">
          <Search size={28} />
          <h2>Nenhum agente encontrado</h2>
          <p>Tente outro nome ou escolha uma classe diferente.</p>
          <button
            onClick={() => {
              setQ("");
              setClassFilter("Todas");
            }}
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="agent-grid">
          {filtered.map((a, index) => {
            const max = maximums(a);
            return (
              <motion.div
                key={a.id}
                initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration,
                  delay: reduced ? 0 : Math.min(index, 5) * 0.035,
                }}
              >
                <Link
                  className="agent-card dossier-card"
                  href={game.accessHref("/agentes/" + a.id)}
                  style={{ "--agent-color": a.color } as CSSProperties}
                >
                  <div className="dossier-visual">
                    <div className="dossier-topline">
                      <span>AGENTE / {String(index + 1).padStart(2, "0")}</span>
                      <b>
                        {a.className === "Sobrevivente"
                          ? `ESTÁGIO ${a.stage}`
                          : `NEX ${a.nex}%`}
                      </b>
                    </div>
                    <div
                      className={`portrait ${a.portrait ? "" : "portrait-empty"}`}
                      style={{ color: a.color }}
                    >
                      {a.portrait ? (
                        <Image
                          unoptimized
                          fill
                          sizes="(max-width: 650px) 90vw, (max-width: 1000px) 45vw, 380px"
                          src={a.portrait}
                          alt={`Aparência de ${a.name}`}
                        />
                      ) : (
                        <>
                          <UserRound size={96} strokeWidth={0.7} />
                          <span>IDENTIDADE EM ARQUIVO</span>
                        </>
                      )}
                    </div>
                    <span className="dossier-class">{a.className}</span>
                  </div>
                  <div className="agent-summary">
                    <h2>{a.name}</h2>
                    <p>{a.track || a.origin || "Personagem independente"}</p>
                  </div>
                  <div className="card-resources">
                    {resourceKeys(a).map((key) => (
                      <div key={key} className={key}>
                        <span>
                          {key.toUpperCase()}
                          <b>
                            {a.resources[key]}
                            <small>/{max[key]}</small>
                          </b>
                        </span>
                        <progress
                          aria-label={`${key.toUpperCase()} de ${a.name}`}
                          value={a.resources[key]}
                          max={max[key] || 1}
                        />
                      </div>
                    ))}
                  </div>
                  <span className="open-sheet">
                    Abrir dossiê
                    <ArrowRight size={17} />
                  </span>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
