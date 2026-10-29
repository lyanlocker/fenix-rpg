"use client";

/** The original stays on the device; only the resized WebP is sent to the server. */
export async function prepareImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw Error("Escolha uma imagem PNG, JPEG ou WebP.");
  if (file.size > 20_000_000) throw Error("Escolha uma imagem de até 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw Error(
        "A imagem tem resolução muito alta. Reduza para até 40 megapixels.",
      );
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Este navegador não conseguiu preparar a imagem.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/webp", 0.82);
    if (!data.startsWith("data:image/webp;") || data.length > 2_300_000)
      throw Error(
        "Não foi possível reduzir a imagem. Escolha uma imagem menor.",
      );
    return data;
  } finally {
    bitmap.close();
  }
}
