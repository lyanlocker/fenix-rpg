"use client";
import { useEffect, useState } from "react";
import { Flame, Maximize, UserRound, Dices } from "lucide-react";
import Image from "next/image";
import type { PresentationFrame } from "@/lib/presentation";

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
    bus.onmessage = (event) => {
      if (event.data?.type === "heartbeat") lastUpdate = Date.now();
      if (event.data?.type === "stop") {
        setFrame(null);
        setStatus("Transmissão encerrada");
      }
      if (event.data?.type === "frame" && event.data.frame) {
        lastUpdate = Date.now();
        setFrame(event.data.frame);
        setStatus("");
      }
    };
    bus.postMessage({ type: "ready" });
    const watchdog = setInterval(() => {
      if (Date.now() - lastUpdate > 12000) {
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
  return (
    <main className="presentation-stage">
      <header>
        <span>
          <Flame size={27} /> FÊNIX <small>2.0 / MESA AO VIVO</small>
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
          <div className="stage-participants">
            {frame.participants.map((p) => (
              <article
                key={p.id}
                className={p.id === frame.currentId ? "is-current" : ""}
              >
                <div className="stage-portrait">
                  {p.portrait ? (
                    <Image
                      unoptimized
                      fill
                      sizes="250px"
                      src={p.portrait}
                      alt={p.name}
                    />
                  ) : (
                    <UserRound size={70} strokeWidth={1} />
                  )}
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
