import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { bookCatalog } from "../lib/books";
import { itemArtwork, itemArtworkSource } from "../lib/item-art";
import raw from "../lib/ritual-art.json";
import regions from "../scripts/ritual-art-regions.json";

test("all published ritual symbols match their reviewed source mapping and intact WebP files", async () => {
  const manifest = raw as Record<string, (typeof raw)[keyof typeof raw]>;
  const catalog = new Map(bookCatalog.map((item) => [item.id, item]));
  const expected = new Set([
    ...regions.entries.map((r) => r.id),
    ...Object.keys(regions.aliases),
  ]);
  assert.deepEqual(new Set(Object.keys(manifest)), expected);
  const paths = new Map<
    string,
    { bytes: number; width: number; height: number; limit: number }
  >();
  for (const [id, art] of Object.entries(manifest)) {
    assert.equal(catalog.get(id)?.kind, "Ritual");
    assert.ok(art.pdfPage > 0 && art.page > 0);
    for (const [path, bytes, width, height, limit] of [
      [art.src, art.bytes, art.width, art.height, 960],
      [
        art.thumbnail,
        art.thumbnailBytes,
        art.thumbnailWidth,
        art.thumbnailHeight,
        256,
      ],
    ] as const) {
      assert.match(path, /^\/art\/rituals\/[a-f0-9]{20}\.webp$/);
      paths.set(path, { bytes, width, height, limit });
    }
  }
  for (const [alias, source] of Object.entries(regions.aliases)) {
    assert.deepEqual(manifest[alias], manifest[source]);
    assert.equal(manifest[alias].bookId, "05");
  }
  assert.deepEqual(
    new Set(await readdir("public/art/rituals")),
    new Set([...paths.keys()].map((p) => p.split("/").at(-1))),
  );
  for (const [path, expected] of paths) {
    const bytes = await readFile(`public${path}`);
    assert.equal(bytes.length, expected.bytes, path);
    assert.ok(
      path.endsWith(
        `${createHash("sha256").update(bytes).digest("hex").slice(0, 20)}.webp`,
      ),
      path,
    );
    const meta = await sharp(bytes).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, expected.width);
    assert.equal(meta.height, expected.height);
    assert.ok(Math.max(meta.width!, meta.height!) <= expected.limit, path);
  }
});

test("ritual images survive copying and legacy IDs; source labels identify the actual image source", () => {
  const base = bookCatalog.find(
    (item) =>
      item.kind === "Ritual" &&
      item.bookId === "01" &&
      item.name === "Eletrocussão",
  )!;
  assert.ok(base);
  const art = itemArtwork(base)!;
  assert.ok(art?.src);
  assert.deepEqual(
    itemArtwork({ ...base, id: "copy", catalogId: base.id }),
    art,
  );
  assert.deepEqual(itemArtwork({ ...base, id: "legacy" }), art);
  const alias = bookCatalog.find(
    (item) => item.id === Object.keys(regions.aliases)[0],
  )!;
  assert.match(itemArtworkSource(itemArtwork(alias)!), /Arsenal dos Agentes/);
  assert.doesNotMatch(
    itemArtworkSource(itemArtwork(alias)!),
    /Biblioteca Ritualística/,
  );
  const custom = itemArtwork({
    ...base,
    image: "data:image/webp;base64,AAAA",
  })!;
  assert.equal(custom.src, "data:image/webp;base64,AAAA");
  assert.equal(itemArtworkSource(custom), "Imagem personalizada");
  assert.equal(
    itemArtwork({
      ...base,
      id: "__proto__",
      bookId: undefined,
      name: "Não cadastrado",
    }),
    undefined,
  );
  assert.equal(itemArtwork({ ...base, kind: "Arma" }), undefined);
});
