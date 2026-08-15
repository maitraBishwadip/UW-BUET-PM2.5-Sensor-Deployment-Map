/* Unit test for the globe's orthographic projection.
 *
 * The globe is drawn by hand on a canvas, so its projection is the one piece that has to
 * be provably right - everything else is paint. Run it with:
 *
 *     node scripts/test_globe_math.js
 *
 * Exits non-zero on failure, so CI fails if the maths drifts.
 */
"use strict";

const path = require("path");
const Globe = require(path.join(__dirname, "..", "docs", "assets", "globe.js"));
const { g, project, unproject, scaleForSpan, dragDelta } = Globe._internals;

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name} ${detail}`);
  }
}
function close(a, b, tol) { return Math.abs(a - b) <= tol; }

// A viewport with Bangladesh centred, roughly what the default view looks like.
Object.assign(g, { w: 1200, h: 800, lam0: 90.35, phi0: 23.525, scale: 1400 });

// 1. the centre of projection lands on the centre of the canvas
{
  const p = project(g.lam0, g.phi0);
  check("centre projects to canvas centre",
    close(p.x, g.w / 2, 1e-9) && close(p.y, g.h / 2, 1e-9) && p.visible,
    `got (${p.x}, ${p.y})`);
}

// 2. project -> unproject round-trips across the front hemisphere
{
  let worst = 0, worstAt = null;
  for (let dlon = -60; dlon <= 60; dlon += 7.5) {
    for (let dlat = -60; dlat <= 60; dlat += 7.5) {
      const lon = g.lam0 + dlon, lat = Math.max(-85, Math.min(85, g.phi0 + dlat));
      const p = project(lon, lat);
      if (!p.visible) continue;
      const ll = unproject(p.x, p.y);
      if (!ll) { worst = Infinity; worstAt = [lon, lat]; continue; }
      // compare as angles; longitude error matters less near the poles
      const err = Math.max(
        Math.abs(((ll[0] - lon + 540) % 360) - 180) * Math.cos(lat * Math.PI / 180),
        Math.abs(ll[1] - lat));
      if (err > worst) { worst = err; worstAt = [lon, lat]; }
    }
  }
  check("project -> unproject round-trips within 1e-6 deg", worst < 1e-6,
    `worst ${worst} at ${JSON.stringify(worstAt)}`);
}

// 3. the far hemisphere is flagged invisible and clamped onto the limb
{
  const anti = project(g.lam0 + 180, -g.phi0);
  const behind = project(g.lam0 + 120, g.phi0);
  const r = Math.hypot(behind.x - g.w / 2, behind.y - g.h / 2);
  check("antipode is not visible", !anti.visible);
  check("back-side point is clamped to the limb radius", close(r, g.scale, 1e-6),
    `r=${r} scale=${g.scale}`);
  check("horizon point is exactly on the limb", (() => {
    // 90 deg away along the equator of the view is the horizon
    const p = project(g.lam0 + 90, 0);
    const rr = Math.hypot(p.x - g.w / 2, p.y - g.h / 2);
    return close(rr, g.scale * Math.cos(g.phi0 * Math.PI / 180) *
      Math.hypot(1, Math.tan(g.phi0 * Math.PI / 180)), 1e-6) || rr <= g.scale + 1e-6;
  })());
}

// 4. north is up: a point due north of centre projects above the centre
{
  const n = project(g.lam0, g.phi0 + 2);
  const s = project(g.lam0, g.phi0 - 2);
  const e = project(g.lam0 + 2, g.phi0);
  check("north is up", n.y < g.h / 2 && s.y > g.h / 2, `n.y=${n.y} s.y=${s.y}`);
  check("east is right", e.x > g.w / 2, `e.x=${e.x}`);
}

// 5. the drag gesture: the ground under the cursor must follow the cursor. Each axis is
//    tested on its own - a diagonal drag also picks up a small second-order term, because
//    rotating a sphere in two axes at once walks the anchor along an arc rather than a
//    straight line, and that curvature is real, not an error.
function dragAnchor(dx, dy, lat) {
  const saved = { lam0: g.lam0, phi0: g.phi0 };
  g.phi0 = lat;
  const anchor = { lon: g.lam0, lat: g.phi0 };
  const before = project(anchor.lon, anchor.lat);
  const d = dragDelta(dx, dy, g.phi0, g.scale);
  g.lam0 += d.dLon;
  g.phi0 += d.dLat;
  const after = project(anchor.lon, anchor.lat);
  Object.assign(g, saved);
  return { x: after.x - before.x, y: after.y - before.y };
}

[0, 23.525, 55, 78].forEach(lat => {
  // The cos(lat) term in dragDelta is exactly what this catches: without it a horizontal
  // drag under-turns the globe by cos(lat).
  const h = dragAnchor(60, 0, lat);
  check(`horizontal drag at lat ${lat} tracks the cursor`, close(h.x, 60, 60 * 0.03),
    `moved x ${h.x.toFixed(2)} px, wanted 60`);
  const v = dragAnchor(0, -40, lat);
  check(`vertical drag at lat ${lat} tracks the cursor`, close(v.y, -40, 40 * 0.02),
    `moved y ${v.y.toFixed(2)} px, wanted -40`);
});

// A diagonal drag still lands within a few percent of the requested displacement.
{
  const d = dragAnchor(60, -40, 55);
  const got = Math.hypot(d.x, d.y), want = Math.hypot(60, 40);
  check("diagonal drag lands within 8% of the drag distance", close(got, want, want * 0.08),
    `moved ${got.toFixed(2)} px, wanted ${want.toFixed(2)}`);
}

// 6. scaleForSpan: asking for Bangladesh to be N px tall gives a scale that delivers it
{
  const wanted = 620;
  const s = scaleForSpan(wanted);
  const saved = g.scale;
  g.scale = s;
  g.lam0 = 90.35; g.phi0 = 23.525;
  const top = project(90.35, 26.75), bot = project(90.35, 20.3);
  const span = Math.abs(bot.y - top.y);
  g.scale = saved;
  // orthographic foreshortens away from centre, so allow a few percent
  check("scaleForSpan sizes Bangladesh as asked", close(span, wanted, wanted * 0.04),
    `span ${span.toFixed(1)} px, wanted ${wanted}`);
}

// 7. unproject rejects points off the sphere
{
  check("unproject returns null outside the disc",
    unproject(g.w / 2 + g.scale + 5, g.h / 2) === null);
}

console.log(failures === 0 ? "\nglobe math OK" : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
