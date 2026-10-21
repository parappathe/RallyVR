// Testes automáticos (rodam no Node, sem navegador e sem som): node tests/run.js
// Terminam sozinhos; saída 1 se algum falhar.
import { Track } from '../js/track.js';
import { STAGES } from '../js/stages.js';
import { Car, CAR } from '../js/car.js';
import { Rally, levelRuns, medalFor, stageData } from '../js/rally.js';
import { LEVELS } from '../js/ai.js';
import { simulateRun, encodeGhost, decodeGhost } from '../js/ghost.js';
import { SURFACES } from '../js/surfaces.js';

const T0 = Date.now();
setTimeout(() => { console.log('\nTEMPO ESGOTADO (120 s)'); process.exit(2); }, 120000).unref();

let fails = 0;
function check(ok, msg) {
  if (ok) console.log('  ok  ' + msg);
  else { fails++; console.log('  FALHOU  ' + msg); }
}

function runRally(opts, maxT = 400) {
  const ev = {};
  const r = new Rally({ ...opts, onEvent: (t, d) => { (ev[t] ||= []).push(d); } });
  const pos = [];
  while (r.state !== 'done' && r.t < maxT) {
    r.step({});
    if (r.state === 'race') pos.push([r.t, r.car.x, r.car.z]);
  }
  return { r, ev, pos };
}

for (const def of STAGES) {
  console.log(`\nEtapa: ${def.name}`);
  const { track: tr } = stageData(def);

  // Geometria
  let worst = 0;
  for (let s = 0; s < tr.length; s += 7.3) for (const lat of [-3.5, 0, 3]) {
    const p = tr.pointAt(s, lat), q = tr.project(p.x, p.z, -1);
    let ds = Math.abs(q.s - s); ds = Math.min(ds, tr.length - ds);
    worst = Math.max(worst, ds, Math.abs(q.lat - lat));
  }
  check(worst < 0.15, `projeção volta ao mesmo ponto (erro máx ${worst.toFixed(3)} m)`);
  let minC = Infinity;
  for (let i = 0; i < tr.N; i += 2) for (let j = i + 2; j < tr.N; j += 2) {
    const along = Math.min(Math.abs(i - j), tr.N - Math.abs(i - j)) * tr.step;
    if (along > 60) minC = Math.min(minC, Math.hypot(tr.x[i] - tr.x[j], tr.z[i] - tr.z[j]));
  }
  check(minC > 2 * tr.wall + 4, `a estrada não se cruza nem se encosta (folga ${minC.toFixed(1)} m)`);
  let minR = Infinity;
  for (let i = 0; i < tr.N; i++) minR = Math.min(minR, 1 / Math.abs(tr.curv[i]));
  check(minR > 25, `curva mais fechada tem raio ${minR.toFixed(1)} m (> 25)`);
  check(tr.length > 1600 && tr.length < 2200, `comprimento ${tr.length.toFixed(0)} m (1600 a 2200)`);
  const grades = new Set(tr.corners.map(c => c.grade));
  check(tr.corners.length >= 8 && grades.size >= 4, `${tr.corners.length} curvas com notas ${[...grades].sort().join(', ')}`);
  check(tr.splits.length >= 4 && tr.splits.length <= 6, `${tr.splits.length} pontos de parcial`);
  const surfs = new Set(Array.from(tr.surf));
  check(surfs.size >= 2, `${surfs.size} superfícies diferentes`);
  for (const c of tr.crests) {
    let k = 0;
    for (let s = c.s - 5; s < c.s + c.len + 5; s += 1) k = Math.max(k, Math.abs(tr.sampleAt(tr.curv, s)));
    check(k < 1 / 400, `crista em reta (curvatura máx ${k.toFixed(4)})`);
  }

  // Barreira: acelerando e virando todo para um lado, o carro nunca sai da estrada
  for (const steer of [-1, 1]) {
    const c = new Car(tr, 20, 0);
    let out = 0;
    for (let i = 0; i < 120 * 10; i++) {
      c.step({ throttle: 1, steer: i < 240 ? 0 : steer * 0.5 });
      out = Math.max(out, Math.abs(c.proj.lat));
    }
    check(out <= tr.wall - CAR.radius + 0.01, `barreira segura o carro virando para ${steer < 0 ? 'a esquerda' : 'a direita'} (|lat| máx ${out.toFixed(2)})`);
  }

  // Robô (IA perfeita) completa a etapa; salta na crista; parciais na ordem
  const { r, ev, pos } = runRally({ stageDef: def, level: LEVELS[2], robotPlayer: true });
  const limit = tr.length / 15;
  check(r.state === 'done' && r.time < limit, `robô completa a etapa em ${r.time?.toFixed(1)} s (limite ${limit.toFixed(0)} s, média ${(tr.length / r.time * 3.6).toFixed(0)} km/h)`);
  const jumps = (ev.jump || []).length;
  check(jumps >= tr.crests.length, `saltos na crista: ${jumps}`);
  const walls = (ev.wall || []).length;
  check(walls <= 2, `robô quase não bate (${walls} batidas)`);

  // Parciais corretas: na ordem, no lugar certo e com a diferença certa para o fantasma
  const sp = ev.split || [];
  check(sp.length === tr.splits.length && sp.every((x, i) => i === 0 || x.time > sp[i - 1].time), `${sp.length} parciais em ordem`);
  let splitErr = 0, deltaErr = 0;
  sp.forEach((x, i) => {
    // posição do carro no tempo da parcial deve estar na marca da parcial
    const k = pos.findIndex(p => p[0] >= x.time);
    const a = pos[Math.max(0, k - 1)], b = pos[k];
    const f = (x.time - a[0]) / Math.max(1e-9, b[0] - a[0]);
    const q = tr.project(a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, -1);
    let d = Math.abs(q.s - tr.splits[i]); d = Math.min(d, tr.length - d);
    splitErr = Math.max(splitErr, d);
    deltaErr = Math.max(deltaErr, Math.abs(x.delta - (x.time - r.rival.splits[i])));
  });
  check(splitErr < 0.5 && deltaErr < 1e-9, `parcial marcada no ponto certo (erro ${splitErr.toFixed(2)} m) e diferença certa`);
  check(sp.at(-1).delta < 0, `robô chega à última parcial na frente do Difícil (${sp.at(-1).delta.toFixed(2)} s)`);

  // Níveis em ordem: Difícil mais rápido que Médio, que é mais rápido que Fácil; robô bate o Difícil por pouco
  const runs = levelRuns(def);
  const [f, m, d] = runs.map(x => x.time);
  check(runs.every(x => x.finished) && f > m && m > d, `níveis em ordem: Fácil ${f.toFixed(1)} s > Médio ${m.toFixed(1)} s > Difícil ${d.toFixed(1)} s`);
  const gap = (d - r.time) / d;
  check(gap > 0 && gap < 0.06, `robô bate o Difícil por pouco: ${r.time.toFixed(1)} s (${(gap * 100).toFixed(1)}% mais rápido)`);
  check(medalFor(r.time, runs) === 3 && medalFor(m - 0.01, runs) === 2 && medalFor(f + 1, runs) === 0, 'medalhas: ouro/prata/nenhuma conforme o tempo');
  const again = simulateRun(tr, LEVELS[1]);
  check(Math.abs(again.time - m) < 1e-9, 'fantasma do nível é determinístico (mesmo tempo de novo)');

  // Fantasma do jogador: compacta, volta igual e reproduz a trajetória
  const g = r.result.ghost;
  const enc = encodeGhost(g), json = JSON.stringify(enc);
  const back = decodeGhost(JSON.parse(json));
  let encErr = 0;
  for (let i = 0; i < g.samples.length; i += 4) encErr = Math.max(encErr, Math.hypot(back.samples[i] - g.samples[i], back.samples[i + 1] - g.samples[i + 1]));
  let playErr = 0;
  const tmp = {};
  for (let k = 0; k < pos.length; k += 37) {
    const [t, x, z] = pos[k];
    back.at(t, tmp);
    playErr = Math.max(playErr, Math.hypot(tmp.x - x, tmp.z - z));
  }
  check(encErr < 0.1 && playErr < 0.6, `fantasma gravado reproduz a trajetória (compactação ${encErr.toFixed(3)} m, reprodução ${playErr.toFixed(2)} m)`);
  check(json.length < 40000 && Math.abs(back.time - r.time) < 1e-9, `fantasma compacto: ${(json.length / 1024).toFixed(1)} kB, ${g.count} amostras`);
}

// Derrapagem: curva forte na terra e no gelo escorrega; o gelo segura menos que o asfalto
console.log('\nFísica');
function flatTrack(surface) {
  return new Track({ id: 'teste', width: 400, verge: 5, path: [['S', 3000], ['L', 180, 300], ['S', 3000], ['L', 180, 300]], surfaces: [[0, surface]] });
}
function hardTurn(surface, opts = {}) {
  const tr = flatTrack(surface), c = new Car(tr, 10, 0);
  c.u = opts.speed ?? 20;
  let maxW = 0, maxAy = 0;
  for (let i = 0; i < 120 * 3; i++) {
    c.step({ throttle: 0.3, steer: i < 30 ? 0 : 1, handbrake: opts.handbrake && i >= 30 && i < 90 });
    maxW = Math.max(maxW, Math.abs(c.w));
    if (i >= 240) maxAy += Math.abs(c.u * c.r) / 120;       // média no último segundo (curva já estável)
  }
  return { maxW, maxAy, car: c };
}
const terra = hardTurn('terra'), gelo = hardTurn('gelo'), asf = hardTurn('asfalto');
check(terra.maxW > 1 && gelo.maxW > 1, `derrapa em curva forte: velocidade lateral terra ${terra.maxW.toFixed(1)} m/s, gelo ${gelo.maxW.toFixed(1)} m/s`);
check(gelo.maxAy < asf.maxAy * 0.5 && terra.maxAy < asf.maxAy, `gelo segura menos que o asfalto (aceleração lateral: gelo ${gelo.maxAy.toFixed(1)}, terra ${terra.maxAy.toFixed(1)}, asfalto ${asf.maxAy.toFixed(1)} m/s²)`);
{
  // freio de mão solta a traseira; contraesterço recupera
  const run = (counter) => {
    const tr = flatTrack('terra'), c = new Car(tr, 10, 0);
    c.u = 18;
    let maxB = 0, after = 0;
    for (let i = 0; i < 120 * 4; i++) {
      let steer = i < 30 ? 0 : -1;
      if (i >= 90 && counter) steer = Math.max(-1, Math.min(1, -c.beta * 4));       // contraesterço (esterça para o lado da traseira que saiu)
      c.step({ throttle: i >= 90 ? 0.4 : 0, steer, handbrake: i >= 30 && i < 90 });
      maxB = Math.max(maxB, Math.abs(c.beta));
      if (i >= 90 && i < 330) after += Math.abs(c.beta) / 240;
    }
    return { maxB, after };
  };
  const plain = hardTurn('terra', { handbrake: false }), hb = hardTurn('terra', { handbrake: true });
  check(hb.maxW > plain.maxW * 1.2, `freio de mão solta a traseira (lateral ${hb.maxW.toFixed(1)} contra ${plain.maxW.toFixed(1)} m/s)`);
  const fix = run(true), nofix = run(false);
  check(fix.maxB > 0.3 && fix.after < nofix.after * 0.7, `contraesterço segura a derrapagem (ângulo máx ${fix.maxB.toFixed(2)} rad; depois de soltar o freio de mão, ângulo médio ${fix.after.toFixed(2)} contra ${nofix.after.toFixed(2)} sem contraesterço)`);
}
{
  // velocidade máxima por superfície
  const top = (surface) => { const tr = flatTrack(surface), c = new Car(tr, 10, 0); for (let i = 0; i < 120 * 40; i++) c.step({ throttle: 1 }); return c.u; };
  const va = top('asfalto'), vl = top('lama');
  check(va > vl + 8 && vl <= SURFACES.lama.vmax + 0.5, `velocidade máxima: asfalto ${(va * 3.6).toFixed(0)} km/h, lama ${(vl * 3.6).toFixed(0)} km/h`);
}
{
  // Reiniciar no último ponto: volta para o meio da estrada, parado, um pouco atrás
  const r = new Rally({ stageDef: STAGES[0], level: LEVELS[0] });
  while (r.state !== 'race') r.step({});
  for (let i = 0; i < 120 * 6; i++) r.step({ throttle: 1, steer: 0.6 });
  const d0 = r.car.dist;
  r.respawn();
  check(Math.abs(r.car.proj.lat) < 0.05 && r.car.v === 0 && d0 - r.car.dist <= 12.01 && d0 - r.car.dist >= 0, `reiniciar no último ponto (lat ${r.car.proj.lat.toFixed(2)}, voltou ${(d0 - r.car.dist).toFixed(1)} m)`);
}
{
  // Contagem: o carro não sai antes do "vai" e o cronômetro começa em zero
  const r = new Rally({ stageDef: STAGES[1], level: LEVELS[1] });
  let moved = 0;
  while (r.state === 'countdown') { r.step({ throttle: 1 }); moved = Math.max(moved, r.car.v); }
  check(moved < 0.01 && Math.abs(r.t) < 1e-9, 'carro parado na contagem; cronômetro começa no "vai"');
}

console.log(`\n(${((Date.now() - T0) / 1000).toFixed(1)} s)`);
console.log(fails ? `\n${fails} teste(s) falharam` : '\nTudo certo');
process.exit(fails ? 1 : 0);
