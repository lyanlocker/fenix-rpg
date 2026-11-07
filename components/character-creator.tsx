"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useGame } from "./game-shell";
import {
  newAgent,
  maximums,
  attributes,
  resourceKeys,
  resourceLabels,
  skillAttributes,
  type Agent,
  type ClassName,
} from "@/lib/rules";
import {
  classGuide,
  originSkills,
  attributeNames,
  trainingLevels,
  creationStepError,
} from "@/lib/creation";
import CharacterOptions from "./character-options";
import { addBenefits, originSkillsFor } from "@/lib/books";
import PortraitPicker from "./portrait-picker";
export default function CharacterCreator() {
  const game = useGame(),
    router = useRouter(),
    [a, setA] = useState<Agent>(() => ({
      ...newAgent(""),
      attributes: { AGI: 1, FOR: 1, INT: 1, PRE: 1, VIG: 1 },
      skills: {},
    })),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const guide = classGuide[a.className],
    sum = Object.values(a.attributes).reduce((x, y) => x + y, 0),
    trained = Object.values(a.skills).filter((n) => n > 0).length;
  if (game.access.ready && game.access.isPlayer)
    return (
      <div className="page">
        <h1>Acesso restrito</h1>
        <p>O modo jogador não permite criar novas fichas.</p>
        {game.access.agentId && (
          <Link href={game.accessHref(`/agentes/${game.access.agentId}`)}>
            Voltar para minha ficha
          </Link>
        )}
      </div>
    );
  function next() {
    setError("");
    const validation = creationStepError(a, step);
    if (validation) return setError(validation);
    setStep(step + 1);
  }
  async function create() {
    const validation = [0, 1, 2, 3]
      .map((step) => creationStepError(a, step))
      .find(Boolean);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    try {
      await game.save("agents", {
        ...addBenefits(a),
        name: a.name.trim(),
        resources: maximums(a),
      });
      router.push("/agentes/" + a.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="page creator">
      <Link className="back" href="/">
        <ArrowLeft size={16} />
        Agentes
      </Link>
      <h1>Criar personagem</h1>
      <p>Uma escolha por vez. Você poderá editar a ficha depois.</p>
      <ol className="steps">
        {[
          "Conceito",
          "Classe e origem",
          "Atributos",
          "Perícias",
          "Revisão",
        ].map((s, i) => (
          <li
            key={s}
            className={i === step ? "current" : ""}
            aria-current={i === step ? "step" : undefined}
          >
            <span>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <section className="panel wizard-panel">
        <p className="eyebrow">ETAPA {step + 1} DE 5</p>
        <h2>
          {
            ["Conceito", "Classe e origem", "Atributos", "Perícias", "Revisão"][
              step
            ]
          }
        </h2>
        {step === 0 && (
          <div className="form-grid">
            <div className="span-all creator-portrait">
              <PortraitPicker
                compact
                value={a.portrait}
                name={a.name}
                color={a.color}
                onChange={(portrait) => setA({ ...a, portrait })}
              />
            </div>
            <label className="span-all">
              Nome do personagem
              <input
                autoFocus
                maxLength={100}
                value={a.name}
                onChange={(e) => setA({ ...a, name: e.target.value })}
              />
            </label>
            <label className="span-all">
              Conceito e história
              <textarea
                rows={5}
                value={a.notes}
                onChange={(e) => setA({ ...a, notes: e.target.value })}
                placeholder="Quem era antes do paranormal? Quem quer proteger?"
              />
            </label>
            <label>
              Campanha
              <select
                value={a.campaign_id || ""}
                onChange={(e) =>
                  setA({ ...a, campaign_id: e.target.value || null })
                }
              >
                <option value="">Sem campanha por enquanto</option>
                {game.state.campaigns.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Recursos
              <select
                value={a.determination ? "pd" : "san"}
                onChange={(e) =>
                  setA({ ...a, determination: e.target.value === "pd" })
                }
              >
                <option value="san">Vida, Esforço e Sanidade</option>
                <option value="pd">Vida e Determinação</option>
              </select>
            </label>
            <p className="hint span-all">
              Determinação é a variante de Sobrevivendo ao Horror. Combine a
              escolha com o mestre.
            </p>
          </div>
        )}
        {step === 1 && (
          <>
            <div className="class-options">
              {(Object.keys(classGuide) as ClassName[]).map((c) => (
                <button
                  key={c}
                  aria-pressed={a.className === c}
                  onClick={() =>
                    setA({
                      ...a,
                      className: c,
                      nex: c === "Sobrevivente" ? 0 : 5,
                      track: "",
                      trackId: undefined,
                    })
                  }
                >
                  <strong>{c}</strong>
                  <span>{classGuide[c].description}</span>
                </button>
              ))}
            </div>
            <div className="form-grid">
              <label>
                {a.className === "Sobrevivente" ? "Estágio" : "NEX"}
                <select
                  value={a.className === "Sobrevivente" ? a.stage : a.nex}
                  onChange={(e) =>
                    setA({
                      ...a,
                      ...(a.className === "Sobrevivente"
                        ? { stage: +e.target.value }
                        : {
                            nex: +e.target.value,
                            track: +e.target.value < 10 ? "" : a.track,
                          }),
                    })
                  }
                >
                  {(a.className === "Sobrevivente"
                    ? [1, 2, 3, 4, 5]
                    : Array.from({ length: 20 }, (_, i) =>
                        i === 19 ? 99 : (i + 1) * 5,
                      )
                  ).map((n) => (
                    <option key={n} value={n}>
                      {n}
                      {a.className === "Sobrevivente" ? "" : "%"}
                    </option>
                  ))}
                </select>
              </label>
              <CharacterOptions agent={a} onChange={setA} />
              <div className="help span-all">
                <strong>O que essa escolha muda?</strong>
                <p>{guide.skills}</p>
                <p>Proficiências: {guide.proficiencies}</p>
                <p>
                  Perícias da origem:{" "}
                  {(originSkills[a.origin] || originSkillsFor(a)).join(" e ") ||
                    "defina com o mestre"}
                  .
                </p>
                <small>
                  Livro de Regras, criação de personagem. Poderes e
                  pré-requisitos serão registrados e conferidos na ficha.
                </small>
              </div>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <p>
              Distribua os atributos conforme as regras da sua mesa. O mestre
              define os valores e a quantidade de pontos, em qualquer NEX.
            </p>
            <div className="attribute-edit">
              {attributes.map((k) => (
                <label key={k}>
                  {attributeNames[k]}
                  <input
                    aria-label={attributeNames[k]}
                    type="number"
                    min={0}
                    step={1}
                    value={a.attributes[k]}
                    onChange={(e) =>
                      setA({
                        ...a,
                        attributes: {
                          ...a.attributes,
                          [k]: +e.target.value,
                        },
                      })
                    }
                  />
                  <small>{k}</small>
                </label>
              ))}
            </div>
            <p className="help">
              Soma: <b>{sum}</b>. Distribuição definida pelo mestre.
            </p>
            <p className="hint">
              Atributo 0: 2d20, menor resultado. Nos demais, role a quantidade
              do atributo e use o maior.
            </p>
          </>
        )}
        {step === 3 && (
          <>
            <p>{guide.skills}</p>
            <div className="help">
              <p>
                {a.origin}:{" "}
                {(originSkills[a.origin] || originSkillsFor(a)).join(" e ") ||
                  "defina com o mestre"}
                .
              </p>
              <button
                onClick={() =>
                  setA({
                    ...a,
                    skills: {
                      ...a.skills,
                      ...Object.fromEntries(
                        (originSkills[a.origin] || originSkillsFor(a)).map(
                          (s) => [s, Math.max(a.skills[s] || 0, 5)],
                        ),
                      ),
                      ...(a.className === "Ocultista"
                        ? {
                            Ocultismo: Math.max(a.skills.Ocultismo || 0, 5),
                            Vontade: Math.max(a.skills.Vontade || 0, 5),
                          }
                        : {}),
                    },
                  })
                }
              >
                Aplicar perícias da origem
              </button>
            </div>
            <p>
              <b>{trained}</b> perícias treinadas. Escolha livremente os graus e
              a quantidade combinados com o mestre.
            </p>
            <div className="skill-picker">
              {Object.entries(skillAttributes).map(([s, k]) => (
                <label key={s}>
                  {s}
                  <small>{k}</small>
                  <select
                    aria-label={"Treinamento em " + s}
                    value={a.skills[s] || 0}
                    onChange={(e) =>
                      setA({
                        ...a,
                        skills: { ...a.skills, [s]: +e.target.value },
                      })
                    }
                  >
                    {trainingLevels.map((n) => (
                      <option value={n} key={n}>
                        {
                          [
                            "Destreinado",
                            "Treinado +5",
                            "Veterano +10",
                            "Expert +15",
                          ][n / 5]
                        }
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <h3>{a.name}</h3>
            <p>
              {a.className} · {a.origin} ·{" "}
              {a.className === "Sobrevivente"
                ? `Estágio ${a.stage}`
                : `NEX ${a.nex}%`}{" "}
              {a.track && `· ${a.track}`}
            </p>
            <div className="review-stats">
              {resourceKeys(a).map((k) => (
                <div key={k}>
                  <span>{resourceLabels[k]}</span>
                  <strong>{maximums(a)[k]}</strong>
                </div>
              ))}
            </div>
            <p>
              {trained} perícias treinadas · Defesa {10 + a.attributes.AGI}
            </p>
            <div className="help">
              <strong>Depois de criar</strong>
              <p>
                A ficha abre pronta para rolar atributos e perícias. Use a
                Biblioteca para adicionar armas ou crie seus próprios
                equipamentos, poderes e rituais.
              </p>
              <p>
                Recursos são calculados. Poderes de origem, classe e trilha,
                efeitos e progressão avançada ainda precisam de revisão manual.
              </p>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="wizard-actions">
          <button
            disabled={step === 0 || busy}
            onClick={() => {
              setError("");
              setStep(step - 1);
            }}
          >
            <ArrowLeft size={16} />
            Voltar
          </button>
          {step < 4 ? (
            <button className="primary" onClick={next}>
              Continuar
              <ArrowRight size={16} />
            </button>
          ) : (
            <button className="primary" disabled={busy} onClick={create}>
              {busy ? "Criando…" : "Criar e abrir ficha"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
