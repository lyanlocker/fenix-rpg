"""Recover ritual headers hidden by decorative fonts in the source PDFs."""
import json, pathlib, re, unicodedata
import fitz

root = pathlib.Path(__file__).resolve().parents[2]
catalog_path = root / "fenix/lib/data/book-catalog.json"
items = json.loads(catalog_path.read_text())
docs = {key: fitz.open(next((root / "project_sources").glob(key + "-*"))) for key in ["01","03","04","05","06","07"]}

def fold(text):
    return "".join(char for char in unicodedata.normalize("NFD", text) if not unicodedata.combining(char)).upper()

missing = []
for item in items:
    if item["kind"] != "Ritual":
        continue
    page = docs[item["bookId"]][item["page"] - 1].get_text().replace("Nome Apoiador", "")
    text = re.sub(r"\s+", " ", fold(page))
    title = re.sub(r"\s+", " ", fold(item["name"])).strip()
    match = re.search(re.escape(title) + r"\s+(SANGUE|CONHECIMENTO|ENERGIA|MORTE|MEDO|VARIA|MULTIPLOS)\s*([1-4])?(?=\s|$)", text)
    if match:
        item["element"] = match[1].capitalize()
        item["circle"] = int(match[2] or 0)
        item["cost"] = [0, 1, 3, 6, 10][item["circle"]]
    elif not item.get("element"):
        missing.append((item["name"], item["bookId"], item["page"]))
    for key in ["notes", "discente", "verdadeiro"]:
        if item.get(key):
            item[key] = re.sub(r"((?:DISCENTE|VERDADEIRO|EVOLUÇÃO)\s*\([^)]*\):)\s*\1", r"\1", item[key])

if missing:
    raise ValueError(f"Ritual headers need review: {missing}")
catalog_path.write_text(json.dumps(items, ensure_ascii=False, indent=2))
print("Recovered metadata for", sum(item["kind"] == "Ritual" for item in items), "ritual records.")
