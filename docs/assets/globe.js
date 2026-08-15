/* 3D globe view, built on globe.gl (three.js/WebGL), vendored under assets/vendor/.
 *
 * The library is loaded lazily the first time the globe is shown: it is 1.7 MB, and if it
 * ever fails to load or WebGL is unavailable, the 2D map has to keep working. Nothing here
 * runs at page load beyond defining this object.
 *
 * The globe shows world country outlines for context, all 64 Bangladesh districts shaded
 * by how many deployments they hold, and the deployments themselves as the same SVG pins
 * the 2D map uses. It shares app.js's `state`, so the sidebar's layer toggles, status
 * filter, A/B/C group filter and search drive both views.
 *
 * Namespaced as Globe3D: `Globe` is the global the library itself exports.
 */
"use strict";

const Globe3D = (() => {
  const LIB_SRC = "assets/vendor/globe.gl.min.js";
  const BD = { lat: 23.685, lng: 90.35 };

  // Camera altitude in globe radii. 2.4 shows the whole planet, 0.34 frames Bangladesh,
  // 0.02 is about as close as the vector geometry is worth looking at.
  const ALT_WORLD = 2.4;
  const ALT_BD = 0.34;
  const ALT_MIN = 0.015;
  const ALT_MAX = 4.0;

  const s = {
    globe: null, wrap: null, loadPromise: null, built: false, failed: false,
    world: null, districts: null,
    counts: {}, maxCount: 1, markerEls: new Map(),
  };

  /* ---------- pure helpers (unit-tested by scripts/test_globe_data.js) ---------- */

  // Which stations the globe should show, given the sidebar's current filters.
  function visibleFeatures(st, layers) {
    if (!st || !st.allFeatures) return [];
    return st.allFeatures.filter(f => {
      const p = f.properties;
      const key = layers[p.layer] ? p.layer : "other";
      if (st.enabled && st.enabled[key] === false) return false;
      const status = statusOf(p);
      if (st.statusFilter && st.statusFilter !== "all" && status !== st.statusFilter) return false;
      if (st.doeGroup && st.doeGroup !== "all" && p.group === "doe_proposed"
          && (p.doe_group || "").split(".")[0].toUpperCase() !== st.doeGroup) return false;
      return true;
    });
  }

  function statusOf(p) {
    return p.status || (p.group === "existing" || p.group === "sas" ? "installed" : "proposed");
  }

  // Deployments per district, from the district_boundary the build resolved by
  // point-in-polygon. Recomputed on every filter change so the shading tracks the sidebar.
  function districtCounts(feats) {
    const counts = {};
    feats.forEach(f => {
      const d = f.properties.district_boundary;
      if (d) counts[d] = (counts[d] || 0) + 1;
    });
    return counts;
  }

  // Square-root ramp: linear shading makes Dhaka's 23 flatten everything else to nothing.
  function shadeFor(n, max) {
    if (!n) return 0;
    return 0.15 + 0.55 * Math.sqrt(n / Math.max(1, max));
  }

  // globe.gl reads `.geometry` off each datum, so the two boundary layers can be handed
  // over as one array with a `kind` discriminator. Bangladesh itself is dropped from the
  // world layer when the districts are present - otherwise the country polygon and the 64
  // district polygons are stacked on the same ground and fight each other.
  function polygonPayload(world, districts) {
    const out = [];
    const hasDistricts = !!(districts && districts.features && districts.features.length);
    (world && world.features || []).forEach(f => {
      const name = f.properties.name || "";
      if (hasDistricts && name === "Bangladesh") return;
      out.push({ kind: "world", name, geometry: f.geometry });
    });
    (districts && districts.features || []).forEach(f =>
      out.push({ kind: "district", name: f.properties.name, division: f.properties.division,
                 c: f.properties.c, geometry: f.geometry }));
    return out;
  }

  /* ---------- theme ---------- */
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v || "").trim() || fallback;
  }
  // Cached: the cap-colour accessor runs once per polygon per render, and getComputedStyle
  // is far too expensive to call 240 times a frame. Invalidated when the theme changes.
  let themeCache = null;
  function theme() {
    if (themeCache) return themeCache;
    themeCache = readTheme();
    return themeCache;
  }
  function readTheme() {
    return {
      ocean: cssVar("--globe-ocean", "#cfe0ef"),
      land: cssVar("--globe-land", "#e9e6dd"),
      landSide: cssVar("--globe-land-side", "#d5d1c6"),
      landStroke: cssVar("--globe-land-stroke", "#b9b3a5"),
      district: cssVar("--globe-district", "#f4efe4"),
      districtStroke: cssVar("--globe-district-stroke", "#9aa7b8"),
      choropleth: cssVar("--globe-choropleth", "42,120,214"),
      atmosphere: cssVar("--globe-atmosphere", "#9ec6ea"),
    };
  }

  /* ---------- loading ---------- */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`could not load ${src}`));
      document.head.appendChild(el);
    });
  }

  let msgTimer = null;
  function message(html, autoHideMs) {
    const el = document.getElementById("globe-msg");
    if (!el) return;
    clearTimeout(msgTimer);
    if (!html) { el.hidden = true; el.innerHTML = ""; return; }
    el.innerHTML = html;
    el.hidden = false;
    if (autoHideMs) msgTimer = setTimeout(() => { el.hidden = true; }, autoHideMs);
  }

  /* ---------- build ---------- */
  function size() {
    const r = (s.wrap || document.getElementById("globe-wrap")).getBoundingClientRect();
    return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
  }

  function build() {
    const t = theme();
    const { w, h } = size();
    s.globe = window.Globe()(s.wrap)
      .width(w)
      .height(h)
      .backgroundColor("rgba(0,0,0,0)")
      .showAtmosphere(true)
      .atmosphereColor(t.atmosphere)
      .atmosphereAltitude(0.16)
      .showGraticules(true)
      .polygonsData(polygonPayload(s.world, s.districts))
      .polygonAltitude(d => (d.kind === "district" ? 0.012 : 0.006))
      .polygonCapColor(capColor)
      .polygonSideColor(d => (d.kind === "district" ? "rgba(120,140,170,0.35)" : t.landSide))
      .polygonStrokeColor(d => (d.kind === "district" ? t.districtStroke : t.landStroke))
      .polygonLabel(polygonLabel)
      .polygonsTransitionDuration(0)
      .onPolygonClick(onPolygonClick)
      .htmlElementsData([])
      .htmlLat(d => d.geometry.coordinates[1])
      .htmlLng(d => d.geometry.coordinates[0])
      .htmlAltitude(0.02)
      .htmlTransitionDuration(0)
      .htmlElement(markerElement)
      .htmlElementVisibilityModifier((el, isVisible) => {
        // globe.gl keeps far-side elements in the DOM; fade them out so pins do not
        // float over the back of the planet.
        el.style.opacity = isVisible ? "1" : "0";
        el.style.pointerEvents = isVisible ? "auto" : "none";
      });

    // ocean colour
    const mat = s.globe.globeMaterial();
    if (mat && mat.color && mat.color.set) mat.color.set(t.ocean);
    if (mat) { mat.shininess = 6; }

    const c = s.globe.controls();
    if (c) {
      c.enableDamping = true;
      c.dampingFactor = 0.12;
      c.rotateSpeed = 0.45;
      c.zoomSpeed = 0.9;
      c.minDistance = 100 * (1 + ALT_MIN);
      c.maxDistance = 100 * (1 + ALT_MAX);
      c.autoRotate = false;
    }

    s.globe.pointOfView({ lat: BD.lat, lng: BD.lng, altitude: ALT_WORLD }, 0);
    s.built = true;
    wireTools();
    // fly down to the study area once, so the first thing you see is a globe that
    // becomes the map
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => s.globe.pointOfView({ lat: BD.lat, lng: BD.lng, altitude: ALT_BD },
      reduce ? 0 : 1600), 350);
  }

  function capColor(d) {
    const t = theme();
    if (d.kind !== "district") return t.land;
    const n = s.counts[d.name] || 0;
    const a = shadeFor(n, s.maxCount);
    return a ? `rgba(${t.choropleth},${a.toFixed(3)})` : t.district;
  }

  function polygonLabel(d) {
    if (d.kind !== "district") return `<div class="g-label">${d.name}</div>`;
    const n = s.counts[d.name] || 0;
    return `<div class="g-label"><strong>${d.name}</strong><br>
      ${n} deployment${n === 1 ? "" : "s"} · ${d.division} division</div>`;
  }

  function onPolygonClick(d) {
    if (!d || d.kind !== "district" || !d.c) return;
    s.globe.pointOfView({ lat: d.c[1], lng: d.c[0], altitude: 0.09 }, 900);
  }

  /* ---------- markers ---------- */
  function markerElement(f) {
    const p = f.properties;
    const key = (typeof LAYERS !== "undefined" && LAYERS[p.layer]) ? p.layer : "other";
    const el = document.createElement("div");
    el.className = "g-pin";
    el.innerHTML = typeof markerSVG === "function"
      ? markerSVG(key, statusOf(p) === "installed", 24)
      : "<span>•</span>";
    el.title = `${p.name || p.id}`;
    el.style.pointerEvents = "auto";
    el.style.cursor = "pointer";
    el.onclick = (ev) => { ev.stopPropagation(); openCard(p); };
    return el;
  }

  function openCard(p) {
    const el = document.getElementById("globe-card");
    if (!el) return;
    const body = typeof popupHTML === "function"
      ? popupHTML(p) : `<div class="pop"><h3>${p.name || p.id}</h3></div>`;
    el.innerHTML = `<button class="card-close" type="button" aria-label="Close">×</button>${body}`;
    el.hidden = false;
    el.querySelector(".card-close").onclick = () => { el.hidden = true; };
  }

  /* ---------- tools ---------- */
  function currentAltitude() {
    const pov = s.globe && s.globe.pointOfView();
    return pov ? pov.altitude : ALT_BD;
  }
  function zoomBy(factor) {
    if (!s.globe) return;
    const pov = s.globe.pointOfView();
    const alt = Math.max(ALT_MIN, Math.min(ALT_MAX, currentAltitude() * factor));
    s.globe.pointOfView({ lat: pov.lat, lng: pov.lng, altitude: alt }, 350);
  }
  function wireTools() {
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el && !el._wired) { el._wired = true; el.addEventListener("click", fn); }
    };
    on("globe-fit-bd", () => s.globe.pointOfView({ lat: BD.lat, lng: BD.lng, altitude: ALT_BD }, 900));
    on("globe-fit-world", () => s.globe.pointOfView({ lat: BD.lat, lng: BD.lng, altitude: ALT_WORLD }, 900));
    on("globe-zoom-in", () => zoomBy(1 / 1.7));
    on("globe-zoom-out", () => zoomBy(1.7));
  }

  /* ---------- public ---------- */
  function setData({ world, districts }) {
    s.world = world;
    s.districts = districts;
  }

  // Called when the globe view is switched on. Resolves false if the globe cannot run,
  // so the caller can fall back to the 2D map instead of showing an empty stage.
  async function activate() {
    s.wrap = document.getElementById("globe-wrap");
    if (!s.wrap) return false;
    if (s.failed) return false;
    if (s.built) { resize(); refresh(); return true; }

    message("Loading the 3D globe…");
    if (!s.loadPromise) s.loadPromise = loadScript(LIB_SRC);
    try {
      await s.loadPromise;
    } catch (err) {
      s.failed = true;
      message(`The 3D globe could not load (<code>${LIB_SRC}</code>). Showing the 2D map.`, 8000);
      return false;
    }
    if (typeof window.Globe !== "function") {
      s.failed = true;
      message("The 3D globe library did not initialise. Showing the 2D map.", 8000);
      return false;
    }
    try {
      build();
      refresh();
    } catch (err) {
      s.failed = true;
      console.error(err);
      message("The 3D globe could not start — this browser may not have WebGL available. "
              + "Showing the 2D map.", 8000);
      return false;
    }
    message("");
    return true;
  }

  function refresh() {
    if (!s.built || typeof LAYERS === "undefined") return;
    const feats = visibleFeatures(state, LAYERS);
    s.counts = districtCounts(feats);
    s.maxCount = Math.max(1, ...Object.values(s.counts), 1);
    s.globe.htmlElementsData(feats);
    // A fresh closure, not `capColor` itself: globe.gl skips an update when a prop is set
    // to the same value, and the same function reference counts as the same value.
    s.globe.polygonCapColor(d => capColor(d));
  }

  function resize() {
    if (!s.built) return;
    const { w, h } = size();
    s.globe.width(w).height(h);
  }

  function flyToFeature(f) {
    if (!s.built) return;
    const [lng, lat] = f.geometry.coordinates;
    s.globe.pointOfView({ lat, lng, altitude: 0.05 }, 900);
    openCard(f.properties);
  }

  function applyTheme() {
    themeCache = null;
    if (!s.built) return;
    const t = theme();
    const mat = s.globe.globeMaterial();
    if (mat && mat.color && mat.color.set) mat.color.set(t.ocean);
    s.globe.atmosphereColor(t.atmosphere)
      .polygonCapColor(d => capColor(d))
      .polygonSideColor(d => (d.kind === "district" ? "rgba(120,140,170,0.35)" : t.landSide))
      .polygonStrokeColor(d => (d.kind === "district" ? t.districtStroke : t.landStroke));
  }

  return {
    setData, activate, refresh, resize, flyToFeature, applyTheme,
    isReady: () => s.built,
    // pure helpers, exercised by scripts/test_globe_data.js
    _pure: { visibleFeatures, districtCounts, shadeFor, polygonPayload, statusOf },
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Globe3D;
