// Liga a etapa à tela, aos controles do Quest (volante, gatilhos, freio de mão), ao
// teclado/controle no PC, aos fantasmas e aos menus.
import * as THREE from '../vendor/three/three.module.js';
import { STAGES } from './stages.js';
import { Rally, stageData } from './rally.js';
import { DT } from './car.js';
import { LEVELS } from './ai.js';
import { SURFACES } from './surfaces.js';
import { encodeGhost, decodeGhost } from './ghost.js';
import { buildWorld, disposeGroup, makeCar, makeGhost, makeVignette, CAR3D } from './scene.js';
import { Hud, Banner } from './hud.js';
import { Panel, Label } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave, loadGhost, storeGhost } from './save.js';
import { clamp, lerp, fmtTime, fmtDelta, wrapAngle } from './util.js';

const save = loadSave();
const sfx = new Sfx();
const WHEEL_MAX = 1.6;         // giro máximo do volante (rad), ~90°
const RECORD_COLOR = 0xffcf3a;
const MEDALS = ['', 'Bronze', 'Prata', 'Ouro'];
const MEDAL_COLORS = ['#a9b0c2', '#d08a4a', '#d8dde6', '#ffcf3a'];
const MEDAL_ICON = ['—', '🥉', '🥈', '🥇'];

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 2500);
scene.add(camera);
const seat = new THREE.Group();      // cabeça do piloto, presa ao carro (só gira no eixo vertical)
scene.add(seat);
const rig = new THREE.Group();       // espaço do VR (ajustado pelo "recentralizar")
seat.add(rig);

const panel = new Panel(1.1);
panel.onShow = () => { banner.mesh.visible = false; };
const banner = new Banner();
const vignette = makeVignette();
const fpsLabel = new Label(0.14);
fpsLabel.mesh.visible = false;
const hud = new Hud();
document.getElementById('hudbox').appendChild(hud.canvas);

// ---------- Estado ----------
let app = 'menu';          // 'menu' | 'playing' | 'paused' | 'result'
let screen = 'main';
let optionsBack = 'main';
let stageIndex = 0;
let levelIndex = clamp(save.level ?? 1, 0, LEVELS.length - 1);
let run = null;            // a etapa em andamento (Rally)
let world = null, worldStage = -1;
let carModel = null;
const ghostModels = { rival: null, record: null };
let recordGhost = null;
let splitShow = null;      // { index, delta, until }
let lastResult = null;
let time = 0;

// ---------- Etapa ----------
function loadStage(i) {
  stageIndex = i;
  const def = STAGES[i];
  run = new Rally({ stageDef: def, level: LEVELS[levelIndex], onEvent });
  if (worldStage !== i) {
    if (world) { scene.remove(world.group); disposeGroup(world.group); }
    world = buildWorld(run.track, def.theme);
    worldStage = i;
    scene.add(world.group);
    scene.background = world.background;
    scene.fog = world.fog;
    hud.setTrack(run.track);
  }
  if (!carModel) {
    carModel = makeCar(0xd8202a, { number: 27, stripe: 0xffffff, cockpit: true });
    scene.add(carModel.group);
    // tela do painel (VR): no meio do painel, virada para o piloto
    hud.mesh.position.set(0.1, 1.04, -0.62);
    hud.mesh.rotation.set(-0.42, -0.35, 0, 'YXZ');
    carModel.body.add(hud.mesh);
  }
  for (const k of ['rival', 'record']) if (ghostModels[k]) { scene.remove(ghostModels[k].group); ghostModels[k].group.geometry.dispose(); ghostModels[k].material.dispose(); }
  ghostModels.rival = makeGhost(LEVELS[levelIndex].color);
  ghostModels.record = makeGhost(RECORD_COLOR);
  scene.add(ghostModels.rival.group, ghostModels.record.group);
  recordGhost = decodeGhost(loadGhost(def.id));
  splitShow = null;
  hud.last = '';
  seatY = null;
  syncCar(0);
}

// ---------- VR: controles ----------
const hands = { left: null, right: null };
const ctrls = [];
const handGeo = new THREE.SphereGeometry(0.035, 12, 10);
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl); rig.add(grip);
  const laser = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xff9a2e }));
  laser.scale.z = 2; laser.visible = false;
  ctrl.add(laser);
  const glove = new THREE.Mesh(handGeo, new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
  glove.visible = false;
  scene.add(glove);
  const entry = { ctrl, grip, laser, glove, source: null, hand: null, prev: [], hoverIndex: -1, held: false, a0: 0, w0: 0 };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => {
    entry.source = e.data; entry.hand = e.data.handedness;
    if (entry.hand === 'left' || entry.hand === 'right') hands[entry.hand] = entry;
  });
  ctrl.addEventListener('disconnected', () => {
    if (entry.hand && hands[entry.hand] === entry) hands[entry.hand] = null;
    entry.source = null; entry.hand = null; entry.held = false;
  });
  ctrl.addEventListener('selectstart', () => onSelect(entry));
}

function pulse(handName, v, ms) {
  try { hands[handName]?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(v, ms); } catch { /* sem vibração */ }
}
function pulseBoth(v, ms) { pulse('left', v, ms); pulse('right', v, ms); }

function recenter() {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.y);
  rig.position.set(-head.x, -head.y, -head.z);
}
let recenterIn = 0;
renderer.xr.addEventListener('sessionstart', () => {
  rig.add(camera);
  camera.add(vignette);
  camera.add(fpsLabel.mesh);
  fpsLabel.mesh.position.set(0.12, -0.12, -0.5);
  recenterIn = 5;
  placeOverlays();
  updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
  scene.add(camera);
  camera.remove(vignette);
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  for (const e of ctrls) { e.held = false; e.glove.visible = false; }
  camera.fov = 70; camera.updateProjectionMatrix();
  placeOverlays();
  updateHint();
});

// Painel do menu e letreiro: presos ao assento no VR, presos à câmera no PC.
function placeOverlays() {
  if (renderer.xr.isPresenting) {
    seat.add(panel.mesh); panel.mesh.position.set(0.25, 0.0, -1.05); panel.mesh.rotation.set(0, -0.2, 0);
    seat.add(banner.mesh); banner.mesh.position.set(0.3, 0.5, -3.4); banner.mesh.scale.setScalar(1);
  } else {
    camera.add(panel.mesh); panel.mesh.position.set(0, 0, -1.25); panel.mesh.rotation.set(0, 0, 0);
    camera.add(banner.mesh); banner.mesh.position.set(0, 0.32, -2.2); banner.mesh.scale.setScalar(0.8);
  }
}

// ---------- Volante ----------
const wheel = { angle: 0, grabbed: false };
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

function updateWheel(dt, stickSteer) {
  const piv = carModel.wheelPivot;
  piv.updateWorldMatrix(true, false);
  let sum = 0, n = 0;
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp) { e.glove.visible = false; continue; }
    e.grip.getWorldPosition(tmpV);
    const world = tmpV.clone();
    piv.worldToLocal(tmpV);
    const r = Math.hypot(tmpV.x, tmpV.y), a = Math.atan2(tmpV.y, tmpV.x);
    const gripOn = !!gp.buttons[1]?.pressed;
    const canPlay = app === 'playing' || app === 'paused';
    const pressedNow = gripOn && !e.gripWas;
    e.gripWas = gripOn;
    if (pressedNow && !e.held && canPlay && !panel.visible && Math.abs(r - CAR3D.wheelR) < 0.12 && Math.abs(tmpV.z) < 0.14) {
      e.held = true; e.a0 = a; e.w0 = wheel.angle;
      pulse(e.hand, 0.3, 30);
    }
    if (!gripOn) e.held = false;
    if (e.held) {
      sum += e.w0 + wrapAngle(a - e.a0); n++;
      tmpV.set(Math.cos(a) * CAR3D.wheelR, Math.sin(a) * CAR3D.wheelR, 0);
      piv.localToWorld(tmpV);
      e.glove.position.copy(tmpV);
    } else e.glove.position.copy(world);
    e.glove.visible = true;
  }
  wheel.grabbed = n > 0;
  if (wheel.grabbed) {
    wheel.angle = clamp(sum / n, -WHEEL_MAX, WHEEL_MAX);
  } else {
    const target = -stickSteer * WHEEL_MAX;
    wheel.angle += clamp(target - wheel.angle, -dt * 8, dt * 8);
  }
  carModel.wheelRim.rotation.z = wheel.angle;
  return -wheel.angle / WHEEL_MAX;
}

// ---------- Teclado e controle (PC) ----------
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  if (!keys.has(e.code)) {
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    if (e.code === 'KeyR' && app === 'playing') run?.respawn();
    if (e.code === 'KeyC') { save.view = save.view === 'chase' ? 'cockpit' : 'chase'; storeSave(save); }
    if (e.code === 'KeyF') { save.fps = !save.fps; storeSave(save); }
  }
  keys.add(e.code);
  sfx.unlock();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
const padPrev = [];

function readDesktopInput() {
  const k = (c) => keys.has(c);
  let throttle = (k('ArrowUp') || k('KeyW')) ? 1 : 0;
  let brake = (k('ArrowDown') || k('KeyS')) ? 1 : 0;
  let steer = ((k('ArrowRight') || k('KeyD')) ? 1 : 0) - ((k('ArrowLeft') || k('KeyA')) ? 1 : 0);
  let handbrake = k('Space');
  for (const gp of navigator.getGamepads?.() || []) {
    if (!gp || gp.mapping !== 'standard') continue;
    throttle = Math.max(throttle, gp.buttons[7]?.value || 0, gp.buttons[0]?.pressed ? 1 : 0);
    brake = Math.max(brake, gp.buttons[6]?.value || 0);
    const ax = gp.axes[0] || 0;
    if (Math.abs(ax) > 0.12) steer = ax;
    handbrake = handbrake || !!gp.buttons[2]?.pressed || !!gp.buttons[5]?.pressed;
    if (gp.buttons[3]?.pressed && !padPrev[3] && app === 'playing') run?.respawn();
    if (gp.buttons[9]?.pressed && !padPrev[9]) togglePause();
    gp.buttons.forEach((b, i) => { padPrev[i] = b.pressed; });
  }
  return { throttle, brake, steer, handbrake };
}

function readVRInput(dt) {
  const R = hands.right?.source?.gamepad, Lg = hands.left?.source?.gamepad;
  const throttle = R?.buttons[0]?.value || 0;
  const brake = Lg?.buttons[0]?.value || 0;
  let stick = 0;
  for (const gp of [Lg, R]) {
    const ax = gp?.axes?.[2] || 0;
    if (Math.abs(ax) > Math.abs(stick)) stick = ax;
  }
  if (Math.abs(stick) < 0.12) stick = 0;
  const steer = updateWheel(dt, stick);
  // freio de mão: A (direito) ou X (esquerdo), segurando
  const handbrake = !!(R?.buttons[4]?.pressed || Lg?.buttons[4]?.pressed);
  return { throttle, brake, steer, handbrake };
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Mouse (menu no PC) ----------
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
function setMouse(e) { mouse.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); }
renderer.domElement.addEventListener('pointermove', setMouse);
renderer.domElement.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  setMouse(e);
  if (!panel.visible) return;
  raycaster.setFromCamera(mouse, camera);
  doAction(panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv)));
});

// ---------- Corrida ----------
function startStage(si = stageIndex, li = levelIndex) {
  levelIndex = li;
  save.level = li; storeSave(save);
  loadStage(si);
  app = 'playing';
  panel.hide();
  updateHint();
}

function onEvent(type, d) {
  switch (type) {
    case 'count': banner.show(String(d.n), '', 0.9); sfx.beep(false); pulseBoth(0.2, 60); break;
    case 'go': banner.show('VAI!', '', 1.0, '#6fe08a'); sfx.beep(true); pulseBoth(0.6, 120); break;
    case 'split': {
      const good = d.delta <= 0;
      splitShow = { index: d.index, delta: d.delta, until: time + 5 };
      banner.show(`PC ${d.index + 1}: ${fmtDelta(d.delta)}`, `${good ? 'na frente de' : 'atrás de'} ${run.level.pilot} · ${fmtTime(d.time)}`, 2.2, good ? '#6fe08a' : '#ff7a6a');
      sfx.split(good);
      pulseBoth(0.25, 60);
      break;
    }
    case 'wall':
      sfx.bump(d.power);
      pulseBoth(Math.min(1, 0.2 + d.power * 0.08), 60 + Math.min(200, d.power * 15));
      shake = Math.min(1, d.power * 0.08);
      break;
    case 'jump': sfx.jump(); break;
    case 'land': sfx.land(d.power); pulseBoth(Math.min(1, d.power * 0.12), 90); break;
    case 'reset': sfx.reset(); banner.show('De volta à estrada', '', 1.2, '#ffffff'); break;
    case 'finish': {
      const def = STAGES[stageIndex];
      const b = save.best[def.id] || {};
      const rec = b.time == null || d.time < b.time;
      save.best[def.id] = { time: rec ? d.time : b.time, medal: Math.max(b.medal || 0, d.medal) };
      storeSave(save);
      if (rec) { storeGhost(def.id, encodeGhost(d.ghost)); }
      lastResult = { ...d, rec, stage: stageIndex, level: levelIndex, prevBest: b.time };
      banner.show('Chegada!', `${fmtTime(d.time)}${d.medal ? ' · ' + MEDALS[d.medal] : ''}`, 2.5, MEDAL_COLORS[d.medal] === '#a9b0c2' ? '#ffffff' : MEDAL_COLORS[d.medal]);
      sfx.fanfare(d.medal > 0);
      if (d.medal >= 2) sfx.cheer();
      setTimeout(() => { if (app === 'playing' && run?.state === 'done') { app = 'result'; showScreen('result'); } }, 2500);
      break;
    }
  }
}

function togglePause() {
  if (app === 'playing' && run?.state !== 'done') { app = 'paused'; showScreen('pause'); }
  else if (app === 'paused' && screen === 'pause') { app = 'playing'; panel.hide(); updateHint(); }
}

// ---------- Telas do menu ----------
const PW = 1024;
function showScreen(name) { screen = name; panel.show((p) => SCREENS[name](p)); updateHint(); }

const SCREENS = {
  main(p) {
    p.title('Rally da Serra', 54);
    p.text('Contra o relógio. Bata o carro fantasma do rival e ganhe a medalha.', PW / 2, 100, { size: 25, color: '#a9b0c2' });
    STAGES.forEach((st, i) => {
      const b = save.best[st.id];
      const km = (stageData(st).track.length / 1000).toFixed(2).replace('.', ',');
      p.row(126 + i * 100, {
        num: i + 1, name: st.name, style: `${km} km`, desc: st.desc,
        status: 'open', action: 'race:' + i, color: '#' + st.theme.terra.toString(16).padStart(6, '0'),
        tag: b?.time ? `${MEDAL_ICON[b.medal || 0]} ${fmtTime(b.time)}` : 'Correr ▶',
      });
    });
    p.text('Rival:', 50, 462, { size: 30, bold: true, align: 'left' });
    LEVELS.forEach((lv, i) => p.button(lv.name, 'level:' + i, 160 + i * 284, 424, 270, 76, { on: i === levelIndex, size: 30, sub: lv.pilot }));
    const vr = renderer.xr.isPresenting;
    p.text(vr ? 'Gatilho direito acelera, esquerdo freia, A ou X é o freio de mão. Segure o volante com os botões laterais ou use o analógico.'
      : 'Setas ou WASD dirigem, Espaço é o freio de mão, R volta para a estrada, C troca a câmera.', PW / 2, 540, { size: 20, color: '#a9b0c2' });
    p.text('Medalhas: bronze = bater o Fácil, prata = o Médio, ouro = o Difícil.', PW / 2, 572, { size: 20, color: '#a9b0c2' });
    p.button('Opções', 'options', PW / 2 - 150, 606, 300, 74);
  },
  options(p) {
    p.title('Opções', 58);
    const line = (y, label, items, current, key) => {
      p.text(label, 50, y + 34, { size: 30, align: 'left', bold: true });
      const x0 = 470, w = (PW - 50 - x0 - (items.length - 1) * 10) / items.length;
      items.forEach(([val, txt], i) => p.button(txt, `set:${key}:${val}`, x0 + i * (w + 10), y, w, 68, { on: String(current) === String(val), size: 28 }));
    };
    line(120, 'Conforto no VR', [[1, 'Ligado'], [0, 'Desligado']], save.comfort ? 1 : 0, 'comfort');
    p.text('Escurece as bordas da visão nas curvas, derrapagens e saltos (ajuda contra enjoo).', PW / 2, 216, { size: 21, color: '#a9b0c2' });
    line(250, 'Câmera no PC', [['chase', 'Atrás'], ['cockpit', 'Cabine']], save.view, 'view');
    line(340, 'Fantasma do recorde', [[1, 'Mostrar'], [0, 'Esconder']], save.recordGhost ? 1 : 0, 'recordGhost');
    p.text('Seu melhor tempo em cada etapa corre junto, em dourado.', PW / 2, 436, { size: 21, color: '#a9b0c2' });
    line(470, 'Mostrar FPS', [[1, 'Sim'], [0, 'Não']], save.fps ? 1 : 0, 'fps');
    p.button('Voltar', 'back', PW / 2 - 150, 600, 300, 76, { on: true });
  },
  pause(p) {
    p.title('Pausa', 60);
    p.text(`${STAGES[stageIndex].name} · ${fmtTime(Math.max(0, run.t))} · rival ${run.level.name}`, PW / 2, 112, { size: 28 });
    const vr = renderer.xr.isPresenting;
    const items = [['Continuar', 'resume'], ...(vr ? [['Recentralizar', 'recenter']] : []), ['Reiniciar no último ponto', 'respawn'],
      ['Reiniciar etapa', 'restart'], ['Opções', 'options'], ['Sair para o menu', 'quit']];
    const step = items.length > 5 ? 88 : 98;
    items.forEach(([t, a], i) => p.button(t, a, PW / 2 - 250, 150 + i * step, 500, step - 14, { on: i === 0, size: 32 }));
  },
  result(p) {
    const r = lastResult, st = STAGES[r.stage];
    p.title(r.medal ? `Medalha de ${MEDALS[r.medal]}!` : 'Sem medalha', 56);
    p.text(`${st.name} · seu tempo ${fmtTime(r.time)}${r.resets ? ` · ${r.resets} reinício(s)` : ''}`, PW / 2, 104, { size: 26, color: '#a9b0c2' });
    if (r.rec) p.text(r.prevBest != null ? `★ Novo recorde! (antes ${fmtTime(r.prevBest)})` : '★ Primeiro recorde da etapa!', PW / 2, 140, { size: 26, color: '#ffcf3a', bold: true });
    const rows = [{ name: 'Você', time: r.time, me: true },
      ...LEVELS.map((lv, i) => ({ name: `${lv.pilot} (${lv.name})`, time: r.runs[i], medal: i + 1, color: lv.color }))];
    rows.sort((a, b) => a.time - b.time);
    rows.forEach((x, i) => {
      const Y = 192 + i * 56;
      p.text(`${i + 1}º`, 150, Y, { size: 30, bold: true, align: 'left', color: x.me ? '#ffcf3a' : '#f4f6fb' });
      if (!x.me) { p.ctx.fillStyle = '#' + x.color.toString(16).padStart(6, '0'); p.ctx.fillRect(206, Y - 14, 14, 28); }
      p.text(x.name, 234, Y, { size: 28, bold: x.me, align: 'left', color: x.me ? '#ffcf3a' : '#f4f6fb' });
      const d = x.me ? '' : `  ${fmtDelta(r.time - x.time).replace(' s', '')}`;
      p.text(fmtTime(x.time), 760, Y, { size: 26, align: 'right', color: '#c9cfdc' });
      if (!x.me) p.text(d, 880, Y, { size: 24, align: 'right', color: r.time <= x.time ? '#6fe08a' : '#ff7a6a' });
      if (x.medal) p.text(MEDAL_ICON[x.medal], 110, Y, { size: 26 });
    });
    const btns = [];
    if (r.stage < STAGES.length - 1) btns.push([`Próxima: ${STAGES[r.stage + 1].name}`, 'race:' + (r.stage + 1)]);
    btns.push(['Correr de novo', 'race:' + r.stage]);
    btns.push(['Menu', 'menu']);
    const w = 300, gap = 16, x0 = (PW - (btns.length * w + (btns.length - 1) * gap)) / 2;
    btns.forEach(([tx, a], i) => p.button(tx, a, x0 + i * (w + gap), 440, w, 84, { on: i === 0, size: tx.length > 18 ? 23 : 27 }));
    const tip = r.medal === 3 ? 'Ouro! Tente baixar o seu recorde: o fantasma dourado mostra o caminho.'
      : 'Dica: freie antes da curva e use o freio de mão só para virar o carro nos grampos.';
    p.text(tip, PW / 2, 580, { size: 22, color: '#a9b0c2' });
  },
};

function doAction(a) {
  if (!a) return;
  sfx.unlock();
  sfx.click();
  if (a.startsWith('race:')) { startStage(Number(a.slice(5))); return; }
  if (a.startsWith('level:')) { levelIndex = Number(a.slice(6)); save.level = levelIndex; storeSave(save); loadStage(stageIndex); showScreen('main'); return; }
  if (a.startsWith('set:')) {
    const [, key, val] = a.split(':');
    if (key === 'comfort') save.comfort = val === '1';
    else if (key === 'fps') save.fps = val === '1';
    else if (key === 'recordGhost') save.recordGhost = val === '1';
    else if (key === 'view') save.view = val;
    storeSave(save);
    showScreen('options');
    return;
  }
  switch (a) {
    case 'options': optionsBack = screen; showScreen('options'); break;
    case 'back': showScreen(optionsBack === 'options' ? 'main' : optionsBack); break;
    case 'menu': case 'quit': goMenu(); break;
    case 'resume': app = 'playing'; panel.hide(); updateHint(); break;
    case 'respawn': app = 'playing'; panel.hide(); run.respawn(); updateHint(); break;
    case 'restart': startStage(stageIndex); break;
    case 'recenter': recenter(); break;
  }
}

function goMenu() {
  app = 'menu';
  loadStage(stageIndex);
  showScreen('main');
}

function onSelect(entry) {
  sfx.unlock();
  if (panel.visible && entry.hoverIndex >= 0) doAction(panel.actionAt(entry.hoverIndex));
}

function pollVRButtons() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[5] && !e.prev[5]) togglePause();
    e.prev = b;
  }
}

// ---------- Raio do menu ----------
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
function updateMenuRays() {
  const vr = renderer.xr.isPresenting;
  let hover = -1;
  for (const e of ctrls) {
    e.hoverIndex = -1;
    e.laser.visible = vr && panel.visible && !!e.source;
    if (!e.laser.visible) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(tmpQ);
    rayDir.set(0, 0, -1).applyQuaternion(tmpQ);
    raycaster.set(rayOrigin, rayDir);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    e.laser.scale.z = hit ? hit.distance : 2;
    e.hoverIndex = panel.pick(hit?.uv);
    if (e.hoverIndex >= 0) hover = e.hoverIndex;
  }
  if (!vr && panel.visible) {
    raycaster.setFromCamera(mouse, camera);
    hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
    renderer.domElement.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
  } else renderer.domElement.style.cursor = 'default';
  if (panel.visible) panel.setHover(hover);
}

// ---------- Carro e fantasmas na tela ----------
let seatY = null;
let shake = 0;
const gpose = {}, camPos = new THREE.Vector3();
function syncCar(dt) {
  const vr = renderer.xr.isPresenting;
  const car = run.car, tr = run.track, m = carModel;
  m.group.position.set(car.x, car.y, car.z);
  m.group.rotation.y = car.h;
  // a carroceria inclina só vista de fora (na cabine o horizonte nunca inclina)
  const inside = vr || (save.view === 'cockpit' && app !== 'menu');
  const along = car.fx * car.proj.tx + car.fz * car.proj.tz;
  const pitch = car.airborne ? clamp(car.vy * 0.03, -0.2, 0.2) : Math.atan(tr.gradeAt(car.s) * along);
  m.body.rotation.x = inside ? 0 : lerp(m.body.rotation.x, pitch, Math.min(1, dt * 10));
  m.body.rotation.z = inside ? 0 : lerp(m.body.rotation.z, clamp(-car.u * car.r * 0.008, -0.07, 0.07), Math.min(1, dt * 6));
  for (const w of m.wheels) w.rotation.x -= car.u * dt / 0.32;
  for (const f of m.front) f.rotation.y = car.delta;
  m.shadow.position.y = (tr.heightAt(car.s) - car.y) + 0.03;
  m.interior.visible = inside || app === 'menu';
  // assento (cabeça) segue o carro, sem inclinar
  if (seatY == null) seatY = car.y;
  seatY = lerp(seatY, car.y, Math.min(1, dt * (car.airborne ? 5 : 12)));
  if (!dt) seatY = car.y;
  const c = Math.cos(car.h), s = Math.sin(car.h);
  // ponto (headX, headY, headZ) do carro girado por h
  seat.position.set(car.x + CAR3D.headX * c + CAR3D.headZ * s, seatY + CAR3D.headY, car.z - CAR3D.headX * s + CAR3D.headZ * c);
  seat.rotation.set(0, car.h, 0);

  // fantasmas: somem quando estão em cima do jogador (não atrapalham a visão da cabine)
  const t = Math.max(0, run.t);
  const list = [];
  camera.getWorldPosition(camPos);
  const place = (model, ghost, show) => {
    model.group.visible = false;
    if (!show || !ghost) return;
    ghost.at(t, gpose);
    const d = Math.min(Math.hypot(gpose.x - car.x, gpose.z - car.z), Math.hypot(gpose.x - camPos.x, gpose.z - camPos.z) + 1);
    model.material.opacity = 0.34 * clamp((d - 3) / 6, 0, 1);
    model.group.visible = model.material.opacity > 0.01;
    model.group.position.set(gpose.x, gpose.y, gpose.z);
    model.group.rotation.y = gpose.h;
    list.push({ x: gpose.x, z: gpose.z, color: model === ghostModels.rival ? LEVELS[levelIndex].color : RECORD_COLOR });
  };
  place(ghostModels.rival, run.rival.ghost, app !== 'menu');
  place(ghostModels.record, recordGhost, app !== 'menu' && save.recordGhost);
  return list;
}

// Câmera do PC
const chase = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
function updateDesktopCamera(dt) {
  const car = run.car;
  if (app === 'menu') {
    // volta lenta em torno do carro parado na largada
    const a = time * 0.15;
    // (mira acima do carro para ele aparecer embaixo do painel do menu)
    camera.position.set(car.x + Math.sin(a) * 7.5, car.y + 1.6, car.z + Math.cos(a) * 7.5);
    camera.lookAt(car.x, car.y + 3.6, car.z);
    chase.init = false;
    return;
  }
  if (save.view === 'cockpit') {
    seat.getWorldPosition(tmpV);
    camera.position.copy(tmpV);
    camera.rotation.set(-0.06, car.h, 0, 'YXZ');
    chase.init = false;
    return;
  }
  // atrás do carro, seguindo para onde ele vai (meio termo entre direção e movimento)
  const vdir = car.v > 3 ? Math.atan2(-(car.fx * car.u + car.lx * car.w), -(car.fz * car.u + car.lz * car.w)) : car.h;
  const hh = car.h + wrapAngle(vdir - car.h) * 0.5;
  const back = 6.2, up = 2.3;
  const want = tmpV.set(car.x + Math.sin(hh) * back, car.y + up, car.z + Math.cos(hh) * back);
  if (!chase.init) { chase.pos.copy(want); chase.init = true; }
  chase.pos.lerp(want, Math.min(1, dt * 5));
  const ground = run.track.heightAt(run.track.project(chase.pos.x, chase.pos.z, car.proj.i).s);
  chase.pos.y = Math.max(chase.pos.y, ground + 0.8);
  camera.position.copy(chase.pos);
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.3; camera.position.y += (Math.random() - 0.5) * shake * 0.3; }
  chase.look.set(car.x - Math.sin(hh) * 4, car.y + 1.0, car.z - Math.cos(hh) * 4);
  camera.lookAt(chase.look);
}

// ---------- HTML (PC) ----------
const hintEl = document.getElementById('hint');
const fpsEl = document.getElementById('fps');
const hudBox = document.getElementById('hudbox');
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  hintEl.textContent = app === 'playing'
    ? 'Setas/WASD dirigem · Espaço freio de mão · R volta para a estrada · C câmera · Esc pausa'
    : 'Clique nas opções do painel · No Quest, use o botão "Entrar em VR"';
}

const vrBtn = document.getElementById('vr');
async function setupVR() {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();

// ---------- Laço principal ----------
let acc = 0, lastT = performance.now();
let fpsFrames = 0, fpsTime = 0;
let vigOp = 0, rumbleT = 0;
const GEARS = [0, 11, 18, 25, 32, 39, 50];

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  time += dt;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) recenter();
  if (vr) pollVRButtons();

  const inp = vr ? readVRInput(dt) : readDesktopInput();
  if (!vr) carModel.wheelRim.rotation.z = -run.car.steer * WHEEL_MAX;
  if (app === 'playing' && run) {
    run.robotPlayer = dev.autoplay;
    acc += dt;
    const n = Math.min(12, Math.floor(acc / DT));
    for (let i = 0; i < n; i++) run.step(inp);
    acc -= n * DT;
  } else acc = 0;

  const ghosts = syncCar(dt);
  hud.mesh.visible = vr;
  if (splitShow && time > splitShow.until) splitShow = null;
  hud.draw(run, ghosts, splitShow);
  banner.update();
  shake = Math.max(0, shake - dt * 3);

  // som: motor com marchas, cascalho conforme a superfície, pneu escorregando
  const car = run.car, racing = app === 'playing';
  const v = car.v;
  let gi = 1; while (gi < GEARS.length - 1 && v > GEARS[gi]) gi++;
  const rpm = clamp(0.2 + 0.8 * (v - GEARS[gi - 1]) / (GEARS[gi] - GEARS[gi - 1]), 0, 1);
  const S = SURFACES[car.surface];
  const loose = car.airborne ? 0 : S.gravel * Math.min(1, v / 18);
  const slide = clamp((car.slip - 1.2) / 4, 0, 1);
  sfx.motor(racing, rpm, run.state === 'race' ? inp.throttle : 0,
    car.surface === 'asfalto' ? slide : slide * 0.3, clamp(loose * 0.8 + slide * S.gravel * 0.6, 0, 1));
  // tremida leve nos controles em estrada de terra
  rumbleT -= dt;
  if (vr && racing && loose > 0.2 && rumbleT <= 0) { pulseBoth(0.04 + loose * 0.08, 40); rumbleT = 0.15; }

  // conforto: escurece as bordas quando o carro gira rápido, derrapa ou voa
  const want = vr && save.comfort && app === 'playing'
    ? clamp((Math.abs(car.r) - 0.35) * 0.5 + Math.abs(car.beta) * 0.7 + (car.airborne ? 0.35 : 0), 0, 0.8) : 0;
  vigOp = lerp(vigOp, want, Math.min(1, dt * 8));
  vignette.material.opacity = vigOp;
  vignette.visible = vigOp > 0.01;

  if (!vr) updateDesktopCamera(dt);
  hudBox.style.display = !vr && app !== 'menu' ? 'block' : 'none';
  updateMenuRays();

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
  renderer.render(scene, camera);
}

// Para testes no console: rally.startStage(0); rally.dev.autoplay = true; rally.dev.advance(30)
const dev = { autoplay: false };
dev.advance = (sec) => { for (let i = 0; i < sec * 72; i++) { lastT = performance.now() - 1000 / 72; frame(); } };
window.rally = { get run() { return run; }, get app() { return app; }, save, startStage, doAction, dev, camera, renderer, scene };

placeOverlays();
goMenu();
renderer.setAnimationLoop(frame);
