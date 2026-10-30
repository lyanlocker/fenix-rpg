import raw from "./data/threat-art.json";
import custom from "./data/threat-library.json";

export type ThreatArtwork = {
  src: string;
  thumbnail: string;
  width: number;
  height: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
  bookId: string;
  page: number;
  pdfPage: number;
};

const artwork = raw as Record<string, ThreatArtwork>;
export const threatArtCount = Object.keys(artwork).length;

/** Only curated local assets can be selected; imports cannot inject remote URLs. */
export function threatArtwork(
  id?: string,
  overrides: Record<string, ThreatArtwork> = custom.art,
): ThreatArtwork | undefined {
  if (id && Object.hasOwn(overrides, id)) return overrides[id];
  return id && Object.hasOwn(artwork, id) ? artwork[id] : undefined;
}

export function threatArtId(
  threat: {
    id: string;
    artId?: string;
  },
  overrides: Record<string, ThreatArtwork> = custom.art,
): string | undefined {
  if (Object.hasOwn(overrides, threat.id)) return threat.id;
  const id = threat.artId || threat.id;
  return threatArtwork(id, overrides) ? id : undefined;
}
