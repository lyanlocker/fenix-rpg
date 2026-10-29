"use client";
import { useEffect, useState } from "react";
import { Flame, Maximize, UserRound, Dices } from "lucide-react";
import Image from "next/image";
import type { PresentationFrame } from "@/lib/presentation";

function PublicPortrait({
  src,
  name,
  large = false,
}: {
  src: string;
  name: string;
  large?: boolean;
}) {
  const [failed, setFailed] = useState("");
  return src && failed !== src ? (
    <Image
      unoptimized
      fill
      sizes={large ? "(max-width: 650px) 90vw, 65vw" : "250px"}
      src={src}
      alt={name}
      loading={large ? "eager" : "lazy"}
      onError={() => setFailed(src)}
    />
  ) : (
    <UserRound size={large ? 120 : 70} strokeWidth={1} />
  );
}

/** Deliberately isolated from useGame/useStore and all Supabase clients. */
export default function PresentationStage() {
  const [frame, setFrame] = useState<PresentationFrame | null>(null);
  const [status, setStatus] = useState("Aguardando a mesa");
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!/^[a-f0-9-]{36}$/.test(id) || !("BroadcastChannel" in window)) {
      setStatus("Abra a apresentação pelo painel de combate");
      return;
    }
    const bus = new BroadcastChannel(`fenix-stage-${id}`);
    let lastUpdate = Date.now();
    let hasFrame = false;
    let ended = false;
    bus.onmessage = (event) => {
      if (ended) return;
      if (event.data?.type === "heartbeat") {
        lastUpdate = Date.now();
        if (!hasFrame) bus.postMessage({ type: "ready" });
      }
      if (event.data?.type === "stop") {
        ended = true;
        hasFrame = false;
        setFrame(null);
        setStatus("Transmissão encerrada");
      }
      if (event.data?.type === "frame" && event.data.frame) {
        hasFrame = true;
        lastUpdate = Date.now();
        setFrame(event.data.frame);
        setStatus("");
      }
    };
    bus.postMessage({ type: "ready" });
    const watchdog = setInterval(() => {
      if (!ended && Date.now() - lastUpdate > 12000) {
        hasFrame = false;
        setFrame(null);
        setStatus("Conexão com a mesa pausada");
      }
    }, 3000);
    return () => {
      clearInterval(watchdog);
      bus.close();
    };
  }, []);
  const current = frame?.participants.find((p) => p.id === frame.currentId);
  const spotlight = frame?.participants.find((p) => p.id === frame.spotlightId);
  return (
    <main className="presentation-stage">
      <header>
        <span>
          <Flame size={27} /> FÊNIX <small>2.1 / MESA AO VIVO</small>
        </span>
        <button
          aria-label="Tela cheia"
          onClick={() => {
            if (document.fullscreenElement)
              void document.exitFullscreen().catch(() => {});
            else
              void document.documentElement
                .requestFullscreen?.()
                .catch(() => {});
          }}
        >
          <Maximize size={18} />
        </button>
      </header>
      <div className="stage-heading">
        <p className="eyebrow">
          {frame
            ? `RODADA ${frame.round} · ${frame.active ? "EM CENA" : "PAUSA"}`
            : "ARQUIVOS DO IMPOSSÍVEL"}
        </p>
        <h1>{frame?.campaign || "Toda história deixa uma marca."}</h1>
      </div>
      {!frame ? (
        <div className="stage-wait">
          <Flame size={50} />
          <h2>{status}</h2>
          <p>O mestre controla o que aparece nesta tela.</p>
        </div>
      ) : (
        <>
          <section
            key={`${frame.currentId}-${frame.round}-${frame.active}`}
            className="stage-turn"
            aria-live="polite"
          >
            <span>
              {frame.active
                ? "TURNO ATUAL"
                : "A HISTÓRIA CONTINUA EM INSTANTES"}
            </span>
            <h2>
              {frame.active
                ? current?.name || "A mesa aguarda…"
                : "Combate pausado"}
            </h2>
          </section>
          {spotlight && (
            <section
              className="stage-spotlight"
              key={spotlight.id}
              aria-label={`Em destaque: ${spotlight.name}`}
              aria-live="polite"
            >
              <div className="stage-spotlight-art">
                <PublicPortrait
                  src={spotlight.portrait}
                  name={spotlight.name}
                  large
                />
              </div>
              <div className="stage-spotlight-caption">
                <span>EM DESTAQUE</span>
                <h2>{spotlight.name}</h2>
              </div>
            </section>
          )}
          <div
            className={`stage-participants ${spotlight ? "with-spotlight" : ""}`}
          >
            {frame.participants.map((p) => (
              <article
                key={p.id}
                className={p.id === frame.currentId ? "is-current" : ""}
              >
                <div className="stage-portrait">
                  <PublicPortrait
                    src={p.thumbnail || p.portrait}
                    name={p.name}
                  />
                </div>
                <h3>{p.name}</h3>
                <small>
                  {p.id === frame.currentId ? "SUA VEZ" : "EM CENA"}
                </small>
              </article>
            ))}
          </div>
          {frame.roll && (
            <section
              key={frame.roll.id}
              className="stage-roll"
              aria-live="polite"
            >
              <Dices size={28} />
              <div>
                <span>{frame.roll.name}</span>
                <h3>{frame.roll.label}</h3>
                <p>
                  {frame.roll.expression} · [{frame.roll.dice.join(", ")}]
                </p>
              </div>
              <strong>{frame.roll.total}</strong>
            </section>
          )}
        </>
      )}
      <footer>FÊNIX · A próxima decisão muda tudo.</footer>
    </main>
  );
}
