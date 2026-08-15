/* Bangladesh PM2.5 Deployment Map
 * Reads docs/data/{deployments.geojson, divisions.json, summary.json} produced by
 * scripts/build_map.py and renders an interactive Leaflet map. No hardcoded station
 * counts — everything is derived from the data at load time.
 *
 * Marker language: every deployment is a map pin. Colour = layer, glyph in the pin head
 * = family (reference / DoE-proposed / UW-BUET / low-cost). Super SAS sites are red stars.
 * Stations sharing one physical site are fanned out on a ring so none is hidden.
 */
"use strict";

const REPO_URL = "https://github.com/maitraBishwadip/UW-BUET-PM2.5-Sensor-Deployment-Map";

/* Layer catalogue.
 * section -> sidebar block + summary tally; family -> pin glyph; color -> pin gradient. */
const LAYERS = {
  // --- DoE proposed 55-unit PurpleAir plan (plus glyph) ---
  doe_prop_cams:        { label: "On a CAMS + SAS compound",        section: "doe_proposed", family: "prop", color: "#0b3d91", order: 1 },
  doe_prop_sas:         { label: "On a rural SAS area",             section: "doe_proposed", family: "prop", color: "#00838f", order: 2 },
  doe_prop_rural:       { label: "New rural site",                  section: "doe_proposed", family: "prop", color: "#3f9142", order: 3 },
  doe_prop_urban:       { label: "New urban site",                  section: "doe_proposed", family: "prop", color: "#7b3fa0", order: 4, hideIfEmpty: true },
  doe_prop_district:    { label: "New district (no existing CAMS)", section: "doe_proposed", family: "prop", color: "#c2185b", order: 5 },
  doe_prop_unspecified: { label: "Unspecified in DoE table",        section: "doe_proposed", family: "prop", color: "#9e9e9e", order: 6, hideIfEmpty: true },
  // --- Super SAS: Source Apportionment Study areas (red star) ---
  doe_sas:            { label: "Source Apportionment Study",  section: "sas",      family: "sas",     color: "#d62828", order: 20 },
  // --- UW-BUET network (diamond glyph) ---
  doe_colocation:     { label: "DoE colocation (Block A)",    section: "mine",     family: "mine",    color: "#1f6feb", order: 30 },
  border:             { label: "Border area (Block B)",       section: "mine",     family: "mine",    color: "#e4572e", order: 31 },
  ambient_semi_urban: { label: "Ambient · semi-urban",        section: "mine",     family: "mine",    color: "#f2a65a", order: 32 },
  ambient_village:    { label: "Ambient · village/rural",     section: "mine",     family: "mine",    color: "#17a398", order: 33 },
  pollution_hotspot:  { label: "Pollution source / hotspot",  section: "mine",     family: "mine",    color: "#2b2b2b", order: 34 },
  // --- existing networks (bullseye = reference grade, dot = low-cost) ---
  doe_cams:           { label: "DoE CAMS (reference)",        section: "existing", family: "ref",     color: "#e8a33d", order: 40 },
  doe_ccams:          { label: "DoE C-CAMS (reference)",      section: "existing", family: "ref",     color: "#8d6e29", order: 41 },
  us_embassy:         { label: "US Embassy (BAM ref.)",       section: "existing", family: "ref",     color: "#2e4a7d", order: 42 },
  spartan:            { label: "SPARTAN (filter ref.)",       section: "existing", family: "ref",     color: "#795548", order: 43 },
  purpleair:          { label: "PurpleAir (low-cost)",        section: "existing", family: "lowcost", color: "#7c4dff", order: 44 },
  gaia:               { label: "GAIA / aqicn (low-cost)",     section: "existing", family: "lowcost", color: "#b07aa1", order: 45 },
  iqair:              { label: "IQAir (low-cost)",            section: "existing", family: "lowcost", color: "#e87ba4", order: 46 },
  community:          { label: "aqicn community (low-cost)",  section: "existing", family: "lowcost", color: "#78909c", order: 47 },
  other:              { label: "Other",                       section: "existing", family: "lowcost", color: "#9e9e9e", order: 48, hideIfEmpty: true },
};

const SECTIONS = ["doe_proposed", "sas", "mine", "existing"];

/* Groups of the DoE "Proposed Monitoring Locations" sheet. Counts come from the build. */
const DOE_GROUPS = {
  A: { label: "A", title: "Group A — paired with an existing DoE CAMS station" },
  B: { label: "B", title: "Group B — paired with a rural Source Apportionment Study area" },
  C: { label: "C", title: "Group C — districts with no existing CAMS / C-CAMS" },
};

// bd.json uses older division spellings; map them to the report spellings.
const DIV_ALIAS = { "Barisal": "Barishal", "Chittagong": "Chattogram" };

const BASEMAPS = {
  carto:     { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 20 },
  cartodark: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 20 },
  osm:       { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenStreetMap contributors", subdomains: "abc", maxZoom: 19 },
  esri:      { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Tiles &copy; Esri", maxZoom: 19 },
};

/* ---------- colour helpers ---------- */
function mixWhite(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = v => Math.round(v + (255 - v) * t);
  return `#${((1 << 24) | (m(r) << 16) | (m(g) << 8) | m(b)).toString(16).slice(1)}`;
}

/* ---------- SVG marker factory ---------- */
// Teardrop pin drawn in a 24 x 32 box: head centred at (12, 11.4), tip at (12, 31).
const PIN_PATH = "M12 0.9C6.2 0.9 1.5 5.6 1.5 11.4c0 7.9 10.5 19.7 10.5 19.7s10.5-11.8 10.5-19.7C22.5 5.6 17.8 0.9 12 0.9z";

function glyphSVG(family, color, filled) {
  const c = filled ? "#ffffff" : color;
  switch (family) {
    case "ref": // reference grade -> bullseye
      return `<circle cx="12" cy="11.4" r="4.5" fill="none" stroke="${c}" stroke-width="1.6"/>
              <circle cx="12" cy="11.4" r="1.9" fill="${c}"/>`;
    case "prop": // DoE proposed -> plus
      return `<path d="M12 6.8v9.2M7.4 11.4h9.2" stroke="${c}" stroke-width="2.1" stroke-linecap="round"/>`;
    case "mine": // UW-BUET -> diamond
      return `<polygon points="12,6.5 16.9,11.4 12,16.3 7.1,11.4" fill="${c}"/>`;
    default: // low-cost -> dot
      return `<circle cx="12" cy="11.4" r="3.4" fill="${c}"/>`;
  }
}

function pinSVG(color, family, filled, size) {
  const w = size, h = Math.round(size * 32 / 24);
  const gid = `pg${color.slice(1)}${filled ? 1 : 0}`;
  const fill = filled ? `url(#${gid})` : mixWhite(color, 0.82);
  const defs = filled
    ? `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0" stop-color="${mixWhite(color, 0.42)}"/>
         <stop offset="1" stop-color="${color}"/></linearGradient></defs>`
    : "";
  return `<svg width="${w}" height="${h}" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
    ${defs}
    <path d="${PIN_PATH}" fill="${fill}" stroke="${color}" stroke-width="${filled ? 1.1 : 1.9}"/>
    ${glyphSVG(family, color, filled)}
  </svg>`;
}

function starPts(cx, cy, outer, inner, points, rot) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = rot + (Math.PI * i) / points;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function starSVG(color, filled, size) {
  const c = size / 2, r = size / 2 - 1.5;
  const gid = `sg${color.slice(1)}${filled ? 1 : 0}`;
  const fill = filled ? `url(#${gid})` : mixWhite(color, 0.82);
  const defs = filled
    ? `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0" stop-color="${mixWhite(color, 0.4)}"/>
         <stop offset="1" stop-color="${color}"/></linearGradient></defs>`
    : "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${defs}
    <polygon points="${starPts(c, c, r, r * 0.44, 5, -Math.PI / 2)}"
             fill="${fill}" stroke="${color}" stroke-width="1.3" stroke-linejoin="round"/>
  </svg>`;
}

function markerSVG(layerKey, filled, size) {
  const L2 = LAYERS[layerKey] || LAYERS.other;
  return L2.family === "sas"
    ? starSVG(L2.color, filled, size)
    : pinSVG(L2.color, L2.family, filled, size);
}

function makeIcon(layerKey, status, size = 26) {
  const L2 = LAYERS[layerKey] || LAYERS.other;
  const filled = status === "installed";
  const svg = markerSVG(layerKey, filled, size);
  if (L2.family === "sas") {
    return L.divIcon({ className: "pin", html: svg, iconSize: [size, size],
      iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 + 2] });
  }
  const h = Math.round(size * 32 / 24);
  return L.divIcon({ className: "pin", html: svg, iconSize: [size, h],
    iconAnchor: [size / 2, h], popupAnchor: [0, -h + 4] });
}

/* ---------- state ---------- */
const state = {
  map: null, baseLayer: null, divisionLayer: null, coloLayer: null,
  markersByLayer: {}, clusterByLayer: {}, useCluster: false, spread: true,
  enabled: {}, statusFilter: "all", doeGroup: "all", allFeatures: [], summary: null,
  view: "globe",
};

/* ---------- load & init ---------- */
async function boot() {
  document.getElementById("repo-link").innerHTML =
    `<a href="${REPO_URL}" target="_blank" rel="noopener">Source &amp; how to update ↗</a>`;

  const [geo, divisions, summary, world, districts] = await Promise.all([
    fetch("data/deployments.geojson").then(r => r.json()),
    fetch("data/divisions.json").then(r => r.json()),
    fetch("data/summary.json").then(r => r.json()).catch(() => null),
    fetch("data/world.json").then(r => r.json()).catch(() => null),
    fetch("data/districts.json").then(r => r.json()).catch(() => null),
  ]);
  state.allFeatures = geo.features;
  state.summary = summary;

  initMap();
  buildDivisions(divisions);
  buildMarkers();
  buildLayerControls();
  buildDoeGroupFilter();
  buildStats();
  buildPending();
  wireUI();
  applyHashView();

  if (typeof Globe3D !== "undefined") Globe3D.setData({ world, districts });
  setView(savedView());
}

/* ---------- 3D globe / 2D map switch ----------
 * The globe is the default view; whichever one you pick is remembered for next time.
 * Switching to the globe can fail (the library is loaded on demand, and it needs WebGL),
 * so setView falls back to the 2D map rather than leaving an empty stage. */
function savedView() {
  try { return localStorage.getItem("bd-pm25-view") === "map" ? "map" : "globe"; }
  catch { return "globe"; }
}

async function setView(v) {
  const want = v === "map" ? "map" : "globe";
  state.view = want;
  try { localStorage.setItem("bd-pm25-view", want); } catch { /* private mode */ }
  paintView(want);

  if (want === "map") {
    // Leaflet measures its container on creation; it was display:none then, so tell it to
    // re-measure every time it comes back on screen.
    requestAnimationFrame(() => state.map.invalidateSize());
    return;
  }
  let ok = false;
  try {
    ok = typeof Globe3D !== "undefined" && await Globe3D.activate();
  } catch (err) {
    console.error(err);
  }
  if (!ok && state.view === "globe") {
    state.view = "map";
    try { localStorage.setItem("bd-pm25-view", "map"); } catch { /* ignore */ }
    paintView("map");
    requestAnimationFrame(() => state.map.invalidateSize());
  }
}

function paintView(view) {
  const onMap = view === "map";
  document.getElementById("map").classList.toggle("is-hidden", !onMap);
  document.getElementById("globe-wrap").hidden = onMap;
  document.getElementById("globe-tools").hidden = onMap;
  document.querySelectorAll("#view-switch .vs-btn").forEach(b =>
    b.classList.toggle("is-on", b.dataset.view === view));
  // options that only mean something on one of the two views
  document.getElementById("map-options").hidden = !onMap;
  document.getElementById("globe-options-note").hidden = onMap;
  if (onMap) document.getElementById("globe-card").hidden = true;
}

/* ---------- the layers/filters drawer ---------- */
function setSidebar(open) {
  document.getElementById("app").classList.toggle("side-closed", !open);
  try { localStorage.setItem("bd-pm25-side", open ? "open" : "closed"); } catch { /* ignore */ }
}

function initMap() {
  state.map = L.map("map", { zoomControl: true, worldCopyJump: false })
    .setView([23.8, 90.35], 7);
  setBasemap("carto");
  L.control.scale({ imperial: false, position: "bottomleft" }).addTo(state.map);
  state.coloLayer = L.layerGroup().addTo(state.map);

  const coordCtl = L.control({ position: "bottomright" });
  coordCtl.onAdd = () => {
    const d = L.DomUtil.create("div", "leaflet-bar");
    d.style.cssText = "background:var(--surface-1);color:var(--text-secondary);padding:2px 6px;font:11px system-ui;border-radius:4px;";
    d.id = "coord-readout"; d.textContent = "—";
    return d;
  };
  coordCtl.addTo(state.map);
  state.map.on("mousemove", e => {
    const el = document.getElementById("coord-readout");
    if (el) el.textContent = `${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)}`;
  });
  state.map.on("moveend", writeHashView);
  state.map.on("zoomend", applyColoSpread);
}

function setBasemap(key) {
  const cfg = BASEMAPS[key];
  if (state.baseLayer) state.map.removeLayer(state.baseLayer);
  state.baseLayer = L.tileLayer(cfg.url, cfg).addTo(state.map);
  state.baseLayer.bringToBack();
}

/* ---------- divisions ---------- */
function buildDivisions(geojson) {
  const counts = {};
  state.allFeatures.forEach(f => {
    const d = f.properties.division;
    if (d) counts[d] = (counts[d] || 0) + 1;
  });
  const styleFor = () => ({ color: "var(--accent)", weight: 1, fillColor: "#2a78d6", fillOpacity: 0.05, opacity: 0.5 });

  state.divisionLayer = L.geoJSON(geojson, {
    style: styleFor,
    onEachFeature: (feat, layer) => {
      const raw = feat.properties.name;
      const name = DIV_ALIAS[raw] || raw;
      const n = counts[name] || 0;
      layer.bindTooltip(
        `<strong>${name}</strong><br><span class="dt-row">${n} station${n === 1 ? "" : "s"} total</span>`,
        { sticky: true, className: "div-tip", direction: "top" }
      );
      layer.on({
        mouseover: () => layer.setStyle({ weight: 2.5, fillOpacity: 0.14, opacity: 0.9 }),
        mouseout: () => state.divisionLayer.resetStyle(layer),
        click: () => state.map.fitBounds(layer.getBounds(), { padding: [30, 30] }),
      });
    },
  }).addTo(state.map);
  state.divisionLayer.bringToBack();
}

/* ---------- markers ---------- */
function buildMarkers() {
  Object.keys(LAYERS).forEach(k => {
    state.markersByLayer[k] = [];
    state.enabled[k] = true;
  });
  state.allFeatures.forEach(f => {
    const p = f.properties;
    const key = LAYERS[p.layer] ? p.layer : "other";
    const [lng, lat] = f.geometry.coordinates;
    const status = p.status || (p.group === "existing" || p.group === "sas" ? "installed" : "proposed");
    const m = L.marker([lat, lng], { icon: makeIcon(key, status), riseOnHover: true });
    m.feature = f; m._layerKey = key; m._status = status; m._trueLatLng = L.latLng(lat, lng);
    m.bindTooltip(`${p.name || p.id} · ${(LAYERS[key] || LAYERS.other).label}`,
      { className: "pin-tip", direction: "top", offset: [0, -8] });
    m.bindPopup(() => popupHTML(p), { maxWidth: 320 });
    state.markersByLayer[key].push(m);
  });
  refreshMarkerDisplay();
}

function statusChip(status) {
  const map = { installed: "#0ca30c", planned: "#eda100", proposed: "#2a78d6", pending: "#898781" };
  const c = map[status] || "#898781";
  return `<span class="status-chip" style="color:${c};border-color:${c}">${status}</span>`;
}

function colocatedWith(p) {
  if (!p.colo_id) return [];
  return state.allFeatures
    .filter(f => f.properties.colo_id === p.colo_id && f.properties.id !== p.id)
    .map(f => f.properties);
}

function popupHTML(p) {
  const L2 = LAYERS[p.layer] || LAYERS.other;
  const rows = [];
  const add = (k, v) => { if (v) rows.push(`<tr><td class="k">${k}</td><td>${v}</td></tr>`); };
  if (p.group === "mine") {
    add("Category", L2.label);
    add("Tier", p.tier);
  } else if (p.group === "doe_proposed") {
    add("Role", L2.label);
    const g = DOE_GROUPS[(p.doe_group || "").split(".")[0].toUpperCase()];
    add("DoE group", (g ? g.title.replace("Group ", "") : p.doe_group)
        + (p.pair_id ? ` · pair ${p.pair_id}` : ""));
    add("Area type", p.area_type);
    add("Reference", p.associated_station);
    add("Host site", p.school);
  } else {
    add("Network", p.network);
    add("Operator", p.operator);
    add("Type", p.monitor_type);
    add("City", p.city);
  }
  add("Division", p.division);
  add("District", p.district);
  if (p.status) add("Status", statusChip(p.status));
  const prec = { approx: "planning-stage (approx.)", exact: "confirmed",
                 derived: "derived from co-located station",
                 "district-centroid": "⚠ generic district point — placeholder" }[p.coord_precision];
  add("Coords", prec || p.coord_precision);
  add("Notes", p.notes);

  const others = colocatedWith(p);
  const kindTag = p.colo_kind === "cams_sas_pa"
    ? `<span class="pc-kind">CAMS + SAS + PurpleAir</span>` : "";
  const coloBlock = others.length ? `
    <div class="pop-colo">
      <div class="pc-h">Same site — ${others.length + 1} stations ${kindTag}</div>
      ${others.map(o => {
        const OL = LAYERS[o.layer] || LAYERS.other;
        return `<div class="pc-row"><span class="pc-dot" style="background:${OL.color}"></span>
          <span class="pc-name">${o.name || o.id}</span>
          <span class="pc-lab">${OL.label}</span></div>`;
      }).join("")}
    </div>` : "";

  const ll = markerLatLng(p);
  const links = [];
  if (ll) links.push(`<a href="https://www.google.com/maps?q=${ll[0]},${ll[1]}" target="_blank" rel="noopener">Google Maps ↗</a>`);
  if (p.source_url) links.push(`<a href="${p.source_url}" target="_blank" rel="noopener">Source ↗</a>`);
  return `<div class="pop">
    <span class="pop-badge" style="background:${L2.color}">${p.id}</span>
    <h3>${p.name || p.id}</h3>
    <table>${rows.join("")}</table>
    ${coloBlock}
    ${links.length ? `<div class="pop-links">${links.join("")}</div>` : ""}
  </div>`;
}

function markerLatLng(p) {
  const f = state.allFeatures.find(x => x.properties.id === p.id);
  if (!f) return null;
  const [lng, lat] = f.geometry.coordinates;
  return [lat, lng];
}

function passesStatus(status) {
  if (state.statusFilter === "all") return true;
  return status === state.statusFilter;
}

// The A/B/C chip filters only inside the DoE-proposed set, so the reference network it is
// being compared against stays on the map.
function passesDoeGroup(p) {
  if (state.doeGroup === "all" || p.group !== "doe_proposed") return true;
  return (p.doe_group || "").split(".")[0].toUpperCase() === state.doeGroup;
}

function passesFilters(m) {
  return passesStatus(m._status) && passesDoeGroup(m.feature.properties);
}

function visibleMarkers() {
  const out = [];
  Object.keys(LAYERS).forEach(key => {
    if (!state.enabled[key]) return;
    state.markersByLayer[key].forEach(m => { if (passesFilters(m)) out.push(m); });
  });
  return out;
}

function refreshMarkerDisplay() {
  Object.keys(LAYERS).forEach(key => {
    if (state.clusterByLayer[key]) { state.map.removeLayer(state.clusterByLayer[key]); state.clusterByLayer[key] = null; }
    state.markersByLayer[key].forEach(m => state.map.removeLayer(m));
    if (!state.enabled[key]) return;
    const visible = state.markersByLayer[key].filter(passesFilters);
    if (state.useCluster) {
      const cg = L.markerClusterGroup({ maxClusterRadius: 40, spiderfyOnMaxZoom: true, showCoverageOnHover: false });
      visible.forEach(m => cg.addLayer(m));
      state.clusterByLayer[key] = cg;
      state.map.addLayer(cg);
    } else {
      visible.forEach(m => m.addTo(state.map));
    }
  });
  applyColoSpread();
  updateCountBadges();
  if (typeof Globe3D !== "undefined" && Globe3D.isReady()) Globe3D.refresh();
}

/* ---------- co-located site fan-out ----------
 * Several networks often share one compound (e.g. CAMS + SAS + GAIA + a proposed unit).
 * Stacked pins hide each other, so spread the group on a small pixel-radius ring around
 * the true site and draw leader lines back to it. Recomputed on zoom and on any filter
 * change, because the ring size is in screen pixels, not degrees. */
function applyColoSpread() {
  state.coloLayer.clearLayers();
  Object.keys(LAYERS).forEach(key =>
    state.markersByLayer[key].forEach(m => {
      if (!m.getLatLng().equals(m._trueLatLng)) m.setLatLng(m._trueLatLng);
    }));

  const groups = {};
  visibleMarkers().forEach(m => {
    const cid = m.feature.properties.colo_id;
    if (cid) (groups[cid] = groups[cid] || []).push(m);
  });
  const siteAnchor = ms => L.latLng(
    ms.reduce((s, m) => s + m._trueLatLng.lat, 0) / ms.length,
    ms.reduce((s, m) => s + m._trueLatLng.lng, 0) / ms.length);

  // The seven calibration compounds: DoE CAMS + SAS area + a proposed PurpleAir unit on
  // one site. Ringed whether or not the fan-out is on, so they read at a glance.
  Object.values(groups).forEach(ms => {
    if (ms[0].feature.properties.colo_kind !== "cams_sas_pa") return;
    state.coloLayer.addLayer(L.circleMarker(siteAnchor(ms), {
      radius: 34, color: "#d62828", weight: 1.6, dashArray: "4 4", opacity: 0.85,
      fillColor: "#d62828", fillOpacity: 0.06, interactive: false,
    }));
  });

  if (!state.spread || state.useCluster) return;

  Object.values(groups).forEach(ms => {
    if (ms.length < 2) return;
    const anchor = siteAnchor(ms);
    const ap = state.map.latLngToLayerPoint(anchor);
    const radius = Math.min(38, 15 + 3.4 * ms.length);

    ms.forEach((m, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / ms.length;
      const pos = state.map.layerPointToLatLng(
        L.point(ap.x + radius * Math.cos(a), ap.y + radius * Math.sin(a)));
      m.setLatLng(pos);
      state.coloLayer.addLayer(L.polyline([anchor, pos], {
        color: "#8a8a8a", weight: 1, opacity: 0.5, interactive: false,
      }));
    });
    state.coloLayer.addLayer(L.circleMarker(anchor, {
      radius: 2.5, color: "#8a8a8a", weight: 1, fillColor: "#8a8a8a",
      fillOpacity: 0.9, interactive: false,
    }));
  });
}

function updateCountBadges() {
  Object.keys(LAYERS).forEach(key => {
    const el = document.querySelector(`.lr-count[data-key="${key}"]`);
    if (!el) return;
    const total = state.markersByLayer[key].length;
    const shown = state.markersByLayer[key].filter(passesFilters).length;
    el.textContent = shown === total ? total : `${shown}/${total}`;
  });
}

/* ---------- layer controls ---------- */
function buildLayerControls() {
  const keys = Object.keys(LAYERS).sort((a, b) => LAYERS[a].order - LAYERS[b].order);
  keys.forEach(key => {
    const L2 = LAYERS[key];
    const host = document.getElementById(`layers-${L2.section}`);
    if (!host) return;
    const count = state.markersByLayer[key] ? state.markersByLayer[key].length : 0;
    if (count === 0 && L2.hideIfEmpty) return;
    const row = document.createElement("label");
    row.className = "layer-row";
    row.innerHTML = `
      <input type="checkbox" checked data-key="${key}" />
      <span class="swatch">${markerSVG(key, true, L2.family === "sas" ? 17 : 15)}</span>
      <span class="lr-label">${L2.label}</span>
      <span class="lr-count" data-key="${key}">${count}</span>`;
    const cb = row.querySelector("input");
    cb.addEventListener("change", () => {
      state.enabled[key] = cb.checked;
      row.classList.toggle("is-off", !cb.checked);
      refreshMarkerDisplay();
    });
    host.appendChild(row);
  });
}

/* ---------- DoE sheet group filter (A / B / C) ---------- */
function buildDoeGroupFilter() {
  const host = document.getElementById("doe-group-filter");
  if (!host) return;
  const totals = state.summary?.doe_group_totals || {};
  const units = state.summary?.doe_proposed_units ?? 0;
  const chips = [`<button class="seg-btn is-on" data-doegroup="all" title="Every unit in the DoE sheet">All ${units}</button>`];
  Object.keys(DOE_GROUPS).forEach(g => {
    if (!totals[g]) return;
    chips.push(`<button class="seg-btn" data-doegroup="${g}" title="${DOE_GROUPS[g].title}">${DOE_GROUPS[g].label} · ${totals[g]}</button>`);
  });
  host.innerHTML = chips.join("");
  host.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      host.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("is-on"));
      btn.classList.add("is-on");
      state.doeGroup = btn.dataset.doegroup;
      refreshMarkerDisplay();
    });
  });
}

/* ---------- stats ---------- */
function buildStats() {
  const bySection = s => state.allFeatures.filter(f => (LAYERS[f.properties.layer] || LAYERS.other).section === s).length;
  const units = state.summary?.doe_proposed_units ?? bySection("doe_proposed");
  const row = document.getElementById("stat-row");
  row.innerHTML = `
    <div class="stat"><div class="num">${units}</div><div class="lab">DoE PurpleAir</div></div>
    <div class="stat"><div class="num">${bySection("sas")}</div><div class="lab">Super SAS</div></div>
    <div class="stat"><div class="num">${bySection("mine")}</div><div class="lab">UW–BUET</div></div>
    <div class="stat"><div class="num">${bySection("existing")}</div><div class="lab">Existing</div></div>`;
  const stamp = [];
  if (state.summary?.built_utc) stamp.push("Data built " + state.summary.built_utc);
  if (state.summary?.colocated_sites) stamp.push(`${state.summary.colocated_sites} shared sites`);
  if (state.summary?.cams_sas_pa_sites)
    stamp.push(`${state.summary.cams_sas_pa_sites} CAMS+SAS+PurpleAir`);
  document.getElementById("built-stamp").textContent = stamp.join(" · ");
}

/* ---------- awaiting-siting list ---------- */
function buildPending() {
  const items = state.summary?.pending || [];
  if (!items.length) return;
  document.getElementById("pending-panel").hidden = false;
  document.getElementById("pending-count").textContent = items.length;
  document.getElementById("pending-list").innerHTML = items.map(it => {
    const L2 = LAYERS[it.layer] || LAYERS.other;
    return `<li><span class="pc-dot" style="background:${L2.color}"></span>
      <span class="pd-name">${it.name || it.id}</span>
      <span class="pd-sub">${it.district || it.division || ""} — ${it.reason}</span></li>`;
  }).join("");
}

/* ---------- UI wiring ---------- */
function wireUI() {
  // The drawer overlays the stage, so opening it never resizes either renderer.
  document.getElementById("side-toggle").addEventListener("click", () => setSidebar(false));
  document.getElementById("sidebar-open").addEventListener("click", () => setSidebar(true));
  try { setSidebar(localStorage.getItem("bd-pm25-side") === "open"); }
  catch { setSidebar(false); }

  document.querySelectorAll("#view-switch .vs-btn").forEach(btn => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  // Both renderers need a concrete pixel size; give them one whenever the window changes.
  const onResize = () => {
    if (state.view === "map") state.map.invalidateSize();
    else if (typeof Globe3D !== "undefined" && Globe3D.isReady()) Globe3D.resize();
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(onResize).observe(document.getElementById("stage"));
  }

  document.querySelectorAll("#status-filter .seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#status-filter .seg-btn").forEach(b => b.classList.remove("is-on"));
      btn.classList.add("is-on");
      state.statusFilter = btn.dataset.status;
      refreshMarkerDisplay();
    });
  });

  document.querySelectorAll(".mini-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.group;
      const keys = Object.keys(LAYERS).filter(k => LAYERS[k].section === section);
      const turnOff = btn.textContent.startsWith("hide");
      keys.forEach(k => {
        state.enabled[k] = !turnOff;
        const cb = document.querySelector(`input[data-key="${k}"]`);
        if (cb) { cb.checked = !turnOff; cb.closest(".layer-row").classList.toggle("is-off", turnOff); }
      });
      btn.textContent = turnOff ? "show all" : "hide all";
      refreshMarkerDisplay();
    });
  });

  document.getElementById("opt-spread").addEventListener("change", e => {
    state.spread = e.target.checked; applyColoSpread();
  });
  document.getElementById("opt-cluster").addEventListener("change", e => {
    state.useCluster = e.target.checked; refreshMarkerDisplay();
  });
  document.getElementById("opt-divlabels").addEventListener("change", e => {
    if (e.target.checked) state.divisionLayer.addTo(state.map).bringToBack();
    else state.map.removeLayer(state.divisionLayer);
  });
  document.getElementById("opt-theme").addEventListener("change", e => {
    const dark = e.target.checked;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    const sel = document.getElementById("opt-basemap");
    if (dark && sel.value === "carto") { sel.value = "cartodark"; setBasemap("cartodark"); }
    if (!dark && sel.value === "cartodark") { sel.value = "carto"; setBasemap("carto"); }
    if (typeof Globe3D !== "undefined" && Globe3D.isReady()) Globe3D.applyTheme();
  });
  document.getElementById("opt-basemap").addEventListener("change", e => setBasemap(e.target.value));

  wireSearch();
}

/* ---------- search ---------- */
function wireSearch() {
  const input = document.getElementById("search");
  const results = document.getElementById("search-results");
  let idx = -1;
  const render = (items) => {
    if (!items.length) { results.hidden = true; return; }
    results.innerHTML = items.map((it, i) =>
      `<li data-i="${i}"><div>${it.p.name || it.p.id}</div><div class="r-sub">${(LAYERS[it.key]||LAYERS.other).label} · ${it.p.district || it.p.division || it.p.city || ""}</div></li>`
    ).join("");
    results.hidden = false; idx = -1;
    Array.from(results.children).forEach((li, i) => {
      li.addEventListener("click", () => flyTo(items[i]));
    });
    results._items = items;
  };
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { results.hidden = true; return; }
    const items = [];
    state.allFeatures.forEach(f => {
      const p = f.properties;
      const hay = `${p.name} ${p.district || ""} ${p.city || ""} ${p.id} ${p.division || ""} ${p.school || ""} ${p.pair_id || ""}`.toLowerCase();
      if (hay.includes(q)) items.push({ p, key: LAYERS[p.layer] ? p.layer : "other", f });
    });
    render(items.slice(0, 20));
  });
  input.addEventListener("keydown", e => {
    const items = results._items || [];
    if (e.key === "ArrowDown") { idx = Math.min(idx + 1, items.length - 1); highlight(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { idx = Math.max(idx - 1, 0); highlight(); e.preventDefault(); }
    else if (e.key === "Enter" && items[idx]) { flyTo(items[idx]); }
    else if (e.key === "Escape") { results.hidden = true; }
  });
  function highlight() {
    Array.from(results.children).forEach((li, i) => li.classList.toggle("active", i === idx));
  }
  function flyTo(item) {
    const [lng, lat] = item.f.geometry.coordinates;
    if (!state.enabled[item.key]) {
      state.enabled[item.key] = true;
      const cb = document.querySelector(`input[data-key="${item.key}"]`);
      if (cb) { cb.checked = true; cb.closest(".layer-row").classList.remove("is-off"); }
      refreshMarkerDisplay();
    }
    if (state.view === "globe" && typeof Globe3D !== "undefined" && Globe3D.isReady()) {
      Globe3D.flyToFeature(item.f);
      results.hidden = true; input.blur();
      return;
    }
    state.map.flyTo([lat, lng], 14, { duration: 0.8 });
    const marker = state.markersByLayer[item.key].find(m => m.feature.properties.id === item.p.id);
    if (marker) setTimeout(() => marker.openPopup(), 900);
    results.hidden = true; input.blur();
  }
  document.addEventListener("click", e => {
    if (!e.target.closest(".search-wrap")) results.hidden = true;
  });
}

/* ---------- shareable view via URL hash ----------
 * Only the 2D map writes to the hash. It is created hidden and fires moveend while it is
 * off screen, which used to stamp a meaningless #0/... on the URL before you had touched
 * anything. */
function writeHashView() {
  if (state.view !== "map") return;
  const c = state.map.getCenter();
  location.replace(`#${state.map.getZoom()}/${c.lat.toFixed(3)}/${c.lng.toFixed(3)}`);
}
function applyHashView() {
  const m = location.hash.match(/^#(\d+)\/([\d.-]+)\/([\d.-]+)/);
  if (m) state.map.setView([parseFloat(m[2]), parseFloat(m[3])], parseInt(m[1], 10));
}

boot().catch(err => {
  console.error(err);
  document.getElementById("map").innerHTML =
    `<div style="padding:40px;font:14px system-ui;color:#b00">Failed to load map data: ${err.message}<br>Run <code>python scripts/build_map.py</code> first.</div>`;
});
