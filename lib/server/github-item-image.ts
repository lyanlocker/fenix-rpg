import { githubRepository, githubBranch } from "../threat-library";
import { prepareThreatImage, type GitClient } from "./github-threats";
import { SyncError } from "./github-session";
export async function publishItemImage(client: GitClient, image: string) {
  const prepared = await prepareThreatImage(image),
    repo = `/repos/${githubRepository}`;
  const files = prepared.files.map((f) => ({
    ...f,
    path: f.path.replace("/art/custom/", "/art/items/"),
  }));
  const entries = [];
  for (const file of new Map(files.map((f) => [f.path, f])).values()) {
    const blob = await client<{ sha: string }>(`${repo}/git/blobs`, "POST", {
      content: file.data.toString("base64"),
      encoding: "base64",
    });
    entries.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const head = (
      await client<{ object: { sha: string } }>(
        `${repo}/git/ref/heads/${githubBranch}`,
      )
    ).object.sha;
    const base = await client<{ tree: { sha: string } }>(
      `${repo}/git/commits/${head}`,
    );
    const tree = await client<{ sha: string }>(`${repo}/git/trees`, "POST", {
      base_tree: base.tree.sha,
      tree: entries,
    });
    const commit = await client<{ sha: string }>(
      `${repo}/git/commits`,
      "POST",
      {
        message: "Fênix: imagem de ritual ou equipamento",
        tree: tree.sha,
        parents: [head],
      },
    );
    try {
      await client(`${repo}/git/refs/heads/${githubBranch}`, "PATCH", {
        sha: commit.sha,
        force: false,
      });
      return {
        image: `https://raw.githubusercontent.com/${githubRepository}/${commit.sha}/${files[0].path}`,
        commit: commit.sha,
      };
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
    "O repositório mudou. Tente enviar a imagem novamente.",
    409,
  );
}
