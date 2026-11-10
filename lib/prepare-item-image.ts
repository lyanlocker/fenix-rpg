"use client";
import { itemImageLimit } from "./item-image-value";
export async function prepareItemImage(file: File) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 20_000_000
  )
    throw Error("Escolha uma imagem PNG, JPEG ou WebP de até 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw Error("Reduza a resolução para até 40 megapixels.");
    const canvas = document.createElement("canvas"),
      scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Não foi possível preparar a imagem.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.86, 0.72, 0.58]) {
      const value = canvas.toDataURL("image/webp", quality);
      if (
        value.startsWith("data:image/webp;") &&
        value.length <= itemImageLimit
      )
        return value;
    }
    throw Error("A imagem continua grande. Escolha uma imagem mais simples.");
  } finally {
    bitmap.close();
  }
}
