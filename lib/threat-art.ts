import raw from "./data/threat-art.json";

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
export function threatArtwork(id?: string): ThreatArtwork | undefined {
  return id && Object.hasOwn(artwork, id) ? artwork[id] : undefined;
}

export function threatArtId(threat: {
  id: string;
  artId?: string;
}): string | undefined {
  const id = threat.artId || threat.id;
  return threatArtwork(id) ? id : undefined;
}
