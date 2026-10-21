// Sons sintetizados com Web Audio (sem arquivos). Só tocam depois de um clique/gatilho
// (unlock); os testes automáticos nunca chamam unlock, então ficam mudos.
export class Sfx {
  constructor() { this.ctx = null; this.engine = null; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _out(pan = 0) {
    const c = this.ctx;
    if (!c.createStereoPanner) return this.master;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    return p;
  }

  _tone(freq, dur, vol, pan = 0, type = 'sine', bend = 1, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * bend, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this._out(pan));
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol, freq, q, pan = 0, attack = 0.002, type = 'bandpass') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this._out(pan));
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // Motor contínuo do jogador. rpm 0..1, load 0..1 (acelerando); skid 0..1 = pneu cantando
  // (asfalto) ou escorregando; gravel 0..1 = cascalho/terra/neve batendo embaixo do carro.
  // on = false silencia.
  motor(on, rpm = 0, load = 0, skid = 0, gravel = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    if (!this.engine) {
      const o1 = c.createOscillator(), o2 = c.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'square';
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 2;
      const g = c.createGain(); g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      const ns = c.createBufferSource(); ns.buffer = this.noise; ns.loop = true;
      const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2600; nf.Q.value = 3;
      const ng = c.createGain(); ng.gain.value = 0;
      ns.connect(nf); nf.connect(ng); ng.connect(this.master); ns.start();
      // cascalho: ruído grave com "trepidação" (modulado por um oscilador lento)
      const gs = c.createBufferSource(); gs.buffer = this.noise; gs.loop = true;
      const gf = c.createBiquadFilter(); gf.type = 'lowpass'; gf.frequency.value = 1100; gf.Q.value = 0.7;
      const gg = c.createGain(); gg.gain.value = 0;
      const trem = c.createGain(); trem.gain.value = 1;
      const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 23;
      const lfoAmt = c.createGain(); lfoAmt.gain.value = 0.35;
      lfo.connect(lfoAmt); lfoAmt.connect(trem.gain); lfo.start();
      gs.connect(gf); gf.connect(trem); trem.connect(gg); gg.connect(this.master); gs.start();
      this.engine = { o1, o2, f, g, ng, gg, gf, lfo };
    }
    const e = this.engine;
    const f0 = 55 + rpm * 150;
    e.o1.frequency.setTargetAtTime(f0, t, 0.05);
    e.o2.frequency.setTargetAtTime(f0 * 0.5, t, 0.05);
    e.f.frequency.setTargetAtTime(500 + rpm * 1400 + load * 600, t, 0.08);
    e.g.gain.setTargetAtTime(on ? 0.05 + load * 0.05 + rpm * 0.03 : 0, t, 0.08);
    e.ng.gain.setTargetAtTime(on ? skid * 0.12 : 0, t, 0.05);
    e.gg.gain.setTargetAtTime(on ? gravel * 0.22 : 0, t, 0.06);
    e.gf.frequency.setTargetAtTime(600 + gravel * 900 + rpm * 500, t, 0.1);
    e.lfo.frequency.setTargetAtTime(12 + rpm * 30, t, 0.1);
  }

  click() { this._tone(660, 0.05, 0.2, 0, 'square', 1.2); }
  beep(high = false) { this._tone(high ? 1320 : 660, high ? 0.5 : 0.25, 0.25, 0, 'square'); }
  // parcial: duas notas subindo (na frente do rival) ou descendo (atrás)
  split(good) { (good ? [880, 1320] : [660, 440]).forEach((f, i) => this._tone(f, 0.16, 0.18, 0, 'triangle', 1, i * 0.1)); }
  // batida na barreira: quanto mais forte, mais grave e mais alto
  bump(power = 3, pan = 0) {
    const v = Math.min(0.6, 0.1 + power * 0.04);
    this._tone(80, 0.2 + Math.min(0.3, power * 0.02), v, pan, 'sine', 0.5);
    this._noise(0.12 + Math.min(0.3, power * 0.03), v * 0.8, 450, 0.8, pan);
    if (power > 8) this._noise(0.5, v * 0.5, 2200, 1.2, pan, 0.01);       // lataria
  }
  jump() { this._noise(0.3, 0.08, 600, 0.7, 0, 0.05); }
  land(power = 4) { this._tone(65, 0.22, Math.min(0.5, power * 0.06), 0, 'sine', 0.6); this._noise(0.14, 0.22, 300, 1); }
  reset() { this._tone(520, 0.12, 0.15, 0, 'triangle', 1.5); this._tone(780, 0.18, 0.15, 0, 'triangle', 1.2, 0.1); }
  cheer() { this._noise(1.6, 0.16, 1300, 0.5, -0.3, 0.2); this._noise(1.6, 0.16, 1800, 0.5, 0.3, 0.25); }
  fanfare(win = true) {
    const notes = win ? [523, 659, 784, 1047, 1319] : [392, 349, 311, 262];
    notes.forEach((f, i) => this._tone(f, 0.35, 0.2, 0, 'triangle', 1, i * 0.15));
  }
}
