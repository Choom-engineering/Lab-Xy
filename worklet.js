// XY Studio audio processors.
// - 'xy-machine' wraps the Open-XY SDK's PreviewEngine (MIT) and adds timestamped note events,
//   applied at the exact sample, so a sequencer scheduling ahead stays tight.
// - 'xy-builtin' holds the app's own engines: Analog, FM, Corde and Batterie.
import { PreviewEngine } from './sdk/browser/engine.mjs';

class EventQueue {
  constructor() { this.ev = []; }
  push(e) { // keep sorted by time; most events arrive in order
    let i = this.ev.length;
    while (i > 0 && this.ev[i - 1].when > e.when) i--;
    this.ev.splice(i, 0, e);
  }
  clear() { this.ev.length = 0; }
  // Render [0, n) calling render(from, to) between events and fire(e) at each event.
  run(n, render, fire) {
    let pos = 0;
    const t0 = currentTime;
    while (this.ev.length) {
      const at = Math.round((this.ev[0].when - t0) * sampleRate);
      if (at >= n) break;
      const idx = Math.max(pos, at);
      if (idx > pos) { render(pos, idx); pos = idx; }
      fire(this.ev.shift());
    }
    if (pos < n) render(pos, n);
  }
}

class MachineProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.q = new EventQueue();
    try {
      const { module, parameters, drumKeys } = options.processorOptions;
      this.engine = new PreviewEngine(module, sampleRate, parameters);
      if (drumKeys) this.kit(drumKeys, parameters);
      this.port.postMessage({ ready: true });
    } catch (error) {
      this.engine = null;
      this.port.postMessage({ error: error.message });
    }
    this.port.onmessage = ({ data }) => {
      if (!this.engine) return;
      try {
        if (data.type === 'panic') { this.q.clear(); this.engine.panic(); }
        else if (data.when) this.q.push(data);  // notes et p-locks datés : appliqués à l'échantillon près
        else this.fire(data);
      } catch (error) { this.port.postMessage({ error: error.message }); }
    };
  }
  // A drum kit plays as on the OP-XY: each of its 24 keys (notes 53..76, the
  // same at every octave) has its own model and eight controls, and the
  // track's parameters are offsets to them, neutral in the middle. The
  // preview has one model for all voices, so each voice's model and controls
  // are put in place just before that voice renders.
  kit(keys, parameters) {
    const api = this.engine.api, engine = this.engine;
    this.keys = keys;
    this.offsets = parameters.slice();
    this.voiceKey = new Map();
    const words = new Int32Array(8);
    engine.api = Object.assign({}, api, {
      opxy_render: (state, output, parameterAddress, pitch) => {
        const key = keys[this.voiceKey.get(state) ?? 0];
        api.opxy_preview_model?.(key.model);
        for (let k = 0; k < engine.parameterCount && k < 8; ++k) {
          const offset = Math.round((this.offsets[k] / 0x7fffffff - 0.5) * 128);
          const raw = Math.max(0, Math.min(127, key.controls[k] + offset));
          words[k] = raw === 127 ? 0x7fffffff : raw << 24;
        }
        engine.parameters.set(words.subarray(0, Math.min(8, engine.parameterCount)));
        return api.opxy_render(state, output, parameterAddress, pitch);
      },
    });
  }
  fire(e) {
    if (e.type === 'on' && this.keys) {
      this.engine.noteOn(e.note, Math.min(1, Math.max(0.01, e.velocity)));
      const voice = this.engine.voices.find(v => v.active && v.note === e.note);
      if (voice) this.voiceKey.set(voice.state, (((e.note - 53) % 24) + 24) % 24);
    }
    else if (e.type === 'parameters' && this.keys) this.offsets = e.value.slice();
    else if (e.type === 'on') this.engine.noteOn(e.note, Math.min(1, Math.max(0.01, e.velocity)));
    else if (e.type === 'off') this.engine.noteOff(e.note);
    else if (e.type === 'parameters') this.engine.setParameters(e.value);
    // The track's envelope: the preview's linear attack and release, in seconds.
    else if (e.type === 'env') {
      this.engine.attackStep = 1 / (sampleRate * Math.max(0.002, e.attack));
      this.engine.releaseStep = 1 / (sampleRate * Math.max(0.01, e.release));
    }
  }
  process(_inputs, outputs) {
    // Two channels: a stereo machine fills both, a mono one is copied to the right.
    const out = outputs[0][0], right = outputs[0][1];
    if (!out) return true;
    if (!this.engine) { out.fill(0); right?.fill(0); return true; }
    this.q.run(out.length, (a, b) => this.engine.render(out.subarray(a, b), right ? right.subarray(a, b) : undefined), e => this.fire(e));
    return true;
  }
}
registerProcessor('xy-machine', MachineProcessor);

/* ---------------- built-in engines ---------------- */
const TAU = Math.PI * 2;
const RATIOS = [0.5, 1, 1.5, 2, 3, 4, 5, 7];
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
class Voice {
  constructor() {
    this.on = false; this.stage = 0; this.env = 0; this.note = 60; this.f = 261.6; this.vel = 1;
    this.ph1 = 0; this.ph2 = 0; this.mph = 0; this.lm = 0; this.ic1 = 0; this.ic2 = 0;
    this.buf = new Float32Array(4096); this.N = 2; this.i = 0; this.last = 0; this.age = 0;
    // drums
    this.kind = 0; this.t = 0; this.lp = 0; this.lp2 = 0; this.hp = 0; this.osc = new Float32Array(6);
  }
}
const CYMBAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

class BuiltinProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.v = Array.from({ length: 8 }, () => new Voice());
    this.P = { engine: 0, p: [0.5, 0.2, 0.6, 0.2], a: 0.005, d: 0.3, s: 0.7, r: 0.3 };
    this.q = new EventQueue();
    this.clock = 0;
    this.seed = 22222;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'panic') { this.q.clear(); for (const v of this.v) v.on = false; }
      else if (data.when) this.q.push(data);  // notes et p-locks datés
      else this.fire(data);
    };
    this.port.postMessage({ ready: true });
  }
  rnd() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 2147483648 - 1; }
  fire(e) {
    if (e.type === 'on') this.noteOn(e.note, e.velocity);
    else if (e.type === 'off') this.noteOff(e.note);
    else if (e.type === 'params') Object.assign(this.P, e.value);
  }
  pick(n) {
    let v = null;
    if (this.P.engine !== 3) for (const x of this.v) if (x.on && x.note === n) { v = x; break; }
    if (!v) for (const x of this.v) if (!x.on) { v = x; break; }
    if (!v) { v = this.v[0]; for (const x of this.v) if (x.age < v.age) v = x; }
    return v;
  }
  noteOn(n, vel) {
    const P = this.P, p = P.p;
    if (P.engine === 3) {
      const kind = ((n % 12) + 12) % 12;
      if (kind === 6) for (const x of this.v) if (x.on && x.kind === 10) x.on = false; // closed hat chokes open hat
      const v = this.pick(n);
      v.on = true; v.kind = kind; v.note = n; v.vel = vel; v.t = 0; v.ph1 = 0; v.ph2 = 0;
      v.lp = 0; v.lp2 = 0; v.hp = 0; v.osc.fill(0); v.age = ++this.clock;
      return;
    }
    const v = this.pick(n);
    const fresh = !v.on;
    v.on = true; v.stage = 1; v.note = n; v.f = 440 * Math.pow(2, (n - 69) / 12); v.vel = vel; v.age = ++this.clock;
    if (fresh) { v.env = 0; v.ic1 = 0; v.ic2 = 0; v.ph1 = 0; v.ph2 = Math.random(); v.mph = 0; v.lm = 0; }
    if (P.engine === 2) {
      const N = Math.max(2, Math.min(4095, Math.round(sampleRate / v.f)));
      const c = 0.04 + 0.96 * p[0] * p[0];
      let lp = 0;
      for (let k = 0; k < N; k++) {
        const x = this.rnd() * (1 - p[3]) + (k < N / 2 ? 1 : -1) * p[3];
        lp += c * (x - lp); v.buf[k] = lp;
      }
      v.N = N; v.i = 0; v.last = 0;
    }
  }
  noteOff(n) {
    if (this.P.engine === 3) return; // one-shots
    for (const v of this.v) if (v.on && v.note === n && v.stage !== 4) v.stage = 4;
  }
  renderSynth(L, a, b) {
    const sr = sampleRate, P = this.P, p = P.p, eng = P.engine;
    const aInc = 1 / (Math.max(0.001, P.a) * sr);
    const dK = 1 - Math.exp(-3 / (Math.max(0.005, P.d) * sr));
    const rK = 1 - Math.exp(-3 / (Math.max(0.005, P.r) * sr));
    for (const v of this.v) {
      if (!v.on) continue;
      let fc = eng === 0 ? 40 * Math.pow(2, p[2] * 9) * (0.5 + v.env) : eng === 1 ? 150 * Math.pow(2, p[3] * 7) : 1000;
      fc = Math.min(fc, sr * 0.45);
      const g = Math.tan(Math.PI * fc / sr), k = eng === 0 ? 2 - 1.85 * p[3] : 1.2;
      const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
      const dt = v.f / sr, dt2 = dt * Math.pow(2, p[1] * 40 / 1200);
      const ratio = RATIOS[Math.min(7, Math.floor(p[0] * 8))], idx = p[1] * 7, fb = p[2] * 1.4;
      const damp = 0.96 + 0.0395 * p[1], s = 0.05 + 0.6 * (1 - p[2]);
      const amp = 0.28 * v.vel;
      for (let i = a; i < b; i++) {
        if (v.stage === 1) { v.env += aInc; if (v.env >= 1) { v.env = 1; v.stage = 2; } }
        else if (v.stage === 2) v.env += (P.s - v.env) * dK;
        else if (v.stage === 4) { v.env -= v.env * rK; if (v.env < 1e-4) { v.on = false; break; } }
        let x;
        if (eng === 0) {
          v.ph1 += dt; if (v.ph1 >= 1) v.ph1 -= 1;
          let t2 = v.ph1 + 0.5; if (t2 >= 1) t2 -= 1;
          const saw = 2 * v.ph1 - 1 - blep(v.ph1, dt), sq = saw - (2 * t2 - 1 - blep(t2, dt));
          v.ph2 += dt2; if (v.ph2 >= 1) v.ph2 -= 1;
          const s2 = 2 * v.ph2 - 1 - blep(v.ph2, dt2);
          x = (saw * (1 - p[0]) + sq * 0.5 * p[0]) * (1 - 0.45 * p[1]) + s2 * 0.45 * p[1];
        } else if (eng === 1) {
          v.mph += dt * ratio; if (v.mph >= 1) v.mph -= 1;
          const m = Math.sin(TAU * v.mph + fb * v.lm); v.lm = m;
          v.ph1 += dt; if (v.ph1 >= 1) v.ph1 -= 1;
          x = Math.sin(TAU * v.ph1 + idx * (0.25 + 0.75 * v.env) * m);
        } else {
          const y = v.buf[v.i], f = y * (1 - s) + v.last * s;
          v.buf[v.i] = f * damp; v.last = y; v.i++; if (v.i >= v.N) v.i = 0; x = y * 1.6;
        }
        if (eng !== 2) {
          const v3 = x - v.ic2, v1 = a1 * v.ic1 + a2 * v3, v2 = v.ic2 + a2 * v.ic1 + a3 * v3;
          v.ic1 = 2 * v1 - v.ic1; v.ic2 = 2 * v2 - v.ic2; x = v2;
        }
        L[i] += x * v.env * amp;
      }
    }
  }
  renderDrums(L, a, b) {
    const sr = sampleRate, p = this.P.p, inv = 1 / sr;
    const kickDecay = 0.18 + 0.7 * p[0], kickTune = 42 + 26 * p[0];
    const snap = 0.06 + 0.22 * p[1], snareTone = 160 + 90 * p[1];
    const hatC = 0.018 + 0.07 * p[2], hatO = 0.14 + 0.5 * p[2];
    const drive = 1 + 7 * p[3] * p[3];
    for (const v of this.v) {
      if (!v.on) continue;
      for (let i = a; i < b; i++) {
        const t = v.t * inv; v.t++;
        let x = 0, alive = true;
        const n = this.rnd();
        switch (v.kind) {
          case 0: { // kick
            const f = kickTune * (1 + 3 * Math.exp(-t * 38));
            v.ph1 += f * inv; if (v.ph1 >= 1) v.ph1 -= 1;
            x = Math.sin(TAU * v.ph1) * Math.exp(-t / kickDecay) + (t < 0.002 ? n * 0.4 : 0);
            alive = t < kickDecay * 6; break; }
          case 1: { // rim
            v.ph1 += 1700 * inv; if (v.ph1 >= 1) v.ph1 -= 1;
            x = (Math.sin(TAU * v.ph1) * 0.7 + n * 0.3) * Math.exp(-t / 0.012); alive = t < 0.1; break; }
          case 2: { // snare
            v.ph1 += snareTone * (1 + 0.5 * Math.exp(-t * 60)) * inv; if (v.ph1 >= 1) v.ph1 -= 1;
            v.lp += 0.35 * (n - v.lp);
            x = Math.sin(TAU * v.ph1) * Math.exp(-t / 0.07) * 0.6 + (n - v.lp) * Math.exp(-t / snap) * 0.9;
            alive = t < snap * 7; break; }
          case 3: { // clap
            const burst = t < 0.03 ? (t % 0.01 < 0.004 ? 1 : 0.25) : Math.exp(-(t - 0.03) / 0.13);
            v.lp += 0.5 * (n - v.lp); v.lp2 += 0.2 * (v.lp - v.lp2);
            x = (v.lp - v.lp2) * burst * 2.2; alive = t < 0.8; break; }
          case 4: case 8: { // cowbell / zap
            if (v.kind === 4) {
              v.ph1 += 540 * inv; v.ph2 += 800 * inv; if (v.ph1 >= 1) v.ph1 -= 1; if (v.ph2 >= 1) v.ph2 -= 1;
              x = ((v.ph1 < 0.5 ? 1 : -1) + (v.ph2 < 0.5 ? 1 : -1)) * 0.3 * Math.exp(-t / 0.18); alive = t < 1;
            } else {
              v.ph1 += (100 + 1900 * Math.exp(-t * 30)) * inv; if (v.ph1 >= 1) v.ph1 -= 1;
              x = Math.sin(TAU * v.ph1) * Math.exp(-t / 0.12); alive = t < 0.8;
            }
            break; }
          case 5: case 7: case 9: { // toms
            const base = v.kind === 5 ? 82 : v.kind === 7 ? 118 : 168;
            v.ph1 += base * (1 + 0.6 * Math.exp(-t * 18)) * inv; if (v.ph1 >= 1) v.ph1 -= 1;
            x = Math.sin(TAU * v.ph1) * Math.exp(-t / 0.28); alive = t < 1.8; break; }
          case 6: case 10: { // hats
            v.hp += 0.6 * (n - v.hp);
            const metal = this.metal(v, inv);
            x = ((n - v.hp) * 0.7 + metal * 0.5) * Math.exp(-t / (v.kind === 6 ? hatC : hatO));
            alive = t < (v.kind === 6 ? hatC : hatO) * 7; break; }
          case 11: { // cymbal
            const metal = this.metal(v, inv);
            v.hp += 0.4 * (metal - v.hp);
            x = (metal - v.hp) * 0.8 * Math.exp(-t / (0.5 + 0.8 * p[2])); alive = t < 4; break; }
        }
        L[i] += Math.tanh(x * drive) * 0.42 * v.vel;
        if (!alive) { v.on = false; break; }
      }
    }
  }
  metal(v, inv) {
    let s = 0;
    for (let k = 0; k < 6; k++) { v.osc[k] += CYMBAL[k] * 1.9 * inv; if (v.osc[k] >= 1) v.osc[k] -= 1; s += v.osc[k] < 0.5 ? 1 : -1; }
    return s / 6;
  }
  process(_inputs, outputs) {
    const L = outputs[0][0];
    if (!L) return true;
    L.fill(0);
    const render = this.P.engine === 3 ? (a, b) => this.renderDrums(L, a, b) : (a, b) => this.renderSynth(L, a, b);
    this.q.run(L.length, render, e => this.fire(e));
    for (let i = 0; i < L.length; i++) L[i] = Math.tanh(L[i]);
    return true;
  }
}
registerProcessor('xy-builtin', BuiltinProcessor);

// Enregistreur : copie la sortie stéréo par paquets et l'envoie au fil principal.
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false; this.size = 4096; this.reset();
    this.port.onmessage = ({ data }) => { if (!data.on && this.n) this.flush(); this.on = !!data.on; this.reset(); };
  }
  reset() { this.L = new Float32Array(this.size); this.R = new Float32Array(this.size); this.n = 0; }
  flush() { this.port.postMessage([this.L.subarray(0, this.n), this.R.subarray(0, this.n)], [this.L.buffer, this.R.buffer]); this.reset(); }
  process(inputs) {
    if (!this.on) return true;
    const ch = inputs[0];
    if (!ch || !ch.length) return true;
    const L = ch[0], R = ch[1] || ch[0];
    for (let i = 0; i < L.length; i++) {
      this.L[this.n] = L[i]; this.R[this.n] = R[i];
      if (++this.n === this.size) this.flush();
    }
    return true;
  }
}
registerProcessor('xy-recorder', RecorderProcessor);

// Punch-in effects sur la sortie générale, à tenir. Chaque effet a son fondu (4 ms) pour éviter les clics.
// 0 Repeat · 1 Roll · 2 Reverse · 3 Tape stop : lisent la mémoire des 4 dernières secondes (un seul à la fois, le dernier appuyé).
// 4 Low pass · 5 High pass · 6 Bits · 7 Gate : s'enchaînent sur le résultat.
class PunchProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.N = Math.round(sampleRate * 4);
    this.bufL = new Float32Array(this.N); this.bufR = new Float32Array(this.N);
    this.w = 0;
    this.on = new Array(8).fill(false); this.mix = new Float32Array(8); this.t = new Float64Array(8); this.mark = new Int32Array(8);
    this.src = -1; this.srcMix = 0; this.lastSrc = -1;
    this.bpm = 120; this.div = 2; this.res = 0.5; this.bits = 0.5; this.tape = 0.5;
    this.read = 0; this.rate = 1;
    this.lp = [0, 0, 0, 0]; this.hp = [0, 0, 0, 0]; this.hold = [0, 0]; this.holdN = 0;
    this.step = 1 / (0.004 * sampleRate);
    this.port.onmessage = ({ data }) => {
      if (data.bpm) this.bpm = data.bpm;
      if (data.amt) Object.assign(this, data.amt);
      if (data.on != null) this.press(data.on, true);
      if (data.off != null) this.press(data.off, false);
      if (data.allOff) for (let i = 0; i < 8; i++) this.press(i, false);
    };
  }
  press(i, down) {
    if (this.on[i] === down) return;
    this.on[i] = down;
    if (down) {
      this.t[i] = 0; this.mark[i] = this.w;
      if (i < 4) { this.src = i; this.lastSrc = i; if (i === 3) { this.read = this.w - 1; this.rate = 1; } }
    } else if (i < 4 && this.src === i) {
      // Relâché : on revient au dernier effet de lecture encore tenu, sinon au son direct.
      this.src = -1;
      for (let k = 0; k < 4; k++) if (this.on[k]) this.src = k;
    }
  }
  at(buf, pos) { const N = this.N; pos = ((pos % N) + N) % N; const i = Math.floor(pos), f = pos - i; return buf[i] * (1 - f) + buf[(i + 1) % N] * f; }
  svf(st, x, g, k, high) {
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - st[1], v1 = a1 * st[0] + a2 * v3, v2 = st[1] + a2 * st[0] + a3 * v3;
    st[0] = 2 * v1 - st[0]; st[1] = 2 * v2 - st[1];
    return high ? x - k * v1 - v2 : v2;
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const inL = inp[0], inR = inp[1] || inp[0], oL = out[0], oR = out[1] || out[0];
    const n = oL.length, sr = sampleRate, N = this.N;
    if (!inL) { oL.fill(0); if (oR !== oL) oR.fill(0); return true; }
    const beat = 60 / this.bpm * sr, seg = beat / [1, 2, 4, 8][this.div];
    const k = 2 - 1.9 * this.res;
    for (let i = 0; i < n; i++) {
      const xl = inL[i], xr = inR[i];
      this.bufL[this.w] = xl; this.bufR[this.w] = xr;
      // fondus
      for (let f = 0; f < 8; f++) {
        const target = this.on[f] ? 1 : 0;
        if (this.mix[f] !== target) this.mix[f] = target > this.mix[f] ? Math.min(1, this.mix[f] + this.step) : Math.max(0, this.mix[f] - this.step);
        if (this.on[f]) this.t[f]++;
      }
      // source : direct ou lecture de la mémoire
      let l = xl, r = xr;
      const s = this.src >= 0 ? this.src : this.lastSrc;
      const sm = this.src >= 0 ? Math.min(1, this.srcMix + this.step) : Math.max(0, this.srcMix - this.step);
      this.srcMix = sm;
      if (sm > 0 && s >= 0) {
        let pl = 0, pr = 0;
        const t = this.t[s], start = this.mark[s];
        if (s === 0 || s === 1) {
          let len = seg;
          if (s === 1) len = Math.max(beat / 32, (beat / 2) / Math.pow(2, Math.floor(t / (beat / 2))));
          len = Math.max(64, Math.round(len));
          const ph = t % len, pos = start - len + ph;
          const edge = Math.min(1, ph / 48, (len - ph) / 48);  // petit fondu à chaque boucle
          pl = this.at(this.bufL, pos) * edge; pr = this.at(this.bufR, pos) * edge;
        } else if (s === 2) {
          const span = Math.round(beat * 2), ph = t % span, pos = start - 1 - ph;
          const edge = Math.min(1, ph / 48, (span - ph) / 48);
          pl = this.at(this.bufL, pos) * edge; pr = this.at(this.bufR, pos) * edge;
        } else {
          const dur = (0.25 + this.tape * 2.25) * sr;
          this.rate = this.on[3] ? Math.max(0, 1 - t / dur) : this.rate;
          this.read += this.rate;
          const g = Math.min(1, this.rate * 8);
          pl = this.at(this.bufL, this.read) * g; pr = this.at(this.bufR, this.read) * g;
        }
        l = xl * (1 - sm) + pl * sm; r = xr * (1 - sm) + pr * sm;
      }
      // Low pass : de 16 kHz vers 250 Hz en 1,2 s
      if (this.mix[4] > 0) {
        const fc = 250 * Math.pow(64, Math.max(0, 1 - this.t[4] / (1.2 * sr)));
        const g = Math.tan(Math.PI * Math.min(fc, sr * .45) / sr), m = this.mix[4];
        const fl = this.svf(this.lp, l, g, k, false), fr = this.svf(this.lp.subarray ? this.lp : this.lp2 || (this.lp2 = [0, 0]), r, g, k, false);
        l = l * (1 - m) + fl * m; r = r * (1 - m) + fr * m;
      }
      // High pass : de 20 Hz vers 3 kHz en 1,2 s
      if (this.mix[5] > 0) {
        const fc = 20 * Math.pow(150, Math.min(1, this.t[5] / (1.2 * sr)));
        const g = Math.tan(Math.PI * fc / sr), m = this.mix[5];
        const hl = this.svf(this.hp, l, g, k, true), hr = this.svf(this.hp2 || (this.hp2 = [0, 0]), r, g, k, true);
        l = l * (1 - m) + hl * m; r = r * (1 - m) + hr * m;
      }
      // Bits : moins de bits et échantillonnage plus lent
      if (this.mix[6] > 0) {
        const levels = Math.pow(2, 2 + Math.round((1 - this.bits) * 8)), every = 1 + Math.round(this.bits * 23);
        if (this.holdN++ % every === 0) { this.hold[0] = Math.round(l * levels) / levels; this.hold[1] = Math.round(r * levels) / levels; }
        const m = this.mix[6];
        l = l * (1 - m) + this.hold[0] * m; r = r * (1 - m) + this.hold[1] * m;
      }
      // Gate : hachure au rythme choisi
      if (this.mix[7] > 0) {
        const ph = (this.t[7] % seg) / seg, open = ph < 0.5 ? 1 : 0;
        this.gate = (this.gate ?? 1) + (open - (this.gate ?? 1)) * 0.02;
        const m = this.mix[7];
        l *= 1 - m + this.gate * m; r *= 1 - m + this.gate * m;
      }
      oL[i] = l; if (oR !== oL) oR[i] = r;
      this.w = (this.w + 1) % N;
    }
    return true;
  }
}
registerProcessor('xy-punch', PunchProcessor);
