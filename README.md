# Bangladesh PM2.5 Sensor Deployment Map

An interactive map of **every PM2.5 air-quality deployment in Bangladesh** — the DoE regulatory
network (CAMS + C-CAMS), all third-party/low-cost networks, and the **UW–BUET 55-sensor low-cost
network** being planned by Bishwadip Maitra. The map rebuilds from plain CSV files and redeploys to
GitHub Pages automatically on every push.

**Live map:** https://maitrabishwadip.github.io/UW-BUET-PM2.5-Sensor-Deployment-Map/
*(available once GitHub Pages is enabled — see [First-time setup](#first-time-setup))*

![map preview](docs/preview.png)

---

## What's on the map

| Layer | Shape · colour | Source |
|---|---|---|
| DoE CAMS (reference) | gold ★ | DoE Dec-2025 report |
| DoE C-CAMS (reference) | violet ✦ | DoE Dec-2025 report |
| US Embassy (BAM reference) | blue ▲ | AirNow |
| SPARTAN (filter reference) | brown ⬟ | SPARTAN network |
| GAIA / aqicn (low-cost) | teal ● | aqicn/WAQI |
| PurpleAir (low-cost) | violet ● | PurpleAir |
| IQAir (low-cost) | pink ● | IQAir |
| aqicn community (low-cost) | grey ● | aqicn AirNet |
| **My DoE colocation** (Block A) | blue ■ | this project |
| **My border area** (Block B) | red ■ | this project |
| **My ambient · semi-urban** | orange ◆ | this project |
| **My ambient · village/rural** | green ◆ | this project |
| **My pollution source/hotspot** | black ◆ | this project *(placeholder — no sites yet)* |

**Convention:** shape = monitor type · colour = category · **hollow = planned, solid = installed**.

Interactivity: per-layer toggles with live counts, name/district/id search, status filter
(all / planned / installed), division shading with per-division totals on hover, marker clustering,
basemap switcher, dark mode, and shareable URL view state. See the survey of existing networks in
[`reports/third_party_deployments.md`](reports/third_party_deployments.md).

---

## The only files you edit: the CSVs

All sensor locations live in [`data/`](data/) as CSVs. **Nothing is hardcoded to "55"** — counts,
legend badges, and summaries are all derived from the rows at build time, so the network can grow.

```
data/my_deployments/
  doe_colocation.csv     Block A — 8 divisional DoE colocation sensors
  border.csv             Block B — 15 border-area sensors
  ambient.csv            Block C — 32 ambient sensors (tier = semi-urban | village)
  pollution_hotspot.csv  Block D — PLACEHOLDER, add rows when kiln/industry sites are confirmed
data/existing/
  doe_cams.csv           16 DoE CAMS   (reference)
  doe_ccams.csv          15 DoE C-CAMS (reference)
  third_party.csv        US Embassy, GAIA, PurpleAir, IQAir, community, SPARTAN
```

### Adding / updating your sensors

Each `data/my_deployments/*.csv` row is:

```
id, category, tier, name, division, district, lat, lon, status, coord_precision, notes
```

- **`lat` / `lon`** — decimal degrees. **Leave both empty** and the row is skipped with a warning
  (this is the placeholder mechanism). Fill them in later and the marker appears on the next build.
- **`status`** — `proposed` | `planned` | `installed`. `installed` renders a **solid** marker; the
  others render **hollow**.
- **`coord_precision`** — `approx` (planning-stage) or `exact` (confirmed after recon).
- **`category`** — `doe_colocation` | `border` | `ambient` | `pollution_hotspot` (fixed set).
- **`tier`** — for `ambient`: `semi-urban` or `village` (drives orange vs green). Free text otherwise.

**To add pollution-source sensors** (not yet sited): open
[`data/my_deployments/pollution_hotspot.csv`](data/my_deployments/pollution_hotspot.csv), copy an
example row, uncomment it, fill in name/division/district (and lat/lon when known), then rebuild.

---

## Rebuild & preview locally

```bash
python scripts/build_map.py            # validates CSVs -> docs/data/*.json  (fails loudly on bad rows)
python -m http.server -d docs 8000     # then open http://localhost:8000
```

The build **fails with a clear message** (and non-zero exit, which also fails CI) on: out-of-bounds
coordinates, unknown `status`/`category`/`division`, duplicate ids, or missing columns. Empty-coordinate
rows only warn.

---

## Publish (edit → push → live)

```bash
git add -A
git commit -m "Update sensor coordinates"
git push
```

The [GitHub Actions workflow](.github/workflows/deploy.yml) reruns `build_map.py` and redeploys the
`docs/` site to GitHub Pages. No build step runs in the browser — the committed `docs/data/*.json`
is what ships, so a push is all you need.

### First-time setup

Pages must be enabled once:

1. Repo → **Settings → Pages**
2. **Source: GitHub Actions**
3. Push to `main` (or re-run the workflow). The live URL appears in the Action's *deploy* step and at
   the top of this README.

---

## Regenerating the boundary file (rarely needed)

`data/boundaries/bd_divisions_simplified.json` (91 KB) is a one-time simplification of the 32 MB
`bd.json`. Only regenerate if the source boundary changes:

```bash
npx mapshaper data/boundaries/bd.json -simplify keep-shapes 2% -clean \
  -o precision=0.0001 format=geojson data/boundaries/bd_divisions_simplified.json
```

---

## Repo layout

```
data/            editable CSVs (sources of truth) + boundaries
scripts/         build_map.py  (stdlib only, no dependencies)
docs/            the published site (index.html + assets + generated data/)
reports/         third_party_deployments.md — survey of existing networks
source_docs/     original DoE PDF + allocation DOCX
.github/         Pages CI/CD workflow
```

Coordinates for the 55 planned sensors are planning-stage approximations from the allocation plan;
confirm exact sites by reconnaissance before installation.
