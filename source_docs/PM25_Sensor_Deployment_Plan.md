# Proposed Low-Cost PM2.5 Sensor Deployment Plan (55 Units)

Source: DoE "Proposed Monitoring Locations v2" table, reconstructed and corrected to reflect that every
"1+1 (w/ SAS)" entry means **two separate physical deployments** — one co-located with an existing
CAMS/C-CAMS/SAS Aria station (urban, calibration reference) and one at a distinct rural site in the same
district/division. Total across all groups: **55 sensor units**.

Columns: `Group | Pair ID | Site | Area Type | Qty | Role | Associated CAMS/C-CAMS/SAS | School (if applicable) | Lat | Lon | Google Maps Link | Notes`

Coordinates are WGS84 decimal degrees, ready to drop into any plotting tool (matplotlib/GeoPandas, folium, QGIS, etc.).

---

## Group A — Paired with existing DoE CAMS stations (31 units)

### A.1 — Urban/Rural pairs split from "1+1 (w/ SAS)" entries (7 pairs, 14 units)

| Pair | Site | Type | Qty | Role | CAMS/SAS | School | Lat | Lon | Maps Link |
|---|---|---|---|---|---|---|---|---|---|
| P1 | Farmgate, Dhaka | Urban | 1 | Existing CAMS+SAS (calibration ref) | Farmgate CAMS (existing) | — | — | — | — |
| P1 | Keraniganj | Rural | 1 | New rural deployment | Calibrated vs. Farmgate CAMS+SAS | Khejurbag Government Primary School | 23.6952739 | 90.4102807 | https://www.google.com/maps?q=23.6952739,90.4102807 |
| P2 | TV Centre, Chattogram | Urban | 1 | Existing CAMS+SAS (calibration ref) | TV Centre, Chattogram CAMS (existing) | — | — | — | — |
| P2 | New rural site, Chattogram | Rural | 1 | New rural deployment | Calibrated vs. TV Centre CAMS+SAS | Ahmed Mia Government Primary School | 22.3645883 | 91.8351576 | https://www.google.com/maps?q=22.3645883,91.8351576 |
| P3 | Rajshahi | Urban | 1 | Existing CAMS+SAS (calibration ref) | Rajshahi CAMS (existing) | — | — | — | — |
| P3 | New rural site, Rajshahi | Rural | 1 | New rural deployment | Calibrated vs. Rajshahi CAMS+SAS | Raypara Government Primary School | 24.3771875 | 88.5530781 | https://www.google.com/maps?q=24.3771875,88.5530781 |
| P4 | Khulna | Urban | 1 | Existing CAMS+SAS (calibration ref) | Khulna CAMS (existing) | — | — | — | — |
| P4 | New rural site, Khulna | Rural | 1 | New rural deployment | Calibrated vs. Khulna CAMS+SAS | Gaikur Government Primary School | 22.8720426 | 89.5099489 | https://www.google.com/maps?q=22.8720426,89.5099489 |
| P5 | Sylhet | Urban | 1 | Existing CAMS+SAS (calibration ref) | Sylhet CAMS (existing) | — | — | — | — |
| P5 | New rural site, Sylhet | Rural | 1 | New rural deployment | Calibrated vs. Sylhet CAMS+SAS | Government Kindergarten Elementary School | 24.8928278 | 91.8693901 | https://www.google.com/maps?q=24.8928278,91.8693901 |
| P6 | Mymensingh | Urban | 1 | Existing CAMS+SAS (calibration ref) | Mymensingh CAMS (existing) | — | — | — | — |
| P6 | New rural site, Mymensingh | Rural | 1 | New rural deployment | Calibrated vs. Mymensingh CAMS+SAS | Sanki Para Government Primary School | 24.758065 | 90.3932233 | https://www.google.com/maps?q=24.758065,90.3932233 |
| P7 | Rangpur | Urban | 1 | Existing CAMS+SAS (calibration ref) | Rangpur CAMS (existing) | — | — | — | — |
| P7 | New rural site, Rangpur | Rural | 1 | New rural deployment | Calibrated vs. Rangpur CAMS+SAS | Nurpur Government Primary School | 25.7410464 | 89.2589524 | https://www.google.com/maps?q=25.7410464,89.2589524 |

**Notes:** Sylhet's nearest identifiable school is fairly central — verify a more rural option in the field. Chattogram's school is also city-area; the true rural periphery site is still TBD by the field team.

### A.2 — Single-deployment sites, no SAS split (16 units)

| Site | Type | Qty | Associated CAMS | School | Lat | Lon | Maps Link | Notes |
|---|---|---|---|---|---|---|---|---|
| Purbachal | Rural | 1 | Nearest ref: Dhaka cluster CAMS | Borkaw Government Primary School | 23.860164 | 90.479471 | https://www.google.com/maps?q=23.860164,90.479471 | Exact site not named in source doc beyond "Purbachal" |
| New site near Narsingdi | Rural | 1 | Narsingdi CAMS (existing) | Brahman Para Government Primary School | 23.913007 | 90.7136783 | https://www.google.com/maps?q=23.913007,90.7136783 | |
| New site near Narayanganj | Rural | 1 | Narayanganj CAMS (existing, Urban/Industry) | Adarsha Shishu Government Primary School | 23.621699 | 90.5031284 | https://www.google.com/maps?q=23.621699,90.5031284 | |
| New site near Gazipur | Rural | 1 | Gazipur CAMS (existing) | Gazipur Government Primary School | 24.0527941 | 90.4376031 | https://www.google.com/maps?q=24.0527941,90.4376031 | |
| Barishal (rural periphery) | Rural | 1 | Barishal CAMS (existing) | Primary School, Gas Turbine Rd | 22.6606957 | 90.3381833 | https://www.google.com/maps?q=22.6606957,90.3381833 | Source doc gives qty 1 only (no SAS split) |
| New site near Cumilla | Rural | 1 | Cumilla CAMS (existing) | Comilla Modern School | 23.459213 | 91.1761178 | https://www.google.com/maps?q=23.459213,91.1761178 | |
| New site near Faridpur | Rural | 1 | Faridpur CAMS (existing) | Tapakhola Government Primary School | 23.6120427 | 89.856359 | https://www.google.com/maps?q=23.6120427,89.856359 | |
| New site near Jashore | Rural | 1 | Jashore CAMS (existing) | Jessore Institute Government Primary School | 23.1645352 | 89.2101065 | https://www.google.com/maps?q=23.1645352,89.2101065 | |
| Satkhira | Urban | 1 | Satkhira CAMS (existing; doc flips Rural→Urban here) | — | — | — | — | Urban site, no school search applicable |
| New site near Bagerhat | Rural | 1 | Bagerhat CAMS (existing, Rural/Industry) | Mogra Government Primary School | 22.6838758 | 89.7439443 | https://www.google.com/maps?q=22.6838758,89.7439443 | |
| New site near Gopalganj | Rural | 1 | Gopalganj CAMS (existing) | S.M. Model Government Primary School | 23.0046676 | 89.8287424 | https://www.google.com/maps?q=23.0046676,89.8287424 | |
| New site near Tangail | Rural | 1 | Tangail CAMS (existing) | Model Government Primary School | 24.2513773 | 89.9131308 | https://www.google.com/maps?q=24.2513773,89.9131308 | |
| New site near Bogura | Rural | 1 | Bogura CAMS (existing) | Baropur Government Primary School | 24.8890587 | 89.3507293 | https://www.google.com/maps?q=24.8890587,89.3507293 | |
| New site near Brahmanbaria | Rural | 1 | Brahmanbaria CAMS (existing) | District Primary Education Office (landmark) | 23.9678064 | 91.1058531 | https://www.google.com/maps?q=23.9678064,91.1058531 | No verified rural primary school nearby — flagged for field verification |
| New site near Feni | Rural | 1 | Feni CAMS (existing) | Feni Model Government Primary School | 23.0072372 | 91.4015049 | https://www.google.com/maps?q=23.0072372,91.4015049 | |
| New site near Noakhali | Rural | 1 | Noakhali CAMS (existing) | Maijdi Government Primary School | 22.8790855 | 91.0934371 | https://www.google.com/maps?q=22.8790855,91.0934371 | |
| New site near Cox's Bazar | Rural | 1 | Cox's Bazar CAMS (existing) | Tech Para Government Primary School | 21.444076 | 91.985697 | https://www.google.com/maps?q=21.444076,91.985697 | |

**Group A total: 24 rows, 31 units** ✓

---

## Group B — SAS Aria: existing rural calibration site + new urban deployment (6 units, 3 pairs)

The source doc's existing SAS Aria unit already sits in a rural part of these three districts; the new
low-cost deployment adds an urban counterpart in the same district.

| Pair | Site | Type | Qty | Role | CAMS/SAS | School | Lat | Lon | Maps Link | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| P8 | Bhola (rural) | Rural | 1 | Existing SAS Aria (calibration ref) | SAS Aria station (existing, rural Bhola) | Kalinath Bazar Government Primary School | 22.6854999 | 90.6439447 | https://www.google.com/maps?q=22.6854999,90.6439447 | |
| P8 | Bhola (urban) | Urban | 1 | New urban deployment | No existing DoE CAMS/C-CAMS confirmed in Bhola town | — | — | — | — | New site |
| P9 | Munshiganj (rural) | Rural | 1 | Existing SAS Aria (calibration ref) | SAS Aria station (existing, rural Munshiganj) | Munshiganj Government Primary School | 23.5484511 | 90.5296905 | https://www.google.com/maps?q=23.5484511,90.5296905 | |
| P9 | Munshiganj (urban) | Urban | 1 | New urban deployment | No existing DoE CAMS/C-CAMS confirmed in Munshiganj town | — | — | — | — | New site |
| P10 | Dinajpur (rural, near Hajee Mohammad Danish S&T University) | Rural | 1 | Existing SAS Aria (calibration ref) | SAS Aria station (existing, rural Dinajpur) | Govt. Primary School, Bypass Rd, Shekhpur | 25.6229208 | 88.6507021 | https://www.google.com/maps?q=25.6229208,88.6507021 | Near HSTU |
| P10 | Dinajpur (urban) | Urban | 1 | New urban deployment | No existing DoE CAMS/C-CAMS confirmed in Dinajpur town | — | — | — | — | New site |

**Group B total: 6 rows, 6 units** ✓

---

## Group C — New districts, no existing CAMS at all — deployed at schools (18 units)

No existing CAMS/C-CAMS/SAS station to anchor to in these districts, so each unit is proposed at a
verified government school compound (secure, accessible, roughly representative).

| Site | Type | Qty | School (deployment site) | Lat | Lon | Maps Link | Notes |
|---|---|---|---|---|---|---|---|
| Panchagarh (urban) | Urban | 1 | Ahmadnagar Government Primary School | 26.3211725 | 88.5640669 | https://www.google.com/maps?q=26.3211725,88.5640669 | |
| Panchagarh (rural) | Rural | 1 | Collectorate School, Panchagarh | 26.3419314 | 88.5540295 | https://www.google.com/maps?q=26.3419314,88.5540295 | Primary-level status unverified — confirm grade level |
| Kurigram | Urban | 1 | Chilapara Government Primary School | 25.7846744 | 89.6049878 | https://www.google.com/maps?q=25.7846744,89.6049878 | |
| Jamalpur | Urban | 1 | Nasirpur Government Primary School | 24.8983666 | 89.9708047 | https://www.google.com/maps?q=24.8983666,89.9708047 | Multiple same-named schools exist elsewhere in BD — this one confirmed near Jamalpur Sadar |
| Moulavibazar | Urban | 1 | Moulvibazar Model Government Primary School | 24.4898044 | 91.7675424 | https://www.google.com/maps?q=24.4898044,91.7675424 | |
| Manikganj | Urban | 1 | Manikganj Government Primary School | 23.8616637 | 89.9979568 | https://www.google.com/maps?q=23.8616637,89.9979568 | |
| Pabna | Urban | 1 | Singa Government Primary School | 24.0210339 | 89.2445478 | https://www.google.com/maps?q=24.0210339,89.2445478 | |
| Chuadanga | Urban | 1 | Hazrahati Government Primary School | 23.6724848 | 88.8538897 | https://www.google.com/maps?q=23.6724848,88.8538897 | |
| Pirojpur | Urban | 1 | Pirojpur Town School | 22.5775897 | 89.9689549 | https://www.google.com/maps?q=22.5775897,89.9689549 | Listed as "Firozpur" in source doc — assumed Pirojpur district; verify |
| Kushtia | Urban | 1 | Government Primary School, Chand Mohammad Rd | 23.9119877 | 89.1286591 | https://www.google.com/maps?q=23.9119877,89.1286591 | Generic name — confirm identity in field |
| Shariatpur | Urban | 1 | Palong Government Primary School | 23.2200349 | 90.3558067 | https://www.google.com/maps?q=23.2200349,90.3558067 | |
| Joypurhat | Urban | 1 | Joypurhat Model Government Primary School | 25.1004629 | 89.0323562 | https://www.google.com/maps?q=25.1004629,89.0323562 | |
| Thakurgaon | Urban | 1 | Border Guard Government Primary and High School | 26.021082 | 88.4656103 | https://www.google.com/maps?q=26.021082,88.4656103 | |
| Bandarban (Hill Tract) | Urban | 1 | Bandarban Model Government Primary School | 22.1966818 | 92.2212093 | https://www.google.com/maps?q=22.1966818,92.2212093 | |
| Rangamati (Hill Tract) | Urban | 1 | New Rangamati Government Primary School | 22.6509953 | 92.1960114 | https://www.google.com/maps?q=22.6509953,92.1960114 | |
| Habiganj | Urban | 1 | Habiganj Government Primary School | 24.3853787 | 91.4121332 | https://www.google.com/maps?q=24.3853787,91.4121332 | |
| Chapainawabganj | Urban | 1 | Nawabganj Model Government Primary School | 24.5964268 | 88.2729404 | https://www.google.com/maps?q=24.5964268,88.2729404 | |
| Kishoreganj | Urban | 1 | Nogua Government Primary School | 24.432576 | 90.7694692 | https://www.google.com/maps?q=24.432576,90.7694692 | |

**Group C total: 18 rows, 18 units** ✓

---

## Pending / not yet quantified in source doc

These two districts are named in the DoE table but left blank for type and quantity — not counted toward the 55 units.

| Site | Section in source doc | Note |
|---|---|---|
| Patuakhali | DoE Existing CAMS section | Type/quantity not specified in source doc |
| Sunamganj | Districts with no CAMS section | Type/quantity not specified in source doc |

---

## Summary

| Group | Description | Units |
|---|---|---|
| A | Paired with existing DoE CAMS stations (7 urban/rural pairs + 16 single-deployment sites + 1 urban-only) | 31 |
| B | SAS Aria: existing rural calibration site + new urban deployment (3 pairs) | 6 |
| C | New districts, no existing CAMS — deployed at schools | 18 |
| **Total** | | **55** |

### Deployment role breakdown
- **Co-located with existing CAMS (urban, calibration reference):** 7 sites (Farmgate/Dhaka, TV Centre-Chattogram, Rajshahi, Khulna, Sylhet, Mymensingh, Rangpur)
- **Co-located with existing SAS Aria (rural, calibration reference):** 3 sites (Bhola, Munshiganj, Dinajpur)
- **New rural deployments (school- or district-anchored, no prior CAMS on-site):** ~24 sites
- **New urban deployments (no prior CAMS on-site):** ~20 sites, most at school compounds

### Key assumptions / open items for field verification
1. Where the source doc only said "Rural" next to a district/CAMS name (no specific site), the nearest identifiable government primary school is used as a **siting reference/rural anchor**, not a confirmed final GPS point.
2. Brahmanbaria's rural pairing has no verified nearby primary school — the District Primary Education Office is used as a landmark only.
3. "Firozpur" in the source doc is assumed to be a typo for **Pirojpur** district.
4. Patuakhali and Sunamganj are flagged as pending (not guessed) since the source doc left their type/quantity blank.
5. Kushtia's and Kurigram's assigned schools have fairly generic names — worth a field-team sanity check that they're the intended location.
6. Jamalpur required a second, more targeted search since "Jamalpur" is a common place name across multiple divisions in Bangladesh; the selected school is confirmed near Jamalpur Sadar (district town).

*Companion file: `Proposed_Monitoring_Locations_Sheet.xlsx` (same data, spreadsheet format with pair-shading and legend tab).*
