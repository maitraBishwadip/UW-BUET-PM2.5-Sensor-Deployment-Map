/* Tests for the data the globe hands to globe.gl.
 *
 * Rendering is the library's job now; what stays ours is deciding which stations are
 * visible under the sidebar's filters, tallying them per district, and shaping the two
 * boundary layers into one polygon array. Those are pure functions, so they are tested
 * here against the real docs/data/*.json.
 *
 *     node scripts/test_globe_data.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const readJSON = f => JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "data", f), "utf8"));

const Globe3D = require(path.join(ROOT, "docs", "assets", "globe.js"));
const { visibleFeatures, districtCounts, shadeFor, polygonPayload, statusOf } = Globe3D._pure;

const geo = readJSON("deployments.geojson");
const world = readJSON("world.json");
const districts = readJSON("districts.json");
const summary = readJSON("summary.json");

const LAYERS = {};
["doe_prop_cams", "doe_prop_sas", "doe_prop_rural", "doe_prop_urban", "doe_prop_district",
 "doe_sas", "doe_colocation", "border", "ambient_semi_urban", "ambient_village",
 "pollution_hotspot", "doe_cams", "doe_ccams", "us_embassy", "spartan", "purpleair",
 "gaia", "iqair", "community", "other"].forEach(k => { LAYERS[k] = { label: k }; });

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${detail}`); }
};

const baseState = () => ({
  allFeatures: geo.features,
  enabled: Object.fromEntries(Object.keys(LAYERS).map(k => [k, true])),
  statusFilter: "all",
  doeGroup: "all",
});

// ---- visibility under the sidebar's filters ----
{
  const st = baseState();
  check("no filters shows every mapped station",
    visibleFeatures(st, LAYERS).length === summary.total_stations,
    `${visibleFeatures(st, LAYERS).length} vs ${summary.total_stations}`);
}
{
  const st = baseState();
  st.doeGroup = "C";
  const got = visibleFeatures(st, LAYERS).length;
  const proposed = geo.features.filter(f => f.properties.group === "doe_proposed").length;
  const groupC = geo.features.filter(f => f.properties.doe_group === "C").length;
  check("A/B/C filter narrows only the DoE-proposed set", got === summary.total_stations - proposed + groupC,
    `${got} visible`);
  check("Group C is the 18 new-district units", groupC === 18, `${groupC}`);
}
{
  const st = baseState();
  st.statusFilter = "installed";
  const got = visibleFeatures(st, LAYERS).length;
  const want = geo.features.filter(f => statusOf(f.properties) === "installed").length;
  check("status filter reaches the globe", got === want, `${got} vs ${want}`);
  check("existing networks default to installed", want > 0, `${want}`);
}
{
  const st = baseState();
  Object.keys(st.enabled).forEach(k => { st.enabled[k] = false; });
  st.enabled.doe_cams = true;
  check("layer toggles reach the globe", visibleFeatures(st, LAYERS).length === 16,
    `${visibleFeatures(st, LAYERS).length}`);
}
{
  const st = baseState();
  const unknown = { properties: { layer: "not_a_layer", group: "existing", id: "X" },
                    geometry: { coordinates: [90, 23] } };
  st.allFeatures = [unknown];
  st.enabled.other = false;
  check("an unknown layer falls back to 'other' and honours its toggle",
    visibleFeatures(st, LAYERS).length === 0);
}

// ---- per-district tallies drive the choropleth ----
{
  const counts = districtCounts(visibleFeatures(baseState(), LAYERS));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  check("every station lands in a district", total === summary.total_stations,
    `${total} vs ${summary.total_stations}`);
  const sorted = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
  check("district tallies match the build, district for district",
    JSON.stringify(sorted(counts)) === JSON.stringify(sorted(summary.district_counts)),
    `${Object.keys(counts).length} districts vs ${Object.keys(summary.district_counts).length}`);
  const st = baseState();
  st.doeGroup = "C";
  const narrowed = districtCounts(visibleFeatures(st, LAYERS));
  check("filtering re-tallies the choropleth",
    Object.values(narrowed).reduce((a, b) => a + b, 0) < total);
}

// ---- the shading ramp ----
{
  check("zero deployments means no shading", shadeFor(0, 23) === 0);
  check("shading rises with the count", shadeFor(1, 23) < shadeFor(5, 23)
    && shadeFor(5, 23) < shadeFor(23, 23));
  check("shading stays inside a sane alpha range",
    shadeFor(1, 23) > 0.1 && shadeFor(23, 23) <= 0.75,
    `${shadeFor(1, 23).toFixed(3)}..${shadeFor(23, 23).toFixed(3)}`);
  check("a single-station map does not divide by zero", Number.isFinite(shadeFor(1, 0)));
}

// ---- the polygon layer handed to globe.gl ----
{
  const poly = polygonPayload(world, districts);
  check("world and districts arrive as one array, minus the doubled-up country",
    poly.length === world.features.length + districts.features.length - 1, `${poly.length}`);
  check("Bangladesh is drawn as districts, not as a country polygon too",
    poly.filter(p => p.kind === "world" && p.name === "Bangladesh").length === 0);
  check("without districts the country polygon is kept",
    polygonPayload(world, null).filter(p => p.name === "Bangladesh").length === 1);
  check("all 64 districts are present",
    poly.filter(p => p.kind === "district").length === 64);
  check("every polygon carries a geometry globe.gl can read",
    poly.every(p => p.geometry && /^(Multi)?Polygon$/.test(p.geometry.type)));
  check("districts carry their centroid for click-to-zoom",
    poly.filter(p => p.kind === "district").every(p => Array.isArray(p.c) && p.c.length === 2));
  check("districts carry their division", poly.filter(p => p.kind === "district")
    .every(p => typeof p.division === "string" && p.division.length > 0));
  check("missing layers degrade to an empty array", polygonPayload(null, null).length === 0);
}

console.log(failures === 0 ? "\nglobe data OK" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
