// Uma etapa de rally contra o relógio: contagem, cronômetro, parciais contra o fantasma do nível,
// gravação do seu fantasma, reinício no último ponto e chegada. Avança em passos fixos (step).
// Sem navegador.
import { Track } from './track.js';
import { Car, DT } from './car.js';
import { Driver, LEVELS, ROBOT, gripOf } from './ai.js';
import { GhostRecorder, simulateRun, crossTime, START_BACK } from './ghost.js';

export const COUNTDOWN = 3.5;

// A estrada e os fantasmas dos 3 níveis só dependem da etapa: calcula uma vez e guarda.
const cache = new Map();
export function stageData(def) {
  let d = cache.get(def.id);
  if (!d) {
    const track = new Track(def);
    track.buildProfile(gripOf(track));
    d = { track, levels: null };
    cache.set(def.id, d);
  }
  return d;
}
export function levelRuns(def) {
  const d = stageData(def);
  if (!d.levels) d.levels = LEVELS.map(lv => simulateRun(d.track, lv));
  return d.levels;
}

// Medalha: 0 nenhuma, 1 bronze (bateu o Fácil), 2 prata (Médio), 3 ouro (Difícil).
export function medalFor(time, runs) {
  let m = 0;
  runs.forEach((r, i) => { if (time <= r.time) m = Math.max(m, i + 1); });
  return m;
}

export class Rally {
  constructor({ stageDef, level = LEVELS[1], onEvent = () => {}, robotPlayer = false }) {
    this.def = stageDef;
    this.track = stageData(stageDef).track;
    this.runs = levelRuns(stageDef);
    this.level = level;
    this.levelIndex = Math.max(0, LEVELS.indexOf(level));
    this.rival = this.runs[this.levelIndex];          // fantasma do nível escolhido
    this.onEvent = onEvent;
    this.robotPlayer = robotPlayer;
    this.robot = new Driver(ROBOT);
    this.t = -COUNTDOWN;
    this.state = 'countdown';
    this.count = 4;
    this.car = new Car(this.track, this.track.length - START_BACK, 0);
    this.rec = new GhostRecorder();
    this.splitTimes = [];
    this.lastDelta = null;        // diferença na última parcial (s; negativo = na frente)
    this.time = null;
    this.resets = 0;
    this.result = null;
  }

  emit(type, d = {}) { this.onEvent(type, d); }

  // input do jogador: { throttle, brake, steer, handbrake }
  step(input = {}) {
    this.t += DT;
    const car = this.car, tr = this.track;
    if (this.state === 'countdown') {
      const c = Math.ceil(-this.t);
      if (c < this.count && c >= 1) { this.count = c; this.emit('count', { n: c }); }
      if (this.t >= 0) { this.t = 0; this.state = 'race'; this.rec.add(0, car); this.emit('go'); }
      return;                 // carro parado no grid até o "vai"
    }
    if (this.state === 'done') {
      // depois da chegada o carro freia sozinho
      car.step({ brake: 0.6, steer: this.robot.control(car, this.t).steer });
      this.drain();
      return;
    }
    const inp = this.robotPlayer ? this.robot.control(car, this.t) : input;
    const prev = car.dist;
    car.step(inp);
    this.drain();
    this.rec.add(this.t, car);

    // Parciais
    while (this.splitTimes.length < tr.splits.length && car.dist >= tr.splits[this.splitTimes.length]) {
      const k = this.splitTimes.length;
      const time = crossTime(this.t, car.dist, prev, tr.splits[k]);
      this.splitTimes.push(time);
      this.lastDelta = time - this.rival.splits[k];
      this.emit('split', { index: k, time, delta: this.lastDelta, total: tr.splits.length });
    }
    // Chegada
    if (car.dist >= tr.length) {
      this.time = crossTime(this.t, car.dist, prev, tr.length);
      this.state = 'done';
      const ghost = this.rec.ghost(this.time, this.splitTimes.slice());
      this.result = { time: this.time, medal: medalFor(this.time, this.runs), runs: this.runs.map(r => r.time), ghost, resets: this.resets };
      this.emit('finish', this.result);
    }
  }

  drain() {
    for (const e of this.car.events) this.emit(e.type, e);
    this.car.events.length = 0;
  }

  // "Reiniciar no último ponto": volta para o meio da estrada um pouco atrás de onde está, parado.
  // O cronômetro continua (o tempo perdido é a penalidade).
  respawn() {
    if (this.state !== 'race') return;
    const back = Math.min(12, Math.max(0, this.car.dist));
    this.car.placeAt(this.car.s - back, 0);
    this.resets++;
    this.emit('reset');
  }
}
