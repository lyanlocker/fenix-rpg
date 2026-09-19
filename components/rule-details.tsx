import type { Item } from "@/lib/rules";
export default function RuleDetails({ item: i }: { item: Item }) {
  return (
    <div className="rule-details">
      <p className="hint">
        {[
          i.className,
          i.track,
          i.nex ? "NEX " + i.nex + "%" : i.stage ? "Estágio " + i.stage : "",
          i.element,
          i.circle !== undefined
            ? i.circle === 0
              ? "Manifestação primária"
              : i.circle + "º círculo"
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <details>
        <summary>Descrição e efeitos</summary>
        {i.source && (
          <p className="hint">
            {i.subtype || i.kind} · {i.source}
            {i.page ? " · PDF p. " + i.page : ""}
          </p>
        )}
        {i.kind === "Ritual" && i.circle === 0 && (
          <p>
            Manifestação primária: custa {i.element === "Medo" ? 2 : 1} de
            Sanidade, sem custo básico de PE. Evoluções podem acrescentar PE
            conforme a descrição.
          </p>
        )}
        {i.kind === "Ritual" && (
          <dl className="rule-metadata">
            {[
              ["Custo básico", i.cost + " PE"],
              ["Execução", i.execution],
              ["Alcance", i.range],
              ["Alvo / área", i.target],
              ["Duração", i.duration],
              ["Resistência", i.resistance],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>
        )}
        {i.requirements && (
          <p>
            <strong>Pré-requisitos:</strong> {i.requirements}
          </p>
        )}
        <p className="prose">{i.notes || "Sem descrição."}</p>
        {i.discente && (
          <section>
            <h4>Discente</h4>
            <p className="prose">{i.discente}</p>
          </section>
        )}
        {i.verdadeiro && (
          <section>
            <h4>Verdadeiro</h4>
            <p className="prose">{i.verdadeiro}</p>
          </section>
        )}
      </details>
    </div>
  );
}
