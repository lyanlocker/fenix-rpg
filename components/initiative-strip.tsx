"use client";
import { UserRound, EyeOff } from "lucide-react";
import Image from "next/image";
import type { Agent } from "@/lib/rules";
import type { Encounter } from "@/lib/model";

export default function InitiativeStrip({
  encounter,
  agents,
}: {
  encounter: Encounter;
  agents: Agent[];
}) {
  if (!encounter.participants.length) return null;
  return (
    <ol className="initiative-strip" aria-label="Ordem de iniciativa">
      {encounter.participants.map((p, index) => {
        const agent = agents.find((a) => a.id === p.agentId);
        const portrait = (
          p.face === "alternate" ? agent?.alternate?.face : agent
        )?.portrait;
        return (
          <li
            key={p.id}
            aria-current={encounter.active && encounter.turn === index}
          >
            <div className="initiative-avatar">
              {portrait ? (
                <Image
                  unoptimized
                  width={38}
                  height={38}
                  src={portrait}
                  alt=""
                />
              ) : (
                <UserRound size={24} />
              )}
              <span>
                {encounter.active && encounter.turn === index
                  ? "SUA VEZ"
                  : `INICIATIVA ${p.initiative}`}
              </span>
              {p.hidden && (
                <EyeOff size={14} aria-label="Oculto para jogadores" />
              )}
            </div>
            <strong>{p.name}</strong>
            <small>{p.conditions || "Sem condições"}</small>
          </li>
        );
      })}
    </ol>
  );
}
