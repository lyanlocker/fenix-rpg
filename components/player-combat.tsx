"use client";
import { useEffect, useRef, useState } from "react";
import { Dices, Swords } from "lucide-react";
import { useGame } from "./game-shell";
import { Modal } from "./ui";
import CombatArena from "./combat-arena";
import {
  createPlayerCombatSync,
  setPlayerInitiative,
  submitCombatAction,
  type PlayerCombat as Combat,
} from "@/lib/shared-combat";
import { combatFace, type CombatCommand } from "@/lib/combat-actions";
import { rpc } from "@/lib/share";
import { threatArtwork } from "@/lib/threat-art";
import type { Agent } from "@/lib/rules";
import { startVisiblePolling } from "@/lib/polling";
export default function PlayerCombat({
  agent,
  token,
}: {
  agent: Agent;
  token: string;
}) {
  const game = useGame(),
    [combat, setCombat] = useState<Combat | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [portraits, setPortraits] = useState<Record<string, string>>({});
  const lock = useRef(false),
    request = useRef(0),
    opened = useRef<string | null>(null),
    combatRef = useRef(combat);
  combatRef.current = combat;
  useEffect(() => {
    let active = true,
      fetching = false,
      sync = createPlayerCombatSync(agent.id, token);
    async function refresh() {
      if (lock.current || fetching) return true;
      fetching = true;
      const version = request.current;
      try {
        const next = await sync();
        if (active && version === request.current && !lock.current) {
          if (next !== undefined) {
            setCombat(next);
            if (next && opened.current !== next.id) {
              opened.current = next.id;
              setOpen(true);
            }
            if (!next) {
              opened.current = null;
              setOpen(false);
            }
          }
          setError("");
        } else {
          sync = createPlayerCombatSync(agent.id, token);
          return true;
        }
        return !!combatRef.current || next !== undefined;
      } catch (reason) {
        if (active) setError((reason as Error).message);
        throw reason;
      } finally {
        fetching = false;
      }
    }
    const stop = startVisiblePolling(refresh, 3000, 15000);
    return () => {
      active = false;
      stop();
    };
  }, [agent.id, token]);
  const portraitKey =
      combat?.participants
        .map((p) => `${p.id}:${p.portraitVersion}:${p.threatId}`)
        .join("|") || "",
    cache = useRef<Record<string, { version: string; src: string }>>({});
  useEffect(() => {
    let active = true;
    const current = combatRef.current;
    if (!current) {
      setPortraits({});
      cache.current = {};
      return;
    }
    async function load() {
      const next: Record<string, string> = {};
      for (let offset = 0; offset < current!.participants.length; offset += 4) {
        await Promise.all(
          current!.participants.slice(offset, offset + 4).map(async (p) => {
            if (!p.isAgent) {
              const art = threatArtwork(
                p.threatId,
                game.threatLibrary.library.art,
              );
              next[p.id] = art?.thumbnail || art?.src || "";
              return;
            }
            const c = cache.current[p.id];
            if (c?.version === p.portraitVersion) {
              next[p.id] = c.src;
              return;
            }
            try {
              const src = await rpc<string>("fenix_combat_portrait", {
                requested_agent_id: agent.id,
                share_token: token,
                participant_id: p.id,
              });
              next[p.id] = /^data:image\/(png|jpeg|webp);base64,/.test(src)
                ? src
                : "";
              if (active)
                cache.current[p.id] = {
                  version: p.portraitVersion || "",
                  src: next[p.id],
                };
            } catch {
              next[p.id] = "";
            }
          }),
        );
      }
      if (active) setPortraits(next);
    }
    void load();
    return () => {
      active = false;
    };
  }, [portraitKey, agent.id, token, game.threatLibrary.library.art]);
  const mine = combat?.participants.find((p) => p.mine),
    face = mine ? combatFace(agent, { face: mine.face || "main" }) : agent;
  async function run(command?: CombatCommand) {
    if (!combat || lock.current) return;
    lock.current = true;
    request.current++;
    setBusy(true);
    setError("");
    window.dispatchEvent(
      new CustomEvent("fenix:combat-mutation", { detail: true }),
    );
    try {
      if (command) {
        const result = await submitCombatAction({
          agentId: agent.id,
          token,
          encounterId: combat.id,
          revision: combat.revision,
          command,
        });
        if (result.combat) setCombat(result.combat);
        if (result.agentPatch)
          game.mergeCombatAgents([{ id: agent.id, ...result.agentPatch }]);
      } else {
        const result = await setPlayerInitiative(agent.id, token, combat.id);
        setCombat(result.combat);
        if (result.roll)
          game.setNotice(
            `Iniciativa: ${result.roll.total} · ${result.roll.expression}`,
          );
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
      window.dispatchEvent(
        new CustomEvent("fenix:combat-mutation", { detail: false }),
      );
    }
  }
  if (!combat)
    return error ? (
      <p className="hint" role="status">
        Combate: {error}
      </p>
    ) : null;
  return (
    <>
      <aside className="arena-invitation" aria-live="polite">
        <Swords size={22} />
        <div>
          <strong>{combat.name}</strong>
          <small>
            {combat.active
              ? `Rodada ${combat.round} · ${combat.currentName}`
              : "Combate pausado"}
          </small>
        </div>
        <button className="primary" onClick={() => setOpen(true)}>
          Entrar no combate
        </button>
      </aside>
      {open && (
        <Modal
          title="Sala de combate"
          onClose={() => setOpen(false)}
          wide
          className="arena-modal"
        >
          {mine && !mine.initiativeRolled && (
            <button disabled={busy} onClick={() => void run()}>
              <Dices size={17} />
              Rolar minha iniciativa
            </button>
          )}
          <CombatArena
            combat={{ ...combat, portraits }}
            agent={face}
            busy={busy}
            error={error}
            onCommand={(c) => void run(c)}
          />
        </Modal>
      )}
    </>
  );
}
