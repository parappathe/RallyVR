// Estrada de uma etapa: curva fechada (Catmull-Rom) reamostrada a cada ~1 m. A forma vem de um
// "caminho de tartaruga" (retas e arcos com raio conhecido) ou de pontos. Guarda posição, direção,
// curvatura, superfície de cada trecho, cristas (lombadas de salto), a "linha ideal" (por onde a
// IA anda), o perfil de velocidade, as curvas com a nota do copiloto e os pontos de parcial.
// Sem navegador.
//
// Convenções: metros; s = distância ao longo da estrada a partir da largada; lat = desvio
// lateral (positivo = à esquerda de quem anda no sentido da corrida).
import { clamp } from './util.js';
import { SURFACE_IDS } from './surfaces.js';

const cr = (a, b, c, d, t) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
};

// Caminho de tartaruga → pontos a cada ~12 m. Itens: ['S', comprimento] reta, ['L'|'R', graus,
// raio] arco para a esquerda/direita. A soma dos giros deve dar 360°; para o fim cair exatamente
// no começo, as retas são esticadas/encurtadas o mínimo possível (mínimos quadrados).
export function turtlePoints(path, step = 12) {
  const walk = (lens) => {
    let x = 0, z = 0, th = -Math.PI / 2, k = 0;
    const dirs = [];
    for (const seg of path) {
      if (seg[0] === 'S') { const L = lens ? lens[k] : seg[1]; dirs.push([Math.cos(th), Math.sin(th)]); x += Math.cos(th) * L; z += Math.sin(th) * L; k++; }
      else {
        const ang = seg[1] * Math.PI / 180, R = seg[2], dir = seg[0] === 'L' ? -1 : 1;
        const mid = th + dir * ang / 2, len = 2 * R * Math.sin(ang / 2);
        x += Math.cos(mid) * len; z += Math.sin(mid) * len; th += dir * ang;
      }
    }
    return { x, z, dirs };
  };
  // correção das retas: delta = -D^T (D D^T)^-1 e
  let lens = path.filter(s => s[0] === 'S').map(s => s[1]);
  for (let it = 0; it < 4; it++) {
    const { x: ex, z: ez, dirs } = walk(lens);
    let a = 0, b = 0, c = 0;
    dirs.forEach(([dx, dz], i) => { const w = lens[i] > 15 ? 1 : 0; a += w * dx * dx; b += w * dx * dz; c += w * dz * dz; });
    const det = a * c - b * b;
    if (Math.abs(det) < 1e-9) break;
    const ix = (c * ex - b * ez) / det, iz = (a * ez - b * ex) / det;
    lens = lens.map((L, i) => L > 15 ? Math.max(12, L - (dirs[i][0] * ix + dirs[i][1] * iz)) : L);
  }
  const pts = [], segs = [];
  let x = 0, z = 0, th = -Math.PI / 2, k = 0, acc = 0;     // começa andando para -z
  const push = () => pts.push([x, z]);
  for (const seg of path) {
    const L0 = seg[0] === 'S' ? lens[k] : seg[1] * Math.PI / 180 * seg[2];
    segs.push({ s: acc, len: L0, type: seg[0] });
    acc += L0;
    if (seg[0] === 'S') {
      const L = lens[k++], n = Math.max(1, Math.round(L / step));
      for (let i = 0; i < n; i++) { push(); x += Math.cos(th) * L / n; z += Math.sin(th) * L / n; }
    } else {
      const ang = seg[1] * Math.PI / 180, R = seg[2], dir = seg[0] === 'L' ? -1 : 1;
      const n = Math.max(2, Math.round(ang * R / step));
      for (let i = 0; i < n; i++) {
        push();
        const d = ang / n;
        // corda do arco
        const mid = th + dir * d / 2, len = 2 * R * Math.sin(d / 2);
        x += Math.cos(mid) * len; z += Math.sin(mid) * len;
        th += dir * d;
      }
    }
  }
  const n = pts.length, ex = x, ez = z;     // onde terminou (deveria ser 0,0)
  return { points: pts.map(([px, pz], i) => [px - ex * i / n, pz - ez * i / n]), gap: Math.hypot(ex, ez), turn: th + Math.PI / 2, lens, segs, total: acc };
}

export class Track {
  constructor(def) {
    this.def = def;
    this.halfWidth = def.width / 2;
    this.verge = def.verge ?? 2.5;                  // acostamento antes da barreira
    this.wall = this.halfWidth + this.verge;        // |lat| da barreira

    // 1. Curva densa
    const turtle = def.path ? turtlePoints(def.path) : null;
    const base = turtle ? turtle.points : def.points;
    const P = base.map(([x, z]) => [x, z]), n = P.length;
    const dense = [];
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      const steps = Math.max(8, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 0.25));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        dense.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t)]);
      }
    }
    // 2. Reamostra com passo igual
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) {
      const a = dense[i - 1], b = dense[i % dense.length];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    this.length = cum[dense.length];
    const N = this.N = Math.round(this.length);
    this.step = this.length / N;
    this.x = new Float64Array(N); this.z = new Float64Array(N); this.y = new Float64Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * this.step;
      while (cum[j + 1] < s) j++;
      const a = dense[j], b = dense[(j + 1) % dense.length];
      const u = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
      this.x[i] = a[0] + (b[0] - a[0]) * u;
      this.z[i] = a[1] + (b[1] - a[1]) * u;
    }
    // Relevo: pontos [fração, altura] ligados por cosseno (sem degrau).
    const elev = def.elev || [[0, 0]];
    for (let i = 0; i < N; i++) this.y[i] = elevAt(elev, i / N);

    // 3. Direção e curvatura
    this.tx = new Float64Array(N); this.tz = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a], l = Math.hypot(dx, dz);
      this.tx[i] = dx / l; this.tz[i] = dz / l;
    }
    const rawCurv = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const b = (i + 1) % N;
      const cross = this.tx[i] * this.tz[b] - this.tz[i] * this.tx[b];
      rawCurv[i] = -cross / this.step;               // positivo = curva para a esquerda
    }
    this.curv = smooth(rawCurv, 4);

    // 4. Superfície por trecho: [fração onde começa, nome]
    this.surf = new Uint8Array(N);
    const segs = (def.surfaces || [[0, 'asfalto']]).slice().sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < N; i++) {
      const f = i / N;
      let name = segs[segs.length - 1][1];
      for (const [f0, nm] of segs) if (f >= f0) name = nm;
      this.surf[i] = SURFACE_IDS.indexOf(name);
    }

    // 5. Linha ideal: corta por dentro das curvas, antecipando um pouco.
    const ahead = smooth(rawCurv, 16);
    this.line = new Float64Array(N);
    const lim = this.halfWidth * 0.55;
    for (let i = 0; i < N; i++) this.line[i] = clamp(ahead[(i + 6) % N] * this.halfWidth * 22, -lim, lim);
    this.line = smooth(this.line, 8);
    const lx = new Float64Array(N), lz = new Float64Array(N);
    for (let i = 0; i < N; i++) { lx[i] = this.x[i] + this.tz[i] * this.line[i]; lz[i] = this.z[i] - this.tx[i] * this.line[i]; }
    const lc = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 2 + N) % N, b = (i + 2) % N;
      const ax = lx[i] - lx[a], az = lz[i] - lz[a], bx = lx[b] - lx[i], bz = lz[b] - lz[i];
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      lc[i] = -(ax * bz - az * bx) / (la * lb) / ((la + lb) / 2);
    }
    this.lineCurv = smooth(lc, 3);

    // 6. Cristas (salto): elevação suave em forma de lombada. f = início em fração, len, h.
    //    Com seg (índice de uma reta do caminho), a crista fica no meio dessa reta.
    this.crests = (def.crests || []).map(c => {
      let s = c.s ?? c.f * this.length;
      if (c.seg != null && turtle) { const g = turtle.segs[c.seg]; s = (g.s + (g.len - c.len) / 2) * this.length / turtle.total; }
      return { ...c, s };
    });
    // 7. Curvas com nota do copiloto e pontos de parcial
    this.corners = findCorners(this);
    this.splits = (def.splits || [0.2, 0.4, 0.6, 0.8]).map(f => f * this.length);
    this.profile = null;
  }

  // Velocidade possível em cada amostra. grip(i) devolve { alat, vmax, decel } do trecho.
  buildProfile(grip) {
    const N = this.N, p = new Float64Array(N), dec = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const g = grip(i);
      p[i] = Math.min(g.vmax, Math.sqrt(g.alat / Math.max(1e-4, Math.abs(this.lineCurv[i]))));
      dec[i] = g.decel;
    }
    // aterrissagem de crista: não chegar voando numa curva
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const nx = p[(i + 1) % N];
        p[i] = Math.min(p[i], Math.sqrt(nx * nx + 2 * dec[i] * this.step));
      }
    }
    this.profile = p;
    this.profileMax = p.reduce((a, b) => Math.max(a, b), 0);
    return p;
  }

  idx(s) { const i = Math.floor(this.wrap(s) / this.step); return i % this.N; }
  wrap(s) { s %= this.length; return s < 0 ? s + this.length : s; }
  surfaceAt(s) { return SURFACE_IDS[this.surf[this.idx(s)]]; }

  sampleAt(arr, s) {
    s = this.wrap(s) / this.step;
    const i = Math.floor(s) % this.N, u = s - Math.floor(s);
    return arr[i] + (arr[(i + 1) % this.N] - arr[i]) * u;
  }

  // Altura do chão na distância s (relevo + cristas).
  heightAt(s) {
    let h = this.sampleAt(this.y, s);
    const w = this.wrap(s);
    for (const c of this.crests) {
      const d = w - c.s;
      if (d > 0 && d < c.len) h += c.h * (1 - Math.cos(2 * Math.PI * d / c.len)) / 2;
    }
    return h;
  }
  gradeAt(s) { return (this.heightAt(s + 0.25) - this.heightAt(s - 0.25)) / 0.5; }

  pointAt(s, lat = 0, out = {}) {
    const f = this.wrap(s) / this.step;
    const i = Math.floor(f) % this.N, b = (i + 1) % this.N, u = f - Math.floor(f);
    let tx = this.tx[i] + (this.tx[b] - this.tx[i]) * u, tz = this.tz[i] + (this.tz[b] - this.tz[i]) * u;
    const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    out.tx = tx; out.tz = tz;
    out.x = this.x[i] + (this.x[b] - this.x[i]) * u + tz * lat;
    out.z = this.z[i] + (this.z[b] - this.z[i]) * u - tx * lat;
    out.y = this.heightAt(s);
    return out;
  }

  // Projeta (x, z) na estrada. hint = índice da última projeção (procura só em volta), -1 = tudo.
  project(x, z, hint = -1, out = {}) {
    const N = this.N;
    let best = Infinity, bi = 0, bu = 0;
    const from = hint < 0 ? 0 : hint - 40, to = hint < 0 ? N : hint + 40;
    for (let k = from; k < to; k++) {
      const i = ((k % N) + N) % N, b = (i + 1) % N;
      const ax = this.x[i], az = this.z[i];
      const dx = this.x[b] - ax, dz = this.z[b] - az;
      const u = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      const px = ax + dx * u - x, pz = az + dz * u - z;
      const d = px * px + pz * pz;
      if (d < best) { best = d; bi = i; bu = u; }
    }
    const b = (bi + 1) % N;
    const cx = this.x[bi] + (this.x[b] - this.x[bi]) * bu, cz = this.z[bi] + (this.z[b] - this.z[bi]) * bu;
    let tx = this.tx[bi] + (this.tx[b] - this.tx[bi]) * bu, tz = this.tz[bi] + (this.tz[b] - this.tz[bi]) * bu;
    const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    out.i = bi;
    out.s = (bi + bu) * this.step;
    out.lat = (x - cx) * tz - (z - cz) * tx;
    out.tx = tx; out.tz = tz;
    out.y = this.heightAt(out.s);
    return out;
  }

  // Próxima curva a partir de s (até "range" metros à frente). Devolve { corner, dist } ou null.
  nextCorner(s, range = 250) {
    let best = null;
    for (const c of this.corners) {
      let d = c.s0 - this.wrap(s);
      if (d < -this.length / 2) d += this.length;
      if (d > this.length / 2) d -= this.length;
      // ainda dentro da curva conta como "agora"
      const inside = d <= 0 && d > -(c.s1 - c.s0);
      if ((d >= 0 || inside) && d <= range && (!best || d < best.dist)) best = { corner: c, dist: Math.max(0, d) };
    }
    return best;
  }
}

function elevAt(elev, f) {
  const k = elev.length;
  for (let i = 0; i < k; i++) {
    const [f0, h0] = elev[i], [f1raw, h1] = elev[(i + 1) % k];
    const f1 = i + 1 < k ? f1raw : 1 + elev[0][0];
    let ff = f;
    if (ff < f0) ff += 1;
    if (ff >= f0 && ff <= f1) {
      const u = (ff - f0) / Math.max(1e-9, f1 - f0);
      return h0 + (h1 - h0) * (1 - Math.cos(Math.PI * u)) / 2;
    }
  }
  return elev[0][1];
}

// Nota da curva pelo menor raio: 1 = suave ... 6 = muito fechada (grampo).
export function cornerGrade(r) {
  if (r > 150) return 1;
  if (r > 100) return 2;
  if (r > 70) return 3;
  if (r > 50) return 4;
  if (r > 36) return 5;
  return 6;
}

function findCorners(tr) {
  const N = tr.N, k = smooth(tr.curv, 6), TH = 1 / 220;
  // começa num ponto reto para não cortar uma curva ao meio
  let start = 0;
  for (let i = 0; i < N; i++) if (Math.abs(k[i]) < TH) { start = i; break; }
  const out = [];
  let cur = null;
  for (let n = 0; n <= N; n++) {
    const i = (start + n) % N, v = k[i];
    const sign = Math.abs(v) >= TH ? Math.sign(v) : 0;
    if (cur && (sign !== cur.sign || n === N)) {
      cur.end = start + n;
      out.push(cur); cur = null;
    }
    if (!cur && sign !== 0 && n < N) cur = { sign, begin: start + n, maxK: 0, angle: 0 };
    if (cur) { cur.maxK = Math.max(cur.maxK, Math.abs(v)); cur.angle += Math.abs(v) * tr.step; }
  }
  // junta pedaços do mesmo lado separados por menos de 12 m
  const merged = [];
  for (const c of out) {
    const last = merged.at(-1);
    if (last && last.sign === c.sign && (c.begin - last.end) * tr.step < 12) {
      last.end = c.end; last.maxK = Math.max(last.maxK, c.maxK); last.angle += c.angle;
    } else merged.push({ ...c });
  }
  return merged.filter(c => c.angle > 0.26).map(c => {
    const minR = 1 / c.maxK;
    return {
      s0: tr.wrap(c.begin * tr.step), s1: tr.wrap(c.begin * tr.step) + (c.end - c.begin) * tr.step,
      dir: c.sign > 0 ? 'L' : 'R', grade: cornerGrade(minR), minR, angle: c.angle * 180 / Math.PI,
    };
  }).sort((a, b) => a.s0 - b.s0);
}

function smooth(arr, r) {
  const N = arr.length, out = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += arr[((i + k) % N + N) % N];
    out[i] = sum / (2 * r + 1);
  }
  return out;
}
