// Pilotos do computador: seguem a linha ideal da estrada, controlando a derrapagem com
// contraesterço. Cada nível é um piloto com um tempo diferente; ele corre sozinho antes da
// largada (de forma determinística) e vira o carro fantasma. O mesmo piloto no nível "robo"
// dirige perfeito: é o que os testes usam. Sem navegador.
import { clamp, wrapAngle } from './util.js';
import { CAR, G } from './car.js';
import { SURFACES, SURFACE_IDS } from './surfaces.js';

export const LEVELS = [
  { id: 'facil', name: 'Fácil', pilot: 'Tonho Poeira', desc: 'Piloto tranquilo', speed: 0.84, wander: 0.9, color: 0x5ad06a },
  { id: 'medio', name: 'Médio', pilot: 'Lia Cascalho', desc: 'Briga de verdade', speed: 0.9, wander: 0.5, color: 0x4aa8ff },
  { id: 'dificil', name: 'Difícil', pilot: 'Max Derrapada', desc: 'Para quem conhece a estrada', speed: 0.965, wander: 0.15, color: 0xff5a4a },
];
export const ROBOT = { id: 'robo', speed: 1.0, wander: 0 };

// Quanto da aderência a IA usa nas curvas (perfil de velocidade).
export const ALAT_USE = 0.8;
export function gripOf(track) {
  return (i) => {
    const S = SURFACES[SURFACE_IDS[track.surf[i]]];
    return { alat: S.mu * G * ALAT_USE, vmax: S.vmax * 0.97, decel: S.mu * G * 0.62 };
  };
}

export class Driver {
  constructor(level) {
    this.level = level;
    this.phase = level.id.length * 1.7;       // fixo por nível: o fantasma sai sempre igual
    this.stuck = 0; this.reverse = 0;
    this._p = {};
  }

  // Devolve { throttle, brake, steer, handbrake }
  control(car, t) {
    const tr = car.track, lv = this.level;
    const u = car.u, au = Math.abs(u);
    if (this.reverse > 0) {
      this.reverse -= 1 / 120;
      return { throttle: 0, brake: 1, steer: clamp(this.headingTo(car, car.s + 8, 0) * 2, -1, 1) };   // de ré o volante inverte
    }
    if (au < 1.2 && t > 1) { this.stuck += 1 / 120; if (this.stuck > 1.5) { this.reverse = 1.2; this.stuck = 0; } }
    else this.stuck = 0;

    const look = 3 + au * 0.3;
    const sT = car.s + look;
    let lat = tr.sampleAt(tr.line, sT) + Math.sin(t * 0.35 + this.phase) * lv.wander;
    const lim = tr.halfWidth - 1.3;
    lat = clamp(lat, -lim, lim);
    // perseguição pura pela direção em que o carro anda (não para onde aponta, que na
    // derrapagem é diferente): curvatura que leva o carro até o ponto alvo
    const beta = car.beta;
    const alpha = this.headingTo(car, sT, lat) - beta;
    const kappa = 2 * Math.sin(alpha) / look;
    const L = CAR.a + CAR.b;
    let delta = Math.atan(kappa * L);
    delta += beta;                                               // contraesterço quando a traseira sai
    delta += 0.3 * (u * kappa - car.r) / Math.max(au, 4);        // amortece o giro
    const dmax = Math.max(CAR.maxSteer / (1 + au / CAR.steerFade), Math.min(CAR.maxSteer, Math.abs(beta) * 1.2));
    const steer = clamp(-delta / dmax, -1, 1);

    const prof = tr.sampleAt(tr.profile, car.s + 2 + au * 0.15);
    const target = prof * lv.speed;
    let throttle = clamp((target - u) * 0.6, 0, 1);
    const brake = u > target + 0.8 ? clamp((u - target - 0.8) * 0.5, 0, 1) : 0;
    if (Math.abs(car.beta) > 0.18) throttle *= 0.4;
    return { throttle, brake, steer, handbrake: false };
  }

  headingTo(car, s, lat) {
    const p = car.track.pointAt(s, lat, this._p);
    const ht = Math.atan2(-(p.x - car.x), -(p.z - car.z));
    return wrapAngle(ht - car.h);
  }
}
