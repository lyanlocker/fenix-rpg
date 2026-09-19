"use client";
import { Dices } from "lucide-react";
import { attributeNames } from "@/lib/creation";
import { conditionByName } from "@/lib/conditions";
import {
  attributes,
  resourceKeys,
  resourceLabels,
  skillAttributes,
  type Agent,
  type Resource,
} from "@/lib/rules";
import PortraitPicker from "./portrait-picker";

export default function CharacterOverview({
  agent,
  maximums,
  busy,
  onAttribute,
  onSkill,
  onPortrait,
}: {
  agent: Agent;
  maximums: Record<Resource, number>;
  busy: boolean;
  onAttribute: (key: (typeof attributes)[number]) => void;
  onSkill: (name: string) => void;
  onPortrait: (portrait: string) => Promise<void>;
}) {
  const skills = Object.entries(skillAttributes).sort(([left], [right]) => {
      const trained = (agent.skills[right] || 0) - (agent.skills[left] || 0);
      return trained || left.localeCompare(right, "pt-BR");
    }),
    powers = agent.inventory
      .filter((item) => item.kind === "Poder")
      .slice(0, 4);

  return (
    <section className="overview-card" aria-label="Resumo do personagem">
      <div className="overview-name">
        <p className="eyebrow">DOSSIÊ DO AGENTE</p>
        <h2>{agent.name}</h2>
        <p>
          {agent.className} · {agent.origin || "Origem não informada"}
          {agent.track ? ` · ${agent.track}` : ""}
        </p>
      </div>

      <div className="overview-left">
        <h3>Atributos</h3>
        <div className="overview-attributes">
          {attributes.map((key) => (
            <button
              key={key}
              disabled={busy}
              onClick={() => onAttribute(key)}
              aria-label={`Rolar ${attributeNames[key]}`}
            >
              <span>{attributeNames[key]}</span>
              <strong>{agent.attributes[key]}</strong>
              <small>{key}</small>
              <Dices size={15} />
            </button>
          ))}
        </div>
        <h3>Perícias</h3>
        <div className="overview-skills">
          {skills.map(([name, attribute]) => (
            <button
              key={name}
              disabled={busy}
              data-trained={(agent.skills[name] || 0) > 0 || undefined}
              onClick={() => onSkill(name)}
            >
              <span>{name}</span>
              <small>{attribute}</small>
              <strong>+{agent.skills[name] || 0}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className="overview-portrait">
        <PortraitPicker
          value={agent.portrait}
          name={agent.name}
          color={agent.color}
          hero
          onChange={onPortrait}
        />
      </div>

      <div className="overview-right">
        <div className="overview-level">
          <span>{agent.className === "Sobrevivente" ? "ESTÁGIO" : "NEX"}</span>
          <strong>
            {agent.className === "Sobrevivente" ? agent.stage : `${agent.nex}%`}
          </strong>
        </div>
        <div className="overview-resources">
          {resourceKeys(agent).map((key) => (
            <div key={key} className={key}>
              <span>{resourceLabels[key]}</span>
              <strong>
                {agent.resources[key]} <small>/ {maximums[key]}</small>
              </strong>
              <progress value={agent.resources[key]} max={maximums[key] || 1} />
            </div>
          ))}
        </div>
        <div className="overview-feature">
          <h3>Poderes em destaque</h3>
          {powers.length ? (
            powers.map((power) => (
              <article key={power.id}>
                <strong>{power.name}</strong>
                <p>{power.notes || "Consulte os efeitos na aba Poderes."}</p>
              </article>
            ))
          ) : (
            <p className="hint">Nenhum poder adicionado à ficha.</p>
          )}
        </div>
        {!!agent.conditions.length && (
          <div className="overview-conditions">
            <h3>Condições ativas</h3>
            {agent.conditions.map((name) => (
              <p key={name}>
                <strong>{name}</strong>
                <small>{conditionByName.get(name)?.description}</small>
              </p>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
