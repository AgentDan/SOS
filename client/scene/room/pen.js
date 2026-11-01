const PENS = {
  main: { width: 1.55, opacity: 0.95 },
  second: { width: 1.1, opacity: 0.67 },
  light: { width: 0.9, opacity: 0.43 },
  ghost: { width: 0.85, opacity: 0.25 },
  hatch: { width: 0.75, opacity: 0.35 },
  vein: { width: 0.7, opacity: 0.35 }
};

function seededRandom(seed) {
  let state = seed >>> 0;
  return function rng() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function lengthOf(v) {
  return Math.hypot(v[0], v[1], v[2]);
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(v) {
  const len = lengthOf(v);
  if (len < 1e-12) return null;
  return scale(v, 1 / len);
}

function lerp(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function axesFor(dir) {
  const ref = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const first = unit(cross(dir, ref));
  if (!first) return null;
  const second = unit(cross(dir, first));
  if (!second) return null;
  return [first, second];
}

function createPen(seed) {
  const rng = seededRandom(seed);
  const buckets = {};

  function rr(a, b) {
    return a + (b - a) * rng();
  }

  function pushSegment(penName, a, b) {
    const list = buckets[penName] ?? (buckets[penName] = []);
    list.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }

  function rawStroke(penName, a, b, opt = {}) {
    const over = opt.over ?? 0.05;
    const overStart = opt.overStart ?? over;
    const overEnd = opt.overEnd ?? over;
    const wob = opt.wob ?? 1;
    const delta = sub(b, a);
    const len = lengthOf(delta);
    if (len < 1e-4) return;
    const dir = scale(delta, 1 / len);
    const axes = axesFor(dir);
    if (!axes) return;
    const start = add(a, scale(dir, -(overStart * rr(0.2, 1))));
    const end = add(b, scale(dir, overEnd * rr(0.2, 1)));
    const bow = rr(-1, 1) * 0.004 * Math.min(len, 3) * wob;
    const n = opt.seg || Math.max(3, Math.ceil(len / 0.25));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const envelope = Math.sin(t * Math.PI);
      const point = add(
        lerp(start, end, t),
        add(
          scale(axes[0], bow * envelope + rr(-0.0018, 0.0018) * wob * envelope),
          scale(axes[1], rr(-0.0012, 0.0012) * wob * envelope)
        )
      );
      if (prev) pushSegment(penName, prev, point);
      prev = point;
    }
  }

  function ghostBeside(a, b) {
    const delta = sub(b, a);
    const len = lengthOf(delta);
    if (len < 1e-4) return;
    const axes = axesFor(scale(delta, 1 / len));
    if (!axes) return;
    const off = rr(-0.006, 0.006);
    const p0 = add(lerp(a, b, rr(0, 0.25)), scale(axes[0], off));
    const p1 = add(lerp(a, b, rr(0.6, 1)), scale(axes[0], off));
    rawStroke("ghost", p0, p1, { over: 0.02 });
  }

  function stroke(penName, a, b, opt = {}) {
    const len = lengthOf(sub(b, a));
    const broken = len > 1.2 && rng() < 0.12 && opt.breaks !== false;
    if (broken) {
      const gap = rr(0.015, 0.04);
      const pos = rr(0.3, 0.7);
      const t2 = Math.min(1, pos + gap / len);
      rawStroke(penName, a, lerp(a, b, pos), { ...opt, overEnd: 0 });
      rawStroke(penName, lerp(a, b, t2), b, { ...opt, overStart: 0 });
    } else {
      rawStroke(penName, a, b, opt);
    }
    if (opt.ghost && rng() < 0.75) ghostBeside(a, b);
  }

  function polyline(penName, points) {
    if (!points || points.length < 2) return;
    for (let i = 0; i < points.length - 1; i++) {
      if (lengthOf(sub(points[i + 1], points[i])) < 1e-8) continue;
      pushSegment(penName, points[i], points[i + 1]);
    }
  }

  function rect(penName, origin, u, v, w, h, opt) {
    const uu = unit(u);
    const vv = unit(v);
    if (!uu || !vv) return;
    const p00 = origin;
    const p10 = add(origin, scale(uu, w));
    const p11 = add(p10, scale(vv, h));
    const p01 = add(origin, scale(vv, h));
    stroke(penName, p00, p10, opt);
    stroke(penName, p10, p11, opt);
    stroke(penName, p11, p01, opt);
    stroke(penName, p01, p00, opt);
  }

  function hatchBand(origin, u, v, w, h, opt = {}) {
    const step = opt.step ?? 0.03;
    const slant = opt.slant ?? 0.35;
    const penName = opt.pen ?? "hatch";
    const fade = opt.fade !== false;
    if (!(w > 0) || !(h > 0) || !(step > 0)) return;
    const uu = unit(u);
    const vv = unit(v);
    if (!uu || !vv) return;
    const count = Math.ceil(w / step);
    for (let i = 0; i < count; i++) {
      const x = i * step;
      if (x >= w) break;
      const t = x / w;
      const k = fade ? 1 - Math.abs(t - 0.5) * 0.9 : 1;
      if (rng() > 0.85 * k + 0.1) continue;
      let strokeLen = h * rr(0.55, 1);
      if (fade) strokeLen *= 0.6 + 0.4 * k;
      const start = add(origin, scale(uu, x));
      const end = add(start, add(scale(vv, strokeLen), scale(uu, -strokeLen * slant)));
      rawStroke(penName, start, end, { over: 0, wob: 0.6, seg: 2 });
    }
  }

  function result() {
    const out = {};
    for (const name of Object.keys(buckets)) {
      if (buckets[name].length > 0) out[name] = new Float32Array(buckets[name]);
    }
    return out;
  }

  return { stroke, rawStroke, polyline, rect, hatchBand, result, rr };
}

export { PENS, seededRandom, createPen };
