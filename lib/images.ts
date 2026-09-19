const MAX_SOURCE_BYTES = 8_000_000;
const MAX_DATA_URL_LENGTH = 2_000_000;
const MAX_WIDTH = 1200;
const MAX_HEIGHT = 1600;

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível abrir esta imagem."));
    };
    image.src = url;
  });
}

export async function preparePortrait(file: File) {
  if (!file.type.startsWith("image/"))
    throw new Error("Escolha uma imagem PNG, JPEG ou WebP.");
  if (file.size > MAX_SOURCE_BYTES)
    throw new Error("A imagem original deve ter no máximo 8 MB.");

  const image = await loadImage(file);
  const scale = Math.min(
    1,
    MAX_WIDTH / image.naturalWidth,
    MAX_HEIGHT / image.naturalHeight,
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("O navegador não conseguiu preparar a imagem.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.86, 0.74, 0.62]) {
    const value = canvas.toDataURL("image/webp", quality);
    if (value.length <= MAX_DATA_URL_LENGTH) return value;
  }
  throw new Error(
    "A imagem continuou muito grande após a otimização. Escolha outra imagem.",
  );
}
