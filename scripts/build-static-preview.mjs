// Gera a previa estatica do projeto depois do `next build`.
//
// Contexto: o projeto roda em Node (rotas de API com cookies, Github OAuth e
// Supabase), entao `output: "export"` nao se aplica e o Next so produz
// `.next/`. Este script aproveita o HTML que o proprio Next ja prerenderizou
// (`.next/server/app/**/*.html`) e monta as pastas de saida estatica usadas
// pela previa: `out/` (padrao do Next export) e `dist/` e `build/` (nomes
// alternativos verificados pelo gerador de previa).
//
// Nada e removido: `.next/` continua intacto e e o que a Vercel consome.
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const nextDir = path.join(root, ".next");
const serverApp = path.join(nextDir, "server", "app");
const outDir = path.join(root, "out");
const mirrorDirs = [path.join(root, "dist"), path.join(root, "build")];

async function findHtml(dir) {
  const found = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findHtml(full)));
    } else if (entry.name.endsWith(".html")) {
      found.push(full);
    }
  }
  return found;
}

// Converte o caminho do arquivo .next/server/app em rota da aplicacao.
// `.next/server/app/ameacas.html` -> `/ameacas`
// `.next/server/app/ameacas/index.html` -> `/ameacas`
// `.next/server/app/index.html` -> `/`
function routeFromHtml(file) {
  let rel = path.relative(serverApp, file).split(path.sep).join("/");
  rel = rel.replace(/\.html$/, "");
  rel = rel.replace(/\/index$/, "");
  // Rotas dinamicas (ex.: agentes/[id]) sao renderizadas no servidor e nao
  // possuem equivalente estatico; ficam de fora da previa.
  if (rel.includes("[")) return null;
  if (rel === "index") return "/";
  return `/${rel}`;
}

if (!existsSync(serverApp)) {
  console.warn(
    "[preview] .next/server/app ausente: rode `next build` antes deste script. A previa nao foi montada.",
  );
  process.exit(0);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const htmlFiles = await findHtml(serverApp);
const copied = [];
for (const file of htmlFiles) {
  const route = routeFromHtml(file);
  if (!route || route === "/_not-found") continue;
  const target =
    route === "/"
      ? path.join(outDir, "index.html")
      : path.join(outDir, route.replace(/^\//, ""), "index.html");
  await mkdir(path.dirname(target), { recursive: true });
  await cp(file, target);
  copied.push(route);
}

const notFound = path.join(serverApp, "_not-found.html");
if (existsSync(notFound)) {
  await cp(notFound, path.join(outDir, "404.html"));
}

if (existsSync(path.join(nextDir, "static"))) {
  await cp(path.join(nextDir, "static"), path.join(outDir, "_next", "static"), {
    recursive: true,
  });
}

if (existsSync(path.join(root, "public"))) {
  await cp(path.join(root, "public"), outDir, { recursive: true });
}

const indexFile = path.join(outDir, "index.html");
if (!existsSync(indexFile)) {
  console.error(
    "[preview] nenhuma pagina estatica encontrada em .next/server/app; a previa nao pode ser montada.",
  );
  process.exit(0);
}

const html = await readFile(indexFile, "utf8");
if (!/<div id="__next"|id="__next"|<body/.test(html)) {
  console.warn("[preview] out/index.html parece incompleto; confira o build.");
}

// Espelha a mesma previa em dist/ e build/ para o gerador encontrar a entrada.
for (const dir of mirrorDirs) {
  await rm(dir, { recursive: true, force: true });
  await cp(outDir, dir, { recursive: true });
}

console.log(
  `[preview] previa pronta em out/ (${copied.length} rota(s): ${copied.join(", ")}), espelhada em dist/ e build/.`,
);
