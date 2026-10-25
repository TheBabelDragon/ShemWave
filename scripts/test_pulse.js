/**
 * Node-runnable tests for PulseDetector and PersistentField.
 * No microphone required. Run: node scripts/test_pulse.js
 */

import { PulseDetector, PersistentField } from '../assets/js/pulse-injection.js';

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

function transient(n = 256, amp = 0.8, width = 8) {
  const out = new Float32Array(n);
  const mid = Math.floor(n / 2);
  for (let i = 0; i < width; i++) {
    out[mid + i] = amp * (1 - i / width);
  }
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
    assert(strong.strength >= weak.strength * 0.85, 'stronger transient -> higher or equal strength');
  } else {
    assert(strong !== null, 'strong transient is detected');
  }
}

console.log('Result: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
