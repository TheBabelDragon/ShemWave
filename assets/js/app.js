/**
 * ShemWave application: YAML-driven static renderer + acoustic pulse injection.
 * Paths are relative for GitHub Pages subpath compatibility.
 *
 * Layers (kept separate):
 *  - Canonical Hebrew source text (triplets.yaml)
 *  - Gematria + wave-parameter mapping
 *  - Baseline renderer configuration
 *  - Audio feature extraction (AudioInput)
 *  - Pulse-event detection (PulseDetector)
 *  - Persistent field state (PersistentField)
 *  - Canvas rendering (Renderer + ComplexLattice)
 */

import { TripletStore } from './triplets.js';
import { gematria, tripletToWaveParams } from './gematria.js';
import { ComplexLattice } from './simulation.js';
import { Renderer } from './renderer.js';
import { AudioInput } from './audio.js';
import { exportPNG, exportPresetJSON, copyPreset } from './export.js';
import { PulseDetector, PersistentField } from './pulse-injection.js';

const BASE = new URL('.', import.meta.url);
const ROOT = new URL('../../', BASE);

function asset(path) {
  return new URL(path, ROOT).href;
}

async function loadYaml(url) {
  if (typeof jsyaml === 'undefined') {
    throw new Error('js-yaml not loaded');
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const text = await res.text();
  return jsyaml.load(text);
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
      errors.push(`${key}: must be a finite number`);
      delete out[key];
      continue;
    }
    if (out[key] < range.min || out[key] > range.max) {
      errors.push(`${key}: out of range [${range.min}, ${range.max}]`);
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
  field: null,
  inputMode: 'manual',
  raf: null,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  pulseStrengthScale: 1.2,
};

function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

function applyParams(p) {
  const b = state.config?.bounds || {};
  const { params, errors } = validateParams(p, b);
  Object.assign(state.params, params);
  if (state.renderer) {
    state.renderer.mode = state.params.mode || 'lattice';
    state.renderer.spatialFrequency = state.params.spatialFrequency ?? 1;
    state.renderer.waveSpeed = state.params.waveSpeed ?? 0.5;
    state.renderer.symmetry = state.params.symmetry ?? 1;
    const pal = state.config?.palettes?.[state.params.palette];
    if (pal) state.renderer.setPalette(pal);
  }
  if (state.field && state.params.fieldDecay !== undefined) {
    state.field.decay = state.params.fieldDecay;
  }
  if (state.params.sensitivity !== undefined) {
    state.detector.sensitivity = state.params.sensitivity;
  }
  if (state.params.refractoryMs !== undefined) {
    state.detector.refractoryMs = state.params.refractoryMs;
  }
  if (state.params.pulseStrength !== undefined) {
    state.pulseStrengthScale = state.params.pulseStrength;
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
    fieldDecay: 'ctrl-field-decay',
    refractoryMs: 'ctrl-refractory',
  };
  for (const [k, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el || p[k] === undefined) continue;
    el.value = p[k];
    const out = document.getElementById(`${id}-val`);
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
      `mean ${m.meanIntensity.toFixed(4)} · var ${m.variance.toFixed(4)} · H ${m.entropy.toFixed(4)} · fieldE ${fieldE} (simulated)`;
  }
  const diag = document.getElementById('pulse-diag');
  if (diag && state.inputMode === 'pulse') {
    const d = state.detector.diagnostics();
    diag.textContent =
      `level ${d.level.toFixed(3)} · rms ${d.rms.toFixed(3)} · thr ${d.threshold.toFixed(3)} · pulses ${d.pulseCount}` +
      (d.armed ? '' : ' · recovering');
  } else if (diag) {
    diag.textContent = '';
  }
}

function frame() {
  if (!state.lattice || !state.renderer) return;
  const steps = state.params.stepsPerFrame || 1;
  for (let i = 0; i < steps; i++) {
    if (state.field) {
      state.field.step();
      state.field.applyToLattice(state.lattice);
    }
    state.lattice.step(
      state.params.neighborCoupling ?? 0.22,
      state.params.nonlinearity ?? 0.03,
      state.params.damping ?? 0.08
    );
  }
  state.renderer.draw(state.lattice);
  updateMetrics();
  state.raf = requestAnimationFrame(frame);
}

function startLoop() {
  if (state.raf) cancelAnimationFrame(state.raf);
  if (state.reducedMotion) {
    if (state.lattice && state.renderer) {
      state.renderer.draw(state.lattice);
      updateMetrics();
    }
    return;
  }
  state.raf = requestAnimationFrame(frame);
}

function populateTripletSelect() {
  const sel = document.getElementById('triplet-select');
  if (!sel) return;
  sel.innerHTML = '';
  state.triplets.triplets.forEach((t, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${String(i + 1).padStart(2, '0')} · ${t.display} · g=${t.gematria}`;
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
      .map((m) => `<option value="${m.id}">${m.label}</option>`)
      .join('');
  }
  if (palSel && state.config.palettes) {
    palSel.innerHTML = Object.keys(state.config.palettes)
      .map((k) => `<option value="${k}">${k}</option>`)
      .join('');
  }
}

async function stopAudio() {
  await state.audio.stop();
  setStatus('Audio stopped');
}

function wireAudioForMode() {
  state.audio.onLevel = null;
  state.audio.onSamples = null;

  if (state.inputMode === 'continuous') {
    state.audio.onLevel = (bass, overall) => {
      applyParams({
        spatialFrequency: clamp(0.5 + bass * 3, 0.1, 4),
        perturbationStrength: overall * 3,
      });
    };
  } else if (state.inputMode === 'pulse') {
    state.audio.onSamples = (samples) => {
      const evt = state.detector.process(samples);
      if (evt && state.field) {
        const amount = evt.strength * state.pulseStrengthScale;
        state.field.injectRandom(amount);
        setStatus(`Pulse #${state.detector.pulseCount} strength ${amount.toFixed(2)}`);
      }
    };
  }
}

function setInputMode(mode) {
  const prev = state.inputMode;
  state.inputMode = mode;
  if (mode === 'manual' && prev !== 'manual') {
    stopAudio();
  }
  wireAudioForMode();
  syncControls();
  setStatus(
    mode === 'manual'
      ? 'Input: Manual / Baseline (triplet-driven)'
      : mode === 'continuous'
        ? 'Input: Continuous Audio — start mic or file'
        : 'Input: Pulse Injection — start mic, clap or use Inject Pulse'
  );
}

function bindControls() {
  document.getElementById('input-mode')?.addEventListener('change', (e) => {
    setInputMode(e.target.value);
  });

  document.getElementById('triplet-select')?.addEventListener('change', (e) => {
    state.triplets.select(Number(e.target.value));
    rebuildLattice();
    state.field?.clear();
    setStatus(`Triplet ${state.triplets.selected.display} (g=${state.triplets.selected.gematria})`);
  });

  document.getElementById('preset-select')?.addEventListener('change', (e) => {
    const pr = state.presets.find((p) => p.id === e.target.value);
    if (!pr) return;
    applyParams({ ...state.config.defaults, ...pr.params });
    rebuildLattice();
    state.field?.clear();
    setStatus(`Preset: ${pr.name}`);
  });

  document.getElementById('btn-reset')?.addEventListener('click', () => {
    applyParams({ ...state.config.defaults });
    rebuildLattice();
    state.field?.clear();
    state.detector.reset();
    setStatus('Reset to defaults');
  });

  const continuous = [
    ['ctrl-freq', 'spatialFrequency'],
    ['ctrl-speed', 'waveSpeed'],
    ['ctrl-coupling', 'neighborCoupling'],
    ['ctrl-damping', 'damping'],
    ['ctrl-symmetry', 'symmetry'],
    ['ctrl-perturb', 'perturbationStrength'],
    ['ctrl-sensitivity', 'sensitivity'],
    ['ctrl-pulse-strength', 'pulseStrength'],
    ['ctrl-field-decay', 'fieldDecay'],
    ['ctrl-refractory', 'refractoryMs'],
  ];
  for (const [id, key] of continuous) {
    document.getElementById(id)?.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      applyParams({ [key]: v });
      if (key === 'perturbationStrength' && v > 0) {
        state.lattice?.inject(0, 0, v * 0.1);
      }
      if (key === 'fieldDecay' && state.field) state.field.decay = v;
      if (key === 'sensitivity') state.detector.sensitivity = v;
      if (key === 'refractoryMs') state.detector.refractoryMs = v;
      if (key === 'pulseStrength') state.pulseStrengthScale = v;
    });
  }
  document.getElementById('ctrl-mode')?.addEventListener('change', (e) => {
    applyParams({ mode: e.target.value });
  });
  document.getElementById('ctrl-palette')?.addEventListener('change', (e) => {
    applyParams({ palette: e.target.value });
  });

  document.getElementById('btn-pause')?.addEventListener('click', () => {
    if (!state.lattice) return;
    state.lattice.paused = !state.lattice.paused;
    if (state.field) state.field.paused = state.lattice.paused;
    document.getElementById('btn-pause').textContent = state.lattice.paused
      ? 'Resume'
      : 'Pause';
  });

  document.getElementById('btn-pulse')?.addEventListener('click', () => {
    state.lattice?.inject(
      Math.floor(Math.random() * (state.lattice.rows || 8)),
      Math.floor(Math.random() * (state.lattice.cols || 9)),
      1.5
    );
    setStatus('Lattice pulse injected');
  });

  document.getElementById('btn-manual-pulse')?.addEventListener('click', () => {
    const evt = state.detector.forcePulse(state.pulseStrengthScale);
    if (state.field) {
      state.field.injectRandom(evt.strength);
    }
    setStatus(`Manual pulse #${state.detector.pulseCount} strength ${evt.strength.toFixed(2)}`);
  });

  document.getElementById('btn-clear-field')?.addEventListener('click', () => {
    state.field?.clear();
    state.detector.reset();
    setStatus('Pulse field cleared');
  });

  document.getElementById('btn-png')?.addEventListener('click', async () => {
    try {
      await exportPNG(document.getElementById('canvas'));
      setStatus('PNG exported');
    } catch (e) {
      setStatus(`PNG: ${e.message}`, true);
    }
  });

  document.getElementById('btn-json')?.addEventListener('click', () => {
    exportPresetJSON(state.params);
    setStatus('Preset JSON exported');
  });

  document.getElementById('btn-copy')?.addEventListener('click', async () => {
    try {
      await copyPreset(state.params);
      setStatus('Preset copied to clipboard');
    } catch (e) {
      setStatus(`Copy: ${e.message}`, true);
    }
  });

  document.getElementById('preset-import')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const params = data.params || data;
      applyParams(params);
      rebuildLattice();
      setStatus('Preset imported');
    } catch (err) {
      setStatus(`Import: ${err.message}`, true);
    }
  });

  document.getElementById('btn-mic')?.addEventListener('click', async () => {
    try {
      await state.audio.startMic();
      wireAudioForMode();
      setStatus(
        state.inputMode === 'pulse'
          ? 'Microphone active — pulse mode (local only)'
          : 'Microphone active — continuous mode (local only)'
      );
    } catch (e) {
      setStatus(`Mic: ${e.message}`, true);
    }
  });

  document.getElementById('btn-mic-stop')?.addEventListener('click', async () => {
    await stopAudio();
  });

  document.getElementById('audio-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await state.audio.startFile(file);
      wireAudioForMode();
      setStatus(`Playing ${file.name} (local only)`);
    } catch (err) {
      setStatus(`Audio file: ${err.message}`, true);
    }
  });

  window.addEventListener('beforeunload', () => state.audio.stop());
  window.addEventListener('resize', () => {
    const wrap = document.getElementById('canvas-wrap');
    if (wrap && state.renderer) {
      state.renderer.resize(wrap.clientWidth, wrap.clientHeight);
    }
  });
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
      setStatus(`Triplet errors: ${state.triplets.errors.join('; ')}`, true);
    }
    if (state.triplets.length !== 72) {
      setStatus(
        `Expected 72 triplets, loaded ${state.triplets.length}`,
        state.triplets.length === 0
      );
    }

    state.config = rendererData;
    state.presets = presetData.presets || [];
    state.params = {
      ...rendererData.defaults,
      sensitivity: rendererData.defaults.sensitivity ?? 1.0,
      pulseStrength: rendererData.defaults.pulseStrength ?? 1.2,
      fieldDecay: rendererData.defaults.fieldDecay ?? 0.92,
      refractoryMs: rendererData.defaults.refractoryMs ?? 180,
    };

    const canvas = document.getElementById('canvas');
    const wrap = document.getElementById('canvas-wrap');
    state.renderer = new Renderer(canvas);
    state.renderer.resize(wrap.clientWidth, Math.max(320, wrap.clientHeight));

    populateModesAndPalettes();
    populateTripletSelect();
    populatePresets();
    applyParams(state.params);
    rebuildLattice();
    bindControls();
    startLoop();

    setStatus(
      `Loaded ${state.triplets.length} triplets · YAML is source of truth · simulated quantities only`
    );
  } catch (e) {
    console.error(e);
    setStatus(String(e.message || e), true);
  }
}

main();
