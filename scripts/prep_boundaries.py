"""One-time preparation of the globe's boundary layers. Pure stdlib.

The 3D globe needs two extra layers that the 2D map does not:
  * world country outlines, for context around Bangladesh
  * Bangladesh district (ADM2) outlines, so districts are visible when you zoom in

Both are simplified with mapshaper first (topology-preserving, so neighbouring districts
keep their shared edges), then normalised here: district names are rewritten to the
spellings this project uses in the CSVs, and each district is assigned its division by
testing its centroid against data/boundaries/bd.json.

Regenerate only if the sources change:

    curl -L -o adm2.geojson  "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/BGD/ADM2/geoBoundaries-BGD-ADM2_simplified.geojson"
    curl -L -o world.geojson "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson"
    npx mapshaper adm2.geojson -simplify keep-shapes 6% -clean -filter-fields shapeName \
        -o precision=0.0005 format=geojson adm2_simplified.geojson
    npx mapshaper world.geojson -filter "'Antarctica' != NAME" -filter-fields NAME \
        -simplify keep-shapes 7% -clean -o precision=0.02 format=geojson world_simplified.geojson
    python scripts/prep_boundaries.py adm2_simplified.geojson world_simplified.geojson

Sources: geoBoundaries gbOpen BGD ADM2 (CC-BY 4.0, geoboundaries.org) and Natural Earth
110m admin-0 (public domain).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOUNDARY_DIR = ROOT / "data" / "boundaries"
DIVISIONS_SRC = BOUNDARY_DIR / "bd.json"

# geoBoundaries keeps the older district spellings; the CSVs use the current ones.
DISTRICT_ALIAS = {
    "Barisal": "Barishal",
    "Bogra": "Bogura",
    "Brahamanbaria": "Brahmanbaria",
    "Chittagong": "Chattogram",
    "Comilla": "Cumilla",
    "Jessore": "Jashore",
    "Maulvibazar": "Moulvibazar",
    "Nawabganj": "Chapainawabganj",
    "Netrakona": "Netrokona",
    "Khagrachhari": "Khagrachhari",
}
DIVISION_ALIAS = {"Barisal": "Barishal", "Chittagong": "Chattogram"}


def rings(geom):
    """Yield every outer ring of a Polygon / MultiPolygon."""
    if geom["type"] == "Polygon":
        yield geom["coordinates"][0]
    elif geom["type"] == "MultiPolygon":
        for poly in geom["coordinates"]:
            yield poly[0]


def centroid(geom):
    """Area-weighted centroid over the outer rings (good enough to pick a division).

    Standard polygon centroid: with cross = x1*y2 - x2*y1, twice the signed area is
    sum(cross) and Cx = sum((x1+x2)*cross) / (3 * sum(cross)).
    """
    sx = sy = area2 = 0.0
    for ring in rings(geom):
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            cross = x1 * y2 - x2 * y1
            area2 += cross
            sx += (x1 + x2) * cross
            sy += (y1 + y2) * cross
    if not area2:
        pts = [p for ring in rings(geom) for p in ring]
        return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
    return (sx / (3 * area2), sy / (3 * area2))


def point_in_ring(pt, ring) -> bool:
    x, y = pt
    inside = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y):
            xint = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xint:
                inside = not inside
    return inside


def point_in_geom(pt, geom) -> bool:
    return any(point_in_ring(pt, ring) for ring in rings(geom))


def main(adm2_path: str, world_path: str) -> int:
    divisions = json.loads(DIVISIONS_SRC.read_text(encoding="utf-8"))
    div_feats = [(DIVISION_ALIAS.get(f["properties"]["name"], f["properties"]["name"]), f["geometry"])
                 for f in divisions["features"]]

    adm2 = json.loads(Path(adm2_path).read_text(encoding="utf-8"))
    out_feats = []
    unassigned = []
    for f in adm2["features"]:
        raw = (f["properties"].get("shapeName") or "").strip()
        name = DISTRICT_ALIAS.get(raw, raw)
        c = centroid(f["geometry"])
        division = next((dn for dn, dg in div_feats if point_in_geom(c, dg)), "")
        if not division:  # centroid fell in a river/estuary gap - use the nearest division centroid
            unassigned.append(name)
            division = min(div_feats,
                           key=lambda d: (centroid(d[1])[0] - c[0]) ** 2 + (centroid(d[1])[1] - c[1]) ** 2)[0]
        out_feats.append({
            "type": "Feature",
            "properties": {"name": name, "division": division,
                           "c": [round(c[0], 4), round(c[1], 4)]},
            "geometry": f["geometry"],
        })

    out_feats.sort(key=lambda f: f["properties"]["name"])
    districts_path = BOUNDARY_DIR / "bd_districts_simplified.json"
    districts_path.write_text(
        json.dumps({"type": "FeatureCollection", "features": out_feats}, ensure_ascii=False),
        encoding="utf-8")

    world = json.loads(Path(world_path).read_text(encoding="utf-8"))
    world_feats = [{"type": "Feature",
                    "properties": {"name": f["properties"].get("NAME", "")},
                    "geometry": f["geometry"]}
                   for f in world["features"]]
    world_out = BOUNDARY_DIR / "world_simplified.json"
    world_out.write_text(
        json.dumps({"type": "FeatureCollection", "features": world_feats}, ensure_ascii=False),
        encoding="utf-8")

    by_div: dict[str, int] = {}
    for f in out_feats:
        by_div[f["properties"]["division"]] = by_div.get(f["properties"]["division"], 0) + 1
    print(f"districts -> {districts_path.name}  {len(out_feats)} features, "
          f"{districts_path.stat().st_size // 1024} KB")
    print(f"  per division: {dict(sorted(by_div.items()))}")
    if unassigned:
        print(f"  centroid outside every division, snapped to nearest: {unassigned}")
    print(f"world     -> {world_out.name}  {len(world_feats)} features, "
          f"{world_out.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
