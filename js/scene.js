// Monta o mundo 3D de uma etapa: estrada com a cor de cada superfície, barreiras (cerca, feno ou
// neve), placas do copiloto, pórticos das parciais, cenário de cada tema e o carro de rally (com a
// cabine para o VR) e os carros fantasma. Tudo com materiais simples, geometrias juntadas e
// instâncias, para rodar liso no Quest (sem sombra em tempo real: sombra redonda falsa).
import * as THREE from '../vendor/three/three.module.js';
import { rng } from './util.js';
import { SURFACES } from './surfaces.js';
import { drawPaceIcon } from './hud.js';

const col = new THREE.Color();

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- Estrada ----------
function surfColor(name, th) {
  if (name === 'terra') return new THREE.Color(th.terra);
  return new THREE.Color(SURFACES[name].color);
}

function buildRoadMesh(track, th) {
  const S = [];
  for (let i = 0; i <= track.N; i += 2) S.push(Math.min(i, track.N) * track.step);
  if (S.at(-1) < track.length) S.push(track.length);
  const st = S.map(s => {
    const p = track.pointAt(s, 0);
    return { s, x: p.x, z: p.z, lx: p.tz, lz: -p.tx, h: track.heightAt(s) };
  });
  const pos = [], cols = [];
  const hw = track.halfWidth, W = track.wall;
  const quad = (a, b, la, lb, ya, yb, c, cb = c) => {
    const P = (q, lat, y) => [q.x + q.lx * lat, y(q.h, q), q.z + q.lz * lat];
    const v = [P(a, la, ya), P(a, lb, yb), P(b, la, ya), P(b, lb, yb)];
    const cc = [c, c, cb, cb];
    for (const i of [0, 2, 1, 1, 2, 3]) { pos.push(...v[i]); cols.push(cc[i].r, cc[i].g, cc[i].b); }
  };
  const at = (o) => (h) => h + o;
  const r = rng(5);
  const vergeC = new THREE.Color(th.verge), bankC = new THREE.Color(th.bank), white = new THREE.Color(0xf4f4f0);
  const wood = new THREE.Color(0x6a4a2a), woodB = new THREE.Color(0x7d5a36);
  const hayA = new THREE.Color(0xe0c060), hayB = new THREE.Color(0xc8a648), hayTop = new THREE.Color(0xeacf78);
  const snowA = new THREE.Color(0xf6f9fc), snowB = new THREE.Color(0xdfe8f2);
  const c1 = new THREE.Color(), c2 = new THREE.Color();
  for (let i = 0; i < st.length - 1; i++) {
    const a = st[i], b = st[i + 1], sm = (a.s + b.s) / 2;
    const surf = track.surfaceAt(sm);
    // superfície com variação de tom (manchas a cada ~6 m)
    const base = surfColor(surf, th);
    const n = ((Math.floor(sm / 6) * 7919) % 13) / 13;
    c1.copy(base).multiplyScalar(0.9 + 0.16 * n);
    if (surf === 'gelo') c1.lerp(white, 0.25 * r());
    quad(a, b, -hw, hw, at(0), at(0), c1);
    if (surf === 'asfalto') {
      if (Math.floor(sm / 4) % 2 === 0) quad(a, b, -0.1, 0.1, at(0.01), at(0.01), white);
      for (const sd of [-1, 1]) quad(a, b, sd * (hw - 0.35), sd * (hw - 0.2), at(0.01), at(0.01), white);
    } else {
      // trilhas das rodas (mais escuras; no gelo, mais brilhantes)
      c2.copy(base).multiplyScalar(surf === 'gelo' ? 1.15 : surf === 'neve' ? 0.82 : 0.78);
      for (const sd of [-1, 1]) quad(a, b, sd * 0.75, sd * 1.45, at(0.01), at(0.01), c2);
    }
    for (const side of [-1, 1]) {
      col.copy(vergeC).multiplyScalar(0.9 + 0.12 * r());
      quad(a, b, side * hw, side * W, at(-0.02), at(-0.02), col);
      // barreira
      if (th.barrier === 'cerca') {
        quad(a, b, side * W, side * W, at(0.45), at(0.6), wood);
        quad(a, b, side * W, side * W, at(0.85), at(1.0), woodB);
        quad(a, b, side * W, side * (W + 3 + a.h * 1.6), at(-0.02), () => -0.05, bankC);
      } else if (th.barrier === 'feno') {
        const hc = Math.floor(sm / 2) % 2 ? hayA : hayB;
        quad(a, b, side * W, side * W, at(0), at(0.9), hc);
        quad(a, b, side * W, side * (W + 0.9), at(0.9), at(0.9), hayTop);
        quad(a, b, side * (W + 0.9), side * (W + 0.9), at(0.9), at(0), hc);
        quad(a, b, side * (W + 0.9), side * (W + 3.5 + a.h * 1.6), at(-0.02), () => -0.05, bankC);
      } else {
        quad(a, b, side * (W - 0.4), side * (W + 0.5), at(-0.02), at(0.85), snowB, snowB);
        quad(a, b, side * (W + 0.5), side * (W + 1.8), at(0.85), at(0.2), snowA);
        quad(a, b, side * (W + 1.8), side * (W + 4 + a.h * 1.6), at(0.2), () => -0.05, bankC);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

// Coleção de peças (geometria já posicionada + material) que viram um objeto por material.
class Merger {
  constructor() { this.byMat = new Map(); }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(m);
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
    return this;
  }
  meshes() {
    const out = [];
    for (const [mat, list] of this.byMat) out.push(new THREE.Mesh(mergeGeos(list), mat));
    return out;
  }
  // tudo numa geometria só (fantasma)
  single() { return mergeGeos([...this.byMat.values()].flat()); }
}

function mergeGeos(list) {
  const hasUv = list.every(g => g.attributes.uv);
  const pos = [], nor = [], uv = [];
  for (const g of list) {
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    if (hasUv) uv.push(...g.attributes.uv.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (hasUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function yawOf(p) { return Math.atan2(-p.tx, -p.tz); }

// ---------- Largada/chegada ----------
function startArch(track) {
  const grp = new THREE.Group();
  const p = track.pointAt(0.6, 0), yaw = yawOf(p);
  const tex = canvasTex(256, 32, (g, w, h) => {
    const n = 16;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * w / n, j * h / 2, w / n, h / 2); }
  });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(track.halfWidth * 2, 1.2), new THREE.MeshBasicMaterial({ map: tex }));
  line.rotation.order = 'YXZ';
  line.rotation.set(-Math.PI / 2, yaw, 0);
  line.position.set(p.x, track.heightAt(0.6) + 0.03, p.z);
  grp.add(line);
  const W = track.wall + 0.6;
  const m = new Merger(), postM = new THREE.MeshLambertMaterial({ color: 0x2a2e36 });
  for (const side of [-1, 1]) m.add(new THREE.BoxGeometry(0.5, 6.4, 0.5), postM, p.x + p.tz * W * side, p.y + 3.2, p.z - p.tx * W * side);
  for (const o of m.meshes()) grp.add(o);
  const banTex = canvasTex(1024, 160, (g, w, h) => {
    g.fillStyle = '#1b2a4a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * w / 32, j * 12 + (j ? h - 24 : 0), w / 32, 12); }
    g.fillStyle = '#ffcf3a'; g.font = 'bold 70px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('RALLY DA SERRA', w / 2, h / 2 - 12);
    g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif';
    g.fillText('LARGADA  ·  CHEGADA', w / 2, h / 2 + 40);
  });
  const ban = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.5, 1.6, 0.3), new THREE.MeshBasicMaterial({ map: banTex }));
  ban.position.set(p.x, p.y + 6.2, p.z);
  ban.rotation.y = yaw;
  grp.add(ban);
  return grp;
}

// Pórticos das parciais ("PC 1", "PC 2"...): uma textura com todas as faixas.
function splitGates(track) {
  const n = track.splits.length, H = 80;
  const tex = canvasTex(512, H * n, (g, w) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = '#e8edf5'; g.fillRect(0, i * H, w, H);
      g.fillStyle = '#e23b3b'; g.fillRect(0, i * H, 40, H); g.fillRect(w - 40, i * H, 40, H);
      g.fillStyle = '#16213a'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`CONTROLE ${i + 1}`, w / 2, i * H + H / 2 + 2);
    }
  });
  const m = new Merger(), postM = new THREE.MeshLambertMaterial({ color: 0xd8dce4 });
  const banM = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  const W = track.wall + 0.4;
  const banGeos = [];
  track.splits.forEach((s, i) => {
    const p = track.pointAt(s, 0), yaw = yawOf(p);
    for (const side of [-1, 1]) m.add(new THREE.CylinderGeometry(0.12, 0.12, 5, 6), postM, p.x + p.tz * W * side, p.y + 2.5, p.z - p.tx * W * side);
    const g = new THREE.PlaneGeometry(W * 2, 0.9);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / n);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y + 4.6, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1)));
    banGeos.push(g.toNonIndexed());
  });
  const grp = new THREE.Group();
  for (const o of m.meshes()) grp.add(o);
  grp.add(new THREE.Mesh(mergeGeos(banGeos), banM));
  return grp;
}

// Placas do copiloto: seta da curva com a nota de 1 (suave) a 6 (grampo), uns 45 m antes.
function paceSigns(track) {
  const C = 128;
  const tex = canvasTex(C * 6, C * 2, (g) => {
    for (let k = 0; k < 12; k++) {
      const dir = k < 6 ? 'L' : 'R', grade = (k % 6) + 1;
      g.save(); g.translate((k % 6) * C, Math.floor(k / 6) * C);
      drawPaceIcon(g, dir, grade, C / 2, C / 2, C, true);
      g.restore();
    }
  });
  const geos = [], m = new Merger(), postM = new THREE.MeshLambertMaterial({ color: 0x55504a });
  for (const c of track.corners) {
    const s = c.s0 - 45;
    const side = c.dir === 'L' ? -1 : 1;            // placa do lado de fora da curva
    const lat = side * (track.wall + 1.0);
    const p = track.pointAt(s, lat), yaw = yawOf(p) + Math.PI - side * 0.25;
    m.add(new THREE.BoxGeometry(0.1, 1.4, 0.1), postM, p.x, p.y + 0.7, p.z);
    const g = new THREE.PlaneGeometry(1.3, 1.3);
    const k = (c.dir === 'L' ? 0 : 6) + c.grade - 1;
    const uv = g.attributes.uv;
    for (let q = 0; q < uv.count; q++) uv.setXY(q, ((k % 6) + uv.getX(q)) / 6, 1 - (Math.floor(k / 6) + 1 - uv.getY(q)) / 2);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y + 1.9, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1)));
    geos.push(g.toNonIndexed());
  }
  const grp = new THREE.Group();
  for (const o of m.meshes()) grp.add(o);
  if (geos.length) grp.add(new THREE.Mesh(mergeGeos(geos), new THREE.MeshBasicMaterial({ map: tex })));
  return grp;
}

// ---------- Cenário ----------
function scatter(track, count, minOut, maxOut, seed) {
  const r = rng(seed), out = [];
  let tries = 0;
  while (out.length < count && tries++ < count * 30) {
    const s = r() * track.length;
    const side = r() < 0.5 ? -1 : 1;
    const p = track.pointAt(s, 0);
    const d = track.wall + minOut + p.y * 1.6 + r() * (maxOut - minOut);
    const x = p.x + p.tz * d * side, z = p.z - p.tx * d * side;
    const q = track.project(x, z, -1);
    if (Math.abs(q.lat) < track.wall + minOut + q.y * 1.6) continue;
    out.push({ x, z, r: r(), s: q.s });
  }
  return out;
}

function instanced(geo, mat, items, place, color) {
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  const o = new THREE.Object3D();
  items.forEach((it, i) => {
    o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
    place(o, it, i); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    if (color) m.setColorAt(i, color(it, i));
  });
  m.instanceMatrix.needsUpdate = true;
  return m;
}

function buildFlora(track, th) {
  const grp = new THREE.Group();
  const near = scatter(track, 170, 4, 30, 9), far = scatter(track, 150, 30, 110, 10);
  const all = near.concat(far);
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  if (th.flora === 'cerrado') {
    // árvores tortas do cerrado (algumas são ipês floridos), cupinzeiros e capim
    grp.add(instanced(new THREE.CylinderGeometry(0.16, 0.26, 2.6, 5), lam(0x4a3426), all,
      (o, t) => { const s = 0.8 + t.r * 0.7; o.position.set(t.x, 1.3 * s, t.z); o.rotation.set(0.25 * (t.r - 0.5), t.r * 6, 0.3 * (t.r - 0.5)); o.scale.setScalar(s); }));
    const crown = new THREE.IcosahedronGeometry(1.8, 0);
    const greens = [0x6a7a34, 0x5d6e2e, 0x7a8640, 0xf0c020, 0xd060a0];
    grp.add(instanced(crown, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), all,
      (o, t) => { const s = 0.8 + t.r * 0.7; o.position.set(t.x, 2.9 * s, t.z); o.rotation.set(0, t.r * 9, 0); o.scale.set(s * 1.3, s * 0.65, s * 1.3); },
      (t) => col.set(greens[t.r < 0.08 ? 3 : t.r < 0.12 ? 4 : Math.floor(t.r * 37) % 3])));
    const mounds = scatter(track, 60, 2, 40, 31);
    grp.add(instanced(new THREE.ConeGeometry(0.6, 1.6, 6), lam(0xb0603a), mounds,
      (o, t) => { const s = 0.6 + t.r; o.position.set(t.x, 0.8 * s, t.z); o.scale.set(s, s, s); }));
  } else if (th.flora === 'mata') {
    // mata fechada: troncos altos, copas em dois andares
    const dense = all.concat(scatter(track, 180, 3, 22, 12));
    grp.add(instanced(new THREE.CylinderGeometry(0.22, 0.35, 8, 5), lam(0x3e2e22), dense,
      (o, t) => { const s = 0.8 + t.r * 0.6; o.position.set(t.x, 4 * s, t.z); o.scale.setScalar(s); }));
    const crown = new THREE.IcosahedronGeometry(2.6, 0);
    const greens = [0x2e5a2a, 0x3a6a30, 0x24502a, 0x4a7a36];
    grp.add(instanced(crown, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), dense,
      (o, t) => { const s = 0.8 + t.r * 0.6; o.position.set(t.x, 8.5 * s, t.z); o.rotation.set(t.r, t.r * 7, 0); o.scale.set(s, s * 0.9, s); },
      (t) => col.set(greens[Math.floor(t.r * 41) % 4])));
    const ferns = scatter(track, 120, 0.5, 12, 33);
    grp.add(instanced(new THREE.ConeGeometry(0.9, 0.9, 5), lam(0x3f7a34), ferns,
      (o, t) => { o.position.set(t.x, 0.4, t.z); o.rotation.set(Math.PI, t.r * 5, 0); o.scale.set(1 + t.r, 0.7, 1 + t.r); }));
  } else {
    // pinheiros com neve
    grp.add(instanced(new THREE.CylinderGeometry(0.2, 0.3, 2, 5), lam(0x4a3626), all,
      (o, t) => { const s = 0.8 + t.r * 0.9; o.position.set(t.x, s, t.z); o.scale.setScalar(s); }));
    grp.add(instanced(new THREE.ConeGeometry(2.2, 5.5, 7), lam(0x24503a), all,
      (o, t) => { const s = 0.8 + t.r * 0.9; o.position.set(t.x, 4.4 * s, t.z); o.scale.setScalar(s); }));
    grp.add(instanced(new THREE.ConeGeometry(1.25, 2.4, 7), lam(0xf4f8fc), all,
      (o, t) => { const s = 0.8 + t.r * 0.9; o.position.set(t.x, 6.7 * s, t.z); o.scale.setScalar(s); }));
  }
  // pedras perto da estrada (todas as etapas)
  const rocks = scatter(track, 90, 0.5, 14, 41);
  const rr = rng(4);
  grp.add(instanced(new THREE.DodecahedronGeometry(0.8, 0), new THREE.MeshLambertMaterial({ color: th.flora === 'pinheiro' ? 0x8a8e98 : th.flora === 'mata' ? 0x6a6458 : 0x8a6048, flatShading: true }), rocks,
    (o, t) => { const s = 0.5 + t.r * 1.6; o.position.set(t.x, s * 0.35, t.z); o.rotation.set(rr() * 3, rr() * 3, rr() * 3); o.scale.set(s, s * (0.5 + rr() * 0.5), s); }));
  return grp;
}

// Postes da cerca (cerrado) ou balizas laranja (neve); poças na lama.
function buildBarrierProps(track, th) {
  const grp = new THREE.Group();
  const W = track.wall;
  if (th.barrier === 'cerca' || th.barrier === 'neve') {
    const every = th.barrier === 'cerca' ? 4 : 9, items = [];
    for (let s = 0; s < track.length; s += every) for (const side of [-1, 1]) {
      const p = track.pointAt(s, side * (W + (th.barrier === 'neve' ? 0.5 : 0)));
      items.push({ x: p.x, z: p.z, y: p.y, yaw: yawOf(p) });
    }
    const geo = th.barrier === 'cerca' ? new THREE.BoxGeometry(0.14, 1.15, 0.14) : new THREE.CylinderGeometry(0.04, 0.04, 2.0, 5);
    const mat = new THREE.MeshLambertMaterial({ color: th.barrier === 'cerca' ? 0x5a3e24 : 0xff6a1a });
    grp.add(instanced(geo, mat, items, (o, t) => { o.position.set(t.x, t.y + (th.barrier === 'cerca' ? 0.55 : 1.4), t.z); o.rotation.y = t.yaw; }));
  }
  // poças nos trechos de lama
  const r = rng(77), pud = [];
  for (let s = 0; s < track.length; s += 9) {
    if (track.surfaceAt(s) !== 'lama' || r() < 0.35) continue;
    const lat = (r() - 0.5) * track.halfWidth * 1.4, p = track.pointAt(s, lat);
    pud.push({ x: p.x, z: p.z, y: p.y, yaw: yawOf(p), sx: 1.2 + r() * 1.6, sz: 2 + r() * 3 });
  }
  if (pud.length) {
    const mat = new THREE.MeshPhongMaterial({ color: 0x3a2e22, specular: 0x8a9aa8, shininess: 60 });
    grp.add(instanced(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2), mat, pud,
      (o, t) => { o.position.set(t.x, t.y + 0.025, t.z); o.rotation.y = t.yaw; o.scale.set(t.sx, 1, t.sz); }));
  }
  return grp;
}

// Torcida perto da largada e da crista.
function buildCrowd(track) {
  const r = rng(6), fans = [];
  const spots = [20, ...track.crests.map(c => c.s + c.len * 0.4)];
  for (const s0 of spots) for (let i = 0; i < 40; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const p = track.pointAt(s0 + (r() - 0.5) * 30, side * (track.wall + 2.5 + r() * 4));
    fans.push({ x: p.x, z: p.z, y: p.y, c: r(), yaw: yawOf(p) + side * Math.PI / 2 });
  }
  const palette = [0xe23b3b, 0x2f7fd1, 0xf2c518, 0x3fbf5f, 0xffffff, 0xff8a1e];
  return instanced(new THREE.BoxGeometry(0.5, 1.7, 0.35), new THREE.MeshLambertMaterial({ color: 0xffffff }), fans,
    (o, t) => { o.position.set(t.x, t.y + 0.85, t.z); o.rotation.y = t.yaw; },
    (t) => col.set(palette[Math.floor(t.c * palette.length)]));
}

function bounds(track) {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (let i = 0; i < track.N; i++) { a = Math.min(a, track.x[i]); b = Math.max(b, track.x[i]); c = Math.min(c, track.z[i]); d = Math.max(d, track.z[i]); }
  return { minX: a, maxX: b, minZ: c, maxZ: d, cx: (a + b) / 2, cz: (c + d) / 2, size: Math.max(b - a, d - c) };
}

// Céu em degradê (uma esfera) e morros ao longe (uma geometria).
function buildSky(th, B) {
  const R = 1100;
  const g = new THREE.SphereGeometry(R, 20, 12);
  const pos = g.attributes.position, cols = [];
  const hor = new THREE.Color(th.fog), top = new THREE.Color(th.skyTop);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / R;
    col.copy(hor).lerp(top, Math.min(1, Math.max(0, y * 2.2)));
    cols.push(col.r, col.g, col.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.position.set(B.cx, 0, B.cz);
  sky.renderOrder = -10;
  const grp = new THREE.Group();
  grp.add(sky);
  if (th.flora === 'cerrado') {
    // sol baixo de fim de tarde
    const d = new THREE.Vector3(...th.sunDir).normalize();
    const sun = new THREE.Mesh(new THREE.CircleGeometry(45, 24), new THREE.MeshBasicMaterial({ color: 0xffe0a0, fog: false }));
    sun.position.set(B.cx + d.x * 1000, 30 + d.y * 300, B.cz + d.z * 1000);
    sun.lookAt(B.cx, 0, B.cz);
    grp.add(sun);
  }
  // morros
  const r = rng(13), pos2 = [], cols2 = [];
  const hc = new THREE.Color(th.hills), snow = new THREE.Color(0xf4f8fc);
  const cone = new THREE.ConeGeometry(1, 1, 7, 1).toNonIndexed();
  const P = cone.attributes.position;
  for (let i = 0; i < 46; i++) {
    const ang = i / 46 * Math.PI * 2 + r() * 0.1, dist = B.size * 0.5 + 380 + r() * 260;
    const rad = 110 + r() * 150, h = 60 + r() * (th.flora === 'pinheiro' ? 230 : th.flora === 'mata' ? 170 : 70);
    const cx = B.cx + Math.cos(ang) * dist, cz = B.cz + Math.sin(ang) * dist;
    for (let k = 0; k < P.count; k++) {
      const y = P.getY(k) + 0.5;
      pos2.push(cx + P.getX(k) * rad, y * h - 2, cz + P.getZ(k) * rad);
      col.copy(hc).multiplyScalar(0.85 + 0.25 * (i % 3) / 2);
      if (th.flora === 'pinheiro' && y > 0.55) col.copy(snow);
      cols2.push(col.r, col.g, col.b);
    }
  }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
  hg.setAttribute('color', new THREE.Float32BufferAttribute(cols2, 3));
  hg.computeVertexNormals();
  grp.add(new THREE.Mesh(hg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
  return grp;
}

// Tudo de uma etapa num grupo (trocar de etapa = tirar um grupo e pôr outro).
export function buildWorld(track, th) {
  const group = new THREE.Group();
  group.add(new THREE.HemisphereLight(th.hemiSky, th.hemiGround, 1.5));
  const sun = new THREE.DirectionalLight(th.sun, 1.7);
  sun.position.set(...th.sunDir).multiplyScalar(150);
  group.add(sun);
  const B = bounds(track);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600), new THREE.MeshLambertMaterial({ color: th.ground }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(B.cx, -0.06, B.cz);
  group.add(ground);
  group.add(buildSky(th, B));
  group.add(buildRoadMesh(track, th));
  group.add(startArch(track));
  group.add(splitGates(track));
  group.add(paceSigns(track));
  group.add(buildFlora(track, th));
  group.add(buildBarrierProps(track, th));
  group.add(buildCrowd(track));
  const fogFar = th.flora === 'pinheiro' ? 650 : th.flora === 'mata' ? 700 : 900;
  return { group, background: new THREE.Color(th.fog), fog: new THREE.Fog(th.fog, 120, fogFar), bounds: B };
}

export function disposeGroup(g) {
  g.traverse(o => {
    o.geometry?.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) { m.map?.dispose(); m.dispose(); }
  });
}

// ---------- Carro de rally ----------
// Frente do carro = -z. Origem no chão, no centro. Motorista à esquerda (x negativo).
export const CAR3D = { headX: -0.37, headY: 1.2, headZ: 0.22, wheelX: -0.37, wheelY: 0.92, wheelZ: -0.34, wheelR: 0.19, wheelTilt: 0.45 };

function numberTex(num, color) {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#' + color.toString(16).padStart(6, '0'); g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, h / 2, 56, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#111'; g.font = 'bold 76px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(num), w / 2, h / 2 + 4);
  });
}

// Peças da carroceria (as mesmas no carro e no fantasma).
function bodyParts(m, M) {
  // parte de baixo: frente, traseira e portas (a cabine fica oca por dentro)
  m.add(new THREE.BoxGeometry(1.74, 0.55, 1.25), M.paint, 0, 0.56, -1.33);
  m.add(new THREE.BoxGeometry(1.74, 0.6, 0.75), M.paint, 0, 0.58, 1.58);
  for (const sx of [-1, 1]) m.add(new THREE.BoxGeometry(0.14, 0.67, 1.92), M.paint, sx * 0.8, 0.62, 0.25);
  m.add(new THREE.BoxGeometry(1.5, 0.08, 1.92), M.dark, 0, 0.32, 0.25);                     // assoalho
  // capô inclinado e faixa da pintura
  m.add(new THREE.BoxGeometry(1.62, 0.1, 1.15), M.paint, 0, 0.86, -1.3, -0.07);
  m.add(new THREE.BoxGeometry(0.42, 0.02, 1.16), M.stripe, 0.0, 0.92, -1.3, -0.07);
  for (const sx of [-1, 1]) m.add(new THREE.BoxGeometry(0.02, 0.14, 3.6), M.stripe, sx * 0.875, 0.5, 0.05);
  // cabine (vidros) com para-brisa inclinado
  const cab = new THREE.BoxGeometry(1.56, 0.5, 2.0);
  const cp = cab.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    if (cp.getY(i) > 0 && cp.getZ(i) < 0) cp.setZ(i, cp.getZ(i) + 0.55);     // topo da frente recua: para-brisa
    if (cp.getY(i) > 0 && cp.getZ(i) > 0) cp.setZ(i, cp.getZ(i) - 0.15);     // vidro traseiro
    if (cp.getY(i) > 0) cp.setX(i, cp.getX(i) * 0.92);
  }
  cab.computeVertexNormals();
  m.add(cab, M.glass, 0, 1.15, 0.25);
  m.add(new THREE.BoxGeometry(1.44, 0.06, 1.32), M.paint, 0, 1.42, 0.45);                    // teto
  m.add(new THREE.BoxGeometry(0.3, 0.1, 0.5), M.dark, 0, 1.49, 0.35);                         // entrada de ar do teto
  m.add(new THREE.BoxGeometry(1.4, 0.05, 0.3), M.paint, 0, 1.38, 1.38, 0.3);                  // aerofólio
  // para-choques, faróis e lanternas
  m.add(new THREE.BoxGeometry(1.8, 0.24, 0.16), M.dark, 0, 0.42, -1.98);
  m.add(new THREE.BoxGeometry(1.8, 0.24, 0.16), M.dark, 0, 0.42, 1.98);
  for (const sx of [-1, 1]) {
    m.add(new THREE.BoxGeometry(0.36, 0.14, 0.04), M.light, sx * 0.6, 0.72, -1.96);
    m.add(new THREE.BoxGeometry(0.3, 0.14, 0.04), M.red, sx * 0.66, 0.74, 1.96);
    // para-barros
    m.add(new THREE.BoxGeometry(0.3, 0.32, 0.03), M.dark, sx * 0.72, 0.22, 1.62);
  }
  // 4 faróis auxiliares no para-choque
  for (const x of [-0.6, -0.2, 0.2, 0.6]) {
    m.add(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 10), M.dark, x, 0.66, -2.06, Math.PI / 2);
    m.add(new THREE.CircleGeometry(0.085, 10), M.light, x, 0.66, -2.105, 0, Math.PI);
  }
}

export function makeCar(color, { number = 7, stripe = 0xffffff, cockpit = false } = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const M = {
    paint: new THREE.MeshLambertMaterial({ color }),
    stripe: new THREE.MeshLambertMaterial({ color: stripe }),
    dark: new THREE.MeshLambertMaterial({ color: 0x1e2024 }),
    glass: new THREE.MeshLambertMaterial({ color: 0x1c2a38 }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff3c8 }),
    red: new THREE.MeshBasicMaterial({ color: 0xd8202a }),
  };
  const m = new Merger();
  bodyParts(m, M);
  // número nas portas
  const numM = new THREE.MeshLambertMaterial({ map: numberTex(number, color) });
  for (const sx of [-1, 1]) m.add(new THREE.PlaneGeometry(0.7, 0.35), numM, sx * 0.875, 0.68, 0.15, 0, sx * Math.PI / 2);
  for (const o of m.meshes()) body.add(o);

  // rodas (giram)
  const tire = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 14); tire.rotateZ(Math.PI / 2);
  const tireM = new THREE.MeshLambertMaterial({ color: 0x18181b }), rimM = new THREE.MeshLambertMaterial({ color: 0xe8e8ea });
  const wheels = [], front = [];
  for (const [x, z, f] of [[-0.78, -1.25, 1], [0.78, -1.25, 1], [-0.78, 1.25, 0], [0.78, 1.25, 0]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.32, z);
    const w = new THREE.Mesh(tire, tireM);
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.36, 0.08), rimM); w.add(hub);
    pivot.add(w); body.add(pivot);
    wheels.push(w); if (f) front.push(pivot);
  }

  // cabine do piloto (só no carro do jogador)
  let wheelPivot = null, wheelRim = null, interior = null;
  if (cockpit) {
    interior = new THREE.Group();
    const I = {
      dash: new THREE.MeshLambertMaterial({ color: 0x2a2c30 }),
      trim: new THREE.MeshLambertMaterial({ color: 0x55585e }),
      cage: new THREE.MeshLambertMaterial({ color: 0xc8ccd2 }),
      pillar: new THREE.MeshLambertMaterial({ color }),
      seat: new THREE.MeshLambertMaterial({ color: 0x1a1a40 }),
    };
    const k = new Merger();
    k.add(new THREE.BoxGeometry(1.5, 0.2, 0.45), I.dash, 0, 0.86, -0.7);                     // painel
    k.add(new THREE.BoxGeometry(0.42, 0.08, 0.2), I.dash, CAR3D.wheelX, 0.99, -0.62, 0.25);     // capelinha dos mostradores
    // colunas do para-brisa (referência visual fixa: ajuda no conforto)
    for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(sx * 0.72, 0.98, -0.75), b = new THREE.Vector3(sx * 0.66, 1.4, -0.2);
      const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
      k.add(new THREE.BoxGeometry(0.07, len, 0.07), I.pillar, mid.x, mid.y, mid.z, Math.atan2(b.z - a.z, b.y - a.y), 0, 0);
      k.add(new THREE.BoxGeometry(0.05, 0.05, 1.7), I.trim, sx * 0.74, 0.97, 0.25);          // borda da porta
      k.add(new THREE.BoxGeometry(0.06, 0.45, 0.08), I.pillar, sx * 0.68, 1.17, 0.85);        // coluna do meio
      k.add(new THREE.CylinderGeometry(0.025, 0.025, 1.05, 6), I.cage, sx * 0.6, 1.33, 0.32, Math.PI / 2, 0, 0);
    }
    k.add(new THREE.BoxGeometry(1.36, 0.02, 1.25), I.trim, 0, 1.385, 0.45);                    // forro do teto
    k.add(new THREE.BoxGeometry(1.34, 0.06, 0.07), I.pillar, 0, 1.39, -0.2);                   // borda de cima do para-brisa
    k.add(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), I.cage, 0, 1.33, -0.12, 0, 0, Math.PI / 2);
    k.add(new THREE.BoxGeometry(0.17, 0.05, 0.02), I.dash, 0, 1.33, -0.17);                     // retrovisor
    for (const sx of [-1, 1]) {
      k.add(new THREE.BoxGeometry(0.5, 0.12, 0.5), I.seat, sx * 0.37, 0.5, 0.35);
      k.add(new THREE.BoxGeometry(0.5, 0.7, 0.12), I.seat, sx * 0.37, 0.88, 0.62, -0.15);
    }
    for (const o of k.meshes()) interior.add(o);
    body.add(interior);
    // volante
    wheelPivot = new THREE.Group();
    wheelPivot.position.set(CAR3D.wheelX, CAR3D.wheelY, CAR3D.wheelZ);
    wheelPivot.rotation.x = CAR3D.wheelTilt;
    body.add(wheelPivot);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), I.dash);
    column.rotation.x = Math.PI / 2; column.position.z = -0.2; wheelPivot.add(column);
    wheelRim = new THREE.Group(); wheelPivot.add(wheelRim);
    wheelRim.add(new THREE.Mesh(new THREE.TorusGeometry(CAR3D.wheelR, 0.024, 8, 24), new THREE.MeshLambertMaterial({ color: 0x141416 })));
    const spokeM = new THREE.MeshLambertMaterial({ color: 0x6a6e78 });
    for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.022, CAR3D.wheelR, 0.022), spokeM);
      sp.position.set(Math.sin(a) * CAR3D.wheelR / 2, -Math.cos(a) * CAR3D.wheelR / 2, 0); sp.rotation.z = a; wheelRim.add(sp);
    }
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.045, 0.03), new THREE.MeshLambertMaterial({ color: 0xf2c518 }));
    mark.position.set(0, CAR3D.wheelR, 0); wheelRim.add(mark);
  }
  // sombra redonda
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.6), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, opacity: 0.65 }));
  shadow.rotation.x = -Math.PI / 2;
  g.add(shadow);
  return { group: g, body, wheels, front, wheelPivot, wheelRim, interior, shadow };
}

// Carro fantasma: a mesma carroceria numa peça só, semitransparente (1 chamada de desenho).
export function makeGhost(color) {
  const M = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false });
  const m = new Merger();
  const K = { paint: 1, stripe: 1, dark: 1, glass: 1, light: 1, red: 1 };
  bodyParts(m, K);
  for (const [x, z] of [[-0.78, -1.25], [0.78, -1.25], [-0.78, 1.25], [0.78, 1.25]]) {
    m.add(new THREE.CylinderGeometry(0.32, 0.32, 0.24, 10), K.dark, x, 0.32, z, 0, 0, Math.PI / 2);
  }
  const mesh = new THREE.Mesh(m.single(), M);
  mesh.renderOrder = 5;
  return { group: mesh, material: M };
}

let _shadowTex = null;
function shadowTex() {
  if (_shadowTex) return _shadowTex;
  _shadowTex = canvasTex(64, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.setTransform(1, 0, 0, 2, 0, -h / 2); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  return _shadowTex;
}

// Escurecimento nas bordas da visão (conforto no VR).
export function makeVignette() {
  const tex = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.5);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  m.position.z = -0.2;
  m.renderOrder = 20;
  return m;
}

