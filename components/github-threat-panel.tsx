"use client";
import { useState } from "react";
import { Github, Check, RefreshCw } from "lucide-react";
import { useGame } from "./game-shell";

export function GithubThreatPanel() {
  const { threatLibrary: sync } = useGame();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="github-threat-panel"
      aria-label="Conexão do catálogo com GitHub"
    >
      <div className="github-threat-heading">
        <Github size={22} />
        <div>
          <strong>Catálogo no GitHub</strong>
          <p>Criaturas e imagens fazem parte do acervo geral do Fênix.</p>
        </div>
        {sync.connected ? (
          <span className="github-connected">
            <Check size={15} /> Conectado
          </span>
        ) : (
          <button onClick={() => setOpen(!open)} aria-expanded={open}>
            Conectar GitHub
          </button>
        )}
      </div>
      {sync.connected && (
        <div className="github-threat-controls">
          <button
            disabled={busy || sync.busy}
            onClick={() => void run(sync.refresh)}
          >
            <RefreshCw size={15} /> Atualizar catálogo
          </button>
          <button
            disabled={busy || sync.busy}
            onClick={() => void run(sync.disconnect)}
          >
            Desconectar
          </button>
          <small>
            Ao salvar, a mudança vai para o GitHub e inicia a publicação do
            site.
          </small>
        </div>
      )}
      {open && !sync.connected && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = token.trim();
            setToken("");
            void run(async () => {
              await sync.connect(value);
              setOpen(false);
            });
          }}
        >
          <p>
            Conexão exclusiva do proprietário <strong>lyanlocker</strong>.
            Autorize apenas este repositório:
          </p>
          <ol>
            <li>
              Abra{" "}
              <a
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noreferrer"
              >
                Criar autorização no GitHub
              </a>{" "}
              e dê o nome <strong>Fênix — catálogo</strong>.
            </li>
            <li>
              Em <strong>Repository access</strong>, escolha{" "}
              <strong>Only select repositories → fenix-rpg</strong>.
            </li>
            <li>
              Em <strong>Repository permissions</strong>, selecione{" "}
              <strong>Contents → Read and write</strong>. Defina uma validade e
              clique em <strong>Generate token</strong>.
            </li>
          </ol>
          <label>
            Autorização do GitHub
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              maxLength={260}
              value={token}
              required
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_…"
            />
          </label>
          <p className="hint">
            Cole somente neste campo do site. A conexão fica protegida por até 8
            horas neste navegador. Não envie essa autorização pelo chat.
          </p>
          {!sync.configured && (
            <p className="hint">
              A conexão está disponível no endereço principal após a
              configuração administrativa.
            </p>
          )}
          <button className="primary" disabled={busy || !sync.configured}>
            {busy ? "Conectando…" : "Conectar com segurança"}
          </button>
        </form>
      )}
      {(error || sync.error) && (
        <p className="error" role="alert">
          {error || sync.error}
        </p>
      )}
      {sync.busy && (
        <p role="status">Enviando ao GitHub… Mantenha esta janela aberta.</p>
      )}
      {!sync.busy && sync.commit && (
        <p role="status" className="github-save-status">
          Salvo no GitHub. A publicação pode levar alguns instantes.{" "}
          <a
            href={`https://github.com/lyanlocker/fenix-rpg/commit/${sync.commit}`}
            target="_blank"
            rel="noreferrer"
          >
            Ver registro
          </a>
        </p>
      )}
    </section>
  );
}
