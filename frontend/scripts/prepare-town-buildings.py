"""Extract the two opaque backgrounds; retain original pixels and source files.

Run with Python + Pillow, NumPy and SciPy. The other four RGBA assets are only
inspected for their visible bounds; no image generation or resampling is used.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "spritesheets"


def largest_component(mask):
    labels, _ = ndimage.label(mask)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    return labels == sizes.argmax()


for name in ("zhihuhome", "zhihuhot"):
    original = Image.open(ASSETS / f"{name}.png").convert("RGB")
    rgb = np.asarray(original).astype(np.int16)
    # The building has a connected dark outline; the baked checkerboard is
    # bright and neutral. Fill the outline to preserve the light walls inside.
    outline = (rgb.min(axis=2) < 165) | (np.ptp(rgb, axis=2) > 35)
    silhouette = ndimage.binary_fill_holes(largest_component(outline))
    result = original.convert("RGBA")
    result.putalpha(Image.fromarray((silhouette * 255).astype(np.uint8)))
    result.save(ASSETS / f"{name}-cutout.png")

metadata = {}
for name in ("zhihuhome-cutout", "zhihuhot-cutout", "zhihubook", "zhihuwendao", "zhihuwrite", "zhihutiangong"):
    im = Image.open(ASSETS / f"{name}.png")
    alpha = np.asarray(im.getchannel("A"))
    ys, xs = np.where(largest_component(alpha > 127))
    metadata[f"{name}.png"] = {
        "width": im.width, "height": im.height,
        "bounds": [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1],
    }
(ROOT / "src" / "town-building-images.json").write_text(json.dumps(metadata, indent=2) + "\n")
