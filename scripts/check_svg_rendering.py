"""Render and compare every SVG page with its source PDF, entirely locally."""
import argparse
import json
from pathlib import Path
import zipfile

import fitz
from PIL import Image, ImageChops, ImageStat

parser = argparse.ArgumentParser()
parser.add_argument("source")
parser.add_argument("archive")
parser.add_argument("output")
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
rows = []
with fitz.open(args.source) as pdf, zipfile.ZipFile(args.archive) as archive:
    assert len(archive.namelist()) == pdf.page_count
    for i, page in enumerate(pdf):
        source = page.get_pixmap()
        source.save(output / f"source-{i + 1}.png")
        with fitz.open(stream=archive.read(f"page-{i + 1:03d}.svg"), filetype="svg") as svg:
            rendered = svg[0].get_pixmap()
            rendered.save(output / f"svg-{i + 1}.png")
        assert (source.width, source.height) == (rendered.width, rendered.height)
        source_image = Image.frombytes("RGB", (source.width, source.height), source.samples)
        svg_image = Image.frombytes("RGB", (rendered.width, rendered.height), rendered.samples)
        difference = ImageStat.Stat(ImageChops.difference(source_image, svg_image))
        rows.append({"page": i + 1, "size": [source.width, source.height],
                     "mean_pixel_difference_out_of_255": round(sum(difference.mean) / 3, 3)})
(output / "render-comparison.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
print(json.dumps(rows, indent=2))
