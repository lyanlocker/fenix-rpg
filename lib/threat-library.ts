import { z } from "zod";
import raw from "./data/threat-library.json";
import { parseThreatImport, threatCatalog, type Threat } from "./threats";
import type { ThreatArtwork } from "./threat-art";

export type ThreatLibrary = {
  version: 1;
  threats: Threat[];
  art: Record<string, ThreatArtwork>;
};
export const publishedThreatLibrary = raw as ThreatLibrary;
export const libraryPath = "lib/data/threat-library.json";
export const githubRepository = "lyanlocker/fenix-rpg";
export const githubOwnerId = 250854113;
export const githubRepositoryId = 1377507508;
export const githubBranch = "main";
export const customArtPath = /^\/art\/custom\/[a-f0-9]{64}\.webp$/;
export const customThreatId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/;
const size = z.number().int().min(1).max(1280);
const artSchema = z.object({
  src: z.string().regex(customArtPath),
  thumbnail: z.string().regex(customArtPath),
  width: size,
  height: size,
  thumbnailWidth: size.max(320),
  thumbnailHeight: size.max(320),
  bookId: z.literal("custom"),
  page: z.literal(0),
  pdfPage: z.literal(0),
});

/** Validate data from GitHub as data, never as paths or instructions. */
export function parseThreatLibrary(value: unknown): ThreatLibrary {
  const parsed = z
    .object({
      version: z.literal(1),
      threats: z.array(z.unknown()).max(1000),
      art: z.record(artSchema),
    })
    .parse(value);
  const threats = parseThreatImport({ version: 1, threats: parsed.threats });
  const bookIds = new Set(threatCatalog.map((t) => t.id));
  const ids = new Set<string>();
  for (const t of threats) {
    if (
      !customThreatId.test(t.id) ||
      bookIds.has(t.id) ||
      ids.has(t.id) ||
      t.bookId !== "custom"
    )
      throw Error("Catálogo personalizado inválido.");
    ids.add(t.id);
  }
  for (const id of Object.keys(parsed.art)) {
    if (!bookIds.has(id) && !ids.has(id))
      throw Error("Ilustração sem criatura correspondente.");
  }
  return { version: 1, threats, art: parsed.art };
}

/** Published entries supersede local copies; official statistics remain immutable. */
export function mergeThreatCatalog(local: Threat[], published: Threat[]) {
  return [
    ...new Map(
      [...local, ...published, ...threatCatalog].map((t) => [t.id, t]),
    ).values(),
  ];
}

/** Newly committed images can be viewed while Vercel builds their local URLs. */
export function libraryForPreview(
  library: ThreatLibrary,
  commit: string,
): ThreatLibrary {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error("Commit inválido.");
  return {
    ...library,
    art: Object.fromEntries(
      Object.entries(library.art).map(([id, art]) => [
        id,
        {
          ...art,
          src: `https://raw.githubusercontent.com/${githubRepository}/${commit}/public${art.src}`,
          thumbnail: `https://raw.githubusercontent.com/${githubRepository}/${commit}/public${art.thumbnail}`,
        },
      ]),
    ),
  };
}
