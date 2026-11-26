"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { rpc } from "@/lib/share";
import { combatMasterKey } from "@/lib/shared-combat";
import { startVisiblePolling } from "@/lib/polling";
import {
  signed,
  projectedAverage,
  type Board,
  type Settings,
  type Delivery,
} from "@/lib/act-two";
import CampaignReputationBoard from "./act-board";
const Overlay = dynamic(() => import("./anomaly-overlay"), { ssr: false });
type Change = { id: string; before: number; after: number };
type RecordEntry = {
  id: string;
  kind: string;
  at: string;
  actor: string;
  detail: {
    reason?: string;
    target?: string;
    original?: string;
    changes?: Change[];
    before?: number;
    after?: number;
    npc?: string;
    practical?: string;
    support?: boolean;
    score?: number;
    scene?: string;
    gift?: string;
    preset?: string;
  };
};
type Target = {
  dossier: {
    text: string;
    preset: Settings["preset"];
    visual?: string;
    motif?: string;
  }[];
  marked: boolean;
  theme: boolean;
  status: string;
  received: string | null;
};
type PrivateBoard = Board & {
  revision: number;
  pressure: number;
  trigger: string;
  first: string | null;
  automatic: boolean;
  individual: boolean;
  targets: Record<string, Target>;
  history: RecordEntry[];
};
type Reply = Omit<PrivateBoard, "members"> & {
  members: Board["members"] | null;
};
export default function ActMaster({ id }: { id: string }) {
  const token = combatMasterKey(id),
    [board, setBoard] = useState<PrivateBoard | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sync, setSync] = useState(""),
    [tab, setTab] = useState("Equipe e reputação");
  const [ids, setIds] = useState<string[]>([]),
    [absolute, setAbsolute] = useState(false),
    [amount, setAmount] = useState("0"),
    [reason, setReason] = useState(""),
    [pressure, setPressure] = useState("60"),
    [npc, setNpc] = useState(""),
    [scene, setScene] = useState(""),
    [practical, setPractical] = useState(""),
    [support, setSupport] = useState(false),
    [score, setScore] = useState("");
  const [target, setTarget] = useState(""),
    [automatic, setAutomatic] = useState(true),
    [individual, setIndividual] = useState(false),
    [preset, setPreset] = useState<Settings["preset"]>("olhos"),
    [position, setPosition] = useState<Settings["position"]>("cantos"),
    [intensity, setIntensity] = useState(1),
    [duration, setDuration] = useState(5),
    [phrase, setPhrase] = useState(""),
    [preview, setPreview] = useState<Delivery | null>(null);
  const current = useRef<PrivateBoard | null>(null),
    seq = useRef(0),
    lock = useRef(false),
    live = useRef(false),
    refresh = useRef(() => {}),
    retry = useRef<{ key: string; id: string; revision: number } | null>(null);
  function apply(value: Reply | null) {
    const old = current.current;
    const next = value
      ? { ...value, members: value.members || old?.members || [] }
      : null;
    current.current = next;
    setBoard(next);
    setError("");
    setSync(new Date().toLocaleTimeString("pt-BR"));
    if (next && !old) {
      setTarget(next.first || next.members[0]?.id || "");
      setPressure(String(next.pressure));
      setAutomatic(next.automatic);
      setIndividual(next.individual);
    }
  }
  useEffect(() => {
    if (!token || process.env.NEXT_PUBLIC_FENIX_BACKEND !== "neon") return;
    live.current = true;
    async function read() {
      if (lock.current) return false;
      const n = ++seq.current;
      try {
        const v = await rpc<Reply | null>("fenix_act_master", {
          requested_campaign_id: id,
          master_token: token,
          command: { known: current.current?.version },
        });
        if (live.current && n === seq.current) apply(v);
        return !!v;
      } catch (e) {
        if (live.current && n === seq.current) setError((e as Error).message);
        throw e;
      }
    }
    refresh.current = () => {
      void read().catch(() => {});
    };
    const stop = startVisiblePolling(read, 3000);
    return () => {
      live.current = false;
      seq.current++;
      stop();
    };
  }, [id, token]);
  async function run(operation: string, values: Record<string, unknown> = {}) {
    if (lock.current || !current.current) return;
    const key = JSON.stringify([operation, values]);
    const r =
      retry.current?.key === key
        ? retry.current
        : { id: crypto.randomUUID(), revision: current.current.revision, key };
    retry.current = r;
    lock.current = true;
    seq.current++;
    setBusy(true);
    try {
      const v = await rpc<Reply>("fenix_act_master", {
        requested_campaign_id: id,
        master_token: token,
        operation,
        command: {
          ...values,
          id: r.id,
          revision: r.revision,
          known: current.current.version,
        },
      });
      if (live.current) apply(v);
      retry.current = null;
    } catch (e) {
      if (live.current) setError((e as Error).message);
      if ([400, 403, 409].includes((e as { status: number }).status))
        retry.current = null;
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  if (!board) return error ? <p role="status">{error}</p> : null;
  const name = (id?: string | null) =>
      board.members.find((m) => m.id === id)?.name || "",
    sel = board.targets[target],
    dossier = sel?.dossier || [],
    settings: Settings = {
      preset,
      position,
      intensity,
      text: phrase.trim(),
      motif: dossier[intensity - 1]?.motif,
    };
  const average = projectedAverage(board.members, ids, +amount, absolute),
    valid =
      amount.trim() !== "" &&
      Number.isInteger(+amount) &&
      Math.abs(+amount) <= (absolute ? 100 : 200);
  const p = board.pressure,
    stage =
      p <= 20
        ? "Esperança predominante"
        : p <= 40
          ? "Vínculos preservados"
          : p <= 60
            ? "Culpa e isolamento"
            : p <= 80
              ? "Sofrimento crescente"
              : p < 100
                ? "Vulnerabilidade grave"
                : "Ponto de crise";
  return (
    <section className="act-master">
      <h2>Central do Ato II</h2>
      <nav aria-label="Abas do ato">
        {["Equipe e reputação", "Melancolia e anomalias", "Histórico"].map(
          (v) => (
            <button key={v} aria-pressed={v === tab} onClick={() => setTab(v)}>
              {v}
            </button>
          ),
        )}
      </nav>
      <p role="status">
        {error || "Sincronizado às " + sync}{" "}
        <button onClick={() => refresh.current()}>Atualizar</button>
      </p>
      <fieldset disabled={busy}>
        <legend>{tab}</legend>
        {tab === "Equipe e reputação" && (
          <>
            <CampaignReputationBoard board={board} />
            <h3>Ajustar reputação</h3>
            <label>
              Motivo{" "}
              <input
                value={reason}
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {board.members.map((m) => (
              <div className="act-member" key={m.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={ids.includes(m.id)}
                    onChange={(e) =>
                      setIds(
                        e.target.checked
                          ? [...ids, m.id]
                          : ids.filter((x) => x !== m.id),
                      )
                    }
                  />
                  {m.name}
                </label>
                {[-10, -5, -3, -1, 1, 3, 5, 10].map((d) => (
                  <button
                    key={d}
                    aria-label={m.name + " " + signed(d)}
                    onClick={() =>
                      void run("reputação", {
                        agents: [m.id],
                        delta: d,
                        reason,
                      })
                    }
                  >
                    {signed(d)}
                  </button>
                ))}
              </div>
            ))}
            <label>
              Tipo de ajuste{" "}
              <select
                value={absolute ? "valor" : "ajuste"}
                onChange={(e) => setAbsolute(e.target.value === "valor")}
              >
                <option value="ajuste">Somar ou subtrair</option>
                <option value="valor">Definir valor</option>
              </select>
            </label>
            <label>
              Valor{" "}
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <p>
              Média após o ajuste{" "}
              {valid && average !== null ? signed(average, 1) : "—"}
            </p>
            <button
              disabled={!ids.length || !valid}
              onClick={() =>
                void run("reputação", {
                  agents: ids,
                  [absolute ? "value" : "delta"]: +amount,
                  reason,
                })
              }
            >
              Aplicar aos selecionados ({ids.length})
            </button>
          </>
        )}
        {tab === "Melancolia e anomalias" && (
          <>
            <h3>Melancolia da cidade</h3>
            <p>
              <strong>{p} / 100</strong> · {stage}
            </p>
            <progress aria-label="Melancolia da cidade" max={100} value={p} />
            <div>
              {[-5, -3, -1, 1, 3, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => void run("melancolia", { delta: d, reason })}
                >
                  {signed(d)}
                </button>
              ))}
            </div>
            <label>
              Motivo{" "}
              <input
                value={reason}
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <label>
              Valor manual{" "}
              <input
                type="number"
                value={pressure}
                onChange={(e) => setPressure(e.target.value)}
              />
            </label>
            <button
              disabled={
                !pressure.trim() ||
                !Number.isInteger(+pressure) ||
                +pressure < 0 ||
                +pressure > 100
              }
              onClick={() =>
                void run("melancolia", { value: +pressure, reason })
              }
            >
              Definir Melancolia
            </button>
            <h3>Registrar ajuda a NPC</h3>
            <label>
              NPC{" "}
              <input
                value={npc}
                maxLength={120}
                onChange={(e) => setNpc(e.target.value)}
              />
            </label>
            <label>
              Cena ou missão{" "}
              <input
                value={scene}
                maxLength={120}
                onChange={(e) => setScene(e.target.value)}
              />
            </label>
            <label>
              Ajuda prática{" "}
              <input
                value={practical}
                maxLength={300}
                onChange={(e) => setPractical(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={support}
                onChange={(e) => setSupport(e.target.checked)}
              />
              Houve conversa de acolhimento
            </label>
            <label>
              Diplomacia{" "}
              <input
                type="number"
                value={score}
                onChange={(e) => setScore(e.target.value)}
              />
            </label>
            <button
              disabled={
                !npc.trim() ||
                !scene.trim() ||
                (support && (!score.trim() || !Number.isInteger(+score)))
              }
              onClick={() =>
                void run("npc", {
                  npc,
                  scene,
                  practical,
                  support,
                  score: score ? +score : null,
                })
              }
            >
              Confirmar ajuda (
              {support && +score >= 15
                ? +score >= 25
                  ? "−5"
                  : +score >= 20
                    ? "−3"
                    : "−1"
                : "0"}{" "}
              Melancolia)
            </button>
            <h3>Primeiro uso de presente</h3>
            <p role="status">
              Gatilho {board.trigger}
              {board.first ? " · " + name(board.first) : ""}
            </p>
            <label>
              <input
                type="checkbox"
                checked={automatic}
                onChange={(e) => setAutomatic(e.target.checked)}
              />
              Indício automático de 4 segundos
            </label>
            <label>
              <input
                type="checkbox"
                checked={individual}
                onChange={(e) => setIndividual(e.target.checked)}
              />
              Primeiro uso por personagem
            </label>
            <button
              onClick={() => void run("armar", { automatic, individual })}
            >
              {board.trigger === "desarmado"
                ? "Armar gatilho"
                : "Rearmar gatilho"}
            </button>
            <button onClick={() => void run("desarmar")}>Desarmar</button>
            <h3>Manifestação dirigida</h3>
            <label>
              Agente{" "}
              <select
                aria-label="Agente"
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setPhrase("");
                  setPreview(null);
                }}
              >
                {board.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            {sel && (
              <p>
                {sel.marked ? "Marcado" : "Sem marca"} · {sel.status}
                {sel.received
                  ? " · Recebido às " +
                    new Date(sel.received).toLocaleTimeString("pt-BR")
                  : ""}
                {sel.theme ? " · Sombra ativa" : ""}
              </p>
            )}
            <label>
              Dossiê do agente{" "}
              <select
                aria-label="Dossiê do agente"
                key={target}
                defaultValue=""
                onChange={(e) => {
                  const i = +e.target.value;
                  setIntensity(i + 1);
                  setPhrase(dossier[i].text);
                  setPreset(dossier[i].preset);
                  setDuration(5);
                }}
              >
                <option value="" disabled>
                  Escolher momento
                </option>
                {dossier.map((d, i) => (
                  <option key={i} value={i}>
                    {["I · Indício", "II · Intrusão", "III · Confronto"][i]} ·{" "}
                    {d.text}
                  </option>
                ))}
              </select>
            </label>
            {dossier[intensity - 1]?.visual && (
              <p>{dossier[intensity - 1].visual}</p>
            )}
            <label>
              Efeito{" "}
              <select
                aria-label="Efeito"
                value={preset}
                onChange={(e) => {
                  setPreset(e.target.value as Settings["preset"]);
                  if (!duration) setDuration(5);
                }}
              >
                {Object.entries({
                  indicio: "Vinheta",
                  olhos: "Olhar",
                  maos: "Mãos",
                  ruido: "Interferência",
                  pergunta: "Pergunta",
                }).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Posição{" "}
              <select
                aria-label="Posição"
                value={position}
                onChange={(e) =>
                  setPosition(e.target.value as Settings["position"])
                }
              >
                {["cantos", "lateral", "topo"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Intensidade{" "}
              <select
                aria-label="Intensidade"
                value={intensity}
                onChange={(e) => setIntensity(+e.target.value)}
              >
                {[1, 2, 3].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Duração{" "}
              <select
                aria-label="Duração"
                value={duration}
                onChange={(e) => setDuration(+e.target.value)}
              >
                {Array.from({ length: 11 }, (_, i) => i + 2).map((v) => (
                  <option key={v} value={v}>
                    {v} segundos
                  </option>
                ))}
                {preset === "pergunta" && (
                  <option value={0}>Até dispensar</option>
                )}
              </select>
            </label>
            <label>
              Pergunta ou frase{" "}
              <textarea
                maxLength={400}
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
              />
            </label>
            <button
              onClick={() =>
                setPreview({
                  id: crypto.randomUUID(),
                  settings,
                  deadline: duration ? Date.now() + duration * 1000 : null,
                })
              }
            >
              Prévia local
            </button>
            <button
              disabled={!sel}
              onClick={() =>
                void run("enviar", { target, ...settings, duration })
              }
            >
              Enviar ao agente
            </button>
            <button
              disabled={!sel}
              onClick={() => void run("tema", { target, intensity })}
            >
              Ativar sombra persistente
            </button>
            <button
              disabled={!sel}
              onClick={() => void run("encerrar", { target })}
            >
              Encerrar efeito
            </button>
            <button
              disabled={!sel}
              onClick={() => void run("restaurar", { target })}
            >
              Restaurar ficha
            </button>
            {preview && (
              <Overlay
                preview
                effect={preview}
                theme={0}
                reduced={false}
                dismiss={() => setPreview(null)}
              />
            )}
          </>
        )}
        {tab === "Histórico" && (
          <ol className="act-history">
            {board.history.map((h) => (
              <li key={h.id}>
                <strong>{h.kind}</strong> ·{" "}
                {new Date(h.at).toLocaleString("pt-BR")} ·{" "}
                {name(h.actor) || h.actor} {name(h.detail.target)}{" "}
                {h.detail.reason} {h.detail.preset} {h.detail.gift}
                {h.detail.changes?.map((c) => (
                  <span key={c.id}>
                    {name(c.id)} · {signed(c.before)} → {signed(c.after)}
                  </span>
                ))}
                {h.detail.before !== undefined && (
                  <span>
                    {h.detail.before} → {h.detail.after}
                  </span>
                )}
                {h.detail.npc && (
                  <span>
                    {h.detail.npc} · {h.detail.scene} · {h.detail.practical} ·{" "}
                    {h.detail.support ? "Com acolhimento" : "Sem acolhimento"} ·
                    Diplomacia {h.detail.score ?? "—"}
                  </span>
                )}
                {h.kind === "reputação" &&
                  !board.history.some((x) => x.detail.original === h.id) && (
                    <button
                      onClick={() => void run("desfazer", { original: h.id })}
                    >
                      Desfazer ajuste
                    </button>
                  )}
              </li>
            ))}
          </ol>
        )}
      </fieldset>
    </section>
  );
}
