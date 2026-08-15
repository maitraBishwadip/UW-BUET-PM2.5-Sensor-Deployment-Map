/* 3D globe view for the Bangladesh PM2.5 deployment map.
 *
 * A dependency-free orthographic globe on a <canvas>: world outlines for context, the 64
 * Bangladesh districts, and the deployments themselves drawn with the same pin/star
 * language as the 2D map. It shares app.js's state object, so the sidebar's layer
 * toggles, status filter, A/B/C group filter and search drive both views.
 *
 * Loaded before app.js; app.js calls Globe.init() once its data is in, then Globe.draw()
 * whenever the filters change. Everything here is namespaced inside `Globe`.
 */
"use strict";

const Globe = (() => {
  const DEG = Math.PI / 180;
  const BD = { lon0: 87.9, lat0: 20.3, lon1: 92.8, lat1: 26.75 };
  const BD_CENTER = [(BD.lon0 + BD.lon1) / 2, (BD.lat0 + BD.lat1) / 2];
  const BD_SPAN_RAD = (BD.lat1 - BD.lat0) * DEG;   // ~0.1126 rad of arc, north-south

  // Zoom thresholds, expressed as the on-screen height of Bangladesh in pixels.
  const SPAN_AGGREGATE = 70;    // below this, one badge instead of 180 pins
  const SPAN_DISTRICTS = 130;   // districts appear
  const SPAN_LABELS = 950;      // district names appear
  const SPAN_2D_HINT = 5200;    // past here the 2D map is the better tool

  const g = {
    canvas: null, ctx: null, dpr: 1, w: 0, h: 0,
    lam0: BD_CENTER[0], phi0: BD_CENTER[1], scale: 300,
    minScale: 100, maxScale: 1e5,
    world: null, districts: null,
    projected: [], hover: null, selected: null,
    anim: null, dirty: true, ready: false, userMoved: false,
    districtCounts: {}, maxDistrictCount: 1,
  };

  /* ---------- projection ---------- */
  // Orthographic. Points on the far hemisphere are clamped onto the limb so that rings
  // straddling the horizon stay closed and still fill sensibly.
  function project(lon, lat) {
    const lam = (lon - g.lam0) * DEG, phi = lat * DEG, phi0 = g.phi0 * DEG;
    const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
    const cosPhi0 = Math.cos(phi0), sinPhi0 = Math.sin(phi0);
    const cosc = sinPhi0 * sinPhi + cosPhi0 * cosPhi * Math.cos(lam);
    let x = g.scale * cosPhi * Math.sin(lam);
    let y = -g.scale * (cosPhi0 * sinPhi - sinPhi0 * cosPhi * Math.cos(lam));
    const visible = cosc >= 0;
    if (!visible) {
      const r = Math.hypot(x, y) || 1e-9;
      const k = g.scale / r;
      x *= k; y *= k;
    }
    return { x: g.w / 2 + x, y: g.h / 2 + y, visible };
  }

  // Screen point -> lon/lat, or null if the point is off the sphere.
  function unproject(px, py) {
    const x = px - g.w / 2, y = -(py - g.h / 2);
    const rho = Math.hypot(x, y);
    if (rho > g.scale) return null;
    const c = Math.asin(Math.min(1, rho / g.scale));
    const sinc = Math.sin(c), cosc = Math.cos(c);
    const phi0 = g.phi0 * DEG;
    const lat = rho === 0 ? g.phi0
      : Math.asin(cosc * Math.sin(phi0) + (y * sinc * Math.cos(phi0)) / rho) / DEG;
    const lon = g.lam0 + Math.atan2(
      x * sinc, rho * cosc * Math.cos(phi0) - y * sinc * Math.sin(phi0)) / DEG;
    return [((lon + 540) % 360) - 180, lat];
  }

  const bdSpanPx = () => g.scale * BD_SPAN_RAD;

  // Degrees of rotation per pixel of drag. Longitude is foreshortened by cos(lat), so a
  // horizontal drag near the poles has to turn the globe further to move the ground under
  // the cursor by the same number of pixels. Clamped so it does not run away at the pole.
  function dragDelta(dx, dy, phi0, scale) {
    const perPixel = 1 / (scale * DEG);
    const cosPhi = Math.max(0.15, Math.cos(phi0 * DEG));
    return { dLon: -dx * perPixel / cosPhi, dLat: dy * perPixel };
  }

  /* ---------- palette (theme-aware, read from CSS custom properties) ---------- */
  function palette() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, fallback) => (cs.getPropertyValue(n) || "").trim() || fallback;
    return {
      space: v("--globe-space", "#eceae4"),
      ocean: v("--globe-ocean", "#cfe0ef"),
      oceanDeep: v("--globe-ocean-deep", "#9fc0da"),
      land: v("--globe-land", "#e9e6dd"),
      landStroke: v("--globe-land-stroke", "#c2bdb0"),
      graticule: v("--globe-graticule", "rgba(70,90,110,0.16)"),
      district: v("--globe-district", "#f4efe4"),
      districtStroke: v("--globe-district-stroke", "#b9b1a0"),
      bdStroke: v("--globe-bd-stroke", "#33507a"),
      choropleth: v("--globe-choropleth", "42,120,214"),
      label: v("--globe-label", "#3f4a57"),
      labelHalo: v("--globe-label-halo", "#ffffff"),
    };
  }

  /* ---------- geometry drawing ---------- */
  function pathRing(ctx, ring) {
    for (let i = 0; i < ring.length; i++) {
      const p = project(ring[i][0], ring[i][1]);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }

  function polygons(geom) {
    if (!geom) return [];
    if (geom.type === "Polygon") return [geom.coordinates];
    if (geom.type === "MultiPolygon") return geom.coordinates;
    return [];
  }

  // Skip features entirely on the far side: cheap test on the feature's own centre.
  function facingAway(lon, lat) {
    const lam = (lon - g.lam0) * DEG, phi = lat * DEG, phi0 = g.phi0 * DEG;
    return Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lam) < -0.08;
  }

  function drawFeature(ctx, geom, fill, stroke, width) {
    ctx.beginPath();
    polygons(geom).forEach(poly => poly.forEach(ring => pathRing(ctx, ring)));
    if (fill) { ctx.fillStyle = fill; ctx.fill("evenodd"); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  function drawGraticule(ctx, pal) {
    ctx.strokeStyle = pal.graticule;
    ctx.lineWidth = 1;
    const seg = (pts) => {
      let drawing = false;
      ctx.beginPath();
      pts.forEach(([lon, lat]) => {
        const p = project(lon, lat);
        if (!p.visible) { drawing = false; return; }
        if (!drawing) { ctx.moveTo(p.x, p.y); drawing = true; } else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    };
    for (let lon = -180; lon < 180; lon += 15) {
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 3) pts.push([lon, lat]);
      seg(pts);
    }
    for (let lat = -75; lat <= 75; lat += 15) {
      const pts = [];
      for (let lon = -180; lon <= 180; lon += 3) pts.push([lon, lat]);
      seg(pts);
    }
  }

  /* ---------- markers (same visual language as the 2D map) ---------- */
  const PIN_D = "M12 0.9C6.2 0.9 1.5 5.6 1.5 11.4c0 7.9 10.5 19.7 10.5 19.7s10.5-11.8 10.5-19.7C22.5 5.6 17.8 0.9 12 0.9z";
  let pinPath = null;
  const getPinPath = () => (pinPath = pinPath || new Path2D(PIN_D));

  function layerOf(key) {
    return (typeof LAYERS !== "undefined" && LAYERS[key]) ? LAYERS[key] : { color: "#9e9e9e", family: "lowcost", label: key };
  }

  function drawGlyph(ctx, family, color, filled) {
    ctx.strokeStyle = ctx.fillStyle = filled ? "#ffffff" : color;
    ctx.lineCap = "round";
    if (family === "ref") {
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(12, 11.4, 4.5, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(12, 11.4, 1.9, 0, 2 * Math.PI); ctx.fill();
    } else if (family === "prop") {
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(12, 6.8); ctx.lineTo(12, 16);
      ctx.moveTo(7.4, 11.4); ctx.lineTo(16.6, 11.4);
      ctx.stroke();
    } else if (family === "mine") {
      ctx.beginPath();
      ctx.moveTo(12, 6.5); ctx.lineTo(16.9, 11.4); ctx.lineTo(12, 16.3); ctx.lineTo(7.1, 11.4);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(12, 11.4, 3.4, 0, 2 * Math.PI); ctx.fill();
    }
  }

  function mixWhiteLocal(hex, t) {
    if (typeof mixWhite === "function") return mixWhite(hex, t);
    return hex;
  }

  function drawStar(ctx, x, y, color, filled, size) {
    const r = size / 2, ri = r * 0.44;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : ri;
      const a = -Math.PI / 2 + (Math.PI * i) / 5;
      const px = x + rad * Math.cos(a), py = y + rad * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = filled ? color : mixWhiteLocal(color, 0.82);
    ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.stroke();
  }

  function drawMarker(ctx, x, y, layerKey, filled, size, highlight) {
    const L2 = layerOf(layerKey);
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = highlight ? 8 : 3;
    ctx.shadowOffsetY = 1;
    if (L2.family === "sas") {
      drawStar(ctx, x, y, L2.color, filled, size * 1.05);
      ctx.restore();
      return;
    }
    ctx.translate(x, y);
    ctx.scale(size / 24, size / 24);
    ctx.translate(-12, -31);
    const grad = ctx.createLinearGradient(0, 0, 0, 32);
    grad.addColorStop(0, mixWhiteLocal(L2.color, 0.42));
    grad.addColorStop(1, L2.color);
    ctx.fillStyle = filled ? grad : mixWhiteLocal(L2.color, 0.82);
    ctx.fill(getPinPath());
    ctx.shadowBlur = 0;
    ctx.strokeStyle = L2.color;
    ctx.lineWidth = filled ? 1.1 : 1.9;
    ctx.stroke(getPinPath());
    drawGlyph(ctx, L2.family, L2.color, filled);
    ctx.restore();
  }

  /* ---------- what is currently visible ---------- */
  function activeFeatures() {
    if (typeof state === "undefined" || !state.allFeatures) return [];
    return state.allFeatures.filter(f => {
      const p = f.properties;
      const key = (typeof LAYERS !== "undefined" && LAYERS[p.layer]) ? p.layer : "other";
      if (state.enabled && state.enabled[key] === false) return false;
      const status = p.status || (p.group === "existing" || p.group === "sas" ? "installed" : "proposed");
      if (typeof passesStatus === "function" && !passesStatus(status)) return false;
      if (typeof passesDoeGroup === "function" && !passesDoeGroup(p)) return false;
      return true;
    });
  }

  function recomputeDistrictCounts(feats) {
    const counts = {};
    feats.forEach(f => {
      const d = f.properties.district_boundary;
      if (d) counts[d] = (counts[d] || 0) + 1;
    });
    g.districtCounts = counts;
    g.maxDistrictCount = Math.max(1, ...Object.values(counts));
  }

  /* ---------- the frame ---------- */
  function draw() {
    if (!g.ctx || !g.ready || g.w < 2 || g.h < 2) return;
    const ctx = g.ctx, pal = palette();
    const span = bdSpanPx();
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);
    ctx.fillStyle = pal.space;
    ctx.fillRect(0, 0, g.w, g.h);

    const cx = g.w / 2, cy = g.h / 2;

    // Ocean sphere, with a soft shaded limb so it reads as a ball.
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, g.scale, 0, 2 * Math.PI); ctx.clip();
    const oc = ctx.createRadialGradient(cx - g.scale * 0.35, cy - g.scale * 0.4, g.scale * 0.05,
                                        cx, cy, g.scale * 1.05);
    oc.addColorStop(0, pal.ocean);
    oc.addColorStop(1, pal.oceanDeep);
    ctx.fillStyle = oc;
    ctx.fillRect(cx - g.scale, cy - g.scale, g.scale * 2, g.scale * 2);

    drawGraticule(ctx, pal);

    // World land
    if (g.world) {
      ctx.lineJoin = "round";
      g.world.features.forEach(f => {
        drawFeature(ctx, f.geometry, pal.land, pal.landStroke, 0.7);
      });
    }

    // Bangladesh districts
    const feats = activeFeatures();
    recomputeDistrictCounts(feats);
    if (g.districts && span >= SPAN_DISTRICTS) {
      g.districts.features.forEach(f => {
        const c = f.properties.c;
        if (c && facingAway(c[0], c[1])) return;
        const n = g.districtCounts[f.properties.name] || 0;
        const t = n ? 0.12 + 0.42 * Math.sqrt(n / g.maxDistrictCount) : 0;
        const fill = n ? `rgba(${pal.choropleth},${t.toFixed(3)})` : pal.district;
        drawFeature(ctx, f.geometry, fill, pal.districtStroke, span > 600 ? 1 : 0.6);
      });
      // country outline on top of the district hairlines
      if (g.bdOutline) drawFeature(ctx, g.bdOutline, null, pal.bdStroke, span > 600 ? 2 : 1.4);
    } else if (g.bdOutline) {
      drawFeature(ctx, g.bdOutline, `rgba(${pal.choropleth},0.28)`, pal.bdStroke, 1.4);
    }
    ctx.restore();

    // District labels
    if (g.districts && span >= SPAN_LABELS) {
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      g.districts.features.forEach(f => {
        const c = f.properties.c;
        if (!c || facingAway(c[0], c[1])) return;
        const p = project(c[0], c[1]);
        if (!p.visible || p.x < -40 || p.x > g.w + 40 || p.y < -20 || p.y > g.h + 20) return;
        ctx.lineWidth = 3;
        ctx.strokeStyle = pal.labelHalo;
        ctx.strokeText(f.properties.name, p.x, p.y);
        ctx.fillStyle = pal.label;
        ctx.fillText(f.properties.name, p.x, p.y);
      });
    }

    // Deployments
    g.projected = [];
    if (span < SPAN_AGGREGATE) {
      drawAggregate(ctx, feats.length);
    } else {
      drawColoRings(ctx, feats, span);
      const size = Math.max(9, Math.min(26, span / 26));
      feats.forEach(f => {
        const [lon, lat] = f.geometry.coordinates;
        const p = project(lon, lat);
        if (!p.visible) return;
        if (p.x < -30 || p.x > g.w + 30 || p.y < -40 || p.y > g.h + 30) return;
        const key = (typeof LAYERS !== "undefined" && LAYERS[f.properties.layer]) ? f.properties.layer : "other";
        g.projected.push({ f, x: p.x, y: p.y, key, size });
      });
      // paint north-to-south so southern pins overlap the ones behind them
      g.projected.sort((a, b) => a.y - b.y);
      g.projected.forEach(m => {
        const st = m.f.properties.status
          || (m.f.properties.group === "existing" || m.f.properties.group === "sas" ? "installed" : "proposed");
        const isSel = g.selected && g.selected.properties.id === m.f.properties.id;
        const isHov = g.hover && g.hover.f.properties.id === m.f.properties.id;
        drawMarker(ctx, m.x, m.y, m.key, st === "installed", m.size * (isSel || isHov ? 1.25 : 1), isSel || isHov);
      });
    }

    drawScaleHint(ctx, span);
    g.dirty = false;
  }

  function drawColoRings(ctx, feats, span) {
    const seen = new Set();
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#d62828";
    ctx.lineWidth = 1.6;
    ctx.fillStyle = "rgba(214,40,40,0.07)";
    feats.forEach(f => {
      const p = f.properties;
      if (p.colo_kind !== "cams_sas_pa" || seen.has(p.colo_id)) return;
      seen.add(p.colo_id);
      const pt = project(f.geometry.coordinates[0], f.geometry.coordinates[1]);
      if (!pt.visible) return;
      const r = Math.max(13, Math.min(46, span / 55));
      ctx.beginPath(); ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
      ctx.fill(); ctx.stroke();
    });
    ctx.restore();
  }

  function drawAggregate(ctx, n) {
    const p = project(BD_CENTER[0], BD_CENTER[1]);
    if (!p.visible) return;
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(42,120,214,0.92)";
    ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "700 15px system-ui, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(n), p.x, p.y);
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 3;
    ctx.strokeText("Bangladesh", p.x, p.y + 34);
    ctx.fillStyle = "#22304a";
    ctx.fillText("Bangladesh", p.x, p.y + 34);
    ctx.restore();
  }

  // Rewriting the hint every frame would rebind its button 60x a second, so only touch
  // the DOM when the message actually changes.
  let hintMode = null;
  function drawScaleHint(_ctx, span) {
    const el = document.getElementById("globe-hint");
    if (!el) return;
    const mode = span < SPAN_AGGREGATE ? "far" : span > SPAN_2D_HINT ? "near" : "none";
    if (mode === hintMode) return;
    hintMode = mode;
    if (mode === "far") {
      el.textContent = "Drag to spin · scroll to zoom · click Bangladesh to dive in";
      el.hidden = false;
    } else if (mode === "near") {
      el.innerHTML = 'Past district detail — <button type="button" id="hint-2d" class="linkish">switch to the 2D map</button> for streets and satellite.';
      el.hidden = false;
      const b = document.getElementById("hint-2d");
      if (b) b.onclick = switchToMap;
    } else {
      el.hidden = true;
    }
  }

  /* ---------- animation ---------- */
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function animateTo(target, ms = 900) {
    if (g.anim) cancelAnimationFrame(g.anim.raf);
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || ms <= 0) {
      Object.assign(g, target);
      requestDraw();
      return;
    }
    const from = { lam0: g.lam0, phi0: g.phi0, scale: g.scale };
    // interpolate zoom geometrically so the rate of change feels even
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = easeInOut(t);
      g.lam0 = from.lam0 + (target.lam0 - from.lam0) * e;
      g.phi0 = from.phi0 + (target.phi0 - from.phi0) * e;
      g.scale = from.scale * Math.pow(target.scale / from.scale, e);
      draw();
      if (t < 1) g.anim = { raf: requestAnimationFrame(step) };
      else g.anim = null;
    };
    g.anim = { raf: requestAnimationFrame(step) };
  }

  function scaleForSpan(px) { return px / BD_SPAN_RAD; }

  function fitBangladesh(ms = 900) {
    animateTo({ lam0: BD_CENTER[0], phi0: BD_CENTER[1],
                scale: clampScale(scaleForSpan(Math.min(g.w, g.h) * 0.78)) }, ms);
  }
  function fitWorld(ms = 900) {
    animateTo({ lam0: BD_CENTER[0], phi0: BD_CENTER[1], scale: g.minScale }, ms);
  }
  function clampScale(s) { return Math.max(g.minScale, Math.min(g.maxScale, s)); }

  function flyToFeature(f, ms = 900) {
    const [lon, lat] = f.geometry.coordinates;
    g.selected = f;
    animateTo({ lam0: lon, phi0: lat, scale: clampScale(scaleForSpan(Math.min(g.w, g.h) * 9)) }, ms);
    showCard(f.properties);
  }

  /* ---------- interaction ---------- */
  function hitTest(px, py) {
    let best = null, bestD = 1e9;
    for (const m of g.projected) {
      // pins are anchored at the tip, so their body sits above the anchor point
      const dx = px - m.x;
      const dy = py - (layerOf(m.key).family === "sas" ? m.y : m.y - m.size * 0.62);
      const d = Math.hypot(dx, dy);
      if (d < Math.max(11, m.size * 0.75) && d < bestD) { best = m; bestD = d; }
    }
    return best;
  }

  function wireEvents() {
    const c = g.canvas;
    let drag = null;

    c.addEventListener("pointerdown", e => {
      c.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, lam0: g.lam0, phi0: g.phi0, moved: 0 };
    });
    c.addEventListener("pointermove", e => {
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
        const d = dragDelta(dx, dy, drag.phi0, g.scale);
        g.lam0 = drag.lam0 + d.dLon;
        g.phi0 = Math.max(-89, Math.min(89, drag.phi0 + d.dLat));
        g.userMoved = true;
        if (g.anim) { cancelAnimationFrame(g.anim.raf); g.anim = null; }
        requestDraw();
        return;
      }
      const hit = hitTest(px, py);
      if ((hit && (!g.hover || g.hover.f !== hit.f)) || (!hit && g.hover)) {
        g.hover = hit;
        c.style.cursor = hit ? "pointer" : "grab";
        showTip(hit, px, py);
        requestDraw();
      } else if (hit) {
        showTip(hit, px, py);
      }
    });
    const endDrag = (e) => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      if (moved > 4) return;
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const hit = hitTest(px, py);
      if (hit) {
        g.selected = hit.f;
        showCard(hit.f.properties);
        requestDraw();
        return;
      }
      const ll = unproject(px, py);
      if (!ll) return;
      if (bdSpanPx() < SPAN_AGGREGATE && inBD(ll)) { g.userMoved = true; fitBangladesh(800); return; }
      const d = districtAt(ll);
      if (d) zoomToDistrict(d);
    };
    c.addEventListener("pointerup", endDrag);
    c.addEventListener("pointercancel", () => { drag = null; });
    c.addEventListener("pointerleave", () => { g.hover = null; hideTip(); requestDraw(); });

    c.addEventListener("wheel", e => {
      e.preventDefault();
      g.userMoved = true;
      if (g.anim) { cancelAnimationFrame(g.anim.raf); g.anim = null; }
      const factor = Math.exp(-e.deltaY * 0.0016);
      const r = c.getBoundingClientRect();
      const before = unproject(e.clientX - r.left, e.clientY - r.top);
      g.scale = clampScale(g.scale * factor);
      // keep the point under the cursor roughly fixed
      const after = unproject(e.clientX - r.left, e.clientY - r.top);
      if (before && after) {
        g.lam0 += before[0] - after[0];
        g.phi0 = Math.max(-89, Math.min(89, g.phi0 + before[1] - after[1]));
      }
      requestDraw();
    }, { passive: false });

    c.addEventListener("dblclick", e => {
      const r = c.getBoundingClientRect();
      const ll = unproject(e.clientX - r.left, e.clientY - r.top);
      g.userMoved = true;
      if (ll) animateTo({ lam0: ll[0], phi0: ll[1], scale: clampScale(g.scale * 2.2) }, 500);
    });

    window.addEventListener("keydown", e => {
      const wrap = document.getElementById("globe-wrap");
      if (!wrap || wrap.hidden) return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      const step = 6 / Math.max(1, Math.log10(g.scale));
      if (e.key === "ArrowLeft") { g.lam0 -= step; g.userMoved = true; requestDraw(); }
      else if (e.key === "ArrowRight") { g.lam0 += step; g.userMoved = true; requestDraw(); }
      else if (e.key === "ArrowUp") { g.phi0 = Math.min(89, g.phi0 + step); g.userMoved = true; requestDraw(); }
      else if (e.key === "ArrowDown") { g.phi0 = Math.max(-89, g.phi0 - step); g.userMoved = true; requestDraw(); }
      else if (e.key === "Escape") { hideCard(); }
    });
  }

  const inBD = ([lon, lat]) =>
    lon >= BD.lon0 - 1 && lon <= BD.lon1 + 1 && lat >= BD.lat0 - 1 && lat <= BD.lat1 + 1;

  function districtAt(ll) {
    if (!g.districts) return null;
    for (const f of g.districts.features) {
      if (pointInGeom(ll, f.geometry)) return f;
    }
    return null;
  }

  function inRing([x, y], ring) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < xi + ((y - yi) * (xj - xi)) / (yj - yi)) hit = !hit;
    }
    return hit;
  }

  // Inside the outer ring of any polygon and not inside one of that polygon's holes.
  function pointInGeom(pt, geom) {
    return polygons(geom).some(poly =>
      inRing(pt, poly[0]) && !poly.slice(1).some(hole => inRing(pt, hole)));
  }

  function zoomToDistrict(f) {
    const c = f.properties.c;
    g.userMoved = true;
    animateTo({ lam0: c[0], phi0: c[1], scale: clampScale(scaleForSpan(Math.min(g.w, g.h) * 5)) }, 700);
    const n = g.districtCounts[f.properties.name] || 0;
    flash(`${f.properties.name} — ${n} deployment${n === 1 ? "" : "s"} · ${f.properties.division} division`);
  }

  /* ---------- overlays ---------- */
  function showTip(hit, px, py) {
    const el = document.getElementById("globe-tip");
    if (!el) return;
    if (!hit) { el.hidden = true; return; }
    const p = hit.f.properties;
    el.textContent = `${p.name || p.id} · ${layerOf(hit.key).label}`;
    el.style.left = `${px + 14}px`;
    el.style.top = `${py - 10}px`;
    el.hidden = false;
  }
  function hideTip() {
    const el = document.getElementById("globe-tip");
    if (el) el.hidden = true;
  }

  function showCard(p) {
    const el = document.getElementById("globe-card");
    if (!el) return;
    const body = typeof popupHTML === "function" ? popupHTML(p) : `<div class="pop"><h3>${p.name || p.id}</h3></div>`;
    el.innerHTML = `<button class="card-close" type="button" aria-label="Close">×</button>${body}`;
    el.hidden = false;
    el.querySelector(".card-close").onclick = hideCard;
  }
  function hideCard() {
    const el = document.getElementById("globe-card");
    if (el) { el.hidden = true; }
    g.selected = null;
    requestDraw();
  }

  let flashTimer = null;
  function flash(text) {
    const el = document.getElementById("globe-flash");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ---------- sizing ---------- */
  // Called on every layout change, and again the first time the globe is actually on
  // screen - if it starts hidden (because the 2D map was the remembered view) its box is
  // 0x0 and there is nothing sane to size against yet.
  function resize() {
    const wrap = document.getElementById("globe-wrap");
    if (!wrap || !g.canvas) return false;
    const r = wrap.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    g.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    g.w = r.width; g.h = r.height;
    g.canvas.width = Math.round(g.w * g.dpr);
    g.canvas.height = Math.round(g.h * g.dpr);
    g.canvas.style.width = `${g.w}px`;
    g.canvas.style.height = `${g.h}px`;
    g.minScale = Math.min(g.w, g.h) / 2 - 18;
    g.maxScale = g.minScale * 900;
    if (!g.sized) {
      g.sized = true;
      g.scale = g.minScale;
      scheduleIntro();
    }
    g.scale = clampScale(g.scale);
    requestDraw();
    return true;
  }

  let rafPending = false;
  function requestDraw() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; draw(); });
  }

  /* ---------- view switching ---------- */
  function switchToMap() {
    if (typeof setView === "function") setView("map");
  }

  /* ---------- public ---------- */
  function init({ world, districts, divisions }) {
    g.canvas = document.getElementById("globe-canvas");
    if (!g.canvas) return;
    g.ctx = g.canvas.getContext("2d");
    g.world = world;
    g.districts = districts;
    // one outline for the whole country: the divisions file merged visually by drawing
    // all its rings into a single path
    g.bdOutline = divisions
      ? { type: "MultiPolygon",
          coordinates: divisions.features.flatMap(f => polygons(f.geometry)) }
      : null;
    g.ready = true;
    wireEvents();
    resize();
    new ResizeObserver(resize).observe(document.getElementById("globe-wrap"));
    window.addEventListener("resize", resize);

    document.getElementById("globe-zoom-in")?.addEventListener("click", () => {
      g.userMoved = true; animateTo({ lam0: g.lam0, phi0: g.phi0, scale: clampScale(g.scale * 1.8) }, 350);
    });
    document.getElementById("globe-zoom-out")?.addEventListener("click", () => {
      g.userMoved = true; animateTo({ lam0: g.lam0, phi0: g.phi0, scale: clampScale(g.scale / 1.8) }, 350);
    });
    document.getElementById("globe-fit-bd")?.addEventListener("click", () => {
      g.userMoved = true; fitBangladesh(800);
    });
    document.getElementById("globe-fit-world")?.addEventListener("click", () => {
      g.userMoved = true; fitWorld(800);
    });

    requestDraw();
  }

  // Once, on first paint: start on the whole globe and fly down to Bangladesh, so the
  // first thing you see is a globe that turns into the study area. Any interaction in the
  // meantime cancels it.
  function scheduleIntro() {
    if (g.introDone) return;
    g.introDone = true;
    setTimeout(() => { if (!g.userMoved) fitBangladesh(1500); }, 550);
  }

  return {
    init,
    draw: requestDraw,
    resize,
    fitBangladesh: (ms) => { g.userMoved = true; fitBangladesh(ms); },
    fitWorld: (ms) => { g.userMoved = true; fitWorld(ms); },
    flyToFeature,
    isReady: () => g.ready,
    // exposed for the projection unit test in scripts/test_globe_math.js
    _internals: { g, project, unproject, scaleForSpan, dragDelta },
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Globe;
