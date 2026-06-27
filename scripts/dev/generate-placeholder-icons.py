#!/usr/bin/env python3
"""
One-off dev script — generates dummy placeholder SVG "images" for every
product type / service icon, so the customer UI can be previewed with
image-based icons before real artwork is ready.

Each output is a 128x128 transparent-background SVG with just the emoji
glyph rendered large, no card/background — closer to a plain image than
a cartoon icon-card. NOT final art. Run again any time to regenerate
(idempotent, overwrites).

Usage: python scripts/dev/generate-placeholder-icons.py
"""
import os

OUT_PRODUCTS = "public/icons/products"
OUT_SERVICES = "public/icons/services"

# (slug, emoji, category) — category kept for reference only, no longer
# used for a background color since there is no background anymore.
PRODUCTS = [
    ("regular-laundry-mixed",   "👕", "everyday"),
    ("t-shirt",                 "👕", "everyday"),
    ("formal-shirt",            "👔", "everyday"),
    ("trouser-jeans",           "👖", "everyday"),
    ("shorts",                  "🩳", "everyday"),
    ("undergarments-set",       "🧦", "everyday"),
    ("socks-pair",              "🧦", "everyday"),
    ("gym-sports-wear",         "🏋️", "everyday"),

    ("saree",                   "🥻", "ethnic_formal"),
    ("salwar-kameez",           "👘", "ethnic_formal"),
    ("lehenga-set",             "👘", "ethnic_formal"),
    ("sherwani",                "🎽", "ethnic_formal"),
    ("suit-2-piece",            "🤵", "ethnic_formal"),
    ("blazer-jacket",           "🧥", "ethnic_formal"),
    ("dress",                   "👗", "ethnic_formal"),
    ("kurta-men",               "👘", "ethnic_formal"),
    ("saree-blouse",            "👗", "ethnic_formal"),
    ("dupatta-stole",           "🧣", "ethnic_formal"),

    ("single-bedsheet",         "🛏️", "household"),
    ("double-bedsheet",         "🛏️", "household"),
    ("pillow-cover",            "🪑", "household"),
    ("single-blanket",          "🛌", "household"),
    ("double-blanket",          "🛌", "household"),
    ("bath-towel",              "🏊", "household"),
    ("hand-towel",              "🧴", "household"),
    ("curtain-single",          "🪟", "household"),
    ("curtain-pair",            "🪟", "household"),
    ("table-cloth",             "🍽️", "household"),
    ("sofa-cover-seat",         "🛋️", "household"),

    ("sneakers-sports-shoes",   "👟", "specialty"),
    ("formal-shoes",            "👞", "specialty"),
    ("sandals-slippers",        "🩴", "specialty"),
    ("woolen-sweater",          "🧶", "specialty"),
    ("winter-jacket-coat",      "🧥", "specialty"),
    ("backpack-bag",            "🎒", "specialty"),
    ("stuffed-toy",             "🧸", "specialty"),
]

SERVICES = [
    ("wash-fold",      "🧺"),
    ("dry-cleaning",   "🧼"),
    ("steam-ironing",  "🔥"),
    ("wash-iron",      "💨"),
    ("stain-removal",  "⚡"),
    ("shoe-cleaning",  "👟"),
]

SVG_TEMPLATE = """<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <text x="64" y="76" font-size="96" text-anchor="middle" dominant-baseline="middle">{emoji}</text>
</svg>"""


def write_svg(path, emoji):
    svg = SVG_TEMPLATE.format(emoji=emoji)
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)


def main():
    os.makedirs(OUT_PRODUCTS, exist_ok=True)
    os.makedirs(OUT_SERVICES, exist_ok=True)

    for slug, emoji, _category in PRODUCTS:
        write_svg(os.path.join(OUT_PRODUCTS, f"{slug}.svg"), emoji)

    for slug, emoji in SERVICES:
        write_svg(os.path.join(OUT_SERVICES, f"{slug}.svg"), emoji)

    print(f"Generated {len(PRODUCTS)} product icons + {len(SERVICES)} service icons.")


if __name__ == "__main__":
    main()
