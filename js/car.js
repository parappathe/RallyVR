// Física do carro de rally em passo fixo: modelo de "bicicleta" (eixo dianteiro e traseiro) com
// velocidade lateral de verdade. O pneu segura até a aderência da superfície (mu); passou disso,
// escorrega (derrapagem), e o contraesterço funciona. Freio de mão tira a aderência da traseira.
// Sem navegador.
//
// heading h: o carro olha para (-sen h, -cos h) no chão (igual a rotation.y do Three.js); a
// esquerda do carro é (-cos h, sen h). u = velocidade para a frente, w = velocidade lateral
// (positivo = para a esquerda), r = giro (rad/s, positivo = para a esquerda).
// steer: -1 (esquerda) .. +1 (direita).
import { clamp, wrapAngle } from './util.js';
import { SURFACES } from './surfaces.js';

export const DT = 1 / 120;
export const G = 9.8;
export const CAR = {
  a: 1.1,           // centro de massa → eixo dianteiro (m)
  b: 1.4,           // centro de massa → eixo traseiro
  k2: 1.5,          // inércia de giro / massa (m²)
  maxSteer: 0.6,    // esterço máximo das rodas parado (rad)
  steerFade: 16,    // a partir de quantos m/s o esterço máximo cai pela metade
  slipPeak: 0.12,   // ângulo de deriva onde o pneu segura mais (rad)
  slideKeep: 0.82,  // fração da aderência que sobra escorregando de lado
  acc: 10.5,        // aceleração de motor saindo do zero (m/s²), limitada pela aderência
  brake: 0.95,      // freio = brake * mu * g
  reverse: 7,       // velocidade máxima de ré
  handbrakeGrip: 0.25,
  rearGrip: 1.25,    // traseira um pouco mais firme que a dianteira: carro estável, sai de traseira só forçando
  roll: 0.35,       // desaceleração soltando tudo
  radius: 1.0,      // meia largura para a barreira
  wallBounce: 0.15,
};

export class Car {
  constructor(track, s, lat = 0) {
    this.track = track;
    const p = track.pointAt(s, lat);
    this.x = p.x; this.z = p.z; this.y = p.y; this.vy = 0;
    this.h = Math.atan2(-p.tx, -p.tz);
    this.u = 0; this.w = 0; this.r = 0;
    this.steer = 0;
    this.delta = 0;
    this.airborne = false;
    this.surface = 'asfalto';
    this.slip = 0;           // quanto o carro escorrega de lado (m/s), para som e conforto
    this.proj = track.project(this.x, this.z, -1);
    this.s = this.proj.s;
    this.dist = s >= track.length / 2 ? s - track.length : s;   // distância percorrida (negativa antes da largada)
    this.lastSlopeVy = 0;
    this.events = [];
  }

  get fx() { return -Math.sin(this.h); }
  get fz() { return -Math.cos(this.h); }
  get lx() { return -Math.cos(this.h); }
  get lz() { return Math.sin(this.h); }
  get v() { return Math.hypot(this.u, this.w); }
  get speedKmh() { return this.v * 3.6; }
  // ângulo entre para onde o carro aponta e para onde ele vai (positivo = vai mais à esquerda)
  get beta() { return Math.abs(this.u) < 1 ? 0 : Math.atan2(this.w, Math.abs(this.u)); }

  // Coloca o carro parado na estrada em s (centro), olhando para a frente.
  placeAt(s, lat = 0) {
    const tr = this.track, p = tr.pointAt(s, lat);
    let ds = tr.wrap(s) - this.s;
    if (ds < -tr.length / 2) ds += tr.length; else if (ds > tr.length / 2) ds -= tr.length;
    this.dist += ds;
    this.x = p.x; this.z = p.z; this.y = p.y; this.vy = 0;
    this.h = Math.atan2(-p.tx, -p.tz);
    this.u = this.w = this.r = 0; this.steer = 0; this.delta = 0;
    this.airborne = false; this.lastSlopeVy = 0;
    tr.project(this.x, this.z, -1, this.proj);
    this.s = this.proj.s;
  }

  step(input) {
    const C = CAR, dt = DT, tr = this.track;
    const { throttle = 0, brake = 0, steer = 0, handbrake = false } = input;
    this.steer += clamp(steer - this.steer, -5 * dt, 5 * dt);
    const off = Math.abs(this.proj.lat) > tr.halfWidth + 0.4;
    this.surface = off ? 'acost' : tr.surfaceAt(this.s);
    const S = SURFACES[this.surface];
    const mu = S.mu, L = C.a + C.b, Wf = C.b / L, Wr = C.a / L;

    let u = this.u, w = this.w, r = this.r;
    const au = Math.abs(u);
    // esterço das rodas: menor em alta velocidade (controle mais calmo no VR)
    // escorregando, libera esterço suficiente para contraesterçar
    const dmax = Math.max(C.maxSteer / (1 + au / C.steerFade), Math.min(C.maxSteer, Math.abs(this.beta) * 1.2));
    this.delta = -this.steer * dmax;
    const d = this.delta;

    if (!this.airborne) {
      // --- força longitudinal (por massa) ---
      let fx = 0, fxF = 0, fxR = 0;
      if (throttle > 0 && u > -0.5) {
        const eng = Math.max(0, C.acc * (1 - u / S.vmax));
        const drive = throttle * Math.min(eng, mu * G * 0.9);
        fx += drive; fxF += drive * 0.5; fxR += drive * 0.5;
      } else if (throttle > 0) fx += throttle * mu * G * 0.8;   // de ré e acelerando: freia

      if (brake > 0) {
        if (u > 0.5) { const b = brake * C.brake * mu * G; fx -= b; fxF += b * 0.6; fxR += b * 0.4; }
        else if (throttle <= 0) fx -= u > -C.reverse ? brake * 4 : 0;   // ré
      }
      if (handbrake && au > 0.3) { const b = Math.sign(u) * mu * G * Wr * 0.7; fx -= b; fxR += Math.abs(b); }
      fx -= Math.sign(u) * Math.min(au / dt, C.roll + 0.0004 * u * u);
      if (u > S.vmax) fx -= (u - S.vmax) * (1 + S.drag);
      if (S.drag > 0 && au > 2) fx -= Math.sign(u) * S.drag * 0.6;

      // --- forças laterais dos pneus ---
      const FmF = mu * G * Wf, FmR = mu * G * Wr * C.rearGrip * (handbrake ? C.handbrakeGrip : 1);
      // círculo de atrito (suavizado): força longitudinal tira um pouco da lateral
      const latF = FmF * (1 - 0.3 * Math.min(1, (fxF / FmF) ** 2));
      const latR = FmR * (1 - 0.3 * Math.min(1, (fxR / Math.max(FmR, 1e-3)) ** 2));
      const ux = Math.max(au, 2);
      const sgn = u >= 0 ? 1 : -1;
      const aF = Math.atan2(w + C.a * r, ux) - d * sgn;
      const aR = Math.atan2(w - C.b * r, ux);
      const tire = (alpha, Fm) => {
        const x = alpha / C.slipPeak, ax = Math.abs(x);
        const k = ax <= 1 ? ax : 1 - (1 - C.slideKeep) * Math.min(1, (ax - 1) / 2);
        return -Math.sign(x) * Fm * k;
      };
      const Ff = tire(aF, latF), Fr = tire(aR, latR);

      // --- integra (Euler semi-implícito) ---
      u += (fx - Ff * Math.sin(d) + w * r) * dt;
      w += (Ff * Math.cos(d) + Fr - u * r) * dt;
      r += ((C.a * Ff * Math.cos(d) - C.b * Fr) / C.k2) * dt;
      // devagar (e de ré) vale o modelo sem deriva: o carro vai para onde as rodas apontam
      const kb = u < 0 ? 0 : clamp((au - 2) / 4, 0, 1);
      if (kb < 1) {
        const rk = u * Math.tan(d) / L, wk = rk * C.b;
        r = rk + (r - rk) * kb; w = wk + (w - wk) * kb;
      }
      // zona morta para não ficar rodando parado
      if (Math.abs(u) < 0.05 && throttle <= 0 && brake <= 0) u = 0;
    } else {
      r *= 1 - 0.8 * dt;
    }
    this.u = u; this.w = w; this.r = r;
    this.slip = this.airborne ? 0 : Math.abs(w - C.b * r * 0.5);
    this.h = wrapAngle(this.h + r * dt);

    const ox = this.x, oz = this.z;
    this.x += (this.fx * u + this.lx * w) * dt;
    this.z += (this.fz * u + this.lz * w) * dt;

    // Barreira: devolve para dentro e tira a velocidade contra ela.
    const pr = tr.project(this.x, this.z, this.proj.i, this.proj);
    const lim = tr.wall - C.radius;
    if (Math.abs(pr.lat) > lim) {
      const side = Math.sign(pr.lat), push = pr.lat - side * lim;
      this.x -= pr.tz * push; this.z += pr.tx * push;
      const nx = pr.tz * side, nz = -pr.tx * side;               // normal apontando para a barreira
      let vx = this.fx * this.u + this.lx * this.w, vz = this.fz * this.u + this.lz * this.w;
      const into = vx * nx + vz * nz;
      if (into > 0) {
        vx -= (1 + C.wallBounce) * into * nx; vz -= (1 + C.wallBounce) * into * nz;
        // atrito raspando na barreira: perde velocidade proporcional à batida
        const keep = clamp(1 - into * 0.06, 0.45, 0.97);
        vx *= keep; vz *= keep;
        this.u = vx * this.fx + vz * this.fz;
        this.w = vx * this.lx + vz * this.lz;
        this.r *= clamp(1 - into * 0.1, 0.3, 1);
        // gira o carro um pouco para ficar paralelo à barreira (não fica preso de frente)
        const along = Math.sign(this.fx * pr.tx + this.fz * pr.tz) || 1;
        const ht = Math.atan2(-pr.tx * along, -pr.tz * along);
        this.h = wrapAngle(this.h + wrapAngle(ht - this.h) * clamp(into * 0.05, 0.05, 0.35));
        if (into > 1.5) this.events.push({ type: 'wall', power: into });
      }
      tr.project(this.x, this.z, pr.i, pr);
    }

    let ds = pr.s - this.s;
    if (ds < -tr.length / 2) ds += tr.length; else if (ds > tr.length / 2) ds -= tr.length;
    this.dist += ds;
    this.s = pr.s;

    // Altura: segue o chão; decola quando o chão cai mais rápido que a gravidade (crista).
    const ground = pr.y;
    const along = this.fx * pr.tx + this.fz * pr.tz;
    const slopeVy = this.u * along * tr.gradeAt(pr.s);
    if (this.airborne) {
      this.vy -= G * dt;
      this.y += this.vy * dt;
      if (this.y <= ground) {
        if (this.vy < -2.5) this.events.push({ type: 'land', power: -this.vy });
        this.y = ground; this.airborne = false; this.vy = slopeVy;
      }
    } else {
      if ((this.lastSlopeVy - slopeVy) / dt > G * 1.05 && Math.abs(this.u) > 8) {
        this.airborne = true;
        this.vy = this.lastSlopeVy;
        this.y += this.vy * dt;
        this.events.push({ type: 'jump' });
      } else { this.y = ground; this.vy = slopeVy; }
    }
    this.lastSlopeVy = this.airborne ? 0 : slopeVy;
    this.moved = Math.hypot(this.x - ox, this.z - oz);
  }
}
