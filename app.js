// LAB_XY — Open-XY machines played from an OP-XY in MIDI controller mode.
import { createControls, shownControls } from './sdk/browser/controls.mjs';
import { PreviewDisplay, SvgDisplay, NoteActivity } from './sdk/browser/display.mjs';
import { selectArtwork } from './sdk/browser/graphics.mjs';
import { LANG, L, setLang, translatePage } from './i18n.js?v=14';

const $ = id => document.getElementById(id);
const cl = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = n => NN[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1700); }

/* ============================ catalogue ============================ */
const BUILTINS = [
  { id: 'b:drums',  name: L('Batterie'), idx: 3, params: [L('Grosse caisse'), L('Caisse claire'), L('Charleston'), L('Saturation')], description: L('Douze sons de batterie synthétisés, un par note de l\'octave.') },
  { id: 'b:analog', name: 'Analog',   idx: 0, params: [L('Forme'), L('Désaccord'), L('Filtre'), L('Résonance')], description: L('Deux oscillateurs scie et carré, filtre résonant.') },
  { id: 'b:fm',     name: 'FM',       idx: 1, params: ['Ratio', L('Indice'), 'Feedback', L('Ton')], description: L('Deux opérateurs, du doux au métallique.') },
  { id: 'b:corde',  name: L('Corde'),    idx: 2, params: [L('Éclat'), L('Tenue'), L('Matière'), L('Attaque')], description: L('Corde pincée par synthèse Karplus-Strong.') },
];
const DRUM_NAMES = [L('Grosse caisse'), 'Rim', L('Caisse claire'), 'Clap', L('Cloche'), L('Tom grave'), L('Charley fermé'), L('Tom médium'), 'Zap', L('Tom aigu'), L('Charley ouvert'), L('Cymbale')];
let MACHINES = [];          // index.json
let ENGINE_LIST = [];       // ids, builtins first
const engineInfo = id => id.startsWith('b:') ? BUILTINS.find(b => b.id === id) : MACHINES.find(m => 'm:' + m.id === id);
const engineName = id => engineInfo(id)?.name || id.slice(2);
const isMachine = id => id.startsWith('m:');

/* ============================ état ============================ */
const RATIOS = [0.5, 1, 1.5, 2, 3, 4, 5, 7];
const DIVS = [{ l: '1/16', b: .25 }, { l: '1/8', b: .5 }, { l: '3/16', b: .75 }, { l: '1/4', b: 1 }, { l: '3/8', b: 1.5 }, { l: '1/2', b: 2 }];
const LENS = [.25, .5, 1, 2, 3, 4, 6, 8, 16];
const ARP_SHAPES = [L('Montant'), L('Descendant'), L('Aller-retour'), L('Aléatoire'), L('Ordre joué')];
const ARP_RATES = [{ l: '1/32', s: .5 }, { l: '1/16', s: 1 }, { l: '1/8', s: 2 }, { l: '1/4', s: 4 }];
const CHORDS = [[L('Majeur'), [0, 4, 7]], [L('Mineur'), [0, 3, 7]], [L('Septième'), [0, 4, 7, 10]], [L('Mineur 7'), [0, 3, 7, 10]],
  ['Sus4', [0, 5, 7]], [L('Quinte'), [0, 7]], ['Octave', [0, 12]], [L('Neuvième'), [0, 4, 7, 14]]];
const MAX_STEPS = 64;
const step = (n, v = .8, len = 1) => ({ n, v, len, ch: 1 });
// Notes d'un pas : sa note, plus celles de son accord.
const stepNotes = st => st.x?.length ? [st.n, ...st.x] : [st.n];
// Conditions de déclenchement : probabilité, n-ième passage sur m, Fill, premier passage.
const CONDS = [{ l: L('Toujours') }, { l: '10 %', p: .1 }, { l: '25 %', p: .25 }, { l: '50 %', p: .5 }, { l: '75 %', p: .75 }, { l: '90 %', p: .9 },
  { l: '1:2', a: 1, b: 2 }, { l: '2:2', a: 2, b: 2 }, { l: '1:3', a: 1, b: 3 }, { l: '2:3', a: 2, b: 3 }, { l: '3:3', a: 3, b: 3 },
  { l: '1:4', a: 1, b: 4 }, { l: '2:4', a: 2, b: 4 }, { l: '3:4', a: 3, b: 4 }, { l: '4:4', a: 4, b: 4 },
  { l: 'Fill', fill: true }, { l: L('Sans fill'), fill: false }, { l: L('1er passage'), first: true }, { l: L('Après le 1er'), first: false }];
let fillOn = false;
function condOk(st, loop) {
  const c = CONDS[st.cond || 0];
  if (!c) return true;
  if (c.p != null) return Math.random() < c.p;
  if (c.b) return loop % c.b === c.a - 1;
  if (c.fill != null) return c.fill === fillOn;
  if (c.first != null) return c.first === (loop === 0);
  return true;
}
// Motifs : 16 par projet (A à P). Les pistes travaillent sur les tableaux du motif en cours.
const PATTERNS = 16, PAT_NAMES = 'ABCDEFGHIJKLMNOP';
const emptyPattern = () => ({ tracks: Array.from({ length: 8 }, () => ({ len: 16, steps: Array(MAX_STEPS).fill(null) })) });
const patternUsed = k => !!S.patterns[k]?.tracks.some(t => t.steps.some(Boolean));
function linkPattern() {
  const p = S.patterns[S.pat] || (S.patterns[S.pat] = emptyPattern());
  S.tracks.forEach((t, i) => { t.steps = p.tracks[i].steps; t.len = p.tracks[i].len; });
}
function syncPattern() {
  const p = S.patterns[S.pat] || (S.patterns[S.pat] = emptyPattern());
  S.tracks.forEach((t, i) => { p.tracks[i].steps = t.steps; p.tracks[i].len = t.len; });
}
// Met un état ancien ou importé au format courant.
function migrate(s) {
  s.tracks.forEach(t => {
    t.player = { type: 0, shape: 0, rate: 1, range: 1, inv: 0, latch: 0, ...t.player };
    t.steps = (t.steps || []).concat(Array(MAX_STEPS).fill(null)).slice(0, MAX_STEPS);
  });
  if (!Array.isArray(s.patterns) || s.patterns.length !== PATTERNS) {
    const old = Array.isArray(s.patterns) ? s.patterns : [];
    s.patterns = Array.from({ length: PATTERNS }, (_, k) => old[k] || null);
    if (!s.patterns[0]) s.patterns[0] = { tracks: s.tracks.map(t => ({ len: t.len || 16, steps: t.steps })) };
  }
  s.patterns.forEach(p => p?.tracks.forEach(t => { t.steps = (t.steps || []).concat(Array(MAX_STEPS).fill(null)).slice(0, MAX_STEPS); t.len = [16, 32, 48, 64].includes(t.len) ? t.len : 16; }));
  s.pat = s.pat >= 0 && s.pat < PATTERNS ? s.pat : 0;
  s.song = Array.isArray(s.song) ? s.song.filter(r => r && r.p >= 0 && r.p < PATTERNS).map(r => ({ p: r.p | 0, r: cl(r.r | 0, 1, 16) })) : [];
  s.songMode = s.songMode ? 1 : 0;
  s.punch = { div: 1, res: .5, bits: .5, tape: .35, ...s.punch };
  return s;
}

function newTrack(engine) {
  return { engine, p: [.5, .3, .5, .2], mv: {}, env: [.05, .45, .6, .35], vol: .8, pan: 0, send: .12, transpose: 0, mute: false,
    len: 16, steps: Array(MAX_STEPS).fill(null), player: { type: 0, shape: 0, rate: 1, range: 1, inv: 0, latch: 0 } };
}
function defaultState() {
  const t = [];
  for (let i = 0; i < 4; i++) t.push(newTrack('b:drums'));
  t.push(newTrack('b:analog'), newTrack('m:karplus'), newTrack('m:fm2op'), newTrack('m:macroosc'));
  // exemple : un rythme, une basse, une corde, des cloches
  const d = t[0]; d.p = [.45, .5, .35, .25];
  [0, 6, 8, 11].forEach(s => d.steps[s] = step(36, .95));
  [4, 12].forEach(s => d.steps[s] = step(38, .85));
  [2, 6, 10].forEach(s => d.steps[s] = step(42, .5));
  d.steps[14] = step(46, .55);
  const b = t[4]; b.p = [.15, .25, .4, .45]; b.env = [.02, .3, .35, .2]; b.send = .03;
  [[0, 36], [3, 36], [6, 39], [8, 36], [10, 43], [11, 41], [14, 39]].forEach(([s, n]) => b.steps[s] = step(n, .9));
  const k = t[5]; k.vol = .7; k.send = .3;
  [[0, 60], [2, 67], [4, 70], [6, 72], [8, 63], [10, 67], [12, 75], [14, 72]].forEach(([s, n]) => k.steps[s] = step(n, .7));
  const f = t[6]; f.vol = .6; f.send = .4;
  [[4, 84, 2], [13, 79, 2]].forEach(([s, n, l]) => f.steps[s] = step(n, .6, l));
  return { v: 2, bpm: 112, swing: .08, metro: 0, track: 0, oct: 0, mode: 'instrument', sub: 0, selStep: 0, page: 0, follow: 1,
    tracks: t, fx: { div: 2, fb: .38, mix: .3, tone: .55 }, master: .8, projectIdx: 0, pat: 0, song: [], songMode: 0 };
}
const VERSION = '14';
// Remise à zéro : ?reset dans l'adresse, ou le bouton « Réinitialiser ».
if (new URLSearchParams(location.search).has('reset')) {
  try { localStorage.removeItem('xy-studio-v2'); } catch (e) {}
  history.replaceState(null, '', location.pathname);
}
function loadState() {
  try { const s = JSON.parse(localStorage.getItem('xy-studio-v2') || 'null'); if (s && s.v === 2 && s.tracks?.length === 8) return s; } catch (e) {}
  return null;
}
let S = migrate(loadState() || defaultState());
linkPattern();
let keymap = (() => { try { return JSON.parse(localStorage.getItem('xy-keymap') || '{}'); } catch (e) { return {}; } })();
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { syncPattern(); try { localStorage.setItem('xy-studio-v2', JSON.stringify(S)); localStorage.setItem('xy-keymap', JSON.stringify(keymap)); } catch (e) {} }, 300);
}
const T = () => S.tracks[S.track];
// Une couleur poudrée par piste ; celle de la piste sélectionnée colore l'instrument.
const TRACK_COLORS = ['#c47a72', '#9b4f88', '#b5a3bb', '#6a6293', '#86a393', '#cba763', '#7397ad', '#d6c8b4'];
let ACC = TRACK_COLORS[0], ONACC = '#0e0e11';
function setAccent() {
  ACC = TRACK_COLORS[S.track];
  const [r, g, b] = [1, 3, 5].map(k => parseInt(ACC.slice(k, k + 2), 16) / 255);
  ONACC = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.42 ? '#0e0e11' : '#f4f1f6';
  document.documentElement.style.setProperty('--tc', ACC);
}

/* ============================ machines (chargement) ============================ */
// Ouvert par double-clic (file://), le navigateur refuse fetch() : les machines arrivent alors
// sous forme de petits scripts (machines/<id>/data.js) générés par tools/build.py.
const LOCAL = location.protocol === 'file:';
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script'); el.src = src;
    el.onload = resolve; el.onerror = () => reject(new Error(src)); document.head.append(el);
  });
}
const b64bytes = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
async function machineFiles(id) {
  if (LOCAL) {
    const store = window.XY_MACHINE_DATA || {};
    if (!store[id]) await loadScript(`machines/${id}/data.js`);
    const d = window.XY_MACHINE_DATA[id];
    return { manifest: d.manifest, wasm: b64bytes(d.wasm).buffer, art: d.art, gray: d.gray };
  }
  const base = `machines/${id}/`;
  const manifest = await (await fetch(base + 'manifest.json')).json();
  const [wasm, art, gray] = await Promise.all([
    fetch(base + 'engine.wasm').then(r => { if (!r.ok) throw new Error(L('engine.wasm manquant')); return r.arrayBuffer(); }),
    fetch(base + 'panel.svg').then(r => r.text()),
    manifest.hasGray ? fetch(base + 'panel.grayscale.svg').then(r => r.ok ? r.text() : undefined).catch(() => undefined) : undefined,
  ]);
  return { manifest, wasm, art, gray };
}
const machineCache = new Map();
function loadMachine(id) {
  if (!machineCache.has(id)) {
    machineCache.set(id, (async () => {
      const { manifest, wasm, art, gray } = await machineFiles(id);
      const module = await WebAssembly.compile(wasm);
      const controls = createControls(manifest.definition);
      const artwork = { artwork: art, preview: { graphics: manifest.graphics } };
      if (gray) artwork.grayscaleArtwork = gray;
      return { id, manifest, module, controls, artwork };
    })().catch(e => { machineCache.delete(id); throw e; }));
  }
  return machineCache.get(id);
}
// Valeurs complètes et valides pour la machine de la piste.
function machineValues(t, m) {
  const def = m.controls.defaults();
  for (const p of m.controls.parameters) if (Number.isFinite(t.mv?.[p.id])) def[p.id] = cl(t.mv[p.id]);
  t.mv = def;
  return def;
}

/* ============================ audio ============================ */
let outAn = null, recorder = null, recording = false, recChunks = [], recFrames = 0, recStart = 0;
let punchNode = null;
let ctx = null, master, limiter, fxIn, delay, dFb, dWet, dTone, dSat;
const chain = [];   // par piste : gain, pan, envoi, analyseur
const R = Array.from({ length: 8 }, () => ({ node: null, gen: 0, machine: null, display: null, scene: null, activity: new NoteActivity(), serial: 0, loading: false, error: '' }));
const envA = x => 0.002 + x * x * 2, envD = x => 0.02 + x * x * 3, envR = x => 0.02 + x * x * 4;

async function startAudio() {
  ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 44100 });
  if (ctx.sampleRate !== 44100) throw new Error(L('le navigateur ne fournit pas 44,1 kHz'));
  // Le moteur audio est aussi fourni en texte par app.bundle.js : une URL data: passe même en file://.
  const workletUrl = window.XY_WORKLET_SRC ? 'data:text/javascript;charset=utf-8,' + encodeURIComponent(window.XY_WORKLET_SRC) : 'worklet.js?v=' + VERSION;
  await ctx.audioWorklet.addModule(workletUrl);
  // Sortie : un limiteur évite la saturation quand plusieurs pistes jouent fort.
  limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = .003; limiter.release.value = .15;
  master = ctx.createGain(); limiter.connect(ctx.destination);
  punchNode = new AudioWorkletNode(ctx, 'xy-punch', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
  master.connect(punchNode); punchNode.connect(limiter);
  outAn = ctx.createAnalyser(); outAn.fftSize = 2048; limiter.connect(outAn);
  recorder = new AudioWorkletNode(ctx, 'xy-recorder', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' });
  limiter.connect(recorder);
  recorder.port.onmessage = ({ data }) => { if (recording) { recChunks.push(data); recFrames += data[0].length; if (recFrames > 44100 * 60 * 20) toggleRecording(); } };
  fxIn = ctx.createGain(); // entrée commune des envois ; le délai derrière peut être reconstruit
  buildDelay();
  for (let i = 0; i < 8; i++) {
    const g = ctx.createGain(), pan = ctx.createStereoPanner(), send = ctx.createGain(), an = ctx.createAnalyser();
    an.fftSize = 1024;
    g.connect(pan); pan.connect(master); g.connect(send); send.connect(fxIn); g.connect(an);
    chain.push({ g, pan, send, an, buf: new Float32Array(1024) });
  }
  applyFx();
  await Promise.all(S.tracks.map((_, i) => buildNode(i)));
  startClock();
}
// Délai stable : le filtre de la boucle n'a pas de bosse de résonance (Q à -3 dB) et une saturation douce
// borne le signal, donc le gain de boucle reste sous 1 et la boucle ne peut pas s'auto-entretenir.
function buildDelay() {
  if (delay) { try { fxIn.disconnect(); [delay, dTone, dSat, dFb, dWet].forEach(n => n.disconnect()); } catch (e) {} }
  delay = ctx.createDelay(4); dFb = ctx.createGain(); dWet = ctx.createGain();
  dTone = ctx.createBiquadFilter(); dTone.type = 'lowpass'; dTone.Q.value = -3;
  dSat = ctx.createWaveShaper();
  const curve = new Float32Array(1025); for (let k = 0; k < 1025; k++) curve[k] = Math.tanh(k / 512 - 1); // pente 1 au centre : n'amplifie jamais
  dSat.curve = curve;
  fxIn.connect(delay); delay.connect(dTone); dTone.connect(dSat); dSat.connect(dFb); dFb.connect(delay); dSat.connect(dWet); dWet.connect(master);
  applyFx();
}
async function buildNode(i) {
  const r = R[i], t = S.tracks[i], gen = ++r.gen;
  if (r.node) { try { r.node.port.postMessage({ type: 'panic' }); r.node.disconnect(); } catch (e) {} r.node = null; }
  r.error = '';
  if (!isMachine(t.engine)) {
    r.machine = null; r.display = null; r.scene = null;
    if (!ctx) return;
    r.node = new AudioWorkletNode(ctx, 'xy-builtin', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
    r.node.connect(chain[i].g);
    pushTrack(i);
    return;
  }
  r.loading = true; renderTracks();
  try {
    const m = await loadMachine(t.engine.slice(2));
    if (gen !== r.gen) return;
    r.machine = m;
    const values = machineValues(t, m);
    try { r.display = new PreviewDisplay(m.module); r.scene = new SvgDisplay(selectArtwork(m.artwork, 'colorful'), m.manifest.graphics); }
    catch (e) { r.display = r.scene = null; }
    r.activity = new NoteActivity();
    if (ctx) {
      const node = new AudioWorkletNode(ctx, 'xy-machine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
        processorOptions: { module: m.module, parameters: m.controls.q31(values) } });
      node.port.onmessage = ({ data }) => { if (data.error) { r.error = data.error; toast(engineName(t.engine) + ' : ' + data.error); } };
      node.connect(chain[i].g);
      r.node = node;
      pushTrack(i);
    }
  } catch (e) {
    r.error = e.message; toast(L('Machine indisponible : ') + e.message);
  } finally {
    if (gen === r.gen) { r.loading = false; render(); }
  }
}
// Paramètres du moteur d'une piste, avec les p-locks d'un pas par-dessus.
function builtinParams(t, locks) {
  const p = t.p.map((x, k) => locks?.['p' + k] ?? x), e = t.env.map((x, k) => locks?.['e' + k] ?? x);
  return { engine: engineInfo(t.engine).idx, p, a: envA(e[0]), d: envD(e[1]), s: e[2], r: envR(e[3]) };
}
function sendParams(i, locks, when) {
  const t = S.tracks[i], r = R[i];
  if (!r.node) return;
  if (isMachine(t.engine)) {
    if (!r.machine) return;
    const v = { ...machineValues(t, r.machine) };
    if (locks) for (const k in locks) if (k.startsWith('m:') && k.slice(2) in v) v[k.slice(2)] = locks[k];
    r.node.port.postMessage({ type: 'parameters', value: r.machine.controls.q31(v), when: when || 0 });
  } else r.node.port.postMessage({ type: 'params', value: builtinParams(t, locks), when: when || 0 });
}
// Dernière série de p-locks envoyée à chaque piste ('' : réglages de base).
const lockSig = Array(8).fill('');
function applyLocks(i, st, when) {
  const locks = st?.locks && Object.keys(st.locks).length ? st.locks : null;
  const sig = locks ? JSON.stringify(locks) : '';
  if (sig === lockSig[i]) return;
  lockSig[i] = sig; sendParams(i, locks, when);
}
function pushTrack(i) {
  const t = S.tracks[i]; save();
  if (!ctx) return;
  lockSig[i] = ''; sendParams(i, null, 0);
  const now = ctx.currentTime, c = chain[i];
  const boost = isMachine(t.engine) ? 3.5 : 1; // les aperçus machine sortent à -20 dB par voix
  c.g.gain.setTargetAtTime(t.mute ? 0 : t.vol * t.vol * boost, now, .01);
  c.pan.pan.setTargetAtTime(t.pan, now, .01);
  c.send.gain.setTargetAtTime(t.send, now, .01);
}
function applyFx() {
  save(); if (!ctx || !delay) return;
  const now = ctx.currentTime;
  delay.delayTime.setTargetAtTime(60 / S.bpm * DIVS[S.fx.div].b, now, .05);
  dFb.gain.setTargetAtTime(Math.min(.8, S.fx.fb * .8), now, .02);
  dWet.gain.setTargetAtTime(S.fx.mix, now, .02);
  dTone.frequency.setTargetAtTime(400 * Math.pow(2, S.fx.tone * 5.5), now, .02);
  master.gain.setTargetAtTime(S.master * S.master, now, .02);
  punchNode?.port.postMessage({ bpm: S.bpm, amt: { div: S.punch.div, res: S.punch.res, bits: S.punch.bits, tape: S.punch.tape } });
}
function setEngine(i, id) {
  const t = S.tracks[i];
  if (t.engine === id) return;
  panicTrack(i);
  t.engine = id; t.mv = {};
  R[i].machine = null; R[i].display = null; R[i].scene = null;
  if (S.mode === 'instrument' && i === S.track && S.sub === 1 && !hasPage2()) S.sub = 0;
  save(); buildNode(i); render();
}
const hits = new Float64Array(12); // dernière frappe de chaque son de batterie (ms, horloge page)
function voiceOn(i, n, vel, when) {
  const r = R[i];
  r.node?.port.postMessage({ type: 'on', note: n, velocity: cl(vel, .01, 1), when: when || 0 });
  const delayMs = when && ctx ? Math.max(0, (when - ctx.currentTime) * 1000) : 0;
  setTimeout(() => {
    if (r.activity.noteOn(n)) r.serial = (r.serial + 1) >>> 0;
    if (S.tracks[i].engine === 'b:drums') hits[((n % 12) + 12) % 12] = performance.now();
  }, delayMs);
}
function voiceOff(i, n, when) {
  const r = R[i];
  r.node?.port.postMessage({ type: 'off', note: n, when: when || 0 });
  const delayMs = when && ctx ? Math.max(0, (when - ctx.currentTime) * 1000) : 0;
  setTimeout(() => r.activity.noteOff(n), delayMs);
}
function panicTrack(i) { R[i].node?.port.postMessage({ type: 'panic' }); R[i].activity.panic(); arp[i].held.length = 0; chordOn[i].clear(); latched[i].forEach(p => kbSet(p, false)); latched[i].clear(); }
function panicAll() {
  for (let i = 0; i < 8; i++) panicTrack(i);
  liveNotes.clear(); kbOff();
  if (ctx) buildDelay(); // vide les échos en cours
  punchAllOff();
  toast(L('Silence'));
}
function click(when, acc) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = acc ? 1600 : 1000;
  g.gain.setValueAtTime(.0001, when); g.gain.exponentialRampToValueAtTime(.25, when + .002); g.gain.exponentialRampToValueAtTime(.0001, when + .05);
  o.connect(g); g.connect(master); o.start(when); o.stop(when + .06);
}

/* ============================ players ============================ */
const arp = Array.from({ length: 8 }, () => ({ held: [], idx: 0, dir: 1 }));
const chordOn = Array.from({ length: 8 }, () => new Map()); // note -> notes jouées
function chordNotes(t, n) {
  const ivs = CHORDS[t.player.shape % CHORDS.length][1];
  let notes = ivs.map(iv => n + iv);
  for (let k = 0; k < t.player.inv; k++) { const lo = notes.shift(); notes.push(lo + 12); }
  return notes.filter(x => x >= 0 && x <= 127);
}
function trackOn(i, n, vel, when, dur) {
  const t = S.tracks[i], pl = t.player;
  if (pl.type === 1) {
    const now = ctx ? ctx.currentTime : 0;
    arp[i].held.push({ n, vel, start: when || now, end: dur ? (when || now) + dur : Infinity, order: performance.now() + Math.random() });
    return;
  }
  const notes = pl.type === 2 ? chordNotes(t, n) : [n];
  if (pl.type === 2 && !dur) chordOn[i].set(n, notes);
  notes.forEach(x => { voiceOn(i, x, vel, when); if (dur) voiceOff(i, x, when + dur); });
}
function trackOff(i, n, when) {
  const t = S.tracks[i];
  if (t.player.type === 1) {
    const now = when || (ctx ? ctx.currentTime : 0);
    for (const h of arp[i].held) if (h.n === n && h.end === Infinity) h.end = now;
    return;
  }
  const notes = chordOn[i].get(n);
  if (notes) { chordOn[i].delete(n); notes.forEach(x => voiceOff(i, x, when)); }
  else voiceOff(i, n, when);
}
function arpTick(i, time, gate) {
  const a = arp[i], t = S.tracks[i];
  a.held = a.held.filter(h => h.end > time - 2);
  const active = a.held.filter(h => h.start <= time + 1e-4 && h.end > time);
  if (!active.length) { a.idx = 0; return; }
  const base = t.player.shape === 4 ? active.slice().sort((x, y) => x.order - y.order) : active.slice().sort((x, y) => x.n - y.n);
  const seq = [];
  for (let o = 0; o < t.player.range; o++) for (const h of base) seq.push({ n: h.n + 12 * o, vel: h.vel });
  let pick;
  const len = seq.length, sh = t.player.shape;
  if (sh === 1) pick = seq[len - 1 - (a.idx % len)];
  else if (sh === 2) { const per = Math.max(1, 2 * len - 2); const k = a.idx % per; pick = seq[k < len ? k : per - k]; }
  else if (sh === 3) pick = seq[Math.floor(Math.random() * len)];
  else pick = seq[a.idx % len];
  a.idx++;
  if (t.mute) return;
  const n = cl(pick.n, 0, 127);
  voiceOn(i, n, pick.vel, time); voiceOff(i, n, time + gate);
}

/* ============================ horloge et séquenceur ============================ */
let playing = false, rec = false, stopArmed = false;
let clockTime = 0, clockStep = 0, patStep = 0, queue = [], curSeq = -1, curSeqTime = 0;
let nextPat = null, songRow = 0, songRep = 0, playingPat = 0;
const patternLength = () => Math.max(...S.tracks.map(t => t.len));
const stepDur = () => 60 / S.bpm / 4;
function startClock() {
  clockTime = ctx.currentTime + .05;
  setInterval(() => {
    if (!ctx) return;
    const sd = stepDur();
    while (clockTime < ctx.currentTime + .12) {
      const t = clockTime + ((clockStep % 2) ? S.swing * sd : 0);
      if (playing) {
        if (S.metro && patStep % 4 === 0) click(t, patStep % 16 === 0);
        S.tracks.forEach((tr, i) => {
          const pos = patStep % tr.len, st = tr.steps[pos], loop = Math.floor(patStep / tr.len);
          const fire = !!st && !tr.mute && condOk(st, loop) && Math.random() <= (st.ch ?? 1);
          applyLocks(i, fire ? st : null, t);
          if (!fire) return;
          stepNotes(st).forEach(n => trackOn(i, cl(n + tr.transpose, 0, 127), st.v, t, st.len * sd * .92));
        });
        queue.push({ s: patStep, t, pat: S.pat, row: songRow });
        patStep++;
        // Fin du motif : morceau, ou motif mis en attente.
        if (patStep % patternLength() === 0) {
          if (S.songMode && S.song.length) {
            if (++songRep >= S.song[songRow].r) { songRow = (songRow + 1) % S.song.length; songRep = 0; }
            if (S.song[songRow].p !== S.pat) { switchPattern(S.song[songRow].p); patStep = 0; }
          } else if (nextPat != null) { const k = nextPat; nextPat = null; switchPattern(k); patStep = 0; }
        }
      }
      S.tracks.forEach((tr, i) => {
        if (tr.player.type !== 1) return;
        const r = ARP_RATES[tr.player.rate].s;
        if (r < 1) { arpTick(i, t, sd * .4); arpTick(i, t + sd / 2, sd * .4); }
        else if (clockStep % r === 0) arpTick(i, t, sd * r * .8);
      });
      clockTime += sd; clockStep++;
    }
  }, 25);
}
function play() {
  if (!ctx) { toast(L('Allume d\'abord l\'instrument')); return; }
  stopArmed = false; queue = []; patStep = 0;
  if (S.songMode && S.song.length) { songRow = 0; songRep = 0; if (S.song[0].p !== S.pat) switchPattern(S.song[0].p); }
  clockTime = ctx.currentTime + .06; clockStep = 0;
  playing = true; render();
}
function stop() {
  if (!playing || stopArmed) { if (ctx) panicAll(); stopArmed = false; }
  else { stopArmed = true; toast(L('Arrêté · Stop encore pour couper tout le son')); }
  playing = false; queue = []; curSeq = -1;
  for (let i = 0; i < 8; i++) if (lockSig[i]) { lockSig[i] = ''; sendParams(i, null, 0); }
  render();
}
function switchPattern(k) {
  syncPattern(); S.pat = k;
  if (!S.patterns[k]) S.patterns[k] = emptyPattern();
  linkPattern();
  if (S.page * 16 >= T().len) S.page = 0;
  save(); render();
}
// Choix d'un motif : immédiat à l'arrêt, en fin de motif pendant la lecture.
function setPattern(k) {
  if (k === S.pat) { nextPat = null; return; }
  if (playing && !S.songMode) { nextPat = k; toast(L('Motif {p} en attente', { p: PAT_NAMES[k] })); render(); }
  else switchPattern(k);
}

/* ============================ punch-in ============================ */
const PUNCH = [L('Répétition'), L('Roulement'), L('Envers'), L('Arrêt bande'), L('Passe-bas'), L('Passe-haut'), 'Bits', L('Hachoir')];
const PUNCH_DIVS = ['1/4', '1/8', '1/16', '1/32'];
const punchOn = new Map(); // effet -> instant d'appui (ms)
let punchLast = -1;
function punchPress(i) {
  if (!ctx) { toast(L('Allume d\'abord l\'instrument')); return; }
  if (punchOn.has(i)) return;
  punchOn.set(i, performance.now()); punchLast = i;
  punchNode?.port.postMessage({ on: i }); renderSteps();
}
function punchRelease(i) {
  if (!punchOn.has(i)) return;
  punchOn.delete(i);
  if (punchLast === i) punchLast = punchOn.size ? [...punchOn.keys()].pop() : -1;
  punchNode?.port.postMessage({ off: i }); renderSteps();
}
function punchAllOff() { [...punchOn.keys()].forEach(punchRelease); }
addEventListener('blur', punchAllOff);

/* ============================ jeu ============================ */
const liveNotes = new Map();
const heldSteps = new Set(), stepTouched = new Set(), chordStarted = new Set(), stickySteps = new Set();
const latched = Array.from({ length: 8 }, () => new Map()); // note jouée -> note brute (pour l'affichage)
let recLast = { pos: -1, time: 0 };
const pageOffset = () => S.page * 16;
function keyNoteOn(raw, vel) {
  const played = cl(raw + S.oct, 0, 127);
  const t = T();
  if (heldSteps.size) {
    // Pas tenu : la première note remplace celle du pas, les suivantes forment un accord.
    heldSteps.forEach(i => {
      const old = t.steps[i];
      if (!chordStarted.has(i)) { t.steps[i] = { ...(old || step(played)), n: played, v: vel, x: [] }; chordStarted.add(i); }
      else { const st = t.steps[i]; st.x = st.x || []; if (played !== st.n && !st.x.includes(played) && st.x.length < 5) st.x.push(played); }
      stepTouched.add(i);
    });
    save(); renderSteps();
  } else if (playing && rec && ctx && curSeq >= 0) {
    let s = curSeq; if (ctx.currentTime - curSeqTime > stepDur() / 2) s++;
    const pos = s % t.len, st = t.steps[pos];
    // Plusieurs notes jouées ensemble sur le même pas : un accord.
    if (recLast.pos === pos && st && ctx.currentTime - recLast.time < stepDur()) { st.x = st.x || []; if (played !== st.n && !st.x.includes(played) && st.x.length < 5) st.x.push(played); }
    else t.steps[pos] = step(played, vel, 1);
    recLast = { pos, time: ctx.currentTime }; S.selStep = pos; save(); renderSteps();
  }
  if (!ctx) return;
  const n = cl(played + t.transpose, 0, 127), ti = S.track;
  if (t.player.latch) {
    // Latch : la note reste tenue ; la rejouer la relâche.
    if (latched[ti].has(n)) { latched[ti].delete(n); trackOff(ti, n, 0); kbSet(played, false); return; }
    latched[ti].set(n, played);
  }
  liveNotes.set(raw, { track: ti, n, latch: !!t.player.latch });
  trackOn(ti, n, vel, 0, 0); kbSet(played, true);
}
function keyNoteOff(raw) {
  const l = liveNotes.get(raw); if (!l) return;
  liveNotes.delete(raw);
  if (l.latch) return;
  trackOff(l.track, l.n, 0); kbSet(cl(raw + S.oct, 0, 127), false);
}
function releaseLatched(i) {
  latched[i].forEach((played, n) => { trackOff(i, n, 0); kbSet(played, false); });
  latched[i].clear();
}

/* ============================ touches OP-XY ============================ */
const MODE_KEYS = ['instrument', 'auxiliary', 'arrange', 'mix', 'tempo', 'players', 'projects', 'bar', 'punch'];
const MODE_NAMES = { instrument: 'Instrument', auxiliary: 'Auxiliary', arrange: 'Arrange', mix: 'Mix', tempo: 'Tempo', players: 'Players', projects: 'Projects', bar: 'Bar', punch: 'Punch' };
const KEYS = [
  [L('Modes'), [['instrument', 'Instrument'], ['auxiliary', 'Auxiliary'], ['arrange', 'Arrange'], ['mix', 'Mix']]],
  [L('Sous-pages'), [['m1', 'M1'], ['m2', 'M2'], ['m3', 'M3'], ['m4', 'M4']]],
  [L('Pistes'), [1, 2, 3, 4, 5, 6, 7, 8].map(i => ['t' + i, L('Piste ') + i])],
  ['Transport', [['record', 'Record'], ['play', 'Play'], ['stop', 'Stop'], ['fill', 'Fill']]],
  [L('Fonctions'), [['sample', 'Sample'], ['projects', 'Projects'], ['tempo', 'Tempo'], ['com', 'Com'], ['players', 'Players'], ['bar', 'Bar'], ['punch', 'Punch']]],
  [L('Pas'), Array.from({ length: 16 }, (_, i) => ['s' + (i + 1), L('Pas ') + (i + 1)])],
  [L('Encodeurs (CC 1 à 4 par défaut)'), [1, 2, 3, 4].map(i => ['e' + i, L('Encodeur ') + i + L(' (à tourner)')])],
];
const KEY_LABEL = {}, KEY_ORDER = [];
KEYS.forEach(([, ks]) => ks.forEach(([id, l]) => { KEY_LABEL[id] = l; KEY_ORDER.push(id); }));

function setMode(m) {
  if (m === 'bar' && S.mode === 'bar') { extendBar(); return; }
  S.mode = m; S.sub = 0; render();
}
function keyDown(id) {
  flashKey(id);
  if (MODE_KEYS.includes(id)) { setMode(id); return; }
  if (/^m[1-4]$/.test(id)) { mKey(+id[1] - 1); return; }
  if (/^t[1-8]$/.test(id)) { trackKey(+id.slice(1) - 1); return; }
  if (/^s\d+$/.test(id)) {
    const k = +id.slice(1) - 1;
    if (S.mode === 'punch') { if (k < 8) punchPress(k); return; }
    stepDown(pageOffset() + k); return;
  }
  if (id === 'play') { play(); return; }
  if (id === 'stop') { stop(); return; }
  if (id === 'record') { rec = !rec; render(); return; }
  if (id === 'fill') { setFill(true); return; }
  toast(KEY_LABEL[id] + L(' : pas dans LAB_XY'));
}
function keyUp(id) {
  if (/^s\d+$/.test(id)) { const k = +id.slice(1) - 1; if (punchOn.has(k)) punchRelease(k); else stepUp(pageOffset() + k); }
  if (id === 'fill') setFill(false);
}
function setFill(on) { fillOn = on; $('kFill')?.classList.toggle('lit', on); $('kFill')?.classList.toggle('down', on); }
function trackKey(i) {
  if (S.mode === 'mix' && i === S.track) {
    S.tracks[i].mute = !S.tracks[i].mute; if (S.tracks[i].mute) panicTrack(i); pushTrack(i);
    toast(L('Piste ') + (i + 1) + (S.tracks[i].mute ? L(' coupée') : L(' rétablie'))); render(); return;
  }
  releaseSteps();
  S.track = i; if (S.page * 16 >= T().len) S.page = 0; render();
}
function mKey(k) {
  if (S.mode === 'projects') { projectAction(k); return; }
  // Pas tenu + touche de la page affichée : efface les p-locks de cette page.
  if (heldSteps.size && S.mode === 'instrument' && k === S.sub && k < 2) {
    const keys = page().encs.filter(d => d?.lockKey).map(d => d.lockKey);
    let n = 0;
    heldSteps.forEach(j => { const st = T().steps[j]; if (!st?.locks) return; keys.forEach(key => { if (key in st.locks) { delete st.locks[key]; n++; } }); if (!Object.keys(st.locks).length) delete st.locks; stepTouched.add(j); });
    lockSig[S.track] = ''; save(); toast(L('{n} p-lock(s) effacé(s)', { n })); render(); return;
  }
  if (S.mode === 'arrange' && k === S.sub && k === 2) { copyPattern(); return; }
  if (S.mode === 'arrange' && k === S.sub && k === 3) { clearPattern(); return; }
  S.sub = k; render();
}
function stepDown(i) {
  const t = T(); if (i >= t.len) return;
  S.selStep = i; heldSteps.add(i);
  if (!t.steps[i]) { t.steps[i] = step(lastNote(), .8, 1); stepTouched.add(i); }
  save(); renderSteps(); if (S.mode === 'instrument' && S.sub === 3) renderEncs();
}
function stepUp(i) {
  if (!heldSteps.has(i)) return; heldSteps.delete(i); stickySteps.delete(i); chordStarted.delete(i);
  if (!stepTouched.has(i)) T().steps[i] = null;
  stepTouched.delete(i); save(); render();
}
// Maj+clic (ou clic droit) sur un pas à l'écran : il reste tenu jusqu'au prochain Maj+clic.
function toggleSticky(i) {
  if (stickySteps.has(i)) { stepTouched.add(i); stepUp(i); }
  else { stickySteps.add(i); stepDown(i); stepTouched.add(i); }
}
function releaseSteps() { [...heldSteps].forEach(i => { stepTouched.add(i); stepUp(i); }); }
function lastNote() { const t = T(); const st = t.steps.find(Boolean); return st ? st.n : (t.engine === 'b:drums' ? 36 : 48); }
function extendBar() {
  const t = T(); if (t.len >= MAX_STEPS) { toast(L('64 pas maximum')); return; }
  for (let k = 0; k < 16; k++) t.steps[t.len + k] = t.steps[t.len - 16 + k] ? { ...t.steps[t.len - 16 + k] } : null;
  t.len += 16; S.page = t.len / 16 - 1; save(); toast(L('Mesure dupliquée : ') + t.len + L(' pas')); render();
}

/* ============================ projets ============================ */
function projects() { try { return JSON.parse(localStorage.getItem('xy-projects') || '[]'); } catch (e) { return []; } }
function storeProjects(list) { try { localStorage.setItem('xy-projects', JSON.stringify(list)); } catch (e) { toast(L('Stockage du navigateur plein')); } }
function snapshot() { syncPattern(); const c = JSON.parse(JSON.stringify(S)); delete c.projectIdx; return c; }
function applyProject(data) {
  if (!data || data.v !== 2 || data.tracks?.length !== 8) throw new Error(L('format inconnu'));
  panicAll(); playing = false;
  const keep = S.projectIdx;
  S = migrate({ ...defaultState(), patterns: null, song: [], ...data, projectIdx: keep, mode: 'projects', sub: 0 });
  linkPattern(); nextPat = null;
  S.tracks.forEach((t, i) => buildNode(i));
  applyFx(); save(); render();
}
function projectAction(k) {
  const list = projects(), idx = S.projectIdx;
  if (k === 0) { // charger
    if (!list[idx]) { toast(L('Choisis un projet avec l\'encodeur 1')); return; }
    try { applyProject(list[idx].data); toast(list[idx].name + L(' chargé')); } catch (e) { toast(L('Projet illisible : ') + e.message); }
  } else if (k === 1) { // sauver
    const name = list[idx]?.name || L('Projet ') + (list.length + 1);
    const entry = { name, date: new Date().toISOString(), data: snapshot() };
    if (list[idx]) list[idx] = entry; else { list.push(entry); S.projectIdx = list.length - 1; }
    storeProjects(list); toast(name + L(' sauvé')); render();
  } else if (k === 2) { // nouveau
    const fresh = defaultState();
    fresh.tracks = fresh.tracks.map((t, i) => newTrack(i < 4 ? 'b:drums' : t.engine));
    fresh.patterns = null;
    applyProject(fresh); S.projectIdx = projects().length; toast(L('Nouveau projet')); render();
  } else { // exporter
    const name = (list[idx]?.name || 'lab-xy').replace(/[^\w-]+/g, '-');
    const blob = new Blob([JSON.stringify({ kind: 'xy-studio-project', ...snapshot() }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast(L('Projet exporté'));
  }
}
$('fileIn').addEventListener('change', async () => {
  const f = $('fileIn').files[0]; if (!f) return;
  try {
    if (f.size > 2e6) throw new Error(L('fichier trop gros'));
    const data = JSON.parse(await f.text()); delete data.kind;
    applyProject(data);
    const list = projects(); list.push({ name: f.name.replace(/\.json$/, ''), date: new Date().toISOString(), data: snapshot() });
    storeProjects(list); S.projectIdx = list.length - 1; toast(L('Projet importé')); render();
  } catch (e) { toast(L('Import refusé : ') + e.message); }
  finally { $('fileIn').value = ''; }
});

/* ============================ pages des encodeurs ============================ */
function cont(label, get, set, fmt) { return { label, norm: get, text: () => fmt(get()), add: t => set(cl(get() + t / 100)) }; }
function ints(label, get, set, min, max, fmt) { return { label, int: true, norm: () => max === min ? 0 : (get() - min) / (max - min), text: () => fmt(get()), add: t => set(cl(Math.round(get() + t), min, max)) }; }
const pct = v => Math.round(v * 100) + ' %';
const sec = s => s < 1 ? Math.round(s * 1000) + ' ms' : s.toFixed(2) + ' s';
const hz = f => f < 1000 ? Math.round(f) + ' Hz' : (f / 1000).toFixed(1) + ' kHz';
const signed = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v);
function fmtBuiltin(id, i, v) {
  if (id === 'b:analog') { if (i === 1) return Math.round(v * 40) + ' ct'; if (i === 2) return hz(40 * Math.pow(2, v * 9)); }
  if (id === 'b:fm') { if (i === 0) return '×' + RATIOS[Math.min(7, Math.floor(v * 8))]; if (i === 3) return hz(150 * Math.pow(2, v * 7)); }
  return pct(v);
}
// Les emplacements de paramètres d'une machine affichés sur la page (positions 0–3).
function machineSlots(m, second) {
  const ps = m.controls.parameters, pos = m.controls.positions;
  return [0, 1, 2, 3].map(k => {
    const s = ps.findIndex((p, j) => pos[j] === k && (second ? j >= 4 : j < 4) && !p.absent);
    return s < 0 ? null : s;
  });
}
function hasPage2() { const r = R[S.track]; return !!(r.machine && machineSlots(r.machine, true).some(s => s !== null)); }
// Pendant qu'un pas est tenu, un paramètre de son se lit et s'écrit dans les p-locks de ce pas.
const heldLockStep = () => heldSteps.size ? T().steps[[...heldSteps][0]] || null : null;
function lockable(key, get, set) {
  return [
    () => { const v = heldLockStep()?.locks?.[key]; return v ?? get(); },
    v => {
      if (!heldSteps.size) { set(v); return; }
      heldSteps.forEach(j => { const st = T().steps[j]; if (!st) return; (st.locks = st.locks || {})[key] = v; stepTouched.add(j); });
      lockSig[S.track] = ''; save(); renderSteps();
    }];
}
const lockMark = key => heldLockStep()?.locks?.[key] != null ? ' •' : '';
function lockCont(key, label, get, set, fmt) {
  const [g, s2] = lockable(key, get, set);
  return { ...cont(label + lockMark(key), g, s2, fmt), lockKey: key };
}
function machineDesc(i, slot) {
  const r = R[i], m = r.machine, p = m.controls.parameters[slot], t = S.tracks[i], key = 'm:' + p.id;
  const [get, set] = lockable(key, () => t.mv[p.id], v => { t.mv[p.id] = v; pushTrack(i); });
  const text = () => m.controls.displayValue(p.id, { ...machineValues(t, m), [p.id]: get() });
  const label = p.label + lockMark(key);
  if (p.mapping?.kind === 'enum') {
    const count = p.mapping.labels.length;
    return { label, lockKey: key, int: true, norm: get, text, add: d => { const idx = cl(Math.floor(get() * count) + d, 0, count - 1); set((idx + .5) / count); } };
  }
  return { label, lockKey: key, norm: get, text, add: d => set(cl(get() + d / 100)) };
}
function page() {
  const t = T(), i = S.track, tp = () => pushTrack(i);
  const nil = [null, null, null, null];
  switch (S.mode) {
    case 'instrument': {
      const mach = isMachine(t.engine), drums = t.engine === 'b:drums';
      const subs = [mach ? 'Machine' : L('Son'), mach ? (hasPage2() ? 'Page 2' : '—') : drums ? '—' : L('Enveloppe'), L('Piste'), L('Pas')];
      let encs = nil, msg = '';
      if (S.sub === 0 || (S.sub === 1 && mach)) {
        if (mach) {
          const r = R[i];
          if (!r.machine) msg = r.error ? L('Machine indisponible : ') + r.error : L('Chargement de la machine…');
          else { const slots = machineSlots(r.machine, S.sub === 1); encs = slots.map(s => s === null ? null : machineDesc(i, s)); }
        } else if (S.sub === 0) {
          const b = engineInfo(t.engine);
          encs = [0, 1, 2, 3].map(k => lockCont('p' + k, b.params[k], () => T().p[k], v => { T().p[k] = v; tp(); }, v => fmtBuiltin(T().engine, k, v)));
        }
      } else if (S.sub === 1 && !drums) {
        const names = [L('Attaque'), L('Déclin'), L('Maintien'), L('Relâche')], F = [v => sec(envA(v)), v => sec(envD(v)), pct, v => sec(envR(v))];
        encs = [0, 1, 2, 3].map(k => lockCont('e' + k, names[k], () => T().env[k], v => { T().env[k] = v; tp(); }, F[k]));
      } else if (S.sub === 2) {
        encs = [
          ints(L('Moteur'), () => Math.max(0, ENGINE_LIST.indexOf(T().engine)), v => queueEngine(i, ENGINE_LIST[v]), 0, ENGINE_LIST.length - 1, v => engineName(ENGINE_LIST[v] || '')),
          ints(L('Transposition'), () => T().transpose, v => { T().transpose = v; save(); }, -24, 24, v => signed(v) + ' dt'),
          cont(L('Niveau'), () => T().vol, v => { T().vol = v; tp(); }, pct),
          cont(L('Envoi délai'), () => T().send, v => { T().send = v; tp(); }, pct)];
      } else if (S.sub === 3) {
        const st = () => T().steps[S.selStep];
        if (!st()) msg = L('Pas ') + (S.selStep + 1) + L(' vide. Touche un pas pour le créer, puis règle-le ici.');
        else {
          const nl = Object.keys(st().locks || {}).length;
          msg = (st().x?.length ? L('Accord de {n} notes. ', { n: st().x.length + 1 }) : '') + (nl ? L('{n} p-lock(s). ', { n: nl }) : '') + L('Tiens un pas et tourne un encodeur de son pour un p-lock.');
          encs = [
            ints('Note', () => st().n, v => { const d = v - st().n; st().n = v; if (st().x) st().x = st().x.map(n => cl(n + d, 0, 127)); save(); renderSteps(); }, 0, 127, n => (drums ? DRUM_NAMES[n % 12] : noteName(n)) + (st().x?.length ? ' +' + st().x.length : '')),
            cont(L('Vélocité'), () => st().v, v => { st().v = Math.max(.05, v); save(); }, pct),
            ints(L('Longueur'), () => Math.max(0, LENS.indexOf(st().len)), v => { st().len = LENS[v]; save(); }, 0, LENS.length - 1, k => LENS[k] + L(' pas')),
            ints(L('Condition'), () => st().cond || 0, v => { st().cond = v; st().ch = 1; save(); renderSteps(); }, 0, CONDS.length - 1, k => CONDS[k].l)];
        }
      } else msg = L('Rien sur cette sous-page pour ce moteur.');
      return { subs, encs, msg };
    }
    case 'auxiliary':
      return { subs: [L('Délai'), '—', '—', '—'], msg: S.sub ? L('Rien sur cette sous-page.') : '', encs: S.sub ? nil : [
        ints('Division', () => S.fx.div, v => { S.fx.div = v; applyFx(); }, 0, DIVS.length - 1, k => DIVS[k].l),
        cont(L('Retour'), () => S.fx.fb, v => { S.fx.fb = v; applyFx(); }, pct),
        cont('Mix', () => S.fx.mix, v => { S.fx.mix = v; applyFx(); }, pct),
        cont(L('Tonalité'), () => S.fx.tone, v => { S.fx.tone = v; applyFx(); }, v => hz(400 * Math.pow(2, v * 5.5)))] };
    case 'mix': {
      const subs = [L('Piste'), L('Pistes 1–4'), L('Pistes 5–8'), '—'];
      if (S.sub === 0) return { subs, msg: L('Rappuie sur la piste sélectionnée pour la couper ou la rétablir.'), encs: [
        cont('Volume', () => T().vol, v => { T().vol = v; tp(); }, pct),
        cont(L('Panoramique'), () => (T().pan + 1) / 2, v => { T().pan = v * 2 - 1; tp(); }, v => { const p = Math.round(v * 200 - 100); return p === 0 ? L('centre') : (p < 0 ? 'G ' : 'D ') + Math.abs(p); }),
        cont(L('Envoi délai'), () => T().send, v => { T().send = v; tp(); }, pct),
        cont(L('Général'), () => S.master, v => { S.master = v; applyFx(); }, pct)] };
      if (S.sub < 3) { const o = (S.sub - 1) * 4; return { subs, msg: L('Rappuie sur la piste sélectionnée pour la couper ou la rétablir.'), encs: [0, 1, 2, 3].map(k => cont(L('Piste ') + (o + k + 1), () => S.tracks[o + k].vol, v => { S.tracks[o + k].vol = v; pushTrack(o + k); }, pct)) }; }
      return { subs, encs: nil };
    }
    case 'tempo':
      return { subs: ['Tempo', '—', '—', '—'], encs: S.sub ? nil : [
        ints('BPM', () => S.bpm, v => { S.bpm = v; applyFx(); renderBar(); }, 40, 240, String),
        cont('Swing', () => S.swing / .5, v => { S.swing = v * .5; save(); }, pct),
        ints(L('Métronome'), () => S.metro, v => { S.metro = v; save(); }, 0, 1, v => v ? L('oui') : L('non')), null] };
    case 'players': {
      const pl = t.player;
      const type = ints('Player', () => pl.type, v => { panicTrack(i); pl.type = v; save(); }, 0, 2, v => [L('Aucun'), L('Arpège'), L('Accord')][v]);
      const psubs = ['Player', 'Latch', '—', '—'];
      if (S.sub === 1) return { subs: psubs, msg: L('Latch : les notes jouées restent tenues ; rejoue une note pour la relâcher. Idéal pour les drones.'), encs: [
        ints('Latch', () => pl.latch, v => { pl.latch = v; if (!v) releaseLatched(i); save(); }, 0, 1, v => v ? L('oui') : L('non')), null, null, null] };
      if (S.sub) return { subs: psubs, encs: nil, msg: L('Rien sur cette sous-page.') };
      if (pl.type === 1) return { subs: ['Player', 'Latch', '—', '—'], msg: L('Joue ou tiens des notes : l\'arpège suit le tempo, lecture ou non.'), encs: [type,
        ints(L('Forme'), () => pl.shape % ARP_SHAPES.length, v => { pl.shape = v; save(); }, 0, ARP_SHAPES.length - 1, k => ARP_SHAPES[k]),
        ints(L('Vitesse'), () => pl.rate, v => { pl.rate = v; save(); }, 0, ARP_RATES.length - 1, k => ARP_RATES[k].l),
        ints('Octaves', () => pl.range, v => { pl.range = v; save(); }, 1, 3, String)] };
      if (pl.type === 2) return { subs: ['Player', 'Latch', '—', '—'], encs: [type,
        ints(L('Accord'), () => pl.shape % CHORDS.length, v => { pl.shape = v; save(); }, 0, CHORDS.length - 1, k => CHORDS[k][0]),
        ints(L('Renversement'), () => pl.inv, v => { pl.inv = v; save(); }, 0, 2, String), null] };
      return { subs: ['Player', 'Latch', '—', '—'], encs: [type, null, null, null], msg: L('Choisis Arpège ou Accord avec l\'encodeur 1.') };
    }
    case 'projects': {
      const list = projects();
      return { subs: [L('Charger'), L('Sauver'), L('Nouveau'), L('Exporter')], actions: true, encs: [
        ints(L('Projet'), () => S.projectIdx, v => { S.projectIdx = v; save(); }, 0, list.length, k => list[k]?.name || L('nouveau')), null, null, null],
        msg: L('M1 charge, M2 sauve, M3 repart de zéro, M4 exporte en fichier.') };
    }
    case 'bar':
      return { subs: [L('Longueur'), '—', '—', '—'], msg: L('Appuie encore sur Bar pour dupliquer la dernière mesure.'), encs: S.sub ? nil : [
        ints(L('Longueur'), () => T().len / 16, v => { T().len = v * 16; if (S.page >= v) S.page = v - 1; save(); renderSteps(); }, 1, 4, v => v * 16 + L(' pas')),
        ints('Page', () => S.page, v => { S.page = v; save(); renderSteps(); }, 0, T().len / 16 - 1, v => (v + 1) + ' / ' + T().len / 16),
        ints(L('Suivre'), () => S.follow, v => { S.follow = v; save(); }, 0, 1, v => v ? L('oui') : L('non')), null] };
    case 'punch':
      return { subs: [L('Effets'), '—', '—', '—'], msg: L('Tiens les pas 1 à 8, ou les touches 1 à 8 du clavier, pour jouer les effets sur tout le son.'), encs: S.sub ? nil : [
        ints('Division', () => S.punch.div, v => { S.punch.div = v; applyFx(); }, 0, 3, k => PUNCH_DIVS[k]),
        cont(L('Résonance'), () => S.punch.res, v => { S.punch.res = v; applyFx(); }, pct),
        cont('Bits', () => S.punch.bits, v => { S.punch.bits = v; applyFx(); }, v => (2 + Math.round((1 - v) * 8)) + ' bits'),
        cont(L('Arrêt bande'), () => S.punch.tape, v => { S.punch.tape = v; applyFx(); }, v => sec(.25 + v * 2.25))] };
    case 'arrange': {
      const subs = [L('Motifs'), L('Morceau'), L('Copier'), L('Effacer')];
      const playMode = ints(L('Lecture'), () => S.songMode, v => { S.songMode = v; nextPat = null; save(); }, 0, 1, v => v ? L('Morceau') : L('Boucle'));
      if (S.sub === 0) return { subs, msg: L('Pendant la lecture, le motif choisi démarre à la fin du motif en cours.'), encs: [
        ints(L('Motif'), () => nextPat ?? S.pat, v => setPattern(v), 0, PATTERNS - 1, k => PAT_NAMES[k] + (patternUsed(k) || k === S.pat ? '' : ' ' + L('vide'))),
        playMode, null, null] };
      if (S.sub === 1) {
        arrRow = Math.min(arrRow, S.song.length);
        const row = () => S.song[arrRow];
        return { subs, msg: L('Ligne « + » puis encodeur 2 pour ajouter un motif ; répétitions à 0 pour retirer la ligne.'), encs: [
          ints(L('Ligne'), () => arrRow, v => { arrRow = v; }, 0, S.song.length, k => k < S.song.length ? String(k + 1) : '+'),
          ints(L('Motif'), () => row()?.p ?? S.pat, v => { if (row()) row().p = v; else { S.song.push({ p: v, r: 1 }); } save(); }, 0, PATTERNS - 1, k => PAT_NAMES[k]),
          ints(L('Répétitions'), () => row()?.r ?? 1, v => { if (!row()) return; if (v === 0) { S.song.splice(arrRow, 1); } else row().r = v; save(); }, 0, 16, v => v ? '×' + v : L('retirer')),
          playMode] };
      }
      if (S.sub === 2) return { subs, msg: L('Appuie encore sur M3 pour copier le motif {a} vers {b}.', { a: PAT_NAMES[S.pat], b: PAT_NAMES[copyTo] }), encs: [
        ints(L('Vers'), () => copyTo, v => { copyTo = v; }, 0, PATTERNS - 1, k => PAT_NAMES[k] + (patternUsed(k) ? ' ' + L('(rempli)') : '')), null, null, null] };
      return { subs, encs: nil, msg: L('Appuie encore sur M4 pour effacer le motif {a}.', { a: PAT_NAMES[S.pat] }) };
    }
    default:
      return { subs: ['—', '—', '—', '—'], encs: nil, msg: MODE_NAMES[S.mode] + L(' n\'est pas dans LAB_XY.') };
  }
}
let arrRow = 0, copyTo = 1;
function copyPattern() {
  if (copyTo === S.pat) return;
  syncPattern(); S.patterns[copyTo] = JSON.parse(JSON.stringify(S.patterns[S.pat]));
  save(); toast(L('Motif {a} copié vers {b}', { a: PAT_NAMES[S.pat], b: PAT_NAMES[copyTo] })); render();
}
function clearPattern() {
  S.patterns[S.pat] = emptyPattern(); linkPattern();
  save(); toast(L('Motif {a} effacé', { a: PAT_NAMES[S.pat] })); render();
}
let engineTimer = 0;
function queueEngine(i, id) { // l'encodeur fait défiler les moteurs : on charge quand il s'arrête
  S.tracks[i].engine = id; render();
  clearTimeout(engineTimer);
  engineTimer = setTimeout(() => { S.tracks[i].engine = '__'; setEngine(i, id); }, 350);
}

/* ============================ encodeurs ============================ */
// CC des encodeurs : 1 à 4 par défaut (OP-XY), réassociables pour un autre contrôleur.
const encCC = k => { const v = keymap['e' + (k + 1)]; return v == null ? k + 1 : v; };
const encAcc = [0, 0, 0, 0];
// Décodage des encodeurs. Selon le contrôleur, un cran envoie :
//  - relatif « complément à deux » : 1..63 = +n, 65..127 = -(128-n) (127 = -1) ;
//  - relatif « 1 / 0 » : 1 = +1, 0 = -1 ;
//  - absolu : une position 0..127, dont on prend l'écart avec la précédente.
// En automatique, le mode n'est jamais figé sur une seule valeur : il suit les indices des derniers messages.
let encMode = (() => { try { return localStorage.getItem('xy-encmode') || 'auto'; } catch (e) { return 'auto'; } })();
const encState = {};
function encDelta(cc, v) {
  const s = encState[cc] || (encState[cc] = { guess: 'rel', last: null, absVotes: 0, relVotes: 0, seen: [] });
  const last = s.last;
  s.seen.push(v); if (s.seen.length > 12) s.seen.shift();
  let mode = encMode;
  if (mode === 'auto') {
    if (last != null) {
      const gap = Math.abs(v - last);
      // Positions voisines au milieu de la course : signe d'un encodeur absolu.
      if (v >= 8 && v <= 119 && last >= 8 && last <= 119 && gap >= 1 && gap <= 6) s.absVotes++;
      // Glissement régulier vers une butée (…, 124, 125, 126, 127 ou 3, 2, 1, 0) : absolu aussi.
      else if (gap === 1 && (v <= 7 || v >= 120) && s.seen.length >= 3 && Math.abs(s.seen[s.seen.length - 3] - last) === 1) s.absVotes++;
      // Même petite valeur répétée, ou saut de plus de 64 (1 puis 127) : signe d'un encodeur relatif.
      // Mais un encodeur absolu en butée répète aussi 0 ou 127 : on n'en tient pas compte s'il est déjà reconnu absolu.
      const atStop = s.guess === 'abs' && v === last && (v === 0 || v === 127);
      if (!atStop && ((v === last && (v <= 7 || v >= 120)) || gap > 64)) s.relVotes++;
    }
    if (s.absVotes >= 3 && s.absVotes > s.relVotes * 2) s.guess = 'abs';
    else if (s.relVotes >= 2 && s.relVotes > s.absVotes) s.guess = 'rel';
    // Les votes vieillissent, pour suivre un changement de contrôleur.
    if (s.absVotes + s.relVotes > 24) { s.absVotes >>= 1; s.relVotes >>= 1; }
    mode = s.guess;
    // Pas encore d'avis et une valeur de milieu de course : sans doute un encodeur absolu qui démarre.
    // On attend un message de plus plutôt que de faire un grand saut.
    if (mode === 'rel' && s.relVotes === 0 && v >= 8 && v <= 119) { s.last = v; s.mode = '?'; return 0; }
  }
  s.last = v; s.mode = mode;
  if (mode === 'abs') {
    if (last == null) return 0;
    // En butée, certains contrôleurs renvoient la même valeur : on continue dans ce sens.
    if (v === last) return v === 0 ? -1 : v === 127 ? 1 : 0;
    return v - last;
  }
  if (mode === 'rel01') return v === 0 ? -1 : v < 64 ? v : v - 128;
  // relatif complément à deux ; 0 n'existe pas dans ce codage, on le lit comme -1 (variante 1 / 0).
  return v === 0 ? -1 : v < 64 ? v : v - 128;
}
function encDebug() {
  return [0, 1, 2, 3].map(k => { const st = encState[encCC(k)]; return (k + 1) + ': ' + (st ? st.seen.slice(-6).join(' ') + ' → ' + st.mode : '—'); }).join('   ');
}
function turn(k, ticks) {
  const d = page().encs[k]; if (!d || !ticks) return;
  if (d.int) { encAcc[k] += ticks; const w = Math.trunc(encAcc[k]); if (w) { d.add(w); encAcc[k] -= w; } }
  else d.add(ticks);
  renderEncs();
}

/* ============================ écran ============================ */
const SCREEN_FONT = `font-family="Figtree, system-ui, sans-serif"`;
function headerSvg(pg, override) {
  let s = `<rect width="480" height="20" fill="#0d0e10"/>`;
  for (let k = 0; k < 4; k++) {
    const d = pg.encs[k], x = k * 120;
    if (k) s += `<rect x="${x}" y="3" width="1" height="14" fill="#2b2d31"/>`;
    s += `<circle cx="${x + 7}" cy="10" r="2.2" fill="${d ? ACC : '#2b2d31'}"/>`;
    if (!d) continue;
    s += `<text x="${x + 13}" y="13.5" font-size="9" fill="#7f7b89" ${SCREEN_FONT}>${esc(d.label.toLowerCase().slice(0, 12))}</text>`;
    s += `<text x="${x + 114}" y="13.5" font-size="9.5" fill="#f2f3f4" text-anchor="end" ${SCREEN_FONT}>${esc((override?.[k] || d.text()).slice(0, 12))}</text>`;
  }
  return s;
}
function bigTitle(a, b) {
  return `<text x="24" y="52" font-size="13" fill="${ACC}" ${SCREEN_FONT}>${esc(String(a).toLowerCase())}</text><text x="24" y="86" font-size="30" font-weight="300" fill="#f2f3f4" ${SCREEN_FONT}>${esc(b)}</text>`;
}
function scope(i) {
  if (!ctx) return `<text x="240" y="130" font-size="10" fill="#555a60" text-anchor="middle" ${SCREEN_FONT}>${esc(L("allume l'instrument pour entendre"))}</text>`;
  const c = chain[i]; c.an.getFloatTimeDomainData(c.buf);
  let start = 0; for (let k = 1; k < 512; k++) if (c.buf[k - 1] < 0 && c.buf[k] >= 0) { start = k; break; }
  const pts = []; for (let k = 0; k < 160; k++) { const v = c.buf[start + k * 3] || 0; pts.push(`${(24 + k * 432 / 159).toFixed(1)},${(150 - cl(v, -1, 1) * 55).toFixed(1)}`); }
  return `<path d="M24 150H456" stroke="#1d1f23"/><polyline points="${pts.join(' ')}" fill="none" stroke="#f2f3f4" stroke-width="1.4"/>`;
}
function envGlyph(t) {
  const [a, d, s, r] = t.env, x0 = 24, w = 432, A = 40 + a * 90, D = 40 + d * 90, Sw = 80, Rr = 40 + r * 90, tot = A + D + Sw + Rr, k = w / tot;
  const y0 = 205, h = 100, ys = y0 - h * s;
  const pts = [[x0, y0], [x0 + A * k, y0 - h], [x0 + (A + D) * k, ys], [x0 + (A + D + Sw) * k, ys], [x0 + tot * k, y0]];
  return `<polyline points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${ACC}" stroke-width="2"/>` +
    pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="#f2f3f4"/>`).join('');
}
function drumPads() {
  const now = performance.now(); let s = '';
  for (let k = 0; k < 12; k++) {
    const col = k % 6, row = Math.floor(k / 6), x = 24 + col * 73, y = 46 + row * 82, age = (now - hits[k]) / 250, lit = age < 1 ? 1 - age : 0;
    const fill = lit ? ACC : '#121316';
    s += `<rect x="${x}" y="${y}" width="66" height="72" rx="3" fill="${fill}" fill-opacity="${lit ? (.3 + .7 * lit).toFixed(2) : 1}" stroke="#25242b"/>`;
    s += `<text x="${x + 6}" y="${y + 14}" font-size="7.5" fill="${lit > .5 ? ONACC : '#8b9096'}" ${SCREEN_FONT}>${esc(NN[k])}</text>`;
    const words = DRUM_NAMES[k].split(' ');
    words.forEach((w, j) => s += `<text x="${x + 6}" y="${y + 50 + j * 11}" font-size="8" fill="${lit > .5 ? ONACC : '#d6d8db'}" ${SCREEN_FONT}>${esc(w)}</text>`);
  }
  return s;
}
function patternGlyph(t) {
  const notes = t.steps.slice(0, t.len).filter(Boolean).map(s => s.n);
  const lo = notes.length ? Math.min(...notes) : 48, hi = notes.length ? Math.max(...notes) : 60, span = Math.max(12, hi - lo + 1);
  const w = 432 / t.len; let s = `<rect x="24" y="100" width="432" height="100" fill="#0d0e10"/>`;
  t.steps.slice(0, t.len).forEach((st, k) => {
    const x = 24 + k * w;
    if (k % 16 === 0) s += `<rect x="${x.toFixed(1)}" y="100" width="1" height="100" fill="#2b2d31"/>`;
    if (!st) return;
    const y = 196 - ((st.n - lo) / span) * 92;
    s += `<rect x="${(x + 1).toFixed(1)}" y="${(y - 3).toFixed(1)}" width="${Math.max(2, w * st.len - 2).toFixed(1)}" height="5" fill="${k === S.selStep ? ACC : '#f2f3f4'}" opacity="${(.35 + .65 * st.v).toFixed(2)}"/>`;
  });
  if (playing && curSeq >= 0) { const x = 24 + (curSeq % t.len) * w; s += `<rect x="${x.toFixed(1)}" y="100" width="${w.toFixed(1)}" height="100" fill="${ACC}" opacity=".15"/>`; }
  return s;
}
/* écran du mode Punch : l'effet tenu en dernier occupe l'écran, les 8 pads en bas */
const outBuf = new Float32Array(2048);
function outWave(count, from = 0) {
  if (!outAn) return new Array(count).fill(0);
  outAn.getFloatTimeDomainData(outBuf);
  let start = 0; for (let k = 1; k < 1024; k++) if (outBuf[k - 1] < 0 && outBuf[k] >= 0) { start = k; break; }
  return Array.from({ length: count }, (_, k) => outBuf[Math.min(2047, start + from + k * 4)] || 0);
}
const poly = (pts, color, w = 1.4) => `<polyline points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="${color}" stroke-width="${w}"/>`;
const INK = '#ebe8ef', DIM = '#25242b';
function punchVisual(fx, t) {
  const beat = 60 / S.bpm, seg = beat / [1, 2, 4, 8][S.punch.div];
  let s = '';
  const wave = outWave(160);
  const scopeAt = (y0, h, color = INK, flip = false) => poly(wave.map((v, k) => [flip ? 456 - k * 2.7 : 24 + k * 2.7, y0 - cl(v * 2.2, -1, 1) * h]), color);
  switch (fx) {
    case 0: { // Répétition : la même tranche rejouée, la tête avance de bloc en bloc
      const n = [4, 8, 16, 32][S.punch.div] > 16 ? 16 : [4, 8, 16, 32][S.punch.div], cur = Math.floor(t / seg) % n, ph = (t % seg) / seg, w = 432 / n;
      for (let k = 0; k < n; k++) s += `<rect x="${(24 + k * w + 1).toFixed(1)}" y="128" width="${(w - 2).toFixed(1)}" height="34" fill="${k === cur ? ACC : '#1d1f23'}"/>`;
      s += `<rect x="${(24 + (cur + ph) * w).toFixed(1)}" y="124" width="2" height="42" fill="${INK}"/>` + scopeAt(80, 36); break;
    }
    case 1: { // Roulement : les tranches se divisent de plus en plus vite
      const level = Math.min(4, Math.floor(t / (beat / 2))), n = 2 << level, w = 432 / n, cur = Math.floor((t % (beat / 2)) / (beat / 2) * n);
      for (let k = 0; k < n; k++) s += `<rect x="${(24 + k * w + .5).toFixed(1)}" y="${70 + (n > 16 ? 0 : 10)}" width="${Math.max(1, w - 1).toFixed(1)}" height="${(90 - level * 6).toFixed(0)}" fill="${k <= cur ? ACC : '#1d1f23'}" opacity="${k <= cur ? (0.4 + 0.6 * (k + 1) / n).toFixed(2) : 1}"/>`;
      s += `<text x="456" y="56" font-size="10" fill="${ACC}" text-anchor="end" ${SCREEN_FONT}>1/${n * 2}</text>`; break;
    }
    case 2: { // Envers : forme d'onde lue de droite à gauche, flèches qui reculent
      s += scopeAt(105, 40, INK, true);
      for (let k = 0; k < 6; k++) { const x = 456 - ((t * 140 + k * 80) % 480); s += `<path d="M${x.toFixed(1)} 160 l12 -8 v16 z" fill="${ACC}" opacity=".8"/>`; }
      break;
    }
    case 3: { // Arrêt bande : deux bobines qui ralentissent jusqu'à l'arrêt
      const dur = .25 + S.punch.tape * 2.25, rate = Math.max(0, 1 - t / dur);
      const angle = (dur / 2) * (1 - rate * rate) * 720 * 2 + 0; // intégrale de la vitesse
      [150, 330].forEach(cx => {
        s += `<circle cx="${cx}" cy="98" r="44" fill="none" stroke="${INK}" stroke-width="2"/><circle cx="${cx}" cy="98" r="8" fill="${ACC}"/>`;
        for (let k = 0; k < 3; k++) { const a = (angle + k * 120) * Math.PI / 180; s += `<line x1="${cx}" y1="98" x2="${(cx + 38 * Math.cos(a)).toFixed(1)}" y2="${(98 + 38 * Math.sin(a)).toFixed(1)}" stroke="${INK}" stroke-width="3"/>`; }
      });
      s += `<path d="M150 142 L330 142" stroke="${ACC}" stroke-width="2"/><text x="240" y="164" font-size="11" fill="${ACC}" text-anchor="middle" ${SCREEN_FONT}>${Math.round(rate * 100)} %</text>`; break;
    }
    case 4: case 5: { // filtres : courbe de réponse, coupure qui glisse
      const fc = fx === 4 ? 250 * Math.pow(64, Math.max(0, 1 - t / 1.2)) : 20 * Math.pow(150, Math.min(1, t / 1.2));
      const X = f => 24 + Math.log10(f / 20) / 3 * 432, q = 0.5 + S.punch.res * 6;
      const pts = [];
      for (let k = 0; k <= 120; k++) {
        const f = 20 * Math.pow(1000, k / 120), r = f / fc;
        let g = fx === 4 ? 1 / Math.sqrt((1 - r * r) ** 2 + (r / q) ** 2) : (r * r) / Math.sqrt((1 - r * r) ** 2 + (r / q) ** 2);
        const db = Math.max(-36, Math.min(18, 20 * Math.log10(g)));
        pts.push([X(f), 110 - db * 1.6]);
      }
      s += `<path d="M24 110 H456" stroke="${DIM}"/>` + poly(pts, ACC, 2);
      s += `<rect x="${X(fc).toFixed(1)}" y="40" width="1" height="130" fill="${INK}"/><text x="${Math.min(440, X(fc) + 6).toFixed(1)}" y="52" font-size="10" fill="${INK}" ${SCREEN_FONT}>${hz(fc)}</text>`; break;
    }
    case 6: { // Bits : la forme d'onde en marches d'escalier
      const levels = Math.pow(2, 2 + Math.round((1 - S.punch.bits) * 8)), every = Math.max(1, Math.round((1 + S.punch.bits * 23) / 4));
      let held = 0; const pts = [];
      wave.forEach((v, k) => { if (k % every === 0) held = Math.round(v * levels) / levels; const x = 24 + k * 2.7, y = 105 - cl(held * 2.2, -1, 1) * 45; if (pts.length) pts.push([x, pts[pts.length - 1][1]]); pts.push([x, y]); });
      s += poly(pts, ACC, 2); break;
    }
    case 7: { // Hachoir : cases qui s'ouvrent et se ferment au rythme
      const n = 8, open = (t % seg) / seg < .5, cur = Math.floor(t / seg) % n;
      for (let k = 0; k < n; k++) s += `<rect x="${24 + k * 54}" y="70" width="48" height="80" rx="3" fill="${k === cur && open ? ACC : '#1d1f23'}" stroke="${DIM}"/>`;
      break;
    }
  }
  return s;
}
function punchPads() {
  let s = '';
  for (let k = 0; k < 8; k++) {
    const x = 24 + k * 54, on = punchOn.has(k);
    s += `<rect x="${x}" y="176" width="50" height="34" rx="3" fill="${on ? ACC : '#121316'}" stroke="${DIM}"/>`;
    s += `<text x="${x + 5}" y="188" font-size="7.5" fill="${on ? ONACC : '#8b9096'}" ${SCREEN_FONT}>${k + 1}</text>`;
    s += `<text x="${x + 5}" y="203" font-size="7.5" fill="${on ? ONACC : '#d6d8db'}" ${SCREEN_FONT}>${esc(PUNCH[k].slice(0, 9))}</text>`;
  }
  return s;
}

let lastFrame = 0;
function drawScreen(time) {
  const elapsedMs = lastFrame ? time - lastFrame : 0; lastFrame = time;
  const pg = page(), t = T(), r = R[S.track];
  let body = '', override = null, machineArt = '';
  if (S.mode === 'instrument') {
    if (S.sub === 3) body = bigTitle(L('Pas ') + (S.selStep + 1) + ' / ' + t.len, t.steps[S.selStep] ? (t.engine === 'b:drums' ? DRUM_NAMES[t.steps[S.selStep].n % 12] : noteName(t.steps[S.selStep].n)) : L('vide')) + patternGlyph(t);
    else if (S.sub === 2) body = bigTitle(L('Piste ') + (S.track + 1), engineName(t.engine)) + scope(S.track);
    else if (isMachine(t.engine) && r.machine && r.display && r.scene) {
      try {
        const words = r.machine.controls.q31(machineValues(t, r.machine));
        const slots = machineSlots(r.machine, S.sub === 1).map((s, k) => s === null ? k : s);
        const input = shownControls(words, slots);
        const elapsed = Math.min(8192, Math.max(0, Math.round(elapsedMs * 1.024)));
        r.scene.apply(r.display.tick(input, elapsed, r.serial, S.track, matchMedia('(prefers-reduced-motion: reduce)').matches, r.activity));
        machineArt = r.scene.svg();
        override = r.scene.header;
      } catch (e) { r.display = r.scene = null; body = bigTitle(engineName(t.engine), L('écran indisponible')); }
    } else if (isMachine(t.engine)) body = bigTitle(engineName(t.engine), r.error ? L('indisponible') : L('chargement…'));
    else if (t.engine === 'b:drums') body = drumPads();
    else if (S.sub === 1) body = bigTitle(engineName(t.engine), L('enveloppe')) + envGlyph(t);
    else body = bigTitle(L('Piste ') + (S.track + 1), engineName(t.engine)) + scope(S.track);
  } else if (S.mode === 'mix') {
    S.tracks.forEach((tr, k) => {
      const x = 30 + k * 54, h = 130 * tr.vol, y = 200 - h, sel = k === S.track;
      body += `<rect x="${x}" y="64" width="34" height="136" fill="#121316"/><rect x="${x}" y="${y.toFixed(1)}" width="34" height="${h.toFixed(1)}" fill="${tr.mute ? '#3a1d1c' : sel ? ACC : '#d6d8db'}"/>`;
      body += `<text x="${x + 17}" y="54" font-size="9" fill="${tr.mute ? '#e3342c' : '#8b9096'}" text-anchor="middle" ${SCREEN_FONT}>${tr.mute ? L('muet') : k + 1}</text>`;
    });
  } else if (S.mode === 'tempo') {
    body = `<text x="240" y="140" font-size="64" fill="#f2f3f4" text-anchor="middle" ${SCREEN_FONT}>${S.bpm}</text><text x="240" y="168" font-size="10" fill="#8b9096" text-anchor="middle" ${SCREEN_FONT}>bpm · swing ${Math.round(S.swing / .5 * 100)} %</text>`;
    for (let k = 0; k < 4; k++) { const on = playing && curSeq >= 0 && Math.floor(curSeq / 4) % 4 === k; body += `<circle cx="${195 + k * 30}" cy="192" r="5" fill="${on ? ACC : '#2b2d31'}"/>`; }
  } else if (S.mode === 'players') {
    const pl = t.player;
    body = bigTitle(L('Piste ') + (S.track + 1) + ' · ' + engineName(t.engine), [L('Pas de player'), L('Arpège ') + ARP_SHAPES[pl.shape % ARP_SHAPES.length].toLowerCase(), L('Accord ') + CHORDS[pl.shape % CHORDS.length][0].toLowerCase()][pl.type]);
    if (pl.type === 2) chordNotes(t, 60).forEach((n, k) => body += `<rect x="${24 + k * 70}" y="120" width="60" height="60" rx="4" fill="#121316" stroke="${ACC}"/><text x="${54 + k * 70}" y="156" font-size="12" fill="#f2f3f4" text-anchor="middle" ${SCREEN_FONT}>${noteName(n)}</text>`);
    if (pl.latch) body += `<text x="456" y="54" font-size="10" fill="${ACC}" text-anchor="end" ${SCREEN_FONT}>LATCH${latched[S.track].size ? ' · ' + latched[S.track].size : ''}</text>`;
    if (pl.type === 1) { const held = arp[S.track].held.filter(h => h.end === Infinity || h.end > (ctx?.currentTime || 0)); body += `<text x="24" y="140" font-size="10" fill="#8b9096" ${SCREEN_FONT}>${held.length ? held.map(h => noteName(h.n)).join('  ') : L('tiens des notes')}</text>`; }
  } else if (S.mode === 'projects') {
    const list = projects();
    const rows = [...list.map(p => p.name), L('+ nouveau')];
    const first = Math.max(0, Math.min(S.projectIdx - 3, rows.length - 7));
    rows.slice(first, first + 7).forEach((name, k) => {
      const idx = first + k, sel = idx === S.projectIdx, y = 40 + k * 24;
      if (sel) body += `<rect x="20" y="${y - 14}" width="440" height="20" fill="${ACC}"/>`;
      body += `<text x="28" y="${y}" font-size="11" fill="${sel ? ONACC : '#d6d8db'}" ${SCREEN_FONT}>${esc(name)}</text>`;
      if (list[idx]) body += `<text x="452" y="${y}" font-size="8" fill="${sel ? ONACC : '#6b7076'}" text-anchor="end" ${SCREEN_FONT}>${new Date(list[idx].date).toLocaleDateString(LANG === 'fr' ? 'fr-FR' : 'en-GB')}</text>`;
    });
  } else if (S.mode === 'auxiliary') {
    body = bigTitle(L('Délai'), DIVS[S.fx.div].l + L(' · retour ') + Math.round(S.fx.fb * 100) + ' %');
    let a = 1; for (let k = 0; k < 9; k++) { const h = 90 * a; body += `<rect x="${24 + k * 48}" y="${(200 - h).toFixed(1)}" width="10" height="${h.toFixed(1)}" fill="${k ? ACC : '#f2f3f4'}" opacity="${k ? (.3 + .7 * S.fx.mix).toFixed(2) : 1}"/>`; a *= S.fx.fb * .9; }
  } else if (S.mode === 'punch') {
    if (punchLast >= 0 && punchOn.has(punchLast)) body = `<text x="24" y="40" font-size="11" fill="${ACC}" ${SCREEN_FONT}>${esc(PUNCH[punchLast])}${punchOn.size > 1 ? ' +' + (punchOn.size - 1) : ''}</text>` + punchVisual(punchLast, (time - punchOn.get(punchLast)) / 1000);
    else body = `<text x="24" y="40" font-size="11" fill="#8b9096" ${SCREEN_FONT}>${esc(L('Tiens un effet'))}</text>` + poly(outWave(160).map((v, k) => [24 + k * 2.7, 105 - cl(v * 2.2, -1, 1) * 40]), INK);
    body += punchPads();
  } else if (S.mode === 'arrange') {
    // Grille des 16 motifs, puis le morceau.
    for (let k = 0; k < PATTERNS; k++) {
      const x = 24 + (k % 4) * 52, y = 34 + Math.floor(k / 4) * 44, cur = k === S.pat, q = k === nextPat, used = patternUsed(k);
      body += `<rect x="${x}" y="${y}" width="44" height="36" rx="3" fill="${cur ? ACC : used ? '#26282d' : '#101113'}" stroke="${q ? ACC : '#2b2d31'}" stroke-width="${q ? 2 : 1}"/>`;
      body += `<text x="${x + 22}" y="${y + 23}" font-size="13" fill="${cur ? ONACC : used ? '#f2f3f4' : '#5a5e64'}" text-anchor="middle" ${SCREEN_FONT}>${PAT_NAMES[k]}</text>`;
    }
    body += `<text x="250" y="44" font-size="9" fill="#8b9096" ${SCREEN_FONT}>${esc(S.songMode ? L('Morceau') : L('Boucle'))}</text>`;
    const rows = [...S.song.map((r, k) => ({ k, label: PAT_NAMES[r.p] + '  ×' + r.r })), { k: S.song.length, label: '+' }];
    const first = Math.max(0, Math.min(arrRow - 3, rows.length - 7));
    rows.slice(first, first + 7).forEach((r, j) => {
      const y = 64 + j * 20, sel = S.sub === 1 && r.k === arrRow, now = playing && S.songMode && r.k === songRow && r.k < S.song.length;
      if (sel) body += `<rect x="246" y="${y - 13}" width="210" height="18" fill="#26282d"/>`;
      if (now) body += `<rect x="246" y="${y - 13}" width="3" height="18" fill="${ACC}"/>`;
      body += `<text x="256" y="${y}" font-size="11" fill="${now ? ACC : '#d6d8db'}" ${SCREEN_FONT}>${r.k < S.song.length ? (r.k + 1) + '.  ' : ''}${esc(r.label)}</text>`;
    });
  } else if (S.mode === 'bar') {
    body = bigTitle(L('Piste ') + (S.track + 1), t.len + L(' pas · ') + t.len / 16 + L(' mesure') + (t.len > 16 ? 's' : '')) + patternGlyph(t);
  } else {
    body = bigTitle(MODE_NAMES[S.mode], L('pas dans LAB_XY'));
  }
  const punchBar = punchOn.size && S.mode !== 'punch'
    ? `<rect x="0" y="202" width="480" height="18" fill="${ACC}"/><text x="10" y="214.5" font-size="9" fill="${ONACC}" ${SCREEN_FONT}>PUNCH · ${esc([...punchOn.keys()].map(k => PUNCH[k]).join(' + '))}</text>` : '';
  $('screen').innerHTML = `<rect width="480" height="220" fill="#000"/>` + (machineArt ? headerSvg(pg, override) + machineArt : body + headerSvg(pg, override)) + punchBar +
    (pg.msg && !machineArt && !punchBar && !['projects', 'punch'].includes(S.mode) ? `<text x="24" y="214" font-size="7.5" fill="#6b7076" ${SCREEN_FONT}>${esc(pg.msg.slice(0, 92))}</text>` : '');
}

/* ============================ interface ============================ */
function encArc(a0, a1, r = 35) {
  const p = a => [39 + r * Math.sin(a * Math.PI / 180), 39 - r * Math.cos(a * Math.PI / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
function arc(a0, a1, r = 26) {
  const p = a => [32 + r * Math.sin(a * Math.PI / 180), 32 - r * Math.cos(a * Math.PI / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
function keyEl(label, glyph = '') {
  const b = document.createElement('button'); b.className = 'key';
  b.innerHTML = `<span class="face">${glyph ? `<span class="glyph">${glyph}</span>` : ''}</span><span class="lbl">${esc(label)}</span>`;
  return b;
}
const modeEls = {}, mEls = [], encEls = [], trackEls = [], stepEls = [], stepPointers = new Map(), punchPointers = new Map();
function buildUI() {
  MODE_KEYS.forEach(m => { const b = keyEl(MODE_NAMES[m]); b.onclick = () => setMode(m); $('modeKeys').append(b); modeEls[m] = b; });
  for (let k = 0; k < 4; k++) { const b = keyEl('M' + (k + 1)); b.onclick = () => mKey(k); $('mKeys').append(b); mEls.push(b); }
  for (let k = 0; k < 4; k++) {
    const el = document.createElement('div'); el.className = 'enc'; el.tabIndex = 0; el.setAttribute('role', 'slider');
    el.innerHTML = `<svg viewBox="0 0 78 78" aria-hidden="true"><circle class="ring" cx="39" cy="39" r="35"/><path class="arc"/><circle class="disc" cx="39" cy="39" r="24"/><circle class="tip" r="3.4" cx="39" cy="22"/></svg><span class="lab">${k + 1}</span><span class="val"></span>`;
    let y0 = null;
    el.addEventListener('pointerdown', e => { y0 = e.clientY; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => { if (y0 == null) return; const dy = y0 - e.clientY; if (Math.abs(dy) >= 3) { const d = page().encs[k]; turn(k, Math.trunc(dy / 3) * (d?.int ? .34 : (e.shiftKey ? .25 : 1))); y0 = e.clientY; } });
    el.addEventListener('pointerup', () => { y0 = null; });
    el.addEventListener('wheel', e => { e.preventDefault(); turn(k, e.deltaY < 0 ? 1 : -1); }, { passive: false });
    el.addEventListener('keydown', e => { if (['ArrowUp', 'ArrowRight'].includes(e.key)) { turn(k, 1); e.preventDefault(); } if (['ArrowDown', 'ArrowLeft'].includes(e.key)) { turn(k, -1); e.preventDefault(); } });
    $('encs').append(el); encEls.push(el);
  }
  for (let k = 0; k < 8; k++) {
    const b = document.createElement('button'); b.className = 'key tk';
    b.style.setProperty('--c', TRACK_COLORS[k]);
    b.innerHTML = `<span class="face"><span class="bar"><i></i></span><span class="num">${k + 1}</span><span class="eng"></span></span>`;
    b.onclick = e => { if (e.shiftKey) { S.tracks[k].mute = !S.tracks[k].mute; pushTrack(k); render(); } else trackKey(k); };
    $('tracks').append(b); trackEls.push(b);
  }
  for (let k = 0; k < 16; k++) {
    const b = document.createElement('button'); b.className = 'st';
    b.innerHTML = `<span class="i">${k + 1}</span><span class="nt"></span>`;
    // Comme une touche de pas : appui bref = poser ou retirer ; tenu = éditer (notes, accords, p-locks).
    // Maj+clic ou clic droit : le pas reste tenu, pour éditer à la souris.
    b.addEventListener('pointerdown', e => {
      if (S.mode === 'punch') { e.preventDefault(); if (k < 8) { try { b.setPointerCapture(e.pointerId); } catch (err) {} punchPointers.set(e.pointerId, k); punchPress(k); } return; }
      const i = pageOffset() + k; if (i >= T().len) return;
      e.preventDefault();
      if (e.shiftKey || e.button === 2) { toggleSticky(i); return; }
      try { b.setPointerCapture(e.pointerId); } catch (err) {}
      stepPointers.set(e.pointerId, i); stepDown(i);
    });
    const up = e => { const pk = punchPointers.get(e.pointerId); if (pk != null) { punchPointers.delete(e.pointerId); punchRelease(pk); return; } const i = stepPointers.get(e.pointerId); if (i == null) return; stepPointers.delete(e.pointerId); if (!stickySteps.has(i)) stepUp(i); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
    b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSticky(pageOffset() + k); } });
    $('steps').append(b); stepEls.push(b);
  }
  const kf = $('kFill');
  kf.addEventListener('pointerdown', e => { e.preventDefault(); try { kf.setPointerCapture(e.pointerId); } catch (err) {} setFill(true); });
  ['pointerup', 'pointercancel'].forEach(ev => kf.addEventListener(ev, () => setFill(false)));
  $('kPlay').onclick = play; $('kStop').onclick = stop; $('kRec').onclick = () => { rec = !rec; render(); };
  $('kOctDown').onclick = () => { S.oct = Math.max(-36, S.oct - 12); save(); renderBar(); };
  $('kOctUp').onclick = () => { S.oct = Math.min(36, S.oct + 12); save(); renderBar(); };
  buildKb(); bindKb(); buildKeys();
}
function renderEncs() {
  const pg = page();
  encEls.forEach((el, k) => {
    const d = pg.encs[k]; el.classList.toggle('off', !d);
    const raw = d ? d.norm() : 0, nv = Number.isFinite(raw) ? cl(raw) : 0, a = -135 + 270 * nv;
    el.querySelector('.arc').setAttribute('d', d && nv > .003 ? encArc(-135, a) : '');
    el.querySelector('.tip').setAttribute('transform', `rotate(${a} 39 39)`);
    el.querySelector('.lab').textContent = d ? d.label : '—';
    el.querySelector('.val').textContent = d ? d.text() : '\u00a0';
    el.setAttribute('aria-label', d ? L('Encodeur {n} : {label} {value}', { n: k + 1, label: d.label, value: d.text() }) : L('Encodeur {n} inutilisé', { n: k + 1 }));
  });
}
function renderKeysPanel() {
  MODE_KEYS.forEach(m => modeEls[m].classList.toggle('lit', S.mode === m));
  const pg = page();
  $('importBtn').hidden = S.mode !== 'projects';
  mEls.forEach((b, k) => { b.querySelector('.lbl').textContent = pg.actions ? pg.subs[k] : 'M' + (k + 1) + ' · ' + pg.subs[k]; b.classList.toggle('lit', !pg.actions && S.sub === k); });
}
function renderTracks() {
  S.tracks.forEach((t, k) => {
    const b = trackEls[k];
    b.classList.toggle('sel', k === S.track); b.classList.toggle('mute', t.mute); b.classList.toggle('loading', R[k].loading);
    b.querySelector('.eng').textContent = R[k].loading ? L('chargement…') : engineName(t.engine);
    b.title = `${L('Piste ')}${k + 1} · ${engineName(t.engine)}`;
  });
}
function renderSteps() {
  const t = T(), off = pageOffset();
  if (S.mode === 'punch') {
    stepEls.forEach((b, k) => {
      ['has', 'sel', 'lk', 'play'].forEach(c => b.classList.remove(c));
      b.classList.toggle('out', k >= 8); b.classList.toggle('held', punchOn.has(k));
      b.querySelector('.i').textContent = k < 8 ? String(k + 1) : '';
      b.querySelector('.nt').textContent = k < 8 ? PUNCH[k] : '';
    });
    $('seqLabel').textContent = L('Punch-in · tiens un effet');
    $('pages').innerHTML = '';
    return;
  }
  stepEls.forEach((b, k) => {
    const i = off + k, st = t.steps[i], out = i >= t.len;
    b.classList.toggle('has', !!st && !out); b.classList.toggle('sel', i === S.selStep); b.classList.toggle('held', heldSteps.has(i));
    b.classList.toggle('out', out);
    b.classList.toggle('play', playing && curSeq >= 0 && curSeq % t.len === i);
    const on = st && !out;
    b.classList.toggle('lk', !!(on && st.locks && Object.keys(st.locks).length));
    b.querySelector('.i').textContent = (i + 1) + (on && st.cond ? ' ' + CONDS[st.cond].l.replace(' %', '%') : '');
    b.querySelector('.nt').textContent = on ? (t.engine === 'b:drums' ? DRUM_NAMES[st.n % 12].split(' ').map(w => w[0]).join('').toUpperCase() : noteName(st.n)) + (st.x?.length ? '+' + st.x.length : '') : '';
  });
  $('seqLabel').textContent = L('Motif {p} · piste {n} · {len} pas', { p: PAT_NAMES[S.pat] + (nextPat != null ? ' → ' + PAT_NAMES[nextPat] : ''), n: S.track + 1, len: t.len });
  const pages = $('pages'); pages.innerHTML = '';
  for (let p = 0; p < 4; p++) {
    const b = document.createElement('button'); b.className = 'pg' + (p === S.page ? ' sel' : '') + (p * 16 >= t.len ? ' dis' : '');
    if (playing && curSeq >= 0 && Math.floor((curSeq % t.len) / 16) === p) b.classList.add('play');
    b.textContent = p + 1; b.title = p * 16 >= t.len ? L('Allonge la séquence avec Bar') : L('Pas ') + (p * 16 + 1) + ' à ' + (p * 16 + 16);
    b.onclick = () => { if (p * 16 < t.len) { S.page = p; save(); renderSteps(); } else { S.mode = 'bar'; render(); } };
    pages.append(b);
  }
}
function renderBar() {
  $('roBpm').textContent = S.bpm; $('roOct').textContent = signed(S.oct / 12);
  $('kPlay').classList.toggle('lit', playing); $('kRec').classList.toggle('lit', rec);
}
function renderBrowser() {
  const q = $('mSearch').value.trim().toLowerCase(), cur = T().engine;
  const match = m => !q || [m.name, m.description, m.maintainer, ...(m.keywords || [])].join(' ').toLowerCase().includes(q);
  const list = $('mList'); list.innerHTML = '';
  const card = (id, m, by) => {
    const b = document.createElement('div'); b.className = 'mc' + (cur === id ? ' cur' : ''); b.tabIndex = 0; b.setAttribute('role', 'button');
    b.onkeydown = e => { if (e.target === b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); b.onclick(); } };
    b.innerHTML = `<span class="t"><b>${esc(m.name)}</b><span>${esc(by)}</span></span><span class="d">${esc(m.description || '')}</span><span class="p">${esc((m.params || []).join(' · '))}</span>`;
    b.onclick = () => { setEngine(S.track, id); if (S.mode !== 'instrument') { S.mode = 'instrument'; S.sub = 0; } render(); };
    if (cur === id && m.presets?.length) {
      const row = document.createElement('span'); row.className = 'presets';
      m.presets.forEach(p => { const pb = document.createElement('button'); pb.className = 'btn small'; pb.textContent = p;
        pb.onclick = e => { e.stopPropagation(); loadPreset(p); }; row.append(pb); });
      b.append(row);
    }
    if (cur === id && m.repository) {
      const a = document.createElement('a'); a.href = m.repository; a.target = '_blank'; a.rel = 'noopener'; a.className = 'p'; a.textContent = L('source · ') + (m.license || L('licence du dépôt'));
      a.onclick = e => e.stopPropagation(); b.append(a);
    }
    list.append(b);
  };
  const bi = BUILTINS.filter(match), ma = MACHINES.filter(match);
  if (bi.length) { const h = document.createElement('div'); h.className = 'grp-t'; h.textContent = 'Moteurs LAB_XY'; list.append(h); bi.forEach(m => card(m.id, m, L('intégré'))); }
  if (ma.length) { const h = document.createElement('div'); h.className = 'grp-t'; h.textContent = L('Machines Open-XY'); list.append(h); ma.forEach(m => card('m:' + m.id, m, m.maintainer)); }
  if (!bi.length && !ma.length) list.innerHTML = '<p class="note">Aucune machine ne correspond.</p>';
  $('mCount').textContent = L('Piste ') + (S.track + 1) + ' · ' + MACHINES.length + L(' machines');
}
async function loadPreset(name) {
  const t = T(), r = R[S.track]; if (!r.machine) return;
  const preset = r.machine.controls.presets?.[name]; if (!preset) return;
  t.mv = { ...preset }; pushTrack(S.track); toast(name); render();
}
let rq = 0;
function render() {
  if (rq) return;
  rq = requestAnimationFrame(() => { rq = 0; setAccent(); renderEncs(); renderKeysPanel(); renderTracks(); renderSteps(); renderBar(); renderBrowser(); renderKeys(); });
}
function frame(time) {
  if (ctx) {
    const now = ctx.currentTime; let moved = false;
    while (queue.length && queue[0].t <= now) { const q = queue.shift(); curSeq = q.s; curSeqTime = q.t; moved = true; }
    if (moved) {
      if (S.follow && playing) { const p = Math.floor((curSeq % T().len) / 16); if (p !== S.page) S.page = p; }
      renderSteps();
    }
    chain.forEach((c, k) => {
      c.an.getFloatTimeDomainData(c.buf); let pk = 0; for (let j = 0; j < c.buf.length; j += 4) pk = Math.max(pk, Math.abs(c.buf[j]));
      trackEls[k].querySelector('.bar i').style.height = Math.min(100, pk * 120) + '%';
    });
  }
  if (!document.hidden && time - lastFrame > 30) drawScreen(time);
  requestAnimationFrame(frame);
}

/* clavier visuel */
const KB_LOW = 36, KB_HIGH = 84, kbEls = {};
function buildKb() {
  const kb = $('kb'), whites = [];
  for (let n = KB_LOW; n <= KB_HIGH; n++) if (![1, 3, 6, 8, 10].includes(n % 12)) whites.push(n);
  const w = 100 / whites.length;
  whites.forEach((n, i) => { const e = document.createElement('div'); e.className = 'w'; e.dataset.note = n; e.style.left = (i * w) + '%'; e.style.width = w + '%'; if (n % 12 === 0) e.textContent = noteName(n); kb.append(e); kbEls[n] = e; });
  for (let n = KB_LOW; n <= KB_HIGH; n++) if ([1, 3, 6, 8, 10].includes(n % 12)) {
    const i = whites.indexOf(n - 1), e = document.createElement('div'); e.className = 'b'; e.dataset.note = n;
    e.style.left = ((i + 1) * w - w * .3) + '%'; e.style.width = (w * .6) + '%'; kb.append(e); kbEls[n] = e;
  }
}
// Jouable à la souris et au doigt : plusieurs doigts à la fois, glissando en glissant.
// Plus on appuie bas sur la touche, plus la note est forte.
const kbPointers = new Map(); // pointeur -> note brute jouée
function kbNoteAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || !el.closest('#kb')) return null;
  const n = +el.dataset.note;
  if (!Number.isFinite(n)) return null;
  const r = el.getBoundingClientRect();
  return { n, vel: cl(.35 + .65 * (y - r.top) / Math.max(1, r.height), .2, 1) };
}
function kbPress(id, hit) {
  if (!ctx) { toast('Allume d\'abord l\'instrument'); return; }
  const raw = hit.n - S.oct;
  kbPointers.set(id, raw); keyNoteOn(raw, hit.vel);
}
function kbRelease(id) { const raw = kbPointers.get(id); if (raw == null) return; kbPointers.delete(id); keyNoteOff(raw); }
function bindKb() {
  const kb = $('kb');
  kb.addEventListener('pointerdown', e => {
    const hit = kbNoteAt(e.clientX, e.clientY); if (!hit) return;
    e.preventDefault(); kb.setPointerCapture(e.pointerId); kbPress(e.pointerId, hit);
  });
  kb.addEventListener('pointermove', e => {
    if (!kbPointers.has(e.pointerId)) return;
    const hit = kbNoteAt(e.clientX, e.clientY);
    if (!hit || hit.n - S.oct === kbPointers.get(e.pointerId)) return;
    kbRelease(e.pointerId); kbPress(e.pointerId, hit);
  });
  const end = e => kbRelease(e.pointerId);
  kb.addEventListener('pointerup', end); kb.addEventListener('pointercancel', end); kb.addEventListener('lostpointercapture', end);
}
function kbSet(n, on) { kbEls[n]?.classList.toggle('on', on); }
function kbOff() { Object.values(kbEls).forEach(e => e.classList.remove('on')); }

/* ============================ assistant des touches ============================ */
let learnId = null, wizard = false;
const kcEls = {};
function buildKeys() {
  const g = $('keygrid');
  KEYS.forEach(([grp, ks]) => {
    const h = document.createElement('div'); h.className = 'grp cap'; h.textContent = grp; g.append(h);
    ks.forEach(([id, l]) => {
      const c = document.createElement('div'); c.className = 'kc';
      c.innerHTML = `<span>${esc(l)}</span><span class="cc"></span><button class="btn small">${L('Apprendre')}</button>`;
      c.querySelector('button').onclick = () => { if (!input) { toast('Allume d\'abord l\'instrument'); return; } wizard = false; learnId = learnId === id ? null : id; renderKeys(); };
      g.append(c); kcEls[id] = c;
    });
  });
}
function renderKeys() {
  const set = KEY_ORDER.filter(id => keymap[id] != null).length;
  $('banner').hidden = set > 6 || wizard;
  KEY_ORDER.forEach(id => {
    const c = kcEls[id], cc = keymap[id];
    c.classList.toggle('set', cc != null && cc >= 0); c.classList.toggle('learn', learnId === id);
    c.querySelector('.cc').textContent = cc == null ? (id.startsWith('e') ? 'CC ' + id.slice(1) + L(' (défaut)') : '—') : cc < 0 ? L('aucun') : 'CC ' + cc;
    c.querySelector('button').textContent = learnId === id ? L('Annuler') : L('Apprendre');
  });
  $('wizard').classList.toggle('on', wizard && !!learnId);
  if (wizard && learnId) { $('wizAsk').textContent = KEY_LABEL[learnId]; $('wizProg').textContent = (KEY_ORDER.indexOf(learnId) + 1) + ' / ' + KEY_ORDER.length; }
}
function flashKey(id) { const c = kcEls[id]; if (!c) return; c.classList.add('hit'); setTimeout(() => c.classList.remove('hit'), 150); }
function startWizard() {
  if (!input) { toast(L('Allume d\'abord l\'instrument et branche l\'OP-XY')); return; }
  wizard = true; learnId = KEY_ORDER[0]; renderKeys(); $('wizard').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function wizardNext() {
  const i = KEY_ORDER.indexOf(learnId);
  if (wizard && i < KEY_ORDER.length - 1) learnId = KEY_ORDER[i + 1];
  else { learnId = null; if (wizard) toast(L('Touches associées')); wizard = false; }
  renderKeys();
}
function learnCC(cc) {
  Object.keys(keymap).forEach(k => { if (keymap[k] === cc) delete keymap[k]; });
  // Un encodeur resté sur son CC par défaut ne doit pas masquer la touche qu'on vient d'associer.
  if (!learnId.startsWith('e')) for (let k = 0; k < 4; k++) if (keymap['e' + (k + 1)] == null && k + 1 === cc) keymap['e' + (k + 1)] = -1;
  keymap[learnId] = cc; save(); toast(KEY_LABEL[learnId] + ' → CC ' + cc); wizardNext();
}
$('wizSkip').onclick = () => { keymap[learnId] = -1; save(); wizardNext(); };
$('wizStop').onclick = () => { wizard = false; learnId = null; renderKeys(); };
$('wizardBtn').onclick = startWizard;
$('encModeSel').value = encMode;
$('encModeSel').onchange = () => { encMode = $('encModeSel').value; for (const k in encState) delete encState[k]; try { localStorage.setItem('xy-encmode', encMode); } catch (e) {} }; $('bannerWizard').onclick = startWizard;
$('resetKeys').onclick = () => {
  const b = $('resetKeys');
  if (b.dataset.armed) { keymap = {}; save(); renderKeys(); delete b.dataset.armed; b.textContent = L('Tout désassocier'); }
  else { b.dataset.armed = '1'; b.textContent = L('Confirmer ?'); setTimeout(() => { delete b.dataset.armed; b.textContent = L('Tout désassocier'); }, 2500); }
};

/* ============================ MIDI ============================ */
let access = null, input = null, listening = [];
function onMidi(ev) {
  const d = ev.data, s = d[0], hi = s & 0xF0;
  if (s >= 0xF8) return;
  if (hi === 0x90 && d[2] > 0) { keyNoteOn(d[1], .15 + .85 * d[2] / 127); return; }
  if (hi === 0x80 || (hi === 0x90 && d[2] === 0)) { keyNoteOff(d[1]); return; }
  if (hi !== 0xB0) return;
  const cc = d[1], v = d[2];
  if (learnId) { if (v > 0 || learnId.startsWith('e')) learnCC(cc); return; }
  const ei = [0, 1, 2, 3].find(k => encCC(k) === cc);
  if (ei != null) { turn(ei, encDelta(cc, v)); const dbg = $('encDebug'); if (dbg) dbg.textContent = encDebug(); return; }
  const id = Object.keys(keymap).find(k => keymap[k] === cc);
  if (!id) { if (v > 0) toast(L('Touche CC ') + cc + L(' non associée')); return; }
  if (v > 0) keyDown(id); else keyUp(id);
}
function refreshPorts() {
  const sel = $('inSel'), ins = [...access.inputs.values()], cur = sel.value;
  sel.innerHTML = ins.length ? '<option value="*">Toutes les entrées</option>' : '<option value="">Aucune entrée</option>';
  ins.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.append(o); });
  const xy = ins.find(p => /op.?xy/i.test(p.name));
  if (ins.length) sel.value = cur && (cur === '*' || ins.some(p => p.id === cur)) ? cur : (xy ? xy.id : '*');
  bindInput();
}
function bindInput() {
  listening.forEach(p => { p.onmidimessage = null; });
  const v = $('inSel').value, all = access ? [...access.inputs.values()] : [];
  listening = v === '*' ? all : all.filter(p => p.id === v);
  listening.forEach(p => { p.onmidimessage = onMidi; });
  input = listening[0] || null;
  if (!listening.length) setStatus(access ? 'err' : '', ctx ? L('Son prêt. Aucun contrôleur MIDI : joue au clavier de l\'ordinateur ou à l\'écran.') : L('Éteint'));
  else setStatus('on', v === '*' ? listening.length + L(' entrée') + (listening.length > 1 ? 's' : '') + L(' MIDI') : input.name);
  renderKeys();
}
function setStatus(c, t) { $('dot').className = 'dot ' + (c || ''); $('statusTxt').textContent = t; }
$('inSel').onchange = bindInput;
$('startBtn').onclick = async () => {
  const b = $('startBtn');
  if (ctx) { if (ctx.state !== 'running') await ctx.resume(); if (access) refreshPorts(); return; }
  setStatus('', L('Démarrage…'));
  try { await startAudio(); }
  catch (e) { setStatus('err', L('Son impossible : ') + e.message); ctx?.close(); ctx = null; return; }
  b.textContent = L('Actualiser le MIDI'); b.classList.remove('primary');
  if (!navigator.requestMIDIAccess) { setStatus('err', L('Son prêt. Web MIDI absent : utilise Chrome ou Edge.')); return; }
  try { access = await navigator.requestMIDIAccess({ sysex: false }); access.onstatechange = refreshPorts; refreshPorts(); }
  catch (e) { setStatus('err', L('Son prêt. Accès MIDI refusé par le navigateur.')); }
};

/* clavier d'ordinateur : A W S E D F T G Y H U J K, espace = lecture */
const PC = 'awsedftgyhujk', pcDown = new Set();
addEventListener('keydown', e => {
  if (e.target.closest('input,select,textarea,.enc') || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const i = PC.indexOf(e.key.toLowerCase());
  if (i >= 0 && ctx) { pcDown.add(i); keyNoteOn(60 + i, .8); }
  if (i >= 0 && !ctx) toast('Allume d\'abord l\'instrument');
  if (e.code === 'Space' && ctx) { e.preventDefault(); playing ? stop() : play(); }
  if (e.key.toLowerCase() === 'q') setFill(true);
  if (/^Digit[1-8]$/.test(e.code)) punchPress(+e.code.slice(5) - 1);
  if (e.key.toLowerCase() === 'z') { S.oct = Math.max(-36, S.oct - 12); save(); renderBar(); }
  if (e.key.toLowerCase() === 'x') { S.oct = Math.min(36, S.oct + 12); save(); renderBar(); }
  if (e.key === 'Escape' && ctx) panicAll();
});
addEventListener('keyup', e => { if (/^Digit[1-8]$/.test(e.code)) punchRelease(+e.code.slice(5) - 1); if (e.key.toLowerCase() === 'q') setFill(false); const i = PC.indexOf(e.key.toLowerCase()); if (i >= 0 && pcDown.has(i)) { pcDown.delete(i); keyNoteOff(60 + i); } });
$('mSearch').addEventListener('input', renderBrowser);
$('resetApp').onclick = () => {
  const b = $('resetApp');
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = L('Confirmer la remise à zéro'); setTimeout(() => { delete b.dataset.armed; b.textContent = L('Réinitialiser'); }, 3000); return; }
  clearTimeout(saveTimer);
  try { localStorage.removeItem('xy-studio-v2'); } catch (e) {}
  location.replace(location.pathname + '?reset');
};
// Import d'un projet : bouton « Importer » en mode Projects, ou glisser un fichier sur la page.
$('importBtn').onclick = () => $('fileIn').click();
addEventListener('dragover', e => { if (S.mode === 'projects') e.preventDefault(); });
addEventListener('drop', e => { if (S.mode !== 'projects') return; e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { const dt = new DataTransfer(); dt.items.add(f); $('fileIn').files = dt.files; $('fileIn').dispatchEvent(new Event('change')); } });

/* ============================ enregistrement WAV ============================ */
function toggleRecording() {
  if (!ctx) { toast('Allume d\'abord l\'instrument'); return; }
  if (!recording) {
    recChunks = []; recFrames = 0; recording = true; recStart = performance.now();
    recorder.port.postMessage({ on: true }); renderRec(); return;
  }
  recording = false; recorder.port.postMessage({ on: false }); renderRec();
  if (!recFrames) { toast(L('Rien d\'enregistré')); return; }
  const blob = encodeWav(recChunks, recFrames, ctx.sampleRate); recChunks = [];
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lab-xy-' + stamp + '.wav'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(L('Enregistrement : ') + (recFrames / ctx.sampleRate).toFixed(1) + ' s');
}
// WAV PCM 16 bits stéréo.
function encodeWav(chunks, frames, rate) {
  const buf = new ArrayBuffer(44 + frames * 4), v = new DataView(buf);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + frames * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, frames * 4, true);
  let o = 44;
  for (const [L, R] of chunks) for (let i = 0; i < L.length; i++) {
    v.setInt16(o, Math.round(cl(L[i], -1, 1) * 32767), true); v.setInt16(o + 2, Math.round(cl(R[i], -1, 1) * 32767), true); o += 4;
  }
  return new Blob([buf], { type: 'audio/wav' });
}
function renderRec() {
  const b = $('recFileBtn'); if (!b) return;
  b.classList.toggle('on', recording);
  b.textContent = recording ? '■ ' + ((performance.now() - recStart) / 1000).toFixed(0) + ' s' : L('● Enregistrer');
}
setInterval(() => { if (recording) renderRec(); }, 500);
$('recFileBtn').onclick = toggleRecording;

/* ============================ partage par lien ============================ */
const b64url = bytes => { let s = ''; bytes.forEach(c => { s += String.fromCharCode(c); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = t => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
// Pas non vides seulement : [position, note, vélocité, longueur, chance, condition, accord, p-locks].
const packSteps = steps => steps.map((st, i) => st && [i, st.n, +st.v.toFixed(2), st.len, +(st.ch ?? 1).toFixed(2), st.cond || 0, st.x || 0,
  st.locks ? Object.fromEntries(Object.entries(st.locks).map(([k, v]) => [k, +(+v).toFixed(3)])) : 0]).filter(Boolean);
function unpackSteps(list) {
  const steps = Array(MAX_STEPS).fill(null);
  (Array.isArray(list) ? list : []).forEach(([i, n, v, len, ch, cond, x, locks]) => {
    if (!(i >= 0 && i < MAX_STEPS)) return;
    const st = { n: cl(n | 0, 0, 127), v: cl(+v || .8, .05, 1), len: LENS.includes(len) ? len : 1, ch: cl(+ch || 1, .05, 1) };
    if (cond > 0 && cond < CONDS.length) st.cond = cond | 0;
    if (Array.isArray(x) && x.length) st.x = x.slice(0, 5).map(n => cl(n | 0, 0, 127));
    if (locks && typeof locks === 'object') {
      const ok = Object.entries(locks).filter(([k, v]) => /^(p[0-3]|e[0-3]|m:[\w-]{1,40})$/.test(k) && Number.isFinite(+v)).slice(0, 16);
      if (ok.length) st.locks = Object.fromEntries(ok.map(([k, v]) => [k, cl(+v)]));
    }
    steps[i] = st;
  });
  return steps;
}
async function packProject() {
  syncPattern();
  const { bpm, swing, metro, tracks, fx, master, pat, song, songMode } = S;
  const tr = tracks.map(t => ({ ...t, steps: [] }));
  const patterns = S.patterns.map(p => p && p.tracks.some(t => t.steps.some(Boolean)) ? p.tracks.map(t => [t.len, packSteps(t.steps)]) : 0);
  const json = JSON.stringify({ v: 2, bpm, swing, metro, fx, master, pat, song, songMode, tracks: tr, patterns });
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
}
async function unpackProject(text) {
  const stream = new Blob([unb64url(text)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const data = JSON.parse(await new Response(stream).text());
  if (data.v !== 2 || !Array.isArray(data.tracks) || data.tracks.length !== 8) throw new Error(L('lien invalide'));
  data.tracks = data.tracks.map(t => ({ ...newTrack(String(t.engine || 'b:analog')), ...t, steps: unpackSteps(t.steps), len: [16, 32, 48, 64].includes(t.len) ? t.len : 16 }));
  // Liens d'avant les motifs : les pas sont sur les pistes.
  data.patterns = Array.isArray(data.patterns) && data.patterns.length === PATTERNS
    ? data.patterns.map(p => Array.isArray(p) && p.length === 8 ? { tracks: p.map(([len, list]) => ({ len: [16, 32, 48, 64].includes(len) ? len : 16, steps: unpackSteps(list) })) } : null)
    : null;
  return data;
}
async function shareLink() {
  try {
    const url = location.href.split('#')[0].split('?')[0] + '#p=' + await packProject();
    $('shareOut').value = url; $('shareBox').hidden = false; $('shareOut').select();
    try { await navigator.clipboard.writeText(url); toast(L('Lien copié')); } catch (e) { toast(L('Lien prêt : copie-le ci-dessous')); }
  } catch (e) { toast(L('Partage impossible : ') + e.message); }
}
$('shareBtn').onclick = shareLink;
$('shareClose').onclick = () => { $('shareBox').hidden = true; };
async function openSharedLink() {
  const m = location.hash.match(/^#p=([\w-]+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname);
  try {
    const data = await unpackProject(m[1]);
    // L'état en cours est gardé dans les projets avant d'ouvrir le lien.
    const list = projects();
    list.push({ name: L('Avant le lien partagé'), date: new Date().toISOString(), data: snapshot() }); storeProjects(list);
    S = migrate({ ...defaultState(), patterns: null, song: [], ...data, mode: 'instrument', sub: 0, track: 0, page: 0, selStep: 0, projectIdx: list.length });
    linkPattern();
    clearTimeout(saveTimer);
    try { localStorage.setItem('xy-studio-v2', JSON.stringify(S)); } catch (e) {}
    toast(L('Projet partagé ouvert. Ton état précédent est dans Projects.'));
  } catch (e) { toast(L('Lien de projet illisible : ') + e.message); }
}

// Un lien de projet collé dans un onglet déjà ouvert : le navigateur ne recharge pas la page.
addEventListener('hashchange', async () => {
  if (!/^#p=/.test(location.hash)) return;
  if (ctx) panicAll();
  await openSharedLink();
  location.reload();
});

/* ============================ app installable, hors ligne ============================ */
let installPrompt = null;
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('sw.js').then(() => { $('offlineBtn').hidden = false; }).catch(() => {});
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; $('installBtn').hidden = false; });
addEventListener('appinstalled', () => { $('installBtn').hidden = true; installPrompt = null; toast(L('App installée')); });
$('installBtn').onclick = async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; $('installBtn').hidden = true; };
// Télécharge toutes les machines une fois : le service worker les garde pour le hors ligne.
$('offlineBtn').onclick = async () => {
  const b = $('offlineBtn'); b.disabled = true;
  let n = 0;
  try {
    for (const m of MACHINES) {
      const base = `machines/${m.id}/`;
      const man = await (await fetch(base + 'manifest.json')).json();
      await Promise.all([fetch(base + 'engine.wasm'), fetch(base + 'panel.svg'), man.hasGray ? fetch(base + 'panel.grayscale.svg') : null]);
      b.textContent = L('Téléchargement des machines… {n} / {total}', { n: ++n, total: MACHINES.length });
    }
    b.textContent = L('Hors ligne : {n} machines prêtes', { n });
  } catch (e) { toast(L('Hors ligne impossible : ') + e.message); b.textContent = L('Préparer le hors ligne'); b.disabled = false; }
};

/* ============================ langue ============================ */
translatePage();
document.querySelectorAll('[data-lang]').forEach(b => {
  b.classList.toggle('sel', b.dataset.lang === LANG);
  b.onclick = () => {
    if (b.dataset.lang === LANG) return;
    clearTimeout(saveTimer);
    try { localStorage.setItem('xy-studio-v2', JSON.stringify(S)); localStorage.setItem('xy-keymap', JSON.stringify(keymap)); } catch (e) {}
    setLang(b.dataset.lang); location.reload();
  };
});

/* ============================ démarrage ============================ */
buildUI();
try {
  if (LOCAL) { await loadScript('machines/index.js'); MACHINES = window.XY_MACHINE_INDEX; }
  else MACHINES = await (await fetch('machines/index.json')).json();
}
catch (e) { MACHINES = []; toast(L('Liste des machines introuvable : sers ce dossier par HTTP')); }
ENGINE_LIST = [...BUILTINS.map(b => b.id), ...MACHINES.map(m => 'm:' + m.id)];
await openSharedLink();
S.tracks.forEach(t => { if (!ENGINE_LIST.includes(t.engine)) t.engine = 'b:analog'; });
S.tracks.forEach(t => { if (isMachine(t.engine) && !MACHINES.some(m => 'm:' + m.id === t.engine)) t.engine = 'b:analog'; });
S.tracks.forEach((_, i) => { if (isMachine(S.tracks[i].engine)) buildNode(i); }); // écran des machines visible avant d'allumer
render(); requestAnimationFrame(frame);
// Lecture d'état pour les tests automatisés (ne modifie rien).
window.xyStudio = Object.freeze({
  seq: () => JSON.parse(JSON.stringify({ pat: S.pat, nextPat, songRow, songMode: S.songMode, song: S.song, track: S.track,
    steps: T().steps.slice(0, T().len), latched: [...latched[S.track].keys()], used: S.patterns.map((p, k) => patternUsed(k)) })),
  status: () => ({ audio: ctx?.state || 'off', playing,
    out: (() => { if (!outAn) return 0; const b = new Float32Array(2048); outAn.getFloatTimeDomainData(b); return +Math.sqrt(b.reduce((a, x) => a + x * x, 0) / b.length).toFixed(4); })(), tracks: S.tracks.map((t, i) => {
    let rms = 0; if (ctx) { const c = chain[i]; c.an.getFloatTimeDomainData(c.buf); rms = Math.sqrt(c.buf.reduce((a, x) => a + x * x, 0) / c.buf.length); }
    return { engine: t.engine, loaded: !!(R[i].node), error: R[i].error, rms: +rms.toFixed(4) }; }) }),
});
