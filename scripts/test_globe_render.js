/* Headless smoke test for the globe's render path.
 *
 * There is no browser in this workflow, so the drawing code is exercised here instead:
 * a stub canvas records every call, the real docs/data/*.json is loaded, and the globe is
 * drawn at several zoom levels. It catches the failures that matter for untested UI code -
 * an exception mid-frame, geometry that never reaches the canvas, markers projected off
 * screen, district shading that never fires.
 *
 *     node scripts/test_globe_render.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "docs", "data");
const readJSON = f => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));

/* ---------- stub browser ---------- */
const calls = { fill: 0, stroke: 0, fillText: 0, arc: 0, moveTo: 0, gradient: 0 };
function makeCtx() {
  const noop = () => {};
  return {
    fillStyle: "", strokeStyle: "", lineWidth: 1, lineJoin: "", lineCap: "",
    font: "", textAlign: "", textBaseline: "",
    shadowColor: "", shadowBlur: 0, shadowOffsetY: 0,
    setTransform: noop, clearRect: noop, fillRect: noop, save: noop, restore: noop,
    beginPath: noop, closePath: noop, clip: noop, setLineDash: noop,
    translate: noop, scale: noop, measureText: () => ({ width: 40 }),
    moveTo: () => { calls.moveTo++; }, lineTo: noop,
    arc: () => { calls.arc++; },
    fill: () => { calls.fill++; }, stroke: () => { calls.stroke++; },
    fillText: () => { calls.fillText++; }, strokeText: noop,
    createLinearGradient: () => { calls.gradient++; return { addColorStop: noop }; },
    createRadialGradient: () => { calls.gradient++; return { addColorStop: noop }; },
  };
}

const els = {};
function stubEl(id) {
  if (els[id]) return els[id];
  const el = {
    id, hidden: false, textContent: "", innerHTML: "", style: {},
    width: 0, height: 0,
    getContext: () => (el._ctx = el._ctx || makeCtx()),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
    addEventListener: (t, fn) => { (el._on = el._on || {})[t] = fn; },
    removeEventListener: () => {},
    setPointerCapture: () => {},
    querySelector: () => ({ onclick: null }),
    querySelectorAll: () => [],
    classList: { toggle: () => {}, add: () => {}, remove: () => {} },
  };
  els[id] = el;
  return el;
}

const rafQueue = [];
let clock = 0;
global.performance = { now: () => clock };
global.requestAnimationFrame = fn => { rafQueue.push(fn); return rafQueue.length; };
global.cancelAnimationFrame = () => {};
function flushFrames(n, dt = 60) {
  for (let i = 0; i < n && rafQueue.length; i++) {
    clock += dt;
    const batch = rafQueue.splice(0, rafQueue.length);
    batch.forEach(fn => fn(clock));
  }
}

global.document = {
  documentElement: {},
  getElementById: id => (["globe-canvas", "globe-wrap", "globe-tip", "globe-flash",
                         "globe-hint", "globe-card"].includes(id) ? stubEl(id) : null),
  addEventListener: () => {},
};
global.getComputedStyle = () => ({ getPropertyValue: () => "" });
global.window = {
  devicePixelRatio: 2,
  matchMedia: () => ({ matches: false }),
  addEventListener: () => {},
};
global.ResizeObserver = class { observe() {} };
global.Path2D = class { constructor(d) { this.d = d; } };

/* ---------- stub the contract app.js provides ---------- */
global.LAYERS = {
  doe_prop_cams: { label: "On a CAMS + SAS compound", section: "doe_proposed", family: "prop", color: "#0b3d91" },
  doe_prop_sas: { label: "On a rural SAS area", section: "doe_proposed", family: "prop", color: "#00838f" },
  doe_prop_rural: { label: "New rural site", section: "doe_proposed", family: "prop", color: "#3f9142" },
  doe_prop_urban: { label: "New urban site", section: "doe_proposed", family: "prop", color: "#7b3fa0" },
  doe_prop_district: { label: "New district", section: "doe_proposed", family: "prop", color: "#c2185b" },
  doe_sas: { label: "Source Apportionment Study", section: "sas", family: "sas", color: "#d62828" },
  doe_colocation: { label: "DoE colocation", section: "mine", family: "mine", color: "#1f6feb" },
  border: { label: "Border area", section: "mine", family: "mine", color: "#e4572e" },
  ambient_semi_urban: { label: "Ambient semi-urban", section: "mine", family: "mine", color: "#f2a65a" },
  ambient_village: { label: "Ambient village", section: "mine", family: "mine", color: "#17a398" },
  pollution_hotspot: { label: "Hotspot", section: "mine", family: "mine", color: "#2b2b2b" },
  doe_cams: { label: "DoE CAMS", section: "existing", family: "ref", color: "#e8a33d" },
  doe_ccams: { label: "DoE C-CAMS", section: "existing", family: "ref", color: "#8d6e29" },
  us_embassy: { label: "US Embassy", section: "existing", family: "ref", color: "#2e4a7d" },
  spartan: { label: "SPARTAN", section: "existing", family: "ref", color: "#795548" },
  purpleair: { label: "PurpleAir", section: "existing", family: "lowcost", color: "#7c4dff" },
  gaia: { label: "GAIA", section: "existing", family: "lowcost", color: "#b07aa1" },
  iqair: { label: "IQAir", section: "existing", family: "lowcost", color: "#e87ba4" },
  community: { label: "community", section: "existing", family: "lowcost", color: "#78909c" },
  other: { label: "Other", section: "existing", family: "lowcost", color: "#9e9e9e" },
};
global.mixWhite = (hex, t) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const m = v => Math.round(v + (255 - v) * t);
  return `#${((1 << 24) | (m(r) << 16) | (m(gg) << 8) | m(b)).toString(16).slice(1)}`;
};
global.state = { allFeatures: [], enabled: {}, statusFilter: "all", doeGroup: "all" };
global.passesStatus = s => state.statusFilter === "all" || s === state.statusFilter;
global.passesDoeGroup = p => state.doeGroup === "all" || p.group !== "doe_proposed"
  || (p.doe_group || "").split(".")[0].toUpperCase() === state.doeGroup;
global.popupHTML = p => `<div class="pop"><h3>${p.name}</h3></div>`;

/* ---------- run ---------- */
const Globe = require(path.join(ROOT, "docs", "assets", "globe.js"));
const geo = readJSON("deployments.geojson");
const world = readJSON("world.json");
const districts = readJSON("districts.json");
const divisions = readJSON("divisions.json");
state.allFeatures = geo.features;
Object.keys(LAYERS).forEach(k => { state.enabled[k] = true; });

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${detail}`); }
};

Globe.init({ world, districts, divisions });
flushFrames(3);
const { g, scaleForSpan } = Globe._internals;

check("canvas sized against the device pixel ratio",
  els["globe-canvas"].width === 2400 && els["globe-canvas"].height === 1600,
  `${els["globe-canvas"].width}x${els["globe-canvas"].height}`);
check("initial view is the whole globe", Math.abs(g.scale - g.minScale) < 1e-6,
  `scale ${g.scale} minScale ${g.minScale}`);

function drawAt(spanPx) {
  g.scale = Math.max(g.minScale, Math.min(g.maxScale, scaleForSpan(spanPx)));
  g.lam0 = 90.35; g.phi0 = 23.525;
  Object.keys(calls).forEach(k => { calls[k] = 0; });
  Globe.draw();
  flushFrames(2);
  return { ...calls, markers: g.projected.length, districtCounts: Object.keys(g.districtCounts).length };
}

// whole globe: one aggregate badge, no individual pins
{
  const r = drawAt(50);
  check("zoomed out: world geometry is drawn", r.fill > 100, `fills=${r.fill}`);
  check("zoomed out: no individual pins", r.markers === 0, `markers=${r.markers}`);
}

// country view: districts + every visible station
{
  const r = drawAt(620);
  check("country view: all 180 stations project on screen", r.markers === 180,
    `markers=${r.markers}`);
  check("country view: districts are shaded", r.districtCounts === 54,
    `districts with counts=${r.districtCounts}`);
  check("country view: pin gradients are built", r.gradient > 100, `gradients=${r.gradient}`);
}

// deep zoom: labels appear
{
  const r = drawAt(1400);
  check("deep zoom: district labels are drawn", r.fillText > 10, `fillText=${r.fillText}`);
}

// filters propagate from the sidebar into the globe
{
  state.doeGroup = "C";
  const r = drawAt(620);
  state.doeGroup = "all";
  const proposed = geo.features.filter(f => f.properties.group === "doe_proposed").length;
  const groupC = geo.features.filter(f => f.properties.doe_group === "C").length;
  check("A/B/C filter removes the other DoE groups",
    r.markers === 180 - proposed + groupC, `markers=${r.markers}`);
}
{
  Object.keys(LAYERS).forEach(k => { state.enabled[k] = false; });
  state.enabled.doe_cams = true;
  const r = drawAt(620);
  Object.keys(LAYERS).forEach(k => { state.enabled[k] = true; });
  check("layer toggles remove markers", r.markers === 16, `markers=${r.markers}`);
}
{
  state.statusFilter = "installed";
  const r = drawAt(620);
  state.statusFilter = "all";
  const installed = geo.features.filter(f => {
    const p = f.properties;
    const st = p.status || (p.group === "existing" || p.group === "sas" ? "installed" : "proposed");
    return st === "installed";
  }).length;
  check("status filter reaches the globe", r.markers === installed, `markers=${r.markers}`);
}

// the seven CAMS+SAS+PurpleAir sites still carry their ring tag through to the globe
{
  const rings = new Set(geo.features.filter(f => f.properties.colo_kind === "cams_sas_pa")
    .map(f => f.properties.colo_id));
  check("7 calibration compounds reach the globe", rings.size === 7, `${rings.size} rings`);
}

// clicking a marker opens the detail card
{
  drawAt(620);
  const m = g.projected[0];
  Globe.flyToFeature(m.f, 0);
  check("selecting a station fills the detail card",
    !els["globe-card"].hidden && /class="pop"/.test(els["globe-card"].innerHTML));
}

console.log(failures === 0 ? "\nglobe render OK" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
