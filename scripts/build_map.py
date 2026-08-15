"""Build the map data files from the deployment CSVs.

Reads every CSV under data/my_deployments/, data/doe_proposed/ and data/existing/,
validates them, and writes docs/data/deployments.geojson + docs/data/summary.json (and
copies the simplified division boundaries). Pure stdlib - no packages required.

Usage:  python scripts/build_map.py
Add/edit rows in the CSVs, rerun this script, and the map picks the changes up. Lines
starting with '#' inside a CSV are treated as comments. Rows with empty lat/lon are not
dropped silently - they are reported as "awaiting siting" in summary.json and shown in
the map sidebar.

The build also detects co-located stations (different networks at the same site) so the
map can fan them out instead of stacking them on top of each other.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MY_DIR = ROOT / "data" / "my_deployments"
PROPOSED_DIR = ROOT / "data" / "doe_proposed"
EXISTING_DIR = ROOT / "data" / "existing"
BOUNDARY_SRC = ROOT / "data" / "boundaries" / "bd_divisions_simplified.json"
OUT_DIR = ROOT / "docs" / "data"
INDEX_HTML = ROOT / "docs" / "index.html"
# Files whose contents decide the cache-busting version stamped into index.html.
VERSIONED = ["docs/assets/app.js", "docs/assets/style.css",
             "docs/data/deployments.geojson", "docs/data/summary.json"]

# Bangladesh bounding box (generous, includes border strips and islands)
LAT_MIN, LAT_MAX = 20.3, 26.75
LON_MIN, LON_MAX = 87.9, 92.8

# Stations within this distance of each other are treated as one physical site.
COLOCATION_RADIUS_M = 250

MY_REQUIRED = ["id", "category", "tier", "name", "division", "district",
               "lat", "lon", "status", "coord_precision", "notes"]
PROPOSED_REQUIRED = ["id", "doe_group", "pair_id", "role", "name", "area_type",
                     "division", "district", "lat", "lon", "associated_station",
                     "school", "status", "coord_precision", "notes"]
EXISTING_REQUIRED = ["station_id", "network", "operator", "name", "city", "division",
                     "lat", "lon", "monitor_type", "coord_precision", "source_url", "notes"]

MY_CATEGORIES = {"doe_colocation", "border", "ambient", "pollution_hotspot"}
STATUSES = {"proposed", "planned", "installed", "pending"}
DIVISIONS = {"Dhaka", "Chattogram", "Rajshahi", "Khulna", "Sylhet",
             "Barishal", "Rangpur", "Mymensingh"}

# DoE-proposed role -> map layer key
PROPOSED_LAYERS = {
    "cams_colocated": "doe_prop_cams",
    "sas_colocated": "doe_prop_sas",
    "new_rural": "doe_prop_rural",
    "new_urban": "doe_prop_urban",
    "new_district": "doe_prop_district",
    "unspecified": "doe_prop_unspecified",
}

# network name (existing CSVs) -> map layer key; unknown networks fall back to "other"
NETWORK_LAYERS = {
    "DOE CAMS": "doe_cams",
    "DOE C-CAMS": "doe_ccams",
    "DoE SAS": "doe_sas",
    "US Embassy / AirNow": "us_embassy",
    "GAIA A12 (aqicn)": "gaia",
    "PurpleAir": "purpleair",
    "IQAir contributor": "iqair",
    "aqicn AirNet community": "community",
    "SPARTAN": "spartan",
}

# layers that belong to a sidebar section other than "existing"
LAYER_SECTION = {"doe_sas": "sas"}


def read_csv(path: Path) -> list[dict]:
    """Read a CSV, dropping comment lines (starting with '#') and blank lines."""
    raw = path.read_text(encoding="utf-8-sig")
    lines = [ln for ln in raw.splitlines() if ln.strip() and not ln.lstrip().startswith("#")]
    return list(csv.DictReader(io.StringIO("\n".join(lines))))


def parse_coord(row: dict, errors: list, label: str):
    """Return (lat, lon), or None if absent (caller records it as pending) or invalid."""
    lat_s, lon_s = (row.get("lat") or "").strip(), (row.get("lon") or "").strip()
    if not lat_s and not lon_s:
        return None
    try:
        lat, lon = float(lat_s), float(lon_s)
    except ValueError:
        errors.append(f"{label}: lat/lon not numeric ('{lat_s}', '{lon_s}')")
        return None
    if not (LAT_MIN <= lat <= LAT_MAX) or not (LON_MIN <= lon <= LON_MAX):
        errors.append(f"{label}: ({lat}, {lon}) outside Bangladesh bounds "
                      f"[{LAT_MIN}..{LAT_MAX}] x [{LON_MIN}..{LON_MAX}]")
        return None
    return lat, lon


def check_columns(path: Path, rows: list[dict], required: list[str], errors: list) -> bool:
    if not rows:
        return True
    missing = [c for c in required if c not in rows[0]]
    if missing:
        errors.append(f"{path.name}: missing required columns {missing}")
        return False
    return True


def haversine_m(a, b) -> float:
    (lat1, lon1), (lat2, lon2) = a, b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def stamp_build_version() -> str:
    """Write a content hash of the site's assets into index.html's window.BUILD.

    app.js appends it to every asset and data URL it fetches. Without it, GitHub Pages'
    ten-minute cache can hand a browser a stale app.js alongside a fresh index.html - which
    is how a page ends up running code against markup that no longer has the elements it
    expects. Idempotent: rebuilding with unchanged files leaves index.html untouched.
    """
    h = hashlib.sha1()
    for rel in VERSIONED:
        p = ROOT / rel
        if p.exists():
            h.update(p.read_bytes())
    version = h.hexdigest()[:10]

    html = INDEX_HTML.read_text(encoding="utf-8")
    new_html = html

    # The two files that actually change between deploys. Vendored libraries are pinned
    # copies and never do, so they are left alone.
    subs = [
        (r'window\.BUILD\s*=\s*"[^"]*"', f'window.BUILD = "{version}"'),
        (r'href="assets/style\.css(?:\?v=[0-9a-f]+)?"', f'href="assets/style.css?v={version}"'),
        (r'src="assets/app\.js(?:\?v=[0-9a-f]+)?"', f'src="assets/app.js?v={version}"'),
    ]
    for pattern, replacement in subs:
        new_html, n = re.subn(pattern, replacement, new_html)
        if n != 1:
            raise SystemExit(f"  ERROR    {INDEX_HTML.name}: expected exactly one match for "
                             f"{pattern!r}, found {n}. The version stamp cannot be applied, "
                             f"so a stale asset could outlive a deploy - fix the markup.")

    if new_html != html:
        INDEX_HTML.write_text(new_html, encoding="utf-8")
    return version


def doe_letter(group: str) -> str:
    """'A.1' / 'A.2' -> 'A'.  The DoE sheet numbers sub-tables; the group is the letter."""
    return (group or "").split(".")[0].strip().upper()


def tag_colocations(features: list[dict]) -> tuple[int, int]:
    """Single-linkage cluster features within COLOCATION_RADIUS_M.

    Tags colo_id / colo_n on every member, and colo_kind='cams_sas_pa' on the sites where
    a DoE reference station, a SAS area and a proposed PurpleAir unit all share one
    compound - the seven calibration sites the DoE sheet builds Group A around.
    Returns (number of shared sites, number of CAMS+SAS+PurpleAir sites).
    """
    pts = [(f["geometry"]["coordinates"][1], f["geometry"]["coordinates"][0]) for f in features]
    n = len(pts)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(n):
        for j in range(i + 1, n):
            # cheap bbox reject before the trig (~0.0025 deg ~ 275 m)
            if abs(pts[i][0] - pts[j][0]) > 0.0025 or abs(pts[i][1] - pts[j][1]) > 0.0025:
                continue
            if haversine_m(pts[i], pts[j]) <= COLOCATION_RADIUS_M:
                ri, rj = find(i), find(j)
                if ri != rj:
                    parent[rj] = ri

    members: dict[int, list[int]] = {}
    for i in range(n):
        members.setdefault(find(i), []).append(i)

    sites = triple_sites = 0
    for root, idxs in members.items():
        if len(idxs) < 2:
            continue
        sites += 1
        props = [features[i]["properties"] for i in idxs]
        layers = {p["layer"] for p in props}
        has_ref = bool(layers & {"doe_cams", "doe_ccams"})
        kind = ("cams_sas_pa"
                if has_ref and "doe_sas" in layers
                and any(p["group"] == "doe_proposed" for p in props) else "")
        if kind:
            triple_sites += 1
        for p in props:
            p["colo_id"] = f"S{root}"
            p["colo_n"] = len(idxs)
            if kind:
                p["colo_kind"] = kind
    return sites, triple_sites


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    features: list[dict] = []
    pending: list[dict] = []
    seen_ids: dict[str, str] = {}
    layer_counts: dict[str, int] = {}
    division_counts: dict[str, dict[str, int]] = {}

    def add_feature(lat, lon, props):
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]},
            "properties": props,
        })
        layer_counts[props["layer"]] = layer_counts.get(props["layer"], 0) + 1
        div = props.get("division") or "Unknown"
        division_counts.setdefault(div, {})
        division_counts[div][props["group"]] = division_counts[div].get(props["group"], 0) + 1

    def add_pending(props, reason):
        pending.append({
            "id": props["id"], "name": props.get("name", ""), "group": props["group"],
            "layer": props["layer"], "division": props.get("division", ""),
            "district": props.get("district", "") or props.get("city", ""),
            "doe_group": props.get("doe_group", ""), "status": props.get("status", ""),
            "reason": reason,
        })

    def register_id(sid: str, source: str, label: str):
        if sid in seen_ids:
            errors.append(f"{label}: duplicate id '{sid}' (already used in {seen_ids[sid]})")
        seen_ids[sid] = source

    def check_division(div: str, label: str) -> bool:
        if div and div not in DIVISIONS:
            errors.append(f"{label}: division '{div}' not one of {sorted(DIVISIONS)}")
            return False
        return True

    # ---- my deployments -------------------------------------------------
    my_files = sorted(MY_DIR.glob("*.csv"))
    if not my_files:
        errors.append(f"no CSV files found in {MY_DIR}")
    for path in my_files:
        rows = read_csv(path)
        if not check_columns(path, rows, MY_REQUIRED, errors):
            continue
        for i, row in enumerate(rows, start=2):
            sid = (row.get("id") or "").strip()
            label = f"{path.name} row {i} (id={sid or '?'})"
            if not sid:
                errors.append(f"{label}: empty id")
                continue
            register_id(sid, path.name, label)
            cat = (row.get("category") or "").strip()
            if cat not in MY_CATEGORIES:
                errors.append(f"{label}: category '{cat}' not in {sorted(MY_CATEGORIES)}")
                continue
            status = (row.get("status") or "").strip().lower()
            if status not in STATUSES:
                errors.append(f"{label}: status '{status}' not in {sorted(STATUSES)}")
                continue
            div = (row.get("division") or "").strip()
            if not check_division(div, label):
                continue
            tier = (row.get("tier") or "").strip()
            layer = cat if cat != "ambient" else (
                "ambient_village" if tier == "village" else "ambient_semi_urban")
            props = {
                "id": sid, "group": "mine", "layer": layer, "category": cat,
                "tier": tier, "name": row.get("name", "").strip(),
                "division": div, "district": row.get("district", "").strip(),
                "status": status, "coord_precision": row.get("coord_precision", "").strip(),
                "notes": row.get("notes", "").strip(),
            }
            coords = parse_coord(row, errors, label)
            if coords is None:
                add_pending(props, "no coordinates yet")
                continue
            add_feature(coords[0], coords[1], props)

    # ---- DoE proposed 55-unit plan ---------------------------------------
    for path in sorted(PROPOSED_DIR.glob("*.csv")):
        rows = read_csv(path)
        if not check_columns(path, rows, PROPOSED_REQUIRED, errors):
            continue
        for i, row in enumerate(rows, start=2):
            sid = (row.get("id") or "").strip()
            label = f"{path.name} row {i} (id={sid or '?'})"
            if not sid:
                errors.append(f"{label}: empty id")
                continue
            register_id(sid, path.name, label)
            role = (row.get("role") or "").strip()
            if role not in PROPOSED_LAYERS:
                errors.append(f"{label}: role '{role}' not in {sorted(PROPOSED_LAYERS)}")
                continue
            status = (row.get("status") or "").strip().lower()
            if status not in STATUSES:
                errors.append(f"{label}: status '{status}' not in {sorted(STATUSES)}")
                continue
            div = (row.get("division") or "").strip()
            if not check_division(div, label):
                continue
            props = {
                "id": sid, "group": "doe_proposed", "layer": PROPOSED_LAYERS[role],
                "role": role, "doe_group": (row.get("doe_group") or "").strip(),
                "pair_id": (row.get("pair_id") or "").strip(),
                "name": row.get("name", "").strip(),
                "area_type": (row.get("area_type") or "").strip(),
                "division": div, "district": row.get("district", "").strip(),
                "associated_station": row.get("associated_station", "").strip(),
                "school": row.get("school", "").strip(),
                "status": status, "coord_precision": row.get("coord_precision", "").strip(),
                "notes": row.get("notes", "").strip(),
            }
            coords = parse_coord(row, errors, label)
            if coords is None:
                add_pending(props, "type/quantity unspecified in DoE table"
                            if status == "pending" else "coordinates pending field siting")
                continue
            add_feature(coords[0], coords[1], props)

    # ---- existing networks ----------------------------------------------
    for path in sorted(EXISTING_DIR.glob("*.csv")):
        rows = read_csv(path)
        if not check_columns(path, rows, EXISTING_REQUIRED, errors):
            continue
        for i, row in enumerate(rows, start=2):
            sid = (row.get("station_id") or "").strip()
            label = f"{path.name} row {i} (id={sid or '?'})"
            if not sid:
                errors.append(f"{label}: empty station_id")
                continue
            register_id(sid, path.name, label)
            network = (row.get("network") or "").strip()
            layer = NETWORK_LAYERS.get(network, "other")
            if layer == "other":
                warnings.append(f"{label}: unrecognised network '{network}' -> layer 'other'")
            div = (row.get("division") or "").strip()
            if not check_division(div, label):
                continue
            props = {
                "id": sid, "group": LAYER_SECTION.get(layer, "existing"), "layer": layer,
                "network": network, "operator": row.get("operator", "").strip(),
                "name": row.get("name", "").strip(),
                "city": row.get("city", "").strip(), "division": div,
                "monitor_type": row.get("monitor_type", "").strip(),
                "coord_precision": row.get("coord_precision", "").strip(),
                "source_url": row.get("source_url", "").strip(),
                "notes": row.get("notes", "").strip(),
            }
            coords = parse_coord(row, errors, label)
            if coords is None:
                add_pending(props, "no coordinates yet")
                continue
            add_feature(coords[0], coords[1], props)

    # ---- report + fail loudly --------------------------------------------
    for w in warnings:
        print(f"  WARNING  {w}")
    for p in pending:
        print(f"  PENDING  {p['id']} {p['name']} - {p['reason']}")
    if errors:
        for e in errors:
            print(f"  ERROR    {e}", file=sys.stderr)
        print(f"\nBuild FAILED: {len(errors)} error(s). Fix the CSV rows above and rerun.",
              file=sys.stderr)
        return 1

    if not BOUNDARY_SRC.exists():
        print(f"  ERROR    missing boundary file {BOUNDARY_SRC} "
              "(generate once with mapshaper, see README)", file=sys.stderr)
        return 1

    colo_sites, triple_sites = tag_colocations(features)

    # ---- write outputs ----------------------------------------------------
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    geojson = {"type": "FeatureCollection", "features": features}
    (OUT_DIR / "deployments.geojson").write_text(
        json.dumps(geojson, ensure_ascii=False), encoding="utf-8")
    shutil.copyfile(BOUNDARY_SRC, OUT_DIR / "divisions.json")

    def group_total(group):
        mapped = sum(1 for f in features if f["properties"]["group"] == group)
        return mapped + sum(1 for p in pending if p["group"] == group)

    # DoE sheet groups A / B / C. Rows still marked "pending" are not part of the 55.
    doe_group_totals: dict[str, int] = {}
    for p in [f["properties"] for f in features] + pending:
        if p.get("group") != "doe_proposed" or p.get("status") == "pending":
            continue
        letter = doe_letter(p.get("doe_group", ""))
        if letter:
            doe_group_totals[letter] = doe_group_totals.get(letter, 0) + 1

    summary = {
        "built_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "total_stations": len(features),
        "colocated_sites": colo_sites,
        "cams_sas_pa_sites": triple_sites,
        "group_totals": {g: group_total(g) for g in ("mine", "doe_proposed", "sas", "existing")},
        "doe_group_totals": dict(sorted(doe_group_totals.items())),
        "doe_proposed_units": sum(doe_group_totals.values()),
        "layer_counts": dict(sorted(layer_counts.items())),
        "division_counts": dict(sorted(division_counts.items())),
        "pending": pending,
    }
    (OUT_DIR / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    version = stamp_build_version()

    print(f"\nBuild OK: {len(features)} mapped stations, {len(pending)} awaiting siting "
          f"-> docs/data/")
    print(f"  cache-busting build version: {version}")
    print(f"  co-located sites (>=2 stations within {COLOCATION_RADIUS_M} m): {colo_sites}")
    print(f"  of which DoE CAMS + SAS + proposed PurpleAir: {triple_sites}")
    print(f"  DoE proposed units: {summary['doe_proposed_units']}  "
          + " ".join(f"[{g} {n}]" for g, n in summary["doe_group_totals"].items()))
    for layer, n in sorted(layer_counts.items()):
        print(f"  {layer:24s} {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
