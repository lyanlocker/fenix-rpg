"use client";
import { useEffect, useRef } from "react";

export default function TvStatic() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d", { alpha: false });
    if (!canvas || !ctx) return;
    const tile = document.createElement("canvas");
    tile.width = 193;
    tile.height = 157;
    const ink = tile.getContext("2d");
    if (!ink) return;
    const image = ink.createImageData(tile.width, tile.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const grain = Math.floor(Math.random() * 256);
      image.data[i] = image.data[i + 1] = image.data[i + 2] = grain;
      image.data[i + 3] = 255;
    }
    ink.putImageData(image, 0, 0);
    const pattern = ctx.createPattern(tile, "repeat");
    if (!pattern) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer = 0;
    function paint() {
      if (!ctx || !canvas || !pattern) return;
      const x = Math.floor(Math.random() * tile.width),
        y = Math.floor(Math.random() * tile.height);
      ctx.setTransform(1, 0, 0, 1, -x, -y);
      ctx.fillStyle = pattern;
      ctx.fillRect(x, y, canvas.width, canvas.height);
      if (!motion.matches && !document.hidden)
        timer = window.setTimeout(paint, 90);
    }
    function restart() {
      clearTimeout(timer);
      if (!canvas || document.hidden) return;
      const scale = Math.min(0.65, 960 / innerWidth, 600 / innerHeight);
      canvas.width = Math.max(1, Math.round(innerWidth * scale));
      canvas.height = Math.max(1, Math.round(innerHeight * scale));
      paint();
    }
    restart();
    window.addEventListener("resize", restart);
    document.addEventListener("visibilitychange", restart);
    motion.addEventListener("change", restart);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", restart);
      document.removeEventListener("visibilitychange", restart);
      motion.removeEventListener("change", restart);
    };
  }, []);
  return (
    <div aria-hidden="true" className="act-static">
      <canvas ref={ref} />
      <i />
    </div>
  );
}
