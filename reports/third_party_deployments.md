# Existing PM2.5 Sensor Deployments in Bangladesh

**Deliverable 1** — survey of every PM2.5 monitoring deployment in Bangladesh *other than* the
UW–BUET 55-sensor network being planned. Compiled 2026-07-11 from the DoE December-2025 monthly
report and public sensor-network catalogues. Each station is captured as a row in
[`../data/existing/`](../data/existing/) and plotted on the interactive map.

> **Coordinate note.** DoE CAMS/C-CAMS coordinates are exact (converted from the DoE report, see
> §4). Third-party low-cost stations are given at **city / site approximation** (`coord_precision =
> approx`) because the public catalogues expose only coarse locations or move sensors frequently;
> treat them as indicative, not survey-grade. For live positions use each network's own map (links
> below).

---

## 1. Summary of networks

| # | Network / operator | Stations (approx.) | Instrument | Class | In map layer |
|---|---|---|---|---|---|
| 1 | **DoE CAMS** (Dept. of Environment) | 16 | Reference analysers (BAM / TEOM-class + gas) | Regulatory reference | `doe_cams` |
| 2 | **DoE C-CAMS** (Compact CAMS) | 15 | Compact continuous stations | Regulatory reference | `doe_ccams` |
| 3 | **US Embassy Dhaka** (US Dept. of State / AirNow) | 1 | BAM-1020 beta-attenuation | Reference | `us_embassy` |
| 4 | **DoE × aqicn / WAQI** GAIA A12 | ~17 | GAIA A12 low-cost (3 redundant sensors) | Low-cost | `gaia` |
| 5 | **PurpleAir** (DoE units + research clusters) | ~17+ | PA-II-SD low-cost | Low-cost | `purpleair` |
| 6 | **IQAir / AirVisual** contributors | ~15–21 | AirVisual low-cost | Low-cost | `iqair` |
| 7 | **aqicn community** (AirGradient, university & citizen) | ~5+ | Various low-cost | Low-cost | `community` |
| 8 | **SPARTAN** (Dhaka University site) | 1 | Filter-based speciation + nephelometer | Research reference | `spartan` |

The **DoE regulatory network totals 31 stations** (16 CAMS + 15 C-CAMS). The low-cost/third-party
layer in this map currently holds **33 stations**; the real count fluctuates because community and
IQAir contributors come and go.

---

## 2. Reference-grade third-party monitors

### 2.1 US Embassy Dhaka (AirNow)
- **One BAM-1020 beta-attenuation monitor** on the US Embassy compound, Madani Avenue, Baridhara,
  Dhaka. Hourly PM2.5, 16.7 L/min through filter tape, range 0–1000 µg/m³, detection limit <1 µg/m³.
- Publicly reported on [airnow.gov](https://www.airnow.gov) and mirrored on aqicn as
  "Dhaka US Consulate". This is the longest-running independent reference series in Bangladesh and is
  widely used to bias-correct satellite and low-cost data.
- Source: [bd.usembassy.gov/air-quality-data](https://bd.usembassy.gov/air-quality-data/).

### 2.2 SPARTAN — Dhaka University
- Part of the global **Surface PARTiculate mAtter Network**; filter-based PM2.5 with chemical
  speciation (ions, trace metals, black carbon) plus a co-located nephelometer, on the University of
  Dhaka campus. Black carbon >8 µg/m³ has been reported here.
- Source: [spartan-network.org](https://www.spartan-network.org).

---

## 3. Low-cost sensor networks

### 3.1 DoE × aqicn/WAQI — GAIA A12 (~17 stations)
The Department of Environment runs a public low-cost layer of **GAIA A12** monitors (semi-professional,
3 redundant sensors, ~US$200/unit) surfaced through the World Air Quality Index project. Most units
are **co-located at or near the DoE CAMS/C-CAMS reference sites** (Agargaon, BARC/Farmgate, Agrabad,
Boyra, Red Crescent Sylhet, DFO Barishal, BTV Rangpur, Mymensingh, Cumilla, Paba/Rajshahi, plus BUET
and Uttara). Live network: [aqicn.org/network/doebd](https://aqicn.org/network/doebd/).

### 3.2 PurpleAir (~17+ units)
- The DoE operates roughly **17 PurpleAir (PA-II-SD)** units as a low-cost layer.
- Additional **research clusters** exist: a UW–BUET collocation study ran 10–20 PA units against a
  reference monitor across wet/dry seasons (pairwise R² > 0.95; linear correction nRMSE 17–18%, random
  forest 12–14%), and an indoor–outdoor study paired PA sensors at 17 Dhaka homes.
- Live positions change frequently — see [map.purpleair.com/bangladesh](https://map.purpleair.com/bangladesh).
  In this repo PurpleAir is represented by a single indicative point; refresh from the live map before
  citing exact sensors.

### 3.3 IQAir / AirVisual contributors (~15–21 stations)
IQAir aggregates ~11–12 contributors nationwide. Reported monitor towns include **Savar, Sakhipur,
Tangail, Mirzapur, Nagarpur, Sreepur, Kishoreganj, Manikganj**, and several within Dhaka. Locations
are city-level approximations. Source: [iqair.com/bangladesh](https://www.iqair.com/bangladesh).

### 3.4 aqicn community / AirGradient / universities
Independent monitors surfaced on the aqicn "AirNet" map, e.g. **AirGradient at RAJUK Uttara Apartment
Project (Sector 18)**, **ww-khulna at Rupsha Strand Road**, **Jahangirnagar University**, a
**Gulshan-2 (Rob Bhaban)** monitor, and a **BUET Azimpur** unit. Source:
[aqicn.org/station/country/bd/bangladesh](https://aqicn.org/station/country/bd/bangladesh/).

---

## 4. DoE network coordinate conversion (for reproducibility)

The DoE December-2025 report prints coordinates in a corrupted DMS-like format, e.g. CAMS-1 as
`23°.77'73.94"N  90°.37'26.03"E`. These are **not** valid degrees-minutes-seconds (73.94" is
impossible). Concatenating the digit groups recovers a clean decimal degree:

```
23°.77'73.94"N  ->  23.777394 N
90°.37'26.03"E  ->  90.372603 E   (Agargaon, Dhaka — matches DoE HQ)
```

Every one of the 31 stations was converted this way and **sanity-checked against its stated city**
(e.g. CAMS-6 Khulshi → 22.36, 91.80 ✓ Chattogram; C-CAMS-30 Cox's Bazar → 21.44, 91.97 ✓). Full
converted tables: [`../data/existing/doe_cams.csv`](../data/existing/doe_cams.csv) and
[`../data/existing/doe_ccams.csv`](../data/existing/doe_ccams.csv).

---

## 5. Sources

- U.S. Embassy Bangladesh — Air Quality Data: https://bd.usembassy.gov/air-quality-data/
- AirNow (US Dept. of State international monitors): https://www.airnow.gov
- DoE × WAQI network (GAIA A12): https://aqicn.org/network/doebd/
- aqicn Bangladesh station map: https://aqicn.org/station/country/bd/bangladesh/
- PurpleAir Bangladesh live map: https://map.purpleair.com/bangladesh
- IQAir Bangladesh: https://www.iqair.com/bangladesh
- SPARTAN network: https://www.spartan-network.org
- DoE Air Quality Monthly Report, December 2025 (`source_docs/DOE Deployments.pdf`)
- PurpleAir calibration in Dhaka: ACS ES&T Air (2025), https://pubs.acs.org/doi/10.1021/acsestair.5c00105
- GAIA A12 specification: https://aqicn.org/gaia/a12/
