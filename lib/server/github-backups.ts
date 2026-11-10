import {
  backupBranch,
  backupPath,
  backupPathPattern,
  backupSchema,
  type BackupListing,
  type EncryptedBackup,
} from "../backup-format";
import { githubRepository } from "../threat-library";
import type { GitClient } from "./github-threats";
import { SyncError } from "./github-session";
const repo = `/repos/${githubRepository}`;
const marker = "fenix-backup-format.json";
async function snapshot(client: GitClient) {
  let head: string;
  try {
    head = (
      await client<{ object: { sha: string } }>(
        `${repo}/git/ref/heads/${backupBranch}`,
      )
    ).object.sha;
  } catch (e) {
    if (e instanceof SyncError && e.status === 404) return null;
    throw e;
  }
  const commit = await client<{ tree: { sha: string } }>(
    `${repo}/git/commits/${head}`,
  );
  const tree = await client<{
    truncated?: boolean;
    tree: { path: string; sha: string; size?: number; type: string }[];
  }>(`${repo}/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated)
    throw new SyncError(
      "O arquivo de backups excedeu o limite de leitura. Nenhuma cópia foi alterada.",
      413,
    );
  if (!tree.tree.some((x) => x.path === marker && x.type === "blob"))
    throw new SyncError(
      "A branch fenix-backups já existe com outro conteúdo. Nenhum arquivo foi substituído.",
      409,
    );
  return {
    head,
    tree: commit.tree.sha,
    files: tree.tree
      .filter((x) => x.type === "blob" && backupPathPattern.test(x.path))
      .map((x) => ({ path: x.path, sha: x.sha, size: x.size || 0 })),
  };
}
export async function listGithubBackups(
  client: GitClient,
): Promise<BackupListing[]> {
  return ((await snapshot(client))?.files || []).sort((a, b) =>
    b.path.localeCompare(a.path),
  );
}
export async function readGithubBackup(client: GitClient, path: string) {
  if (!backupPathPattern.test(path)) throw new SyncError("Backup inválido.");
  const state = await snapshot(client),
    file = state?.files.find((x) => x.path === path);
  if (!file) throw new SyncError("Backup não encontrado.", 404);
  if (file.size > 3_800_000)
    throw new SyncError("Backup acima do limite de leitura.", 413);
  const blob = await client<{ encoding: string; content: string }>(
    `${repo}/git/blobs/${file.sha}`,
  );
  if (blob.encoding !== "base64")
    throw new SyncError("Formato do backup inválido.");
  return backupSchema.parse(
    JSON.parse(Buffer.from(blob.content, "base64").toString("utf8")),
  );
}
export async function saveGithubBackup(
  client: GitClient,
  raw: EncryptedBackup,
) {
  const backup = backupSchema.parse(raw),
    path = backupPath(backup),
    content = JSON.stringify(backup) + "\n";
  const blob = await client<{ sha: string }>(`${repo}/git/blobs`, "POST", {
    content,
    encoding: "utf-8",
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await snapshot(client),
      existing = state?.files.find((x) => x.path === path);
    if (existing) {
      if (existing.sha !== blob.sha)
        throw new SyncError(
          "Já existe outro backup com esse identificador.",
          409,
        );
      return { path, branch: backupBranch, commit: state!.head };
    }
    if ((state?.files.length || 0) >= 500)
      throw new SyncError(
        "Há 500 versões no arquivo. Baixe suas cópias antes de organizar os backups no GitHub.",
        413,
      );
    const tree = await client<{ sha: string }>(`${repo}/git/trees`, "POST", {
      ...(state ? { base_tree: state.tree } : {}),
      tree: [
        { path, mode: "100644", type: "blob", sha: blob.sha },
        ...(!state
          ? [
              {
                path: marker,
                mode: "100644",
                type: "blob",
                content:
                  JSON.stringify({
                    format: "fenix-encrypted-sheet",
                    version: 1,
                  }) + "\n",
              },
              {
                path: "vercel.json",
                mode: "100644",
                type: "blob",
                content:
                  JSON.stringify({ git: { deploymentEnabled: false } }) + "\n",
              },
            ]
          : []),
      ],
    });
    const commit = await client<{ sha: string }>(
      `${repo}/git/commits`,
      "POST",
      {
        message: "Fênix: backup criptografado de ficha",
        tree: tree.sha,
        parents: state ? [state.head] : [],
      },
    );
    try {
      if (state)
        await client(`${repo}/git/refs/heads/${backupBranch}`, "PATCH", {
          sha: commit.sha,
          force: false,
        });
      else
        await client(`${repo}/git/refs`, "POST", {
          ref: `refs/heads/${backupBranch}`,
          sha: commit.sha,
        });
      return { path, branch: backupBranch, commit: commit.sha };
    } catch (e) {
      if (
        attempt < 2 &&
        e instanceof SyncError &&
        [409, 422].includes(e.status)
      )
        continue;
      throw e;
    }
  }
  throw new SyncError(
    "O arquivo recebeu outra atualização. Tente novamente.",
    409,
  );
}
