import raw from "./ritual-art.json";
import type { Item } from "./rules";
import type { ThreatArtwork } from "./threat-art";
import { bookCatalog, bookNames } from "./books";
import { normalize } from "./catalog";
import { validItemImage } from "./item-image-value";
export const ritualArtwork = raw as Record<string, ThreatArtwork>;
export type ItemArtworkValue = Pick<
  ThreatArtwork,
  "src" | "thumbnail" | "width" | "height"
> &
  Partial<
    Pick<
      ThreatArtwork,
      "bookId" | "page" | "pdfPage" | "thumbnailWidth" | "thumbnailHeight"
    >
  >;
const identity = (item: Item) => `${item.bookId || ""}:${normalize(item.name)}`;
const byName = new Map(
  bookCatalog
    .filter((i) => i.kind === "Ritual" && ritualArtwork[i.id])
    .map((i) => [identity(i), ritualArtwork[i.id]]),
);
export function itemArtwork(item: Item): ItemArtworkValue | undefined {
  if (item.image && validItemImage(item.image))
    return { src: item.image, thumbnail: item.image, width: 640, height: 640 };
  if (item.kind !== "Ritual") return undefined;
  const id = item.catalogId || item.id;
  return (
    (Object.hasOwn(ritualArtwork, id) ? ritualArtwork[id] : undefined) ||
    byName.get(identity(item))
  );
}
export function itemArtworkSource(art: ItemArtworkValue) {
  return art.bookId
    ? `Símbolo: ${bookNames[art.bookId] || art.bookId}, p. ${art.page} (PDF ${art.pdfPage}).`
    : "Imagem personalizada";
}
