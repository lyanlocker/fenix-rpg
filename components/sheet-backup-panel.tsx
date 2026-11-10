"use client";
import { backupLabel, rememberBackupLabel } from "@/lib/backup-labels";
import { backupDate } from "@/lib/backup-format";
import { useRef, useState } from "react";
import { Download, FolderArchive, RefreshCw, ShieldCheck } from "lucide-react";
import type { Agent } from "@/lib/rules";
import {
  encryptSheetBackup,
  decryptSheetBackup,
  type SheetBackup,
} from "@/lib/sheet-backup";
import { type BackupListing, type EncryptedBackup } from "@/lib/backup-format";
import {
  getShareCredentials,
  loadSharedAgent,
  storeShareCredentials,
} from "@/lib/share";
import { githubApi } from "@/lib/github-api";
import { useGame } from "./game-shell";
import { Modal, download } from "./ui";

export function SaveSheetBackup({
  agent,
  onClose,
}: {
  agent: Agent;
  onClose: () => void;
}) {
  const game = useGame();
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState<{ commit: string } | null>(null),
    [envelope, setEnvelope] = useState<EncryptedBackup | null>(null);
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (password !== confirm) throw Error("As senhas precisam ser iguais.");
      const credentials = getShareCredentials(agent.id);
      let latest = agent;
      if (credentials) {
        const remote = await loadSharedAgent(agent.id, credentials.masterToken);
        if (remote.role !== "master")
          throw Error("É necessária a chave do mestre para copiar o acesso.");
        latest = remote.agent;
      }
      const next = await encryptSheetBackup(
        { agent: latest, ...(credentials ? { credentials } : {}) },
        password,
      );
      setEnvelope(next);
      const result = await githubApi<{ commit: string; path: string }>(
        "/api/github/backups",
        "POST",
        next,
      );
      rememberBackupLabel(result.path, latest.name);
      setSaved(result);
      setPassword("");
      setConfirm("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (game.access.isPlayer) return null;
  return (
    <Modal
      title={`Backup de ${agent.name}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {saved ? (
        <>
          <p role="status">
            <ShieldCheck size={18} /> Cópia salva e versionada no GitHub.
          </p>
          <a
            href={`https://github.com/lyanlocker/fenix-rpg/tree/fenix-backups`}
            target="_blank"
            rel="noreferrer"
          >
            Ver arquivo de backups
          </a>
          <p className="hint">
            Guarde a senha. Ela não fica salva no site e é necessária para
            restaurar.
          </p>
        </>
      ) : (
        <>
          <p>
            A cópia inclui a ficha, suas imagens e, quando disponível, o acesso
            do mestre e do jogador. Tudo é protegido por senha antes do envio.
          </p>
          <p className="hint">
            Escolha uma senha longa e guarde-a fora do site. Sem ela, o backup
            não pode ser recuperado. Cada envio cria uma nova versão.
          </p>
          <label>
            Senha do backup
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={256}
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label>
            Repita a senha
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              disabled={busy}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {!game.threatLibrary.connected && (
            <p className="hint">
              Feche esta janela e use Conectar GitHub no painel de Agentes.
            </p>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              !game.threatLibrary.connected ||
              password.length < 12 ||
              password !== confirm
            }
            onClick={() => void save()}
          >
            {busy ? "Protegendo e salvando…" : "Salvar no GitHub"}
          </button>
        </>
      )}
      {envelope && (
        <button
          onClick={() => download(`Fenix-backup-${envelope.id}.json`, envelope)}
        >
          <Download size={16} />
          Baixar cópia protegida
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
export function RestoreSheetBackups() {
  const game = useGame(),
    input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [files, setFiles] = useState<BackupListing[]>([]),
    [selected, setSelected] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [encrypted, setEncrypted] = useState<unknown>(null),
    [decoded, setDecoded] = useState<SheetBackup | null>(null);
  async function run(action: () => Promise<void>) {
    if (busy) return;
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
  async function refresh() {
    const result = await githubApi<{ backups: BackupListing[] }>(
      "/api/github/backups",
    );
    setFiles(result.backups);
    setSelected(result.backups[0]?.path || "");
    setEncrypted(null);
    setDecoded(null);
  }
  async function unlock() {
    const raw =
      encrypted ||
      (
        await githubApi<{ backup: unknown }>(
          `/api/github/backups?path=${encodeURIComponent(selected)}`,
        )
      ).backup;
    setEncrypted(raw);
    setDecoded(await decryptSheetBackup(raw, password));
    setPassword("");
  }
  async function restore(copy: boolean) {
    if (!decoded) return;
    if (copy) {
      await game.save("agents", {
        ...decoded.agent,
        id: crypto.randomUUID(),
        owner_id: undefined,
        campaign_id: null,
      });
      game.setNotice(
        "Backup restaurado como nova ficha, sem substituir as fichas existentes.",
      );
    } else {
      if (!decoded.credentials)
        throw Error("Este backup não contém a chave de mestre.");
      const current = await loadSharedAgent(
        decoded.agent.id,
        decoded.credentials.masterToken,
      );
      if (current.role !== "master")
        throw Error(
          "O acesso de mestre não é mais válido. Restaure uma cópia do backup.",
        );
      storeShareCredentials(current.agent.id, decoded.credentials);
      await game.save("agents", current.agent);
      game.setNotice(
        "Acesso à ficha compartilhada recuperado com os dados atuais do servidor.",
      );
    }
    setDecoded(null);
    setEncrypted(null);
    setOpen(false);
  }
  if (game.access.isPlayer) return null;
  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          if (game.threatLibrary.connected) void run(refresh);
        }}
      >
        <FolderArchive size={17} />
        Restaurar backup
      </button>
      {open && (
        <Modal
          title="Arquivo de fichas no GitHub"
          wide
          onClose={() => {
            if (!busy) {
              setOpen(false);
              setDecoded(null);
              setEncrypted(null);
              setPassword("");
            }
          }}
        >
          {!decoded ? (
            <>
              <p>
                Abra uma versão salva no GitHub ou selecione um arquivo
                protegido que você baixou.
              </p>
              <div className="actions">
                <button
                  disabled={busy || !game.threatLibrary.connected}
                  onClick={() => void run(refresh)}
                >
                  <RefreshCw size={16} />
                  Listar backups do GitHub
                </button>
                <button disabled={busy} onClick={() => input.current?.click()}>
                  Abrir arquivo de backup
                </button>
              </div>
              <input
                ref={input}
                type="file"
                hidden
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void run(async () => {
                      if (file.size > 3_800_000)
                        throw Error("Arquivo acima do limite de 3,8 MB.");
                      setEncrypted(JSON.parse(await file.text()));
                      setSelected("");
                      setDecoded(null);
                    });
                  if (input.current) input.current.value = "";
                }}
              />
              {!encrypted && files.length > 0 && (
                <label>
                  Versão
                  <select
                    value={selected}
                    disabled={busy}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {files.map((f) => (
                      <option key={f.path} value={f.path}>
                        {backupLabel(f.path)} · {backupDate(f.path)} ·{" "}
                        {Math.ceil(f.size / 1024)} KB
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!encrypted && files.length === 0 && (
                <p className="hint">
                  Nenhum backup listado. Conecte o GitHub para consultar seu
                  arquivo.
                </p>
              )}
              {encrypted != null && (
                <p className="hint">Arquivo protegido carregado.</p>
              )}
              <label>
                Senha usada no backup
                <input
                  type="password"
                  autoComplete="off"
                  value={password}
                  disabled={busy}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={busy || (!encrypted && !selected) || !password}
                onClick={() => void run(unlock)}
              >
                {busy ? "Abrindo…" : "Abrir backup"}
              </button>
            </>
          ) : (
            <>
              <h3>{decoded.agent.name}</h3>
              <p>
                {decoded.agent.className} · NEX {decoded.agent.nex}% ·{" "}
                {decoded.agent.inventory.length} itens
              </p>
              <p>
                Restaurar uma cópia cria uma nova ficha com os dados desta
                versão. Recuperar acesso abre a ficha original com os dados
                atuais do servidor.
              </p>
              <div className="actions">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void run(() => restore(true))}
                >
                  Restaurar como nova ficha
                </button>
                {decoded.credentials && (
                  <button
                    disabled={busy}
                    onClick={() => void run(() => restore(false))}
                  >
                    Recuperar acesso à original
                  </button>
                )}
              </div>
              <button
                disabled={busy}
                onClick={() => {
                  setDecoded(null);
                  setEncrypted(null);
                }}
              >
                Escolher outra versão
              </button>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
