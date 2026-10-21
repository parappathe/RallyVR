// Carros fantasma: gravação da trajetória a 10 amostras por segundo, compactação para guardar no
// navegador e reprodução com interpolação. Também roda o piloto de um nível sozinho na etapa
// (antes da largada, de forma determinística) para gerar o fantasma dele. Sem navegador.
import { Car, DT } from './car.js';
import { Driver } from './ai.js';
import { wrapAngle } from './util.js';

export const GHOST_DT = 0.1;     // 10 Hz

// Grava (x, z, y, h) nos instantes 0, 0,1, 0,2 s... interpolando entre os passos de física.
export class GhostRecorder {
  constructor() { this.data = []; this.next = 0; this.prev = null; }
  add(t, car) {
    const cur = [t, car.x, car.z, car.y, car.h];
    if (t >= this.next) {
      const a = this.prev || cur;
      while (t >= this.next) {
        const f = cur[0] > a[0] ? (this.next - a[0]) / (cur[0] - a[0]) : 1;
        this.data.push(a[1] + (cur[1] - a[1]) * f, a[2] + (cur[2] - a[2]) * f, a[3] + (cur[3] - a[3]) * f,
          a[4] + wrapAngle(cur[4] - a[4]) * f);
        this.next += GHOST_DT;
      }
    }
    this.prev = cur;
  }
  ghost(time, splits = []) { return new Ghost(Float32Array.from(this.data), time, splits); }
}

export class Ghost {
  constructor(samples, time, splits = []) {
    this.samples = samples;       // [x, z, y, h] por amostra
    this.count = samples.length / 4;
    this.time = time;             // tempo de chegada
    this.splits = splits;         // tempos nas parciais
  }
  // Pose no tempo t (depois do fim, fica parado no último ponto).
  at(t, out = {}) {
    const S = this.samples, f = Math.max(0, t) / GHOST_DT;
    let i = Math.floor(f), u = f - i;
    if (i >= this.count - 1) { i = this.count - 2; u = 1; }
    if (i < 0) { i = 0; u = 0; }
    const a = i * 4, b = a + 4;
    out.x = S[a] + (S[b] - S[a]) * u;
    out.z = S[a + 1] + (S[b + 1] - S[a + 1]) * u;
    out.y = S[a + 2] + (S[b + 2] - S[a + 2]) * u;
    out.h = S[a + 3] + wrapAngle(S[b + 3] - S[a + 3]) * u;
    return out;
  }
}

// Compacta: inteiros em decímetros (posição) e centésimos de radiano (direção), guardando só a
// diferença para a amostra anterior. ~1000 amostras por etapa → uns 10 kB de texto.
export function encodeGhost(g) {
  const S = g.samples, out = [];
  let px = 0, pz = 0, py = 0, ph = 0;
  for (let i = 0; i < g.count; i++) {
    const x = Math.round(S[i * 4] * 10), z = Math.round(S[i * 4 + 1] * 10), y = Math.round(S[i * 4 + 2] * 10);
    const h = Math.round(wrapAngle(S[i * 4 + 3]) * 100);
    out.push(x - px, z - pz, y - py, h - ph);
    px = x; pz = z; py = y; ph = h;
  }
  return { v: 1, time: g.time, splits: g.splits, d: out.map(n => n.toString(36)).join(',') };
}

export function decodeGhost(o) {
  if (!o || o.v !== 1 || typeof o.d !== 'string') return null;
  const n = o.d.split(',').map(t => parseInt(t, 36));
  if (n.length % 4 || n.some(v => !Number.isFinite(v))) return null;
  const S = new Float32Array(n.length);
  let x = 0, z = 0, y = 0, h = 0;
  for (let i = 0; i < n.length; i += 4) {
    x += n[i]; z += n[i + 1]; y += n[i + 2]; h += n[i + 3];
    S[i] = x / 10; S[i + 1] = z / 10; S[i + 2] = y / 10; S[i + 3] = h / 100;
  }
  return new Ghost(S, o.time, o.splits || []);
}

// Momento exato em que "dist" passou de "mark" no último passo (interpola dentro do passo).
export function crossTime(t, distNow, distPrev, mark) {
  return t - DT * (distNow - mark) / Math.max(1e-9, distNow - distPrev);
}

// Roda o piloto de um nível sozinho do grid até a chegada. Mesma largada do jogador.
export const START_BACK = 4;     // o carro larga 4 m antes da linha
export function simulateRun(track, level, maxT = 600) {
  const car = new Car(track, track.length - START_BACK, 0);
  const drv = new Driver(level);
  const rec = new GhostRecorder();
  const splits = [];
  let t = 0, time = null;
  rec.add(0, car);
  while (t < maxT) {
    const prev = car.dist;
    car.step(drv.control(car, t));
    t += DT;
    while (splits.length < track.splits.length && car.dist >= track.splits[splits.length]) {
      splits.push(crossTime(t, car.dist, prev, track.splits[splits.length]));
    }
    rec.add(t, car);
    if (car.dist >= track.length) { time = crossTime(t, car.dist, prev, track.length); break; }
  }
  // grava mais 3 s parado depois da chegada (o fantasma não some de repente)
  for (let k = 0; k < 30; k++) rec.data.push(...rec.data.slice(-4));
  return { time, finished: time != null, splits, ghost: rec.ghost(time ?? maxT, splits) };
}
