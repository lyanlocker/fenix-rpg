"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, ArrowRight } from "lucide-react";
import { useGame } from "./game-shell";
import CampaignEditor from "./campaign-editor";
import type { Campaign } from "@/lib/model";
export default function Campaigns() {
  const game = useGame(),
    [edit, setEdit] = useState<Campaign | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    c = game.state.campaigns.find((x) => x.id === selected);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SUAS MESAS</p>
          <h1>Campanhas</h1>
          <p>Organize os personagens e as anotações deste navegador.</p>
        </div>
        <button
          className="primary"
          onClick={() =>
            setEdit({
              id: crypto.randomUUID(),
              name: "",
              description: "",
              element: "Medo",
              notes: "",
              rules: "Básico",
            })
          }
        >
          <Plus size={17} />
          Nova campanha
        </button>
      </div>
      <div className="campaign-layout">
        <div>
          {game.state.campaigns.map((x) => (
            <button
              key={x.id}
              className="campaign-entry"
              onClick={() => setSelected(x.id)}
            >
              <strong>{x.name}</strong>
              <ArrowRight size={17} />
            </button>
          ))}
        </div>
        {c ? (
          <section className="panel">
            <h2>{c.name}</h2>
            <p className="prose">{c.description}</p>
            <button onClick={() => setEdit(c)}>Editar campanha</button>
            <h3>Personagens</h3>
            {game.state.agents
              .filter((a) => a.campaign_id === c.id)
              .map((a) => (
                <Link
                  className="campaign-agent"
                  key={a.id}
                  href={"/agentes/" + a.id}
                >
                  <span>
                    {a.name}
                    <small>{a.className}</small>
                  </span>
                  <ArrowRight size={17} />
                </Link>
              ))}
            <h3>Anotações</h3>
            <p className="prose">{c.notes || "Nenhuma anotação."}</p>
          </section>
        ) : (
          <section className="empty">
            <h2>Selecione uma campanha</h2>
            <p>As fichas continuam sendo o centro da sessão.</p>
          </section>
        )}
      </div>
      {edit && (
        <CampaignEditor
          campaign={edit}
          onClose={() => setEdit(null)}
          onSave={async (c) => {
            await game.save("campaigns", c);
            setSelected(c.id);
          }}
        />
      )}
    </div>
  );
}
