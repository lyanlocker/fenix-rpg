"use client";
import { UserRound, EyeOff } from "lucide-react";
import Image from "next/image";
import type { Agent } from "@/lib/rules";
import type { Encounter } from "@/lib/model";
import type { Threat } from "@/lib/threats";
import { participantPortrait } from "@/lib/participant-portrait";

export default function InitiativeStrip({
  encounter,
  agents,
  threats = [],
}: {
  encounter: Encounter;
  agents: Agent[];
  threats?: Threat[];
}) {
  if (!encounter.participants.length) return null;
  return (
    <ol className="initiative-strip" aria-label="Ordem de iniciativa">
      {encounter.participants.map((p, index) => {
        const picture = participantPortrait(p, agents, threats);
        const portrait = picture.thumbnail || picture.portrait;
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
