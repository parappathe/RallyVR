// Painel do carro: tempo, última parcial contra o rival, velocidade, superfície, próxima curva
// (ícone do copiloto), progresso e minimapa. Desenhado num canvas; no VR vira uma tela no painel
// do carro, no PC o mesmo canvas aparece no canto da tela.
import * as THREE from '../vendor/three/three.module.js';
import { fmtTime, fmtDelta } from './util.js';
import { SURFACES } from './surfaces.js';

const W = 640, H = 300;

// Ícone de curva do copiloto: seta virando para o lado da curva, mais torta quanto maior a nota
// (1 suave ... 6 grampo), e o número. board = placa de beira de estrada (fundo e borda).
export function drawPaceIcon(g, dir, grade, cx, cy, size, board = false) {
  const s = size / 128;
  g.save(); g.translate(cx, cy); g.scale(s, s);
  if (board) {
    g.fillStyle = grade >= 5 ? '#d8352a' : '#ffd23a';
    rr(g, -60, -60, 120, 120, 14); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#1a1a1a'; g.stroke();
  }
  const ink = board ? (grade >= 5 ? '#ffffff' : '#141414') : '#ffffff';
  const sx = dir === 'L' ? -1 : 1;
  const bend = 0.35 + grade * 0.32;          // quanto a seta vira (rad)
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 13; g.lineCap = 'round'; g.lineJoin = 'round';
  // haste reta subindo e depois curva
  const x0 = -sx * 14, y0 = 46, y1 = 4, R = 34 - grade * 2.5;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y1);
  const cxr = x0 + sx * R;
  const a0 = sx > 0 ? Math.PI : 0;
  const a1 = a0 + (sx > 0 ? bend : -bend);
  g.arc(cxr, y1, R, a0, a1, sx < 0);
  g.stroke();
  // ponta da seta
  const ex = cxr + Math.cos(a1) * R, ey = y1 + Math.sin(a1) * R;
  const tang = a1 + (sx > 0 ? Math.PI / 2 : -Math.PI / 2);
  g.beginPath();
  g.moveTo(ex + Math.cos(tang) * 20, ey + Math.sin(tang) * 20);
  g.lineTo(ex + Math.cos(tang + 2.3) * 16, ey + Math.sin(tang + 2.3) * 16);
  g.lineTo(ex + Math.cos(tang - 2.3) * 16, ey + Math.sin(tang - 2.3) * 16);
  g.closePath(); g.fill();
  // número
  g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(grade), sx * 36, 34);
  g.restore();
}

export class Hud {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36 * H / W),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true }));
    this.last = '';
    this.track = null;
  }

  setTrack(track) {
    this.track = track;
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (let i = 0; i < track.N; i++) { a = Math.min(a, track.x[i]); b = Math.max(b, track.x[i]); c = Math.min(c, track.z[i]); d = Math.max(d, track.z[i]); }
    const box = 150, sc = (box - 14) / Math.max(b - a, d - c);
    this.map = { x0: W - box - 14 + (box - (b - a) * sc) / 2, y0: 132 + (box - (d - c) * sc) / 2, minX: a, minZ: c, sc };
  }

  mp(x, z) { const m = this.map; return [m.x0 + (x - m.minX) * m.sc, m.y0 + (z - m.minZ) * m.sc]; }

  // ghosts: [{ x, z, color }]; splitInfo: { delta, index } da última parcial (ou null)
  draw(rally, ghosts = [], splitShow = null) {
    if (!rally) return;
    const car = rally.car, tr = rally.track;
    const nc = tr.nextCorner(car.s, 220);
    const t = rally.state === 'done' ? rally.time : Math.max(0, rally.t);
    const key = `${Math.floor(t * 20)}|${Math.round(car.speedKmh)}|${nc?.corner.s0}|${nc ? Math.round(nc.dist / 10) : ''}|${car.surface}|${splitShow?.index}|${ghosts.map(g => Math.round(g.x) + ',' + Math.round(g.z)).join(';')}`;
    if (key === this.last) return;
    this.last = key;
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(12,14,20,0.84)'; rr(g, 2, 2, W - 4, H - 4, 24); g.fill();
    g.strokeStyle = '#ffcf3a'; g.lineWidth = 4; g.stroke();
    g.textBaseline = 'middle'; g.textAlign = 'left';
    // tempo
    g.fillStyle = '#fff'; g.font = 'bold 64px monospace';
    g.fillText(fmtTime(t), 24, 52);
    // última parcial
    if (splitShow) {
      const good = splitShow.delta <= 0;
      g.fillStyle = good ? '#5ee07a' : '#ff6a5a'; g.font = 'bold 40px sans-serif';
      g.fillText(`PC ${splitShow.index + 1}  ${fmtDelta(splitShow.delta)}`, 26, 112);
    } else {
      g.fillStyle = '#9aa2b4'; g.font = '28px sans-serif';
      g.fillText(`Rival: ${rally.level.name}`, 26, 112);
    }
    // velocidade e superfície
    g.fillStyle = '#fff'; g.font = 'bold 72px sans-serif';
    g.fillText(`${Math.round(car.speedKmh)}`, 24, 190);
    const sw = g.measureText(`${Math.round(car.speedKmh)}`).width;
    g.fillStyle = '#c9cfdc'; g.font = '26px sans-serif';
    g.fillText('km/h', 34 + sw, 204);
    const S = SURFACES[car.surface];
    g.fillStyle = '#' + S.color.toString(16).padStart(6, '0');
    rr(g, 26, 236, 26, 26, 6); g.fill();
    g.fillStyle = '#e6e9f0'; g.font = 'bold 28px sans-serif';
    g.fillText(S.name, 62, 250);
    // próxima curva
    g.fillStyle = 'rgba(255,255,255,0.07)'; rr(g, 262, 16, 160, 186, 18); g.fill();
    if (nc) {
      drawPaceIcon(g, nc.corner.dir, nc.corner.grade, 342, 92, 120, true);
      g.fillStyle = '#fff'; g.font = 'bold 28px sans-serif'; g.textAlign = 'center';
      g.fillText(nc.dist < 5 ? 'agora' : `${Math.round(nc.dist / 10) * 10} m`, 342, 178);
      g.textAlign = 'left';
    } else {
      g.fillStyle = '#7a8090'; g.font = '26px sans-serif'; g.textAlign = 'center';
      g.fillText('reta', 342, 100); g.textAlign = 'left';
    }
    // progresso da etapa com os pontos de controle
    const px0 = 262, pw = 160, py = 240;
    const f = Math.max(0, Math.min(1, car.dist / tr.length));
    g.fillStyle = '#3a3f4c'; rr(g, px0, py - 7, pw, 14, 7); g.fill();
    g.fillStyle = '#ffcf3a'; rr(g, px0, py - 7, Math.max(14, pw * f), 14, 7); g.fill();
    g.fillStyle = '#fff';
    for (const s of tr.splits) g.fillRect(px0 + pw * s / tr.length - 1.5, py - 12, 3, 24);
    g.font = '22px sans-serif'; g.fillStyle = '#c9cfdc';
    g.fillText(`${Math.round(f * 100)}%`, px0, py + 32);
    // minimapa
    g.strokeStyle = '#6a7080'; g.lineWidth = 7; g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i <= tr.N; i += 4) { const [x, y] = this.mp(tr.x[i % tr.N], tr.z[i % tr.N]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.stroke();
    const [sx, sy] = this.mp(tr.x[0], tr.z[0]);
    g.fillStyle = '#fff'; g.fillRect(sx - 6, sy - 3, 12, 6);
    for (const gh of ghosts) {
      const [x, y] = this.mp(gh.x, gh.z);
      g.fillStyle = '#' + gh.color.toString(16).padStart(6, '0');
      g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
    }
    const [x, y] = this.mp(car.x, car.z);
    g.fillStyle = '#ffcf3a'; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#c9cfdc'; g.font = 'bold 24px sans-serif'; g.textAlign = 'right';
    g.fillText(rally.def.name, W - 20, 40);
    g.font = '20px sans-serif';
    g.fillText(`${(tr.length / 1000).toFixed(2).replace('.', ',')} km`, W - 20, 72);
    g.textAlign = 'left';
    this.tex.needsUpdate = true;
  }
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// Mensagem grande (largada, parciais, chegada), num plano à frente do jogador.
export class Banner {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024; this.canvas.height = 256;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false }));
    this.mesh.renderOrder = 12;
    this.mesh.visible = false;
    this.until = 0;
    this.text = '';
  }
  show(text, sub = '', secs = 1.5, color = '#ffcf3a') {
    const g = this.ctx, w = 1024, h = 256;
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 120px sans-serif';
    g.lineWidth = 14; g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.strokeText(text, w / 2, sub ? 100 : 128);
    g.fillStyle = color; g.fillText(text, w / 2, sub ? 100 : 128);
    if (sub) { g.font = 'bold 46px sans-serif'; g.lineWidth = 8; g.strokeText(sub, w / 2, 205); g.fillStyle = '#fff'; g.fillText(sub, w / 2, 205); }
    this.tex.needsUpdate = true;
    this.mesh.visible = true;
    this.text = text; this.sub = sub; this.color = color;
    this.until = performance.now() + secs * 1000;
  }
  update() { if (this.mesh.visible && performance.now() > this.until) this.mesh.visible = false; }
}
