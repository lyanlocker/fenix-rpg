"use client";
import { signed, standing, type Board } from "@/lib/act-two";
export function ReputationMeter({ value }: { value: number }) {
  return (
    <div className="act-meter" aria-hidden="true">
      <i
        className={value < 0 ? "negative" : ""}
        style={{
          left: (value < 0 ? 50 + value / 2 : 50) + "%",
          width: Math.abs(value) / 2 + "%",
        }}
      />
    </div>
  );
}
export default function CampaignReputationBoard({ board }: { board: Board }) {
  return (
    <section className="act-board" aria-label="Reputação da equipe">
      <header>
        <p className="eyebrow">Chengyang · Ato II</p>
        <h2>{board.title}</h2>
        <p>O Peso da Devoção · Equipe de reforço policial</p>
      </header>
      <div className="act-total">
        <h3>Reputação da equipe</h3>
        {board.average === null ? (
          <p>Sem agentes</p>
        ) : (
          <>
            <strong>{signed(board.average, 1)}</strong> ·{" "}
            {standing(board.average)}
            <ReputationMeter value={board.average} />
          </>
        )}
      </div>
      <div className="act-grid">
        {board.members.map((m) => (
          <article key={m.id}>
            {m.portrait && <img alt="" src={m.portrait} loading="lazy" />}
            <h3>{m.name}</h3>
            <strong>{signed(m.value)}</strong> · {standing(m.value)}
            <ReputationMeter value={m.value} />
          </article>
        ))}
      </div>
    </section>
  );
}
