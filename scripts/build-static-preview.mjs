// Monta uma previa estatica em out/ a partir das paginas que o Next ja
// prerenderizou. Nao remove nem desabilita nenhuma rota de servidor: o build
// continua gerando .next/ (usado pela Vercel) e apenas acrescenta a copia
// estatica usada pela previa do Editor.
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const nextDir = path.join(root, ".next");
const serverApp = path.join(nextDir, "server", "app");
const outDir = path.join(root, "out");

if (!existsSync(serverApp)) {
  console.warn("[preview] .next/server/app ausente; previa estatica ignorada.");
  process.exit(0);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const manifestPath = path.join(nextDir, "prerender-manifest.json");
let routes = [];
try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  routes = Object.keys(manifest.routes || {}).filter(
    (route) => route !== "/_not-found",
  );
} catch {
  routes = [];
}

if (routes.length === 0) routes = ["/"];

function htmlCandidates(route) {
  const clean = route.replace(/^\/+|\/+$/g, "");
  const base = path.join(serverApp, clean);
  return [
    path.join(base, "index.html"),
    `${base}.html`,
    path.join(base, "page.html"),
  ];
}

let copied = 0;
const missing = [];
for (const route of routes) {
  const candidate = htmlCandidates(route).find((file) =>
    existsSync(file),
  );
  if (!candidate) {
    missing.push(route);
    continue;
  }
  const target = path.join(outDir, route.replace(/^\/+|\/+$/g, ""), "index.html");
  await mkdir(path.dirname(target), { recursive: true });
  await cp(candidate, target);
  copied += 1;
}

const notFound = path.join(serverApp, "_not-found.html");
if (existsSync(notFound)) {
  await cp(notFound, path.join(outDir, "404.html"));
}

if (existsSync(path.join(nextDir, "static"))) {
  await cp(path.join(nextDir, "static"), path.join(outDir, "_next"), {
    recursive: true,
  });
}

if (existsSync(path.join(root, "public"))) {
  await cp(path.join(root, "public"), outDir, { recursive: true });
}

const indexFile = path.join(outDir, "index.html");
if (!existsSync(indexFile)) {
  await writeFile(
    indexFile,
    "<!doctype html><meta charset=\"utf-8\"><title>Fenix</title><p>Previa estatica nao gerada. Consulte o log do build.</p>",
  );
  console.warn("[preview] index.html ausente em out/ apos a montagem.");
  process.exit(0);
}

console.log(
  `[preview] out/ pronto: ${copied} pagina(s) estatica(s)` +
    (missing.length ? `, sem html local: ${missing.join(", ")}` : ""),
);
