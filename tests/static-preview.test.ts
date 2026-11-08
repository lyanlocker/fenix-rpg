import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  access,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
test("static preview preserves the exact CSS and JavaScript URLs emitted by Next in all mirrors", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "fenix-preview-"));
  try {
    await mkdir(path.join(root, ".next/server/app"), { recursive: true });
    await mkdir(path.join(root, ".next/static/chunks"), { recursive: true });
    await writeFile(
      path.join(root, ".next/static/chunks/app.js"),
      "// fixture",
    );
    await writeFile(path.join(root, ".next/static/chunks/app.css"), "body{}");
    await writeFile(
      path.join(root, ".next/server/app/index.html"),
      '<body><link href="/_next/static/chunks/app.css"><script src="/_next/static/chunks/app.js"></script></body>',
    );
    execFileSync(
      process.execPath,
      [path.resolve("scripts/build-static-preview.mjs")],
      { cwd: root, stdio: "pipe" },
    );
    for (const directory of ["out", "dist", "build"]) {
      const html = await readFile(
        path.join(root, directory, "index.html"),
        "utf8",
      );
      for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g))
        await assert.doesNotReject(access(path.join(root, directory, url)));
    }
    await access(path.join(root, ".next/server/app/index.html"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
