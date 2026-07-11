"""Build the map data files from the deployment CSVs.

Reads every CSV under data/my_deployments/ and data/existing/, validates them,
and writes docs/data/deployments.geojson + docs/data/summary.json (and copies the
simplified division boundaries). Pure stdlib - no packages required.

Usage:  python scripts/build_map.py
Add/edit rows in the CSVs (empty lat/lon rows are skipped with a warning),
rerun this script, and the map picks the changes up. Lines starting with '#'
inside a CSV are treated as comments.
"""
from __future__ import annotations

import csv
import io
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MY_DIR = ROOT / "data" / "my_deployments"
EXISTING_DIR = ROOT / "data" / "existing"
BOUNDARY_SRC = ROOT / "data" / "boundaries" / "bd_divisions_simplified.json"
OUT_DIR = ROOT / "docs" / "data"

# Bangladesh bounding box (generous, includes border strips and islands)
LAT_MIN, LAT_MAX = 20.3, 26.75
LON_MIN, LON_MAX = 87.9, 92.8

MY_REQUIRED = ["id", "category", "tier", "name", "division", "district",
               "lat", "lon", "status", "coord_precision", "notes"]
EXISTING_REQUIRED = ["station_id", "network", "operator", "name", "city", "division",
                     "lat", "lon", "monitor_type", "coord_precision", "source_url", "notes"]

MY_CATEGORIES = {"doe_colocation", "border", "ambient", "pollution_hotspot"}
STATUSES = {"proposed", "planned", "installed"}
DIVISIONS = {"Dhaka", "Chattogram", "Rajshahi", "Khulna", "Sylhet",
             "Barishal", "Rangpur", "Mymensingh"}

# network name (existing CSVs) -> map layer key; unknown networks fall back to "other"
NETWORK_LAYERS = {
    "DOE CAMS": "doe_cams",
    "DOE C-CAMS": "doe_ccams",
    "US Embassy / AirNow": "us_embassy",
    "GAIA A12 (aqicn)": "gaia",
    "PurpleAir": "purpleair",
    "IQAir contributor": "iqair",
    "aqicn AirNet community": "community",
    "SPARTAN": "spartan",
}


def read_csv(path: Path) -> list[dict]:
    """Read a CSV, dropping comment lines (starting with '#') and blank lines."""
    raw = path.read_text(encoding="utf-8-sig")
    lines = [ln for ln in raw.splitlines() if ln.strip() and not ln.lstrip().startswith("#")]
    return list(csv.DictReader(io.StringIO("\n".join(lines))))


def parse_coord(row: dict, errors: list, warnings: list, label: str):
    lat_s, lon_s = (row.get("lat") or "").strip(), (row.get("lon") or "").strip()
    if not lat_s and not lon_s:
        warnings.append(f"{label}: no coordinates yet - skipped (placeholder row)")
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


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    features: list[dict] = []
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

    def register_id(sid: str, source: str, label: str):
        if sid in seen_ids:
            errors.append(f"{label}: duplicate id '{sid}' (already used in {seen_ids[sid]})")
        seen_ids[sid] = source

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
            if div and div not in DIVISIONS:
                errors.append(f"{label}: division '{div}' not one of {sorted(DIVISIONS)}")
                continue
            coords = parse_coord(row, errors, warnings, label)
            if coords is None:
                continue
            lat, lon = coords
            tier = (row.get("tier") or "").strip()
            layer = cat if cat != "ambient" else (
                "ambient_village" if tier == "village" else "ambient_semi_urban")
            add_feature(lat, lon, {
                "id": sid, "group": "mine", "layer": layer, "category": cat,
                "tier": tier, "name": row.get("name", "").strip(),
                "division": div, "district": row.get("district", "").strip(),
                "status": status, "coord_precision": row.get("coord_precision", "").strip(),
                "notes": row.get("notes", "").strip(),
            })

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
            coords = parse_coord(row, errors, warnings, label)
            if coords is None:
                continue
            lat, lon = coords
            network = (row.get("network") or "").strip()
            layer = NETWORK_LAYERS.get(network, "other")
            if layer == "other":
                warnings.append(f"{label}: unrecognised network '{network}' -> layer 'other'")
            div = (row.get("division") or "").strip()
            if div and div not in DIVISIONS:
                errors.append(f"{label}: division '{div}' not one of {sorted(DIVISIONS)}")
                continue
            add_feature(lat, lon, {
                "id": sid, "group": "existing", "layer": layer, "network": network,
                "operator": row.get("operator", "").strip(),
                "name": row.get("name", "").strip(),
                "city": row.get("city", "").strip(), "division": div,
                "monitor_type": row.get("monitor_type", "").strip(),
                "coord_precision": row.get("coord_precision", "").strip(),
                "source_url": row.get("source_url", "").strip(),
                "notes": row.get("notes", "").strip(),
            })

    # ---- report + fail loudly --------------------------------------------
    for w in warnings:
        print(f"  WARNING  {w}")
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

    # ---- write outputs ----------------------------------------------------
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    geojson = {"type": "FeatureCollection", "features": features}
    (OUT_DIR / "deployments.geojson").write_text(
        json.dumps(geojson, ensure_ascii=False), encoding="utf-8")
    shutil.copyfile(BOUNDARY_SRC, OUT_DIR / "divisions.json")

    summary = {
        "built_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "total_stations": len(features),
        "layer_counts": dict(sorted(layer_counts.items())),
        "division_counts": dict(sorted(division_counts.items())),
        "skipped_placeholder_rows": [w for w in warnings if "placeholder" in w],
    }
    (OUT_DIR / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    mine = sum(n for k, n in layer_counts.items()
               if k in ("doe_colocation", "border", "ambient_semi_urban",
                        "ambient_village", "pollution_hotspot"))
    print(f"\nBuild OK: {len(features)} stations "
          f"({mine} mine, {len(features) - mine} existing) -> docs/data/")
    for layer, n in sorted(layer_counts.items()):
        print(f"  {layer:20s} {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
