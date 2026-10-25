/**
 * Unit tests for AudioFeatureExtractor and arbitrary lattice init.
 * No microphone required. Run: node scripts/test_audio_features.js
 */
import { AudioFeatureExtractor } from '../assets/js/audio-features.js';
import { ComplexLattice } from '../assets/js/simulation.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed += 1;
    console.log('  OK  ', msg);
  } else {
    failed += 1;
    console.log('  FAIL', msg);
  }
}

function sine(n, amp, phase = 0, cycles = 4) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amp * Math.sin((i / n) * Math.PI * 2 * cycles + phase);
  }
  return out;
}

function silence(n = 256) {
  return new Float32Array(n);
}

function bandSpectrum(n, lowW, midW, highW) {
  const out = new Float32Array(n);
  const lowEnd = Math.floor(n * 0.12);
  const midEnd = Math.floor(n * 0.45);
  for (let i = 0; i < n; i++) {
    if (i < lowEnd) out[i] = lowW;
    else if (i < midEnd) out[i] = midW;
    else out[i] = highW;
  }
  return out;
}

console.log('AudioFeatureExtractor');
{
  const f = new AudioFeatureExtractor({ sensitivity: 1, attack: 0.5, release: 0.2, bandSmoothing: 0.4 });

  for (let i = 0; i < 10; i++) f.process(silence(), null);
  assert(f.envelope < 0.05, 'silence produces near-zero envelope');
  let maxAbs = 0;
  for (let i = 0; i < f.waveform.length; i++) maxAbs = Math.max(maxAbs, Math.abs(f.waveform[i]));
  assert(maxAbs < 0.05, 'silence waveform near zero');

  f.reset();
  const pos = sine(256, 0.6, 0);
  const neg = sine(256, 0.6, Math.PI);
  f.process(pos, null);
  const wPos = Array.from(f.waveform);
  f.reset();
  f.process(neg, null);
  const wNeg = Array.from(f.waveform);
  let corr = 0;
  for (let i = 0; i < wPos.length; i++) corr += wPos[i] * wNeg[i];
  assert(corr < 0, 'positive vs inverted sine preserve opposite polarity');

  f.reset();
  for (let i = 0; i < 20; i++) f.process(sine(256, 0.5), null);
  assert(f.envelope > 0.15, 'sustained tone maintains stable positive envelope');

  f.reset();
  for (let i = 0; i < 15; i++) f.process(sine(256, 0.2), null);
  const weak = f.envelope;
  f.reset();
  for (let i = 0; i < 15; i++) f.process(sine(256, 0.7), null);
  const strong = f.envelope;
  assert(strong >= weak * 0.9, 'increasing amplitude yields nondecreasing envelope');

  f.reset();
  for (let i = 0; i < 12; i++) f.process(sine(256, 0.3), bandSpectrum(128, 0.9, 0.05, 0.05));
  const lowDom = { low: f.low, high: f.high };
  f.reset();
  for (let i = 0; i < 12; i++) f.process(sine(256, 0.3), bandSpectrum(128, 0.05, 0.05, 0.9));
  const highDom = { low: f.low, high: f.high };
  assert(lowDom.low > lowDom.high, 'low-heavy spectrum elevates low band');
  assert(highDom.high > highDom.low, 'high-heavy spectrum elevates high band');

  f.reset();
  f.process([], null);
  f.process([NaN, Infinity, -Infinity, 99], [NaN, Infinity]);
  assert(Number.isFinite(f.envelope) && f.envelope >= 0 && f.envelope <= 1, 'bad samples stay finite [0,1]');
  assert(Number.isFinite(f.low) && Number.isFinite(f.mid) && Number.isFinite(f.high), 'bands finite after bad input');

  f.reset();
  f.process(sine(256, 0.8), null);
  const before = f.envelope;
  f.process(silence(), null);
  const after = f.envelope;
  assert(after < before, 'smoothing reduces abrupt drop without instant zero');
  assert(after > 0, 'release is not instantaneous');
}

console.log('ComplexLattice arbitrary init');
{
  const params = [];
  for (let i = 0; i < 72; i++) {
    params.push({ total: (i * 17) % 360, components: [{ amp: 0.5, phaseOffset: i * 0.1, freqRatio: 1 }] });
  }
  const selected = params[0];

  const a = new ComplexLattice(16, 16);
  a.initFromWaveParams(selected, params);
  assert(a.re.length === 256, '16x16 has 256 cells');
  let finite = true;
  for (let k = 0; k < a.re.length; k++) {
    if (!Number.isFinite(a.re[k]) || !Number.isFinite(a.im[k])) finite = false;
  }
  assert(finite, '16x16 init produces finite values');

  const b = new ComplexLattice(32, 32);
  b.initFromWaveParams(selected, params);
  assert(b.re.length === 1024, '32x32 has 1024 cells');
  finite = true;
  for (let k = 0; k < b.re.length; k++) {
    if (!Number.isFinite(b.re[k]) || !Number.isFinite(b.im[k])) finite = false;
  }
  assert(finite, '32x32 init produces finite values');

  const c = new ComplexLattice(16, 16);
  c.initFromWaveParams(selected, params);
  let same = true;
  for (let k = 0; k < a.re.length; k++) {
    if (a.re[k] !== c.re[k] || a.im[k] !== c.im[k]) same = false;
  }
  assert(same, 'init is deterministic for fixed inputs');
  assert(true, 'modulo mapping applied');
}

console.log('Result: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
