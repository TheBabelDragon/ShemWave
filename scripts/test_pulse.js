/**
 * Node-runnable tests for PulseDetector, ContinuousEnvelopeDetector, PersistentField.
 * No microphone required. Run: node scripts/test_pulse.js
 */
import {
  PulseDetector,
  ContinuousEnvelopeDetector,
  PersistentField,
} from '../assets/js/pulse-injection.js';

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

function silence(n = 256) {
  return new Float32Array(n);
}

function tone(n = 256, amp = 0.4) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((i / n) * Math.PI * 8);
  return out;
}

function transient(n = 256, amp = 0.8, width = 8) {
  const out = new Float32Array(n);
  const mid = Math.floor(n / 2);
  for (let i = 0; i < width; i++) out[mid + i] = amp * (1 - i / width);
  return out;
}

function noise(n = 256, amp = 0.01) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (Math.random() * 2 - 1) * amp;
  return out;
}

console.log('PulseDetector');
{
  const d = new PulseDetector({
    threshold: 0.08,
    sensitivity: 1,
    refractoryMs: 100,
    noiseFloorAlpha: 0.01,
  });
  assert(d.process(silence()) === null, 'silence does not create pulse');
  assert(d.pulseCount === 0, 'pulse count stays 0 after silence');
  const p1 = d.process(transient(256, 0.9), 1000);
  assert(p1 !== null && p1.strength > 0, 'transient above threshold creates pulse');
  assert(d.pulseCount === 1, 'pulse count increments');
  const p2 = d.process(transient(256, 0.9), 1050);
  assert(p2 === null, 'refractory suppresses duplicate within window');
  assert(d.pulseCount === 1, 'pulse count unchanged during refractory');
  d.process(silence(), 1150);
  d.process(silence(), 1160);
  const p3 = d.process(transient(256, 0.9), 1300);
  assert(p3 !== null, 'pulse accepted after refractory + re-arm');
  assert(d.pulseCount === 2, 'second pulse counted');
  d.reset();
  d.threshold = 0.2;
  d.sensitivity = 0.5;
  for (let t = 0; t < 5; t++) d.process(silence(), 2000 + t);
  const lowSens = d.process(transient(256, 0.22), 2100);
  d.reset();
  d.threshold = 0.2;
  d.sensitivity = 3.0;
  for (let t = 0; t < 5; t++) d.process(silence(), 3000 + t);
  const highSens = d.process(transient(256, 0.22), 3100);
  assert(
    highSens !== null || lowSens === null,
    'higher sensitivity is at least as likely to detect weak transient'
  );
  assert(d.forcePulse(1).strength === 1, 'forcePulse after sensitivity change');
  d.reset();
  const forced = d.forcePulse(2.5, 4000);
  assert(forced.strength === 2.5, 'forcePulse sets strength');
  assert(d.pulseCount === 1, 'forcePulse increments count after reset');
}

console.log('ContinuousEnvelopeDetector');
{
  const e = new ContinuousEnvelopeDetector({
    sensitivity: 1,
    noiseFloorAlpha: 0.02,
    attack: 0.5,
    release: 0.15,
    margin: 1.75,
    headroom: 0.2,
    minThreshold: 0.02,
  });

  for (let i = 0; i < 8; i++) e.process(silence());
  assert(e.lastLevel === 0, 'silence produces zero injection level');

  e.reset();
  for (let i = 0; i < 12; i++) e.process(noise(256, 0.008));
  assert(e.lastLevel === 0, 'sub-threshold noise produces zero level');

  e.reset();
  for (let i = 0; i < 6; i++) e.process(silence());
  let positiveWindows = 0;
  for (let i = 0; i < 20; i++) {
    const lvl = e.process(tone(256, 0.35));
    if (lvl > 0.05) positiveWindows += 1;
  }
  assert(positiveWindows >= 10, 'sustained moderate input stays positive over windows');

  e.reset();
  for (let i = 0; i < 6; i++) e.process(silence());
  const levels = [];
  for (let i = 0; i < 40; i++) levels.push(e.process(tone(256, 0.4)));
  const late = levels.slice(-10).reduce((a, b) => a + b, 0) / 10;
  assert(late > 0.15, 'sustained input does not disappear via noise-floor chase');

  e.reset();
  for (let i = 0; i < 6; i++) e.process(silence());
  for (let i = 0; i < 12; i++) e.process(tone(256, 0.25));
  const weakLvl = e.lastLevel;
  e.reset();
  for (let i = 0; i < 6; i++) e.process(silence());
  for (let i = 0; i < 12; i++) e.process(tone(256, 0.7));
  const strongLvl = e.lastLevel;
  assert(strongLvl >= weakLvl * 0.9, 'stronger input maps to equal or stronger level');

  e.reset();
  for (let i = 0; i < 6; i++) e.process(silence());
  for (let i = 0; i < 15; i++) e.process(tone(256, 0.45));
  assert(e.lastLevel > 0.1, 'precondition: active before silence release');
  for (let i = 0; i < 80; i++) e.process(silence());
  assert(e.lastLevel === 0, 'return to silence eventually reaches zero');

  e.reset();
  e.process([]);
  e.process([NaN, Infinity, -Infinity, 1e9, -1e9]);
  e.process(null);
  assert(
    Number.isFinite(e.lastLevel) && e.lastLevel >= 0 && e.lastLevel <= 1,
    'NaN/Inf/empty/out-of-range stay finite and in [0,1]'
  );
  assert(
    Number.isFinite(e.lastRms) && Number.isFinite(e.noiseFloor),
    'diagnostics remain finite after bad samples'
  );
}

console.log('PersistentField');
{
  const f = new PersistentField(4, 4, { decay: 0.5, maxValue: 5 });
  f.inject(1, 1, 2.0);
  assert(f.values[f.index(1, 1)] > 0, 'inject raises cell');
  const e0 = f.energy();
  f.step();
  assert(f.energy() < e0, 'field decays over time');
  assert(f.isBounded(), 'bounded after single inject');
  f.clear();
  assert(f.energy() === 0, 'clear zeros field');
  for (let i = 0; i < 50; i++) f.inject(i % 4, i % 4, 3);
  assert(f.isBounded(), 'bounded under repeated high-amplitude inputs');
  f.clear();
  f.inject(0, 0, 1);
  f.inject(2, 2, 1);
  const eMulti = f.energy();
  assert(eMulti > 1.5, 'multiple injections accumulate');
  f.step();
  f.step();
  assert(f.energy() < eMulti, 'accumulated energy still decays');
  f.decay = 0.99;
  f.clear();
  f.inject(1, 1, 1);
  const before = f.energy();
  f.step();
  assert(f.energy() > before * 0.9, 'higher decay retains more energy');

  f.clear();
  f.decay = 0.9;
  f.maxValue = 8;
  for (let i = 0; i < 200; i++) {
    f.injectContinuous(0.4);
    f.step();
  }
  assert(f.isBounded(), 'repeated continuous injection remains bounded');
  assert(f.energy() < f.rows * f.cols * f.maxValue + 1, 'energy below absolute ceiling');
}

console.log('Pulse strength mapping');
{
  const d = new PulseDetector({
    threshold: 0.05,
    sensitivity: 1,
    refractoryMs: 0,
    noiseFloorAlpha: 0.01,
  });
  for (let t = 0; t < 3; t++) d.process(silence(), t);
  const weak = d.process(transient(128, 0.3), 10);
  d.process(silence(), 20);
  d.process(silence(), 21);
  const strong = d.process(transient(128, 0.95), 30);
  if (weak && strong) {
    assert(
      strong.strength >= weak.strength * 0.85,
      'stronger transient maps to higher or equal strength'
    );
  } else {
    assert(strong !== null, 'strong transient is detected');
  }
}

console.log('Result: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
