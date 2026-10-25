/**
 * ShemWave application: YAML-driven static renderer + acoustic field injection.
 * Paths are relative for GitHub Pages subpath compatibility.
 */

import { TripletStore } from './triplets.js';
import { gematria, tripletToWaveParams } from './gematria.js';
import { ComplexLattice } from './simulation.js';
import { Renderer } from './renderer.js';
import { AudioInput } from './audio.js';
import { exportPNG, exportPresetJSON, copyPreset } from './export.js';
import {
  PulseDetector,
  ContinuousEnvelopeDetector,
  PersistentField,
} from './pulse-injection.js';

const BASE = new URL('.', import.meta.url);
const ROOT = new URL('../../', BASE);

function asset(path) {
  return new URL(path, ROOT).href;
}

async function loadYaml(url) {
  if (typeof jsyaml === 'undefined') throw new Error('js-yaml not loaded');
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load ' + url + ': ' + res.status);
  return jsyaml.load(await res.text());
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function validateParams(params, bounds) {
  const out = { ...params };
  const errors = [];
  for (const [key, range] of Object.entries(bounds || {})) {
    if (out[key] === undefined) continue;
    if (typeof out[key] !== 'number' || !Number.isFinite(out[key])) {
      errors.push(key + ': must be a finite number');
      delete out[key];
      continue;
    }
    if (out[key] < range.min || out[key] > range.max) {
      errors.push(key + ': out of range [' + range.min + ', ' + range.max + ']');
      out[key] = clamp(out[key], range.min, range.max);
    }
  }
  return { params: out, errors };
}

const state = {
  triplets: new TripletStore(),
  config: null,
  presets: [],
  params: {},
  lattice: null,
  renderer: null,
  audio: new AudioInput(),
  detector: new PulseDetector(),
  envelope: new ContinuousEnvelopeDetector(),
  field: null,
  inputMode: 'manual',
  raf: null,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  pulseStrengthScale: 1.2,
  continuousStrength: 0.6,
  continuousLevel: 0,
  lastContinuousInjectAt: 0,
};

function setStatus(msg, isError) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', !!isError);
}

function applyParams(p) {
  const b = state.config && state.config.bounds ? state.config.bounds : {};
  const { params, errors } = validateParams(p, b);
  Object.assign(state.params, params);
  if (state.renderer) {
    state.renderer.mode = state.params.mode || 'lattice';
    state.renderer.spatialFrequency = state.params.spatialFrequency ?? 1;
    state.renderer.waveSpeed = state.params.waveSpeed ?? 0.5;
    state.renderer.symmetry = state.params.symmetry ?? 1;
    const pal =
      state.config && state.config.palettes && state.config.palettes[state.params.palette];
    if (pal) state.renderer.setPalette(pal);
  }
  if (state.field && state.params.fieldDecay !== undefined) {
    state.field.decay = state.params.fieldDecay;
  }
  if (state.params.sensitivity !== undefined) {
    state.detector.sensitivity = state.params.sensitivity;
    state.envelope.sensitivity = state.params.sensitivity;
  }
  if (state.params.refractoryMs !== undefined) {
    state.detector.refractoryMs = state.params.refractoryMs;
  }
  if (state.params.pulseStrength !== undefined) {
    state.pulseStrengthScale = state.params.pulseStrength;
  }
  if (state.params.continuousStrength !== undefined) {
    state.continuousStrength = state.params.continuousStrength;
  }
  syncControls();
  if (errors.length) setStatus(errors.join('; '), true);
  return errors;
}

function syncControls() {
  const p = state.params;
  const map = {
    mode: 'ctrl-mode',
    spatialFrequency: 'ctrl-freq',
    waveSpeed: 'ctrl-speed',
    neighborCoupling: 'ctrl-coupling',
    damping: 'ctrl-damping',
    symmetry: 'ctrl-symmetry',
    palette: 'ctrl-palette',
    perturbationStrength: 'ctrl-perturb',
    sensitivity: 'ctrl-sensitivity',
    pulseStrength: 'ctrl-pulse-strength',
    continuousStrength: 'ctrl-continuous-strength',
    fieldDecay: 'ctrl-field-decay',
    refractoryMs: 'ctrl-refractory',
  };
  for (const [k, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el || p[k] === undefined) continue;
    el.value = p[k];
    const out = document.getElementById(id + '-val');
    if (out) {
      const n = Number(p[k]);
      out.textContent = Number.isFinite(n) ? String(+n.toFixed(2)) : String(p[k]);
    }
  }
  const modeSel = document.getElementById('input-mode');
  if (modeSel) modeSel.value = state.inputMode;
}

function rebuildLattice() {
  const rows = state.params.latticeRows || 8;
  const cols = state.params.latticeCols || 9;
  state.lattice = new ComplexLattice(rows, cols);
  if (!state.field) {
    state.field = new PersistentField(rows, cols, {
      decay: state.params.fieldDecay ?? 0.92,
    });
  } else {
    state.field.resize(rows, cols);
    state.field.decay = state.params.fieldDecay ?? 0.92;
  }
  const mapping = state.config.mapping;
  const allParams = state.triplets.triplets.map((t) =>
    tripletToWaveParams(t.letters, mapping)
  );
  const selected = state.triplets.waveParams(mapping);
  state.lattice.initFromWaveParams(selected, allParams);
  if (state.renderer) state.renderer.waveParams = selected;
  if ((state.params.perturbationStrength || 0) > 0) {
    state.lattice.inject(0, 0, state.params.perturbationStrength);
  }
}

function updateMetrics() {
  if (!state.lattice) return;
  const m = state.lattice.metrics();
  const el = document.getElementById('metrics');
  if (el) {
    const fieldE = state.field ? state.field.energy().toFixed(3) : '0';
    el.textContent =
      'mean ' +
      m.meanIntensity.toFixed(4) +
      ' · var ' +
      m.variance.toFixed(4) +
      ' · H ' +
      m.entropy.toFixed(4) +
      ' · fieldE ' +
      fieldE +
      ' (simulated)';
  }
  const diag = document.getElementById('pulse-diag');
  if (!diag) return;
  if (state.inputMode === 'pulse') {
    const d = state.detector.diagnostics();
    diag.textContent =
      'level ' +
      d.level.toFixed(3) +
      ' · rms ' +
      d.rms.toFixed(3) +
      ' · thr ' +
      d.threshold.toFixed(3) +
      ' · pulses ' +
      d.pulseCount +
      (d.armed ? '' : ' · recovering');
  } else if (state.inputMode === 'continuous-inject') {
    const d = state.envelope.diagnostics();
    const fieldE = state.field ? state.field.energy().toFixed(3) : '0';
    diag.textContent =
      'rms ' +
      d.rms.toFixed(3) +
      ' · floor ' +
      d.noiseFloor.toFixed(4) +
      ' · thr ' +
      d.threshold.toFixed(3) +
      ' · inj ' +
      d.level.toFixed(3) +
      ' · fieldE ' +
      fieldE +
      (d.active ? ' · active' : ' · idle');
  } else {
    diag.textContent = '';
  }
}

function applyContinuousInjection(now) {
  const level = state.continuousLevel;
  if (!(level > 0) || !state.field) return;
  if (now - state.lastContinuousInjectAt < 16) return;
  state.lastContinuousInjectAt = now;
  const amount = level * state.continuousStrength * 0.12;
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  state.field.injectContinuous(amount);
  if (state.lattice) {
    const midR = Math.floor(state.lattice.rows / 2);
    const midC = Math.floor(state.lattice.cols / 2);
    state.lattice.inject(midR, midC, amount * 0.35);
  }
}

function frame() {
  if (!state.lattice || !state.renderer) return;
  const now =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (state.inputMode === 'continuous-inject') {
    applyContinuousInjection(now);
  }
  const steps = state.params.stepsPerFrame || 1;
  for (let i = 0; i < steps; i++) {
    if (state.field) state.field.step();
    state.lattice.step(
      state.params.neighborCoupling ?? 0.22,
      state.params.nonlinearity ?? 0.03,
      state.params.damping ?? 0.08
    );
  }
  state.renderer.draw(state.lattice, state.field);
  updateMetrics();
  state.raf = requestAnimationFrame(frame);
}

function startLoop() {
  if (state.raf) cancelAnimationFrame(state.raf);
  if (state.reducedMotion) {
    if (state.lattice && state.renderer) {
      state.renderer.draw(state.lattice, state.field);
      updateMetrics();
    }
    return;
  }
  state.raf = requestAnimationFrame(frame);
}

function fitCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap || !state.renderer) return;
  let w = wrap.clientWidth;
  let h = wrap.clientHeight;
  if (h < 160) h = Math.max(160, Math.round(w * 0.62));
  state.renderer.resize(w, h);
}

function populateTripletSelect() {
  const sel = document.getElementById('triplet-select');
  if (!sel) return;
  sel.innerHTML = '';
  state.triplets.triplets.forEach((t, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent =
      String(i + 1).padStart(2, '0') + ' · ' + t.display + ' · g=' + t.gematria;
    sel.appendChild(opt);
  });
  sel.value = String(state.triplets.selectedIndex);
}

function populatePresets() {
  const sel = document.getElementById('preset-select');
  if (!sel) return;
  sel.innerHTML = '';
  state.presets.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
}

function populateModesAndPalettes() {
  const modeSel = document.getElementById('ctrl-mode');
  const palSel = document.getElementById('ctrl-palette');
  if (modeSel && state.config.modes) {
    modeSel.innerHTML = state.config.modes
      .map((m) => '<option value="' + m.id + '">' + m.label + '</option>')
      .join('');
  }
  if (palSel && state.config.palettes) {
    palSel.innerHTML = Object.keys(state.config.palettes)
      .map((k) => '<option value="' + k + '">' + k + '</option>')
      .join('');
  }
}

async function stopAudio() {
  await state.audio.stop();
  state.continuousLevel = 0;
  state.envelope.reset();
  setStatus('Audio stopped');
}

function wireAudioForMode() {
  state.audio.onLevel = null;
  state.audio.onSamples = null;
  state.continuousLevel = 0;

  if (state.inputMode === 'continuous') {
    state.audio.onLevel = (bass, overall) => {
      const targetFreq = clamp(0.5 + bass * 3, 0.1, 4);
      const targetPert = overall * 3;
      const curFreq = state.params.spatialFrequency ?? 1;
      const curPert = state.params.perturbationStrength ?? 0;
      const a = 0.18;
      applyParams({
        spatialFrequency: curFreq + (targetFreq - curFreq) * a,
        perturbationStrength: curPert + (targetPert - curPert) * a,
      });
    };
  } else if (state.inputMode === 'pulse') {
    state.audio.onSamples = (samples) => {
      const evt = state.detector.process(samples);
      if (evt) {
        const amount = evt.strength * state.pulseStrengthScale;
        if (state.field) {
          const pos = state.field.injectRandom(amount);
          state.lattice && state.lattice.inject(pos.i, pos.j, amount);
        } else if (state.lattice) {
          state.lattice.inject(
            Math.floor(Math.random() * state.lattice.rows),
            Math.floor(Math.random() * state.lattice.cols),
            amount
          );
        }
        setStatus(
          'Pulse #' + state.detector.pulseCount + ' strength ' + amount.toFixed(2)
        );
      }
    };
  } else if (state.inputMode === 'continuous-inject') {
    state.audio.onSamples = (samples) => {
      state.continuousLevel = state.envelope.process(samples);
    };
  }
}

function setInputMode(mode) {
  const prev = state.inputMode;
  state.inputMode = mode;
  if (mode === 'manual' && prev !== 'manual') stopAudio();
  if (prev === 'continuous' && mode !== 'continuous') {
    applyParams({ perturbationStrength: 0 });
  }
  if (prev === 'continuous-inject' && mode !== 'continuous-inject') {
    state.continuousLevel = 0;
    state.envelope.reset();
  }
  wireAudioForMode();
  syncControls();
  const msgs = {
    manual: 'Input: Manual / Baseline (triplet-driven)',
    continuous: 'Input: Continuous Audio — start mic or file (modulates params)',
    pulse: 'Input: Pulse Injection — discrete transients into field',
    'continuous-inject':
      'Input: Continuous Injection — sustained mic level drives field',
  };
  setStatus(msgs[mode] || 'Input mode: ' + mode);
}

function bindControls() {
  const inputMode = document.getElementById('input-mode');
  if (inputMode) {
    inputMode.addEventListener('change', (e) => setInputMode(e.target.value));
  }

  const tripletSel = document.getElementById('triplet-select');
  if (tripletSel) {
    tripletSel.addEventListener('change', (e) => {
      state.triplets.select(Number(e.target.value));
      rebuildLattice();
      state.field && state.field.clear();
      setStatus(
        'Triplet ' +
          state.triplets.selected.display +
          ' (g=' +
          state.triplets.selected.gematria +
          ')'
      );
    });
  }

  const presetSel = document.getElementById('preset-select');
  if (presetSel) {
    presetSel.addEventListener('change', (e) => {
      const pr = state.presets.find((p) => p.id === e.target.value);
      if (!pr) return;
      applyParams({ ...state.config.defaults, ...pr.params });
      rebuildLattice();
      state.field && state.field.clear();
      setStatus('Preset: ' + pr.name);
    });
  }

  const btnReset = document.getElementById('btn-reset');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      applyParams({ ...state.config.defaults });
      rebuildLattice();
      state.field && state.field.clear();
      state.detector.reset();
      state.envelope.reset();
      state.continuousLevel = 0;
      setStatus('Reset to defaults');
    });
  }

  const continuous = [
    ['ctrl-freq', 'spatialFrequency'],
    ['ctrl-speed', 'waveSpeed'],
    ['ctrl-coupling', 'neighborCoupling'],
    ['ctrl-damping', 'damping'],
    ['ctrl-symmetry', 'symmetry'],
    ['ctrl-perturb', 'perturbationStrength'],
    ['ctrl-sensitivity', 'sensitivity'],
    ['ctrl-pulse-strength', 'pulseStrength'],
    ['ctrl-continuous-strength', 'continuousStrength'],
    ['ctrl-field-decay', 'fieldDecay'],
    ['ctrl-refractory', 'refractoryMs'],
  ];
  for (const [id, key] of continuous) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      applyParams({ [key]: v });
      if (key === 'perturbationStrength' && v > 0) {
        state.lattice && state.lattice.inject(0, 0, v * 0.1);
      }
      if (key === 'fieldDecay' && state.field) state.field.decay = v;
      if (key === 'sensitivity') {
        state.detector.sensitivity = v;
        state.envelope.sensitivity = v;
      }
      if (key === 'refractoryMs') state.detector.refractoryMs = v;
      if (key === 'pulseStrength') state.pulseStrengthScale = v;
      if (key === 'continuousStrength') state.continuousStrength = v;
    });
  }

  const ctrlMode = document.getElementById('ctrl-mode');
  if (ctrlMode) {
    ctrlMode.addEventListener('change', (e) => applyParams({ mode: e.target.value }));
  }
  const ctrlPal = document.getElementById('ctrl-palette');
  if (ctrlPal) {
    ctrlPal.addEventListener('change', (e) => applyParams({ palette: e.target.value }));
  }

  const btnPause = document.getElementById('btn-pause');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      if (!state.lattice) return;
      state.lattice.paused = !state.lattice.paused;
      if (state.field) state.field.paused = state.lattice.paused;
      btnPause.textContent = state.lattice.paused ? 'Resume' : 'Pause';
    });
  }

  const btnPulse = document.getElementById('btn-pulse');
  if (btnPulse) {
    btnPulse.addEventListener('click', () => {
      if (!state.lattice) return;
      state.lattice.inject(
        Math.floor(Math.random() * state.lattice.rows),
        Math.floor(Math.random() * state.lattice.cols),
        1.5
      );
      setStatus('Lattice pulse injected');
    });
  }

  const btnManual = document.getElementById('btn-manual-pulse');
  if (btnManual) {
    btnManual.addEventListener('click', () => {
      const evt = state.detector.forcePulse(state.pulseStrengthScale);
      if (state.field) {
        const pos = state.field.injectRandom(evt.strength);
        state.lattice && state.lattice.inject(pos.i, pos.j, evt.strength);
      } else if (state.lattice) {
        state.lattice.inject(
          Math.floor(Math.random() * state.lattice.rows),
          Math.floor(Math.random() * state.lattice.cols),
          evt.strength
        );
      }
      setStatus(
        'Manual pulse #' +
          state.detector.pulseCount +
          ' strength ' +
          evt.strength.toFixed(2)
      );
    });
  }

  const btnClear = document.getElementById('btn-clear-field');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      state.field && state.field.clear();
      state.detector.reset();
      state.envelope.reset();
      state.continuousLevel = 0;
      setStatus('Pulse field cleared');
    });
  }

  const btnPng = document.getElementById('btn-png');
  if (btnPng) {
    btnPng.addEventListener('click', async () => {
      try {
        await exportPNG(document.getElementById('canvas'));
        setStatus('PNG exported');
      } catch (e) {
        setStatus('PNG: ' + e.message, true);
      }
    });
  }

  const btnJson = document.getElementById('btn-json');
  if (btnJson) {
    btnJson.addEventListener('click', () => {
      exportPresetJSON(state.params);
      setStatus('Preset JSON exported');
    });
  }

  const btnCopy = document.getElementById('btn-copy');
  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      try {
        await copyPreset(state.params);
        setStatus('Preset copied to clipboard');
      } catch (e) {
        setStatus('Copy: ' + e.message, true);
      }
    });
  }

  const presetImport = document.getElementById('preset-import');
  if (presetImport) {
    presetImport.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        applyParams(data.params || data);
        rebuildLattice();
        setStatus('Preset imported');
      } catch (err) {
        setStatus('Import: ' + err.message, true);
      }
    });
  }

  const btnMic = document.getElementById('btn-mic');
  if (btnMic) {
    btnMic.addEventListener('click', async () => {
      try {
        await state.audio.startMic();
        wireAudioForMode();
        const label =
          state.inputMode === 'pulse'
            ? 'Microphone active — pulse mode (local only)'
            : state.inputMode === 'continuous-inject'
              ? 'Microphone active — continuous injection (local only)'
              : 'Microphone active — continuous audio (local only)';
        setStatus(label);
      } catch (e) {
        setStatus('Mic: ' + e.message, true);
      }
    });
  }

  const btnMicStop = document.getElementById('btn-mic-stop');
  if (btnMicStop) {
    btnMicStop.addEventListener('click', async () => {
      await stopAudio();
    });
  }

  const audioFile = document.getElementById('audio-file');
  if (audioFile) {
    audioFile.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        await state.audio.startFile(file);
        wireAudioForMode();
        setStatus('Playing ' + file.name + ' (local only)');
      } catch (err) {
        setStatus('Audio file: ' + err.message, true);
      }
    });
  }

  window.addEventListener('beforeunload', () => state.audio.stop());

  const wrap = document.getElementById('canvas-wrap');
  if (wrap && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => fitCanvas());
    ro.observe(wrap);
  } else {
    window.addEventListener('resize', fitCanvas);
  }
}

async function main() {
  setStatus('Loading YAML…');
  try {
    const [tripData, presetData, rendererData] = await Promise.all([
      loadYaml(asset('data/triplets.yaml')),
      loadYaml(asset('data/presets.yaml')),
      loadYaml(asset('data/renderer.yaml')),
    ]);

    if (!state.triplets.load(tripData)) {
      setStatus('Triplet errors: ' + state.triplets.errors.join('; '), true);
    }
    if (state.triplets.length !== 72) {
      setStatus(
        'Expected 72 triplets, loaded ' + state.triplets.length,
        state.triplets.length === 0
      );
    }

    state.config = rendererData;
    state.presets = presetData.presets || [];
    state.params = {
      ...rendererData.defaults,
      sensitivity: rendererData.defaults.sensitivity ?? 1.0,
      pulseStrength: rendererData.defaults.pulseStrength ?? 1.2,
      continuousStrength: rendererData.defaults.continuousStrength ?? 0.6,
      fieldDecay: rendererData.defaults.fieldDecay ?? 0.92,
      refractoryMs: rendererData.defaults.refractoryMs ?? 180,
    };
    state.continuousStrength = state.params.continuousStrength;

    const canvas = document.getElementById('canvas');
    state.renderer = new Renderer(canvas);
    fitCanvas();

    populateModesAndPalettes();
    populateTripletSelect();
    populatePresets();
    applyParams(state.params);
    rebuildLattice();
    bindControls();
    startLoop();

    setStatus(
      'Loaded ' +
        state.triplets.length +
        ' triplets · YAML is source of truth · simulated quantities only'
    );
  } catch (e) {
    console.error(e);
    setStatus(String(e.message || e), true);
  }
}

main();
