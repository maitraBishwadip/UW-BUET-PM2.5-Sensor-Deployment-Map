/* Bangladesh PM2.5 Deployment Map
 * Reads docs/data/{deployments.geojson, divisions.json, summary.json} produced by
 * scripts/build_map.py and renders an interactive Leaflet map. No hardcoded station
 * counts — everything is derived from the data at load time.
 */
"use strict";

const REPO_URL = "https://github.com/maitraBishwadip/UW-BUET-PM2.5-Sensor-Deployment-Map";

/* Layer catalogue: shape encodes owner/type, colour encodes category.
 * order controls legend order. group ties a layer to a section + summary tally. */
const LAYERS = {
  // --- my deployments ---
  doe_colocation:     { label: "DoE colocation (Block A)", group: "mine", shape: "square",   color: "#2a78d6", order: 1 },
  border:             { label: "Border area (Block B)",     group: "mine", shape: "square",   color: "#e34948", order: 2 },
  ambient_semi_urban: { label: "Ambient · semi-urban",      group: "mine", shape: "diamond",  color: "#eb6834", order: 3 },
  ambient_village:    { label: "Ambient · village/rural",   group: "mine", shape: "diamond",  color: "#008300", order: 4 },
  pollution_hotspot:  { label: "Pollution source / hotspot",group: "mine", shape: "diamond",  color: "#111111", order: 5 },
  // --- existing networks ---
  doe_cams:           { label: "DoE CAMS (reference)",      group: "existing", shape: "star5",    color: "#eda100", order: 10 },
  doe_ccams:          { label: "DoE C-CAMS (reference)",    group: "existing", shape: "star4",    color: "#4a3aa7", order: 11 },
  us_embassy:         { label: "US Embassy (BAM ref.)",     group: "existing", shape: "triangle", color: "#256abf", order: 12 },
  spartan:            { label: "SPARTAN (filter ref.)",     group: "existing", shape: "pentagon", color: "#8a5a2b", order: 13 },
  gaia:               { label: "GAIA / aqicn (low-cost)",   group: "existing", shape: "circle",   color: "#1baf7a", order: 14 },
  purpleair:          { label: "PurpleAir (low-cost)",      group: "existing", shape: "circle",   color: "#7c4dff", order: 15 },
  iqair:              { label: "IQAir (low-cost)",          group: "existing", shape: "circle",   color: "#e87ba4", order: 16 },
  community:          { label: "aqicn community (low-cost)",group: "existing", shape: "circle",   color: "#6f6f6f", order: 17 },
  other:              { label: "Other",                     group: "existing", shape: "circle",   color: "#898781", order: 18 },
};

// bd.json uses older division spellings; map them to the report spellings.
const DIV_ALIAS = { "Barisal": "Barishal", "Chittagong": "Chattogram" };

const BASEMAPS = {
  carto:     { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 20 },
  cartodark: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 20 },
  osm:       { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "&copy; OpenStreetMap contributors", subdomains: "abc", maxZoom: 19 },
  esri:      { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Tiles &copy; Esri", maxZoom: 19 },
};

/* ---------- SVG marker factory ---------- */
function shapeSVG(shape, color, filled, size) {
  const s = size, c = s / 2, r = s / 2 - 2;
  const fill = filled ? color : "var(--surface-1, #fff)";
  const sw = filled ? 1.5 : 2.4;
  const dash = "";
  let inner;
  switch (shape) {
    case "circle":
      inner = `<circle cx="${c}" cy="${c}" r="${r}" fill="${fill}" stroke="${color}" stroke-width="${sw}"/>`; break;
    case "square": {
      const p = 3;
      inner = `<rect x="${p}" y="${p}" width="${s - 2 * p}" height="${s - 2 * p}" rx="2.5" fill="${fill}" stroke="${color}" stroke-width="${sw}"/>`; break;
    }
    case "diamond":
      inner = `<polygon points="${c},2 ${s - 2},${c} ${c},${s - 2} 2,${c}" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"/>`; break;
    case "triangle":
      inner = `<polygon points="${c},2.5 ${s - 2},${s - 3} 2,${s - 3}" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"/>`; break;
    case "pentagon": {
      inner = `<polygon points="${starPts(c, c, r, r, 5, -Math.PI / 2)}" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"/>`; break;
    }
    case "star5":
      inner = `<polygon points="${starPts(c, c, r, r * 0.45, 5, -Math.PI / 2)}" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"/>`; break;
    case "star4":
      inner = `<polygon points="${starPts(c, c, r, r * 0.4, 4, -Math.PI / 2)}" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"/>`; break;
    default:
      inner = `<circle cx="${c}" cy="${c}" r="${r}" fill="${fill}" stroke="${color}" stroke-width="${sw}"/>`;
  }
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
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
function polyPts(cx, cy, r, n, rot) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (2 * Math.PI * i) / n;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}
// pentagon uses polyPts via starPts fallback fix:
function pentagon(cx, cy, r) { return polyPts(cx, cy, r, 5, -Math.PI / 2); }

function makeIcon(layerKey, status, size = 22) {
  const L2 = LAYERS[layerKey] || LAYERS.other;
  const filled = status === "installed";
  let svg;
  if (L2.shape === "pentagon") {
    const s = size, c = s / 2, r = s / 2 - 2;
    const fill = filled ? L2.color : "var(--surface-1,#fff)";
    const sw = filled ? 1.5 : 2.4;
    svg = `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg"><polygon points="${pentagon(c, c, r)}" fill="${fill}" stroke="${L2.color}" stroke-width="${sw}" stroke-linejoin="round"/></svg>`;
  } else {
    svg = shapeSVG(L2.shape, L2.color, filled, size);
  }
  return L.divIcon({ className: "pin", html: svg, iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 + 2] });
}

/* ---------- state ---------- */
const state = {
  map: null, baseLayer: null, divisionLayer: null,
  markersByLayer: {}, clusterByLayer: {}, useCluster: false,
  enabled: {}, statusFilter: "all", allFeatures: [], summary: null,
  divCountEls: {},
};

/* ---------- load & init ---------- */
async function boot() {
  document.getElementById("repo-link").innerHTML =
    `<a href="${REPO_URL}" target="_blank" rel="noopener">Source &amp; how to update ↗</a>`;

  const [geo, divisions, summary] = await Promise.all([
    fetch("data/deployments.geojson").then(r => r.json()),
    fetch("data/divisions.json").then(r => r.json()),
    fetch("data/summary.json").then(r => r.json()).catch(() => null),
  ]);
  state.allFeatures = geo.features;
  state.summary = summary;

  initMap();
  buildDivisions(divisions);
  buildMarkers();
  buildLayerControls();
  buildStats();
  wireUI();
  applyHashView();
}

function initMap() {
  state.map = L.map("map", { zoomControl: true, worldCopyJump: false })
    .setView([23.8, 90.35], 7);
  setBasemap("carto");
  L.control.scale({ imperial: false, position: "bottomleft" }).addTo(state.map);

  // mouse coordinate readout
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
    const status = p.status || (p.group === "existing" ? "installed" : "planned");
    const m = L.marker([lat, lng], { icon: makeIcon(key, status), riseOnHover: true });
    m.feature = f; m._layerKey = key; m._status = status;
    m.bindTooltip(p.name || p.id, { className: "pin-tip", direction: "top", offset: [0, -6] });
    m.bindPopup(() => popupHTML(p), { maxWidth: 300 });
    state.markersByLayer[key].push(m);
  });
  refreshMarkerDisplay();
}

function statusChip(status) {
  const map = { installed: "#0ca30c", planned: "#eda100", proposed: "#898781" };
  const c = map[status] || "#898781";
  return `<span class="status-chip" style="color:${c};border-color:${c}">${status}</span>`;
}

function popupHTML(p) {
  const L2 = LAYERS[p.layer] || LAYERS.other;
  const rows = [];
  const add = (k, v) => { if (v) rows.push(`<tr><td class="k">${k}</td><td>${v}</td></tr>`); };
  if (p.group === "mine") {
    add("Category", L2.label);
    add("Tier", p.tier);
    add("Division", p.division);
    add("District", p.district);
    add("Status", statusChip(p.status));
    add("Coords", p.coord_precision === "approx" ? "planning-stage (approx.)" : "confirmed");
  } else {
    add("Network", p.network);
    add("Operator", p.operator);
    add("Type", p.monitor_type);
    add("City", p.city);
    add("Division", p.division);
  }
  add("Notes", p.notes);
  const ll = markerLatLng(p);
  const links = [];
  if (ll) links.push(`<a href="https://www.google.com/maps?q=${ll[0]},${ll[1]}" target="_blank" rel="noopener">Google Maps ↗</a>`);
  if (p.source_url) links.push(`<a href="${p.source_url}" target="_blank" rel="noopener">Source ↗</a>`);
  return `<div class="pop">
    <span class="pop-badge" style="background:${L2.color}">${p.id}</span>
    <h3>${p.name || p.id}</h3>
    <table>${rows.join("")}</table>
    ${links.length ? `<div class="pop-links">${links.join("")}</div>` : ""}
  </div>`;
}
function markerLatLng(p) {
  // find the marker's coordinates from the source feature
  const f = state.allFeatures.find(x => x.properties.id === p.id);
  if (!f) return null;
  const [lng, lat] = f.geometry.coordinates;
  return [lat, lng];
}

function passesStatus(status) {
  if (state.statusFilter === "all") return true;
  return status === state.statusFilter;
}

function refreshMarkerDisplay() {
  Object.keys(LAYERS).forEach(key => {
    // remove existing renderings
    if (state.clusterByLayer[key]) { state.map.removeLayer(state.clusterByLayer[key]); state.clusterByLayer[key] = null; }
    state.markersByLayer[key].forEach(m => state.map.removeLayer(m));
    if (!state.enabled[key]) return;
    const visible = state.markersByLayer[key].filter(m => passesStatus(m._status));
    if (state.useCluster) {
      const cg = L.markerClusterGroup({ maxClusterRadius: 40, spiderfyOnMaxZoom: true, showCoverageOnHover: false });
      visible.forEach(m => cg.addLayer(m));
      state.clusterByLayer[key] = cg;
      state.map.addLayer(cg);
    } else {
      visible.forEach(m => m.addTo(state.map));
    }
  });
  updateCountBadges();
}

function updateCountBadges() {
  Object.keys(LAYERS).forEach(key => {
    const el = document.querySelector(`.lr-count[data-key="${key}"]`);
    if (!el) return;
    const total = state.markersByLayer[key].length;
    const shown = state.markersByLayer[key].filter(m => passesStatus(m._status)).length;
    el.textContent = state.statusFilter === "all" ? total : `${shown}/${total}`;
  });
}

/* ---------- layer controls ---------- */
function buildLayerControls() {
  const groups = { mine: document.getElementById("layers-mine"), existing: document.getElementById("layers-existing") };
  const keys = Object.keys(LAYERS).sort((a, b) => LAYERS[a].order - LAYERS[b].order);
  keys.forEach(key => {
    const L2 = LAYERS[key];
    const count = state.markersByLayer[key] ? state.markersByLayer[key].length : 0;
    if (count === 0 && key === "other") return; // hide empty catch-all
    const row = document.createElement("label");
    row.className = "layer-row";
    row.innerHTML = `
      <input type="checkbox" checked data-key="${key}" />
      <span class="swatch">${shapeSVG(L2.shape === "pentagon" ? "pentagon" : L2.shape, L2.color, true, 18).replace("pentagon", "")}</span>
      <span class="lr-label">${L2.label}</span>
      <span class="lr-count" data-key="${key}">${count}</span>`;
    // pentagon swatch fix
    if (L2.shape === "pentagon") {
      row.querySelector(".swatch").innerHTML =
        `<svg width="18" height="18" viewBox="0 0 18 18"><polygon points="${pentagon(9,9,7)}" fill="${L2.color}" stroke="${L2.color}" stroke-width="1"/></svg>`;
    }
    const cb = row.querySelector("input");
    cb.addEventListener("change", () => {
      state.enabled[key] = cb.checked;
      row.classList.toggle("is-off", !cb.checked);
      refreshMarkerDisplay();
    });
    groups[L2.group].appendChild(row);
  });

  // legend note
  const note = document.createElement("p");
  note.className = "legend-note";
  note.innerHTML = "Shape = monitor type · colour = category. Hollow = planned, solid = installed.";
  groups.mine.parentElement.appendChild(note);
}

/* ---------- stats ---------- */
function buildStats() {
  const mineKeys = ["doe_colocation", "border", "ambient_semi_urban", "ambient_village", "pollution_hotspot"];
  const mine = mineKeys.reduce((n, k) => n + (state.markersByLayer[k]?.length || 0), 0);
  const doe = (state.markersByLayer.doe_cams?.length || 0) + (state.markersByLayer.doe_ccams?.length || 0);
  const existing = state.allFeatures.filter(f => f.properties.group === "existing").length;
  const row = document.getElementById("stat-row");
  row.innerHTML = `
    <div class="stat"><div class="num">${mine}</div><div class="lab">My sensors</div></div>
    <div class="stat"><div class="num">${doe}</div><div class="lab">DoE CAMS</div></div>
    <div class="stat"><div class="num">${existing}</div><div class="lab">3rd-party</div></div>`;
  if (state.summary?.built_utc)
    document.getElementById("built-stamp").textContent = "Data built " + state.summary.built_utc;
}

/* ---------- UI wiring ---------- */
function wireUI() {
  // sidebar collapse
  const app = document.getElementById("app");
  const openBtn = document.getElementById("sidebar-open");
  document.getElementById("side-toggle").addEventListener("click", () => {
    app.classList.add("side-collapsed"); openBtn.hidden = false;
    setTimeout(() => state.map.invalidateSize(), 300);
  });
  openBtn.addEventListener("click", () => {
    app.classList.remove("side-collapsed"); openBtn.hidden = true;
    setTimeout(() => state.map.invalidateSize(), 300);
  });

  // status filter
  document.querySelectorAll("#status-filter .seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#status-filter .seg-btn").forEach(b => b.classList.remove("is-on"));
      btn.classList.add("is-on");
      state.statusFilter = btn.dataset.status;
      refreshMarkerDisplay();
    });
  });

  // group hide/show all
  document.querySelectorAll(".mini-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      const group = btn.dataset.group;
      const keys = Object.keys(LAYERS).filter(k => LAYERS[k].group === group);
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

  // options
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
    // auto-switch basemap for readability
    const sel = document.getElementById("opt-basemap");
    if (dark && sel.value === "carto") { sel.value = "cartodark"; setBasemap("cartodark"); }
    if (!dark && sel.value === "cartodark") { sel.value = "carto"; setBasemap("carto"); }
    redrawIcons();
  });
  document.getElementById("opt-basemap").addEventListener("change", e => setBasemap(e.target.value));

  wireSearch();
}

// hollow icons reference --surface-1; redraw them after a theme flip so fill updates
function redrawIcons() {
  Object.keys(state.markersByLayer).forEach(key => {
    state.markersByLayer[key].forEach(m => m.setIcon(makeIcon(key, m._status)));
  });
}

/* ---------- search ---------- */
function wireSearch() {
  const input = document.getElementById("search");
  const results = document.getElementById("search-results");
  let idx = -1;
  const render = (items) => {
    if (!items.length) { results.hidden = true; return; }
    results.innerHTML = items.map((it, i) =>
      `<li data-i="${i}"><div>${it.p.name || it.p.id}</div><div class="r-sub">${(LAYERS[it.key]||LAYERS.other).label} · ${it.p.division || it.p.city || ""}</div></li>`
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
      const hay = `${p.name} ${p.district || ""} ${p.city || ""} ${p.id} ${p.division || ""}`.toLowerCase();
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
    // ensure its layer is on
    if (!state.enabled[item.key]) {
      state.enabled[item.key] = true;
      const cb = document.querySelector(`input[data-key="${item.key}"]`);
      if (cb) { cb.checked = true; cb.closest(".layer-row").classList.remove("is-off"); }
      refreshMarkerDisplay();
    }
    state.map.flyTo([lat, lng], 12, { duration: 0.8 });
    const marker = state.markersByLayer[item.key].find(m => m.feature.properties.id === item.p.id);
    if (marker) setTimeout(() => marker.openPopup(), 850);
    results.hidden = true; input.blur();
  }
  document.addEventListener("click", e => {
    if (!e.target.closest(".search-wrap")) results.hidden = true;
  });
}

/* ---------- shareable view via URL hash ---------- */
function writeHashView() {
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
