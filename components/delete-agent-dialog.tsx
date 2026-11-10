"use client";
import { useState } from "react";
import type { Agent } from "@/lib/rules";
import {
  deleteSharedAgent,
  forgetShareCredentials,
  getShareCredentials,
} from "@/lib/share";
import { Modal } from "./ui";
import { useGame } from "./game-shell";
export default function DeleteAgentDialog({
  agent,
  onClose,
}: {
  agent: Agent;
  onClose: () => void;
}) {
  const game = useGame(),
    credentials = getShareCredentials(agent.id);
  const [scope, setScope] = useState(credentials ? "shared" : "local"),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (game.access.isPlayer) return null;
  async function remove() {
    if (busy || confirmation !== agent.name) return;
    setBusy(true);
    setError("");
    try {
      if (scope === "shared") {
        if (!credentials)
          throw Error(
            "A chave de mestre desta ficha não está neste navegador.",
          );
        await deleteSharedAgent(agent.id, credentials.masterToken);
        try {
          forgetShareCredentials(agent.id);
        } catch {
          /* Preserve damaged local storage; remote deletion is already confirmed. */
        }
      }
      game.removeAgent(agent.id);
      game.setNotice(
        scope === "shared"
          ? "Ficha excluída. O link do jogador foi encerrado; backups no GitHub continuam disponíveis."
          : "Ficha removida deste navegador. Backups e links compartilhados foram preservados.",
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Excluir ${agent.name}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        Escolha onde remover a ficha. Salve um backup antes se quiser poder
        recuperá-la depois.
      </p>
      {credentials ? (
        <label>
          O que excluir
          <select
            disabled={busy}
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="shared">
              Ficha compartilhada e cópia deste navegador
            </option>
            <option value="local">Somente a cópia deste navegador</option>
          </select>
        </label>
      ) : (
        <p className="hint">
          Sem chave de mestre neste navegador: somente a cópia local pode ser
          removida.
        </p>
      )}
      <p>
        {scope === "shared"
          ? "O link do jogador deixará de funcionar. O histórico compartilhado da ficha também será excluído. Backups já salvos no GitHub não serão apagados."
          : "O link do jogador, se existir, continuará funcionando. A chave de mestre local será preservada."}
      </p>
      <label>
        Digite <strong>{agent.name}</strong> para confirmar
        <input
          autoComplete="off"
          disabled={busy}
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="wizard-actions">
        <button disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button
          className="danger"
          disabled={busy || confirmation !== agent.name}
          onClick={() => void remove()}
        >
          {busy ? "Excluindo…" : "Confirmar exclusão"}
        </button>
      </div>
    </Modal>
  );
}
