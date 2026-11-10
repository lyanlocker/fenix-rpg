#!/usr/bin/env python3
"""Extract reviewed, embedded ritual symbols from the user-supplied PDFs.

Usage: python scripts/build-ritual-art.py /directory/with/source/pdfs
Requires PyMuPDF and Pillow. Does not redraw symbols or copy full book pages.
The reviewed xrefs/placements live in ritual-art-regions.json; source hashes
prevent silently extracting a different image from another PDF edition.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CONFIG = Path(__file__).with_name("ritual-art-regions.json")


def extract(doc, spec):
    page = doc[spec["pdfPage"] - 1]
    found = [im for im in page.get_image_info(xrefs=True)
             if im["xref"] == spec["xref"] and all(abs(a-b) < .01 for a,b in zip(im["bbox"],spec["bbox"]))]
    if len(found) != 1:
        raise ValueError(f"Image placement changed: {spec}")
    im = found[0]
    pix = fitz.Pixmap(doc, spec["xref"])
    mask = next((entry[1] for entry in page.get_images() if entry[0] == spec["xref"]), 0)
    # DeviceN (spot black) may report one channel but cannot be encoded as PNG.
    pix = fitz.Pixmap(fitz.csRGB, pix)
    image = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
    if mask:
        alpha = Image.open(io.BytesIO(fitz.Pixmap(doc, mask).tobytes("png"))).convert("L")
        # PDFs may store a lower-resolution soft mask than the color plane.
        if alpha.size != image.size:
            alpha = alpha.resize(image.size, Image.Resampling.BICUBIC)
        image.putalpha(alpha)
    a,b,c,d,e,f = im["transform"]
    # Orthogonal PDF rotations retain every native pixel without interpolation.
    if abs(b) < .01 and abs(c) < .01:
        if a < 0: image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if d < 0: image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    elif abs(a) < .01 and abs(d) < .01 and b < 0 and c > 0:
        image = image.transpose(Image.Transpose.ROTATE_90)
    elif abs(a) < .01 and abs(d) < .01 and b > 0 and c < 0:
        image = image.transpose(Image.Transpose.ROTATE_270)
    else:
        # Preserve arbitrary rotation embedded in the book (e.g. Vampirismo).
        left,top,right,bottom = im["bbox"]
        scale = max(image.width / math.hypot(a,b), image.height / math.hypot(c,d))
        aa,bb,cc,dd = a*scale/image.width,b*scale/image.width,c*scale/image.height,d*scale/image.height
        tx,ty = (e-left)*scale,(f-top)*scale
        det = aa*dd-bb*cc
        inverse = (dd/det,-cc/det,(-dd*tx+cc*ty)/det,-bb/det,aa/det,(bb*tx-aa*ty)/det)
        image = image.transform((round((right-left)*scale),round((bottom-top)*scale)),Image.Transform.AFFINE,inverse,Image.Resampling.BICUBIC)
    image.thumbnail((960,960),Image.Resampling.LANCZOS)
    return image


def combine(images):
    if len(images)==1:return images[0]
    columns = math.ceil(math.sqrt(len(images)))
    rows = math.ceil(len(images)/columns)
    width,height = max(im.width for im in images),max(im.height for im in images)
    canvas = Image.new("RGBA",(columns*(width+16)+16,rows*(height+16)+16))
    for i,im in enumerate(images):
        x=16+(i%columns)*(width+16)+(width-im.width)//2
        y=16+(i//columns)*(height+16)+(height-im.height)//2
        canvas.alpha_composite(im,(x,y))
    canvas.thumbnail((960,960),Image.Resampling.LANCZOS)
    return canvas


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("sources",type=Path);args=parser.parse_args()
    config=json.loads(CONFIG.read_text(encoding="utf-8"));docs={}
    catalog={item["id"]:item for item in json.loads((ROOT/"lib/data/book-catalog.json").read_text(encoding="utf-8"))}
    direct_ids=[entry["id"] for entry in config["entries"]]
    if len(set(direct_ids))!=len(direct_ids):raise ValueError("Duplicate direct ritual ID")
    for key in set(direct_ids)|set(config["aliases"]):
        if key not in catalog or catalog[key]["kind"]!="Ritual":raise ValueError(f"Unknown ritual: {key}")
    for alias,source in config["aliases"].items():
        if source not in direct_ids:raise ValueError(f"Missing alias source: {alias} -> {source}")
    for book,source in config["sources"].items():
        candidates=list(args.sources.glob(source["glob"]))
        if len(candidates)!=1:raise ValueError(f"Expected one source for {book}: {source['glob']}")
        path=candidates[0]
        if hashlib.sha256(path.read_bytes()).hexdigest()!=source["sha256"]:raise ValueError(f"Source edition changed: {path.name}")
        docs[book]=fitz.open(path)
    output=ROOT/"public/art/rituals";output.mkdir(parents=True,exist_ok=True)
    manifest={};written=set()
    def write(image,thumbnail=False):
        buffer=io.BytesIO()
        if thumbnail:image.save(buffer,"WEBP",quality=88,method=6)
        else:image.save(buffer,"WEBP",lossless=True,method=6)
        data=buffer.getvalue();name=hashlib.sha256(data).hexdigest()[:20]+".webp"
        (output/name).write_bytes(data);written.add(name)
        return "/art/rituals/"+name,len(data)
    for index,entry in enumerate(config["entries"],1):
        im=combine([extract(docs[entry["bookId"]],s) for s in entry["images"]])
        src,fullbytes=write(im);thumb=im.copy();thumb.thumbnail((256,256),Image.Resampling.LANCZOS)
        if thumb.size==im.size:thumbnail,thumbbytes=src,fullbytes
        else:thumbnail,thumbbytes=write(thumb,True)
        first=entry["images"][0]["pdfPage"]
        manifest[entry["id"]]={"src":src,"thumbnail":thumbnail,"width":im.width,"height":im.height,
            "thumbnailWidth":thumb.width,"thumbnailHeight":thumb.height,"bookId":entry["bookId"],
            "page":first-config["sources"][entry["bookId"]]["printedOffset"],"pdfPage":first,
            "bytes":fullbytes,"thumbnailBytes":thumbbytes}
        if index%50==0:print(f"Extracted {index}/{len(config['entries'])} source rituals",flush=True)
    for alias,source in config["aliases"].items():manifest[alias]=manifest[source].copy()
    manifest_path=ROOT/"lib/ritual-art.json"
    temporary=manifest_path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    temporary.replace(manifest_path)
    sizes=[(output/name).stat().st_size for name in written]
    print(json.dumps({"catalogEntries":len(manifest),"sourceEntries":len(config["entries"]),"files":len(written),"bytes":sum(sizes),"maxFileBytes":max(sizes)},indent=2))

if __name__=="__main__":main()
