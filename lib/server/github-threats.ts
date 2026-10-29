import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { parseThreatImport, threatCatalog } from "../threats";
import {
  customThreatId,
  githubBranch,
  githubOwnerId,
  githubRepository,
  githubRepositoryId,
  libraryPath,
  parseThreatLibrary,
  type ThreatLibrary,
} from "../threat-library";
import { SyncError } from "./github-session";
import type { ThreatArtwork } from "../threat-art";

const repo = `/repos/${githubRepository}`;
export type GitClient = <T>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;

export function githubClient(
  token: string,
  transport: typeof fetch = fetch,
): GitClient {
  return async <T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> => {
    let response: Response;
    try {
      response = await transport(`https://api.github.com${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2026-03-10",
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new SyncError(
        "Não foi possível confirmar a resposta do GitHub. Atualize o catálogo antes de tentar novamente.",
        502,
      );
    }
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: "A autorização expirou ou foi revogada. Conecte o GitHub novamente.",
        403: "O GitHub recusou a gravação. Confira a permissão Contents: Read and write e o limite de requisições.",
        404: "O repositório não está disponível para esta autorização.",
        409: "O catálogo mudou. Atualize o catálogo e confira sua edição antes de salvar novamente.",
        422: "O GitHub recusou a atualização. Confira as permissões e as regras da branch main.",
        429: "O GitHub recebeu muitas solicitações. Aguarde um pouco e tente novamente.",
      };
      throw new SyncError(
        messages[response.status] ||
          "O GitHub está temporariamente indisponível.",
        response.status,
      );
    }
    return response.json() as Promise<T>;
  };
}

export async function verifyGithubOwner(client: GitClient) {
  const user = await client<{ id: number; login: string }>("/user");
  if (user.id !== githubOwnerId)
    throw new SyncError(
      "Somente o proprietário deste Fênix pode publicar no catálogo.",
      403,
    );
  const repository = await client<{
    id: number;
    permissions?: { push?: boolean };
    private: boolean;
  }>(repo);
  if (repository.id !== githubRepositoryId || !repository.permissions?.push)
    throw new SyncError(
      "Autorize somente o repositório fenix-rpg com Contents: Read and write.",
      403,
    );
  return {
    id: user.id,
    login: user.login,
    publicRepository: !repository.private,
  };
}

export type LibrarySnapshot = {
  library: ThreatLibrary;
  fileSha: string;
  head: string;
  tree: string;
};
export async function readGithubLibrary(
  client: GitClient,
): Promise<LibrarySnapshot> {
  const ref = await client<{ object: { sha: string } }>(
    `${repo}/git/ref/heads/${githubBranch}`,
  );
  const head = ref.object.sha;
  if (!/^[a-f0-9]{40}$/.test(head))
    throw new SyncError("Resposta inválida do GitHub.", 502);
  const [commit, file] = await Promise.all([
    client<{ tree: { sha: string } }>(`${repo}/git/commits/${head}`),
    client<{ content: string; sha: string; encoding: string; size: number }>(
      `${repo}/contents/${libraryPath}?ref=${head}`,
    ),
  ]);
  if (file.size > 2_000_000)
    throw new SyncError("Catálogo acima do limite de 2 MB.", 413);
  const encoded =
    file.encoding === "base64"
      ? file
      : await client<{ content: string; encoding: string }>(
          `${repo}/git/blobs/${file.sha}`,
        );
  if (encoded.encoding !== "base64")
    throw new SyncError("O catálogo no GitHub não pôde ser lido.", 502);
  try {
    const library = parseThreatLibrary(
      JSON.parse(Buffer.from(encoded.content, "base64").toString("utf8")),
    );
    return { library, fileSha: file.sha, head, tree: commit.tree.sha };
  } catch {
    throw new SyncError(
      "O catálogo no GitHub precisa de revisão. Nenhum arquivo foi substituído.",
      422,
    );
  }
}

const expected = z.string().regex(/^[a-f0-9]{40}$/);
export const changeSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("save"),
      expected,
      threats: z.array(z.unknown()).min(1).max(50),
      image: z.string().max(2_500_000).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("image"),
      expected,
      id: z.string().max(200),
      image: z.string().max(2_500_000).optional(),
      restore: z.boolean().optional(),
    })
    .strict(),
]);
export type ThreatChange = z.infer<typeof changeSchema>;

export async function prepareThreatImage(value: string) {
  if (!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw new SyncError("Escolha uma imagem PNG, JPEG ou WebP válida.");
  const bytes = Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
  if (bytes.length > 1_800_000)
    throw new SyncError("A imagem otimizada precisa ter até 1,8 MB.", 413);
  try {
    const source = sharp(bytes, {
      limitInputPixels: 16_000_000,
      animated: false,
      failOn: "warning",
    });
    const info = await source.metadata();
    if (info.format !== "webp" || (info.pages || 1) > 1) throw Error("format");
    const full = await source
      .clone()
      .rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await source
      .clone()
      .rotate()
      .resize(320, 320, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer({ resolveWithObject: true });
    const path = (buffer: Buffer) =>
      `/art/custom/${createHash("sha256").update(buffer).digest("hex")}.webp`;
    const art: ThreatArtwork = {
      src: path(full.data),
      thumbnail: path(thumb.data),
      width: full.info.width,
      height: full.info.height,
      thumbnailWidth: thumb.info.width,
      thumbnailHeight: thumb.info.height,
      bookId: "custom",
      page: 0,
      pdfPage: 0,
    };
    return {
      art,
      files: [
        { path: `public${art.src}`, data: full.data },
        { path: `public${art.thumbnail}`, data: thumb.data },
      ],
    };
  } catch {
    throw new SyncError(
      "Não foi possível processar essa imagem. Use outra imagem PNG, JPEG ou WebP.",
    );
  }
}

export async function publishThreatChange(
  client: GitClient,
  input: ThreatChange,
) {
  const changes =
    input.action === "save"
      ? parseThreatImport({ version: 1, threats: input.threats })
      : [];
  const bookIds = new Set(threatCatalog.map((t) => t.id));
  if (
    changes.some(
      (t) =>
        bookIds.has(t.id) ||
        !customThreatId.test(t.id) ||
        t.bookId !== "custom",
    ) ||
    new Set(changes.map((t) => t.id)).size !== changes.length
  )
    throw new SyncError(
      "As estatísticas das ameaças dos livros são preservadas. Edite apenas a imagem.",
    );
  if (input.image && changes.length > 1)
    throw new SyncError("Envie uma imagem por criatura.");
  if (input.action === "image" && !!input.image === !!input.restore)
    throw new SyncError("Escolha uma imagem ou restaure a original.");
  const image = input.image ? await prepareThreatImage(input.image) : null;
  let snapshot = await readGithubLibrary(client);
  const imageTrees: {
    path: string;
    mode: string;
    type: string;
    sha: string;
  }[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    if (snapshot.fileSha !== input.expected)
      throw new SyncError(
        "O catálogo mudou em outra janela. Clique em Atualizar catálogo e confira sua edição antes de salvar novamente.",
        409,
      );
    const next: ThreatLibrary = {
      version: 1,
      threats: [...snapshot.library.threats],
      art: { ...snapshot.library.art },
    };
    if (input.action === "save") {
      const byId = new Map(next.threats.map((t) => [t.id, t]));
      for (const t of changes) byId.set(t.id, t);
      next.threats = [...byId.values()];
    }
    const id = input.action === "image" ? input.id : changes[0].id;
    if (
      input.action === "image" &&
      !bookIds.has(id) &&
      !next.threats.some((t) => t.id === id)
    )
      throw new SyncError("Publique esta criatura antes de trocar sua imagem.");
    if (image) next.art[id] = image.art;
    if (input.action === "image" && input.restore) delete next.art[id];
    parseThreatLibrary(next);
    const content = `${JSON.stringify(next, null, 2)}\n`;
    if (Buffer.byteLength(content) > 2_000_000)
      throw new SyncError(
        "O catálogo atingiu o limite de 2 MB. Reduza os textos das criaturas.",
        413,
      );
    if (JSON.stringify(snapshot.library) === JSON.stringify(next))
      return { ...snapshot, changed: false };
    if (image && !imageTrees.length) {
      for (const file of new Map(
        image.files.map((f) => [f.path, f]),
      ).values()) {
        const blob = await client<{ sha: string }>(
          `${repo}/git/blobs`,
          "POST",
          { content: file.data.toString("base64"), encoding: "base64" },
        );
        imageTrees.push({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        });
      }
    }
    const dataBlob = await client<{ sha: string }>(
      `${repo}/git/blobs`,
      "POST",
      { content, encoding: "utf-8" },
    );
    const tree = await client<{ sha: string }>(`${repo}/git/trees`, "POST", {
      base_tree: snapshot.tree,
      tree: [
        ...imageTrees,
        { path: libraryPath, mode: "100644", type: "blob", sha: dataBlob.sha },
      ],
    });
    const label =
      input.action === "image"
        ? "Atualiza imagem de ameaça"
        : `Salva ${changes.length} ameaça(s)`;
    const commit = await client<{ sha: string }>(
      `${repo}/git/commits`,
      "POST",
      { message: `Fênix: ${label}`, tree: tree.sha, parents: [snapshot.head] },
    );
    try {
      await client(`${repo}/git/refs/heads/${githubBranch}`, "PATCH", {
        sha: commit.sha,
        force: false,
      });
      return {
        library: next,
        fileSha: dataBlob.sha,
        head: commit.sha,
        tree: tree.sha,
        changed: true,
      };
    } catch (error) {
      if (
        attempt === 0 &&
        error instanceof SyncError &&
        [409, 422].includes(error.status)
      ) {
        snapshot = await readGithubLibrary(client);
        continue;
      }
      throw error;
    }
  }
  throw new SyncError(
    "O repositório mudou. Atualize o catálogo antes de tentar novamente.",
    409,
  );
}
