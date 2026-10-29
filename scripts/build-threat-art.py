"""Rebuild the reviewed illustrations from the user's PDFs. The PDFs are not distributed.
Usage: python3 scripts/build-threat-art.py /path/to/source-pdfs
Requires PyMuPDF and Pillow with WebP support. Not needed for npm build.
"""
import argparse, hashlib, io, json
from pathlib import Path
import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "01": {"sha256": "10cd12ca254657d3d22d130f4078f8b3e29ce9d03cf77039fc11d20c22d4b212", "offset": 10},
    "07": {"sha256": "1895b8dc186b8ff1500c566cace17a24cb2452a29e3ca0a3a7c04252c843111c", "offset": 1},
    "04": {"sha256": "7805a45ebdcd9f281edaa1ad4336642c4fa4f81572957422ba7ecf26cbec4779", "offset": 0},
}

def encode(image, limit, quality):
    resized = image.copy()
    resized.thumbnail((limit, limit), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    resized.save(output, format="WEBP", quality=quality, method=6)
    return output.getvalue(), resized.size

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path)
    args = parser.parse_args()
    by_hash = {hashlib.sha256(path.read_bytes()).hexdigest(): path for path in args.source_dir.rglob("*.pdf")}
    missing = [book for book, meta in SOURCES.items() if meta["sha256"] not in by_hash]
    if missing:
        raise SystemExit("Missing the exact reviewed PDFs for books: " + ", ".join(missing))
    docs = {book: fitz.open(by_hash[meta["sha256"]]) for book, meta in SOURCES.items()}
    selections = json.loads((ROOT / "scripts/threat-art-selection.json").read_text())
    catalog = {item["id"]: item for item in json.loads((ROOT / "lib/data/threat-catalog.json").read_text())}
    destination = ROOT / "public/art/threats"
    destination.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for threat_id, selection in selections.items():
        assert threat_id in catalog, threat_id
        book, xref, page_number = selection["bookId"], selection["xref"], selection["pdfPage"]
        doc = docs[book]
        embedded = next((item for item in doc[page_number - 1].get_images(full=True) if item[0] == xref), None)
        if not embedded:
            raise ValueError(f"Image {xref} is not on reviewed page {page_number}: {threat_id}")
        pixmap = fitz.Pixmap(doc, xref)
        pixmap = fitz.Pixmap(fitz.csRGB, pixmap)
        image = Image.open(io.BytesIO(pixmap.tobytes("png"))).convert("RGBA")
        if embedded[1]:
            mask = fitz.Pixmap(doc, embedded[1])
            alpha = Image.open(io.BytesIO(mask.tobytes("png"))).convert("L")
            image.putalpha(alpha.resize(image.size, Image.Resampling.LANCZOS))
            bounds = image.getchannel("A").getbbox()
            if bounds:
                image = image.crop(bounds)
        full, dimensions = encode(image, 1024, 83)
        thumb, thumb_dimensions = encode(image, 320, 75)
        full_name = f"{threat_id}-{hashlib.sha256(full).hexdigest()[:10]}.webp"
        thumb_name = f"{threat_id}-thumb-{hashlib.sha256(thumb).hexdigest()[:10]}.webp"
        (destination / full_name).write_bytes(full)
        (destination / thumb_name).write_bytes(thumb)
        manifest[threat_id] = {
            "src": f"/art/threats/{full_name}", "thumbnail": f"/art/threats/{thumb_name}",
            "width": dimensions[0], "height": dimensions[1],
            "thumbnailWidth": thumb_dimensions[0], "thumbnailHeight": thumb_dimensions[1],
            "bookId": book, "page": page_number - SOURCES[book]["offset"], "pdfPage": page_number,
            "bytes": len(full), "thumbnailBytes": len(thumb),
        }
    (ROOT / "lib/data/threat-art.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    total = sum(item["bytes"] + item["thumbnailBytes"] for item in manifest.values())
    print(f"{len(manifest)} illustrations / {len(manifest) * 2} WebP files / {total:,} bytes")

if __name__ == "__main__":
    main()
