/**
 * ShemWave application: YAML-driven static renderer.
 * Paths are relative for GitHub Pages subpath compatibility.
 */

import { TripletStore } from './triplets.js';
import { gematria, tripletToWaveParams } from './gematria.js';
import { ComplexLattice } from './simulation.js';
import { Renderer } from './renderer.js';
import { AudioInput } from './audio.js';
import { exportPNG, exportPresetJSON, copyPreset } from './export.js';

const BASE = new URL('.', import.meta.url); // assets/js/
const ROOT = new URL('../../', BASE); // site root

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
  raf: null,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
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
  };
  for (const [k, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el || p[k] === undefined) continue;
    el.value = p[k];
    const out = document.getElementById(`${id}-val`);
    if (out) out.textContent = String(p[k]);
  }
}

function rebuildLattice() {
  const rows = state.params.latticeRows || 8;
  const cols = state.params.latticeCols || 9;
  state.lattice = new ComplexLattice(rows, cols);
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
    el.textContent =
      `mean ${m.meanIntensity.toFixed(4)} · var ${m.variance.toFixed(4)} · H ${m.entropy.toFixed(4)} (simulated)`;
  }
}

function frame() {
  if (!state.lattice || !state.renderer) return;
  const steps = state.params.stepsPerFrame || 1;
  for (let i = 0; i < steps; i++) {
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
    // draw once
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

function bindControls() {
  document.getElementById('triplet-select')?.addEventListener('change', (e) => {
    state.triplets.select(Number(e.target.value));
    rebuildLattice();
    setStatus(`Triplet ${state.triplets.selected.display} (g=${state.triplets.selected.gematria})`);
  });

  document.getElementById('preset-select')?.addEventListener('change', (e) => {
    const pr = state.presets.find((p) => p.id === e.target.value);
    if (!pr) return;
    applyParams({ ...state.config.defaults, ...pr.params });
    rebuildLattice();
    setStatus(`Preset: ${pr.name}`);
  });

  document.getElementById('btn-reset')?.addEventListener('click', () => {
    applyParams({ ...state.config.defaults });
    rebuildLattice();
    setStatus('Reset to defaults');
  });

  const continuous = [
    ['ctrl-freq', 'spatialFrequency'],
    ['ctrl-speed', 'waveSpeed'],
    ['ctrl-coupling', 'neighborCoupling'],
    ['ctrl-damping', 'damping'],
    ['ctrl-symmetry', 'symmetry'],
    ['ctrl-perturb', 'perturbationStrength'],
  ];
  for (const [id, key] of continuous) {
    document.getElementById(id)?.addEventListener('input', (e) => {
      const v = Number(e.target.value);
      applyParams({ [key]: v });
      if (key === 'perturbationStrength' && v > 0) {
        state.lattice?.inject(0, 0, v * 0.1);
      }
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
    setStatus('Pulse injected');
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
      state.audio.onLevel = (bass, overall) => {
        applyParams({
          spatialFrequency: clamp(0.5 + bass * 3, 0.1, 4),
          perturbationStrength: overall * 3,
        });
      };
      setStatus('Microphone active (local only)');
    } catch (e) {
      setStatus(`Mic: ${e.message}`, true);
    }
  });

  document.getElementById('btn-mic-stop')?.addEventListener('click', async () => {
    await state.audio.stop();
    setStatus('Audio stopped');
  });

  document.getElementById('audio-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await state.audio.startFile(file);
      state.audio.onLevel = (bass, overall) => {
        applyParams({
          spatialFrequency: clamp(0.5 + bass * 3, 0.1, 4),
          perturbationStrength: overall * 3,
        });
      };
      setStatus(`Playing ${file.name} (local only)`);
    } catch (err) {
      setStatus(`Audio file: ${err.message}`, true);
    }
  });

  window.addEventListener('beforeunload', () => state.audio.stop());
  window.addEventListener('resize', () => {
    const canvas = document.getElementById('canvas');
    const wrap = document.getElementById('canvas-wrap');
    if (canvas && wrap && state.renderer) {
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
    state.params = { ...rendererData.defaults };

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
