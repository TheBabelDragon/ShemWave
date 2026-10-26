/* ShemWave inspire.js — drop-in layer. Talks to the page only through element IDs
   and standard input/change events, so assets/js/app.js stays untouched.
   Adds: idle "breathing" drift, Energy/Calm/Complexity macros, Surprise me,
   and a smarter "Tap to listen". Fails quietly if an ID is missing. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }

  function setNorm(id, t) {            // t in 0..1 across the slider's own range
    var el = $(id); if (!el) return;
    var min = +el.min, max = +el.max, step = +el.step || 0;
    var v = min + Math.min(1, Math.max(0, t)) * (max - min);
    if (step) v = Math.round((v - min) / step) * step + min;
    el.value = +v.toFixed(4);
    fire(el, 'input');
  }
  function getNorm(id) {
    var el = $(id); if (!el) return null;
    var min = +el.min, max = +el.max;
    return max > min ? (+el.value - min) / (max - min) : 0;
  }

  /* ---- Smarter "Tap to listen": pick a visual mode before the mic starts ---- */
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#invite-listen')) return;
    var mode = $('input-mode');
    if (mode && mode.value === 'manual') { mode.value = 'waveform-drive'; fire(mode, 'change'); }
  }, true);   // capture phase: runs before the mic click handler

  /* ---- Macro sliders ---- */
  var macros = [
    { id: 'macro-energy', label: 'Energy',
      apply: function (t) { setNorm('ctrl-speed', 0.1 + 0.8 * t); setNorm('ctrl-perturb', 0.05 + 0.55 * t); } },
    { id: 'macro-calm', label: 'Calm',
      apply: function (t) { setNorm('ctrl-damping', 0.05 + 0.8 * t); setNorm('ctrl-coupling', 0.25 + 0.6 * t); } },
    { id: 'macro-complexity', label: 'Complexity',
      apply: function (t) { setNorm('ctrl-freq', 0.1 + 0.8 * t); setNorm('ctrl-symmetry', t); } }
  ];

  function buildMacros() {
    var host = document.querySelector('.controls-scroll');
    if (!host || $('macro-energy')) return;
    var fs = document.createElement('fieldset');
    var lg = document.createElement('legend');
    lg.textContent = 'Quick feel';
    fs.appendChild(lg);
    macros.forEach(function (m) {
      var label = document.createElement('label');
      label.setAttribute('for', m.id);
      label.textContent = m.label;
      var input = document.createElement('input');
      input.type = 'range'; input.id = m.id;
      input.min = 0; input.max = 100; input.step = 1; input.value = 50;
      input.addEventListener('input', function (e) {
        if (e.isTrusted) m.apply(input.value / 100);
      });
      fs.appendChild(label); fs.appendChild(input);
    });
    var hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Three dials that move several settings together. Fine control is below.';
    fs.appendChild(hint);
    host.insertBefore(fs, host.firstChild);
  }

  /* ---- Surprise me ---- */
  function pickOther(sel) {
    if (!sel || sel.options.length < 2) return;
    var i;
    do { i = Math.floor(Math.random() * sel.options.length); } while (i === sel.selectedIndex);
    sel.selectedIndex = i;
    fire(sel, 'change');
  }
  function buildSurprise() {
    var dock = document.querySelector('.dock');
    if (!dock || $('surprise')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'surprise'; b.textContent = 'Surprise me';
    b.addEventListener('click', function () {
      pickOther($('preset-select'));
      if (Math.random() < 0.5) pickOther($('triplet-select'));
      if (Math.random() < 0.6) pickOther($('ctrl-palette'));
      base = null;
    });
    dock.insertBefore(b, dock.firstChild);
  }

  /* ---- Idle breathing: the wave never sits dead ---- */
  var IDLE_MS = 5000, FIRST_MS = 1500;
  var lastTouch = Date.now() - (IDLE_MS - FIRST_MS);
  var base = null, t0 = Date.now();
  var drift = [   // id, amplitude (fraction of range), period (seconds)
    ['ctrl-freq', 0.07, 23], ['ctrl-speed', 0.06, 17],
    ['ctrl-perturb', 0.05, 29], ['ctrl-coupling', 0.04, 37]
  ];

  ['pointerdown', 'keydown', 'input', 'change', 'wheel', 'touchstart'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      if (!e.isTrusted) return;
      lastTouch = Date.now();
      base = null;           // re-read baseline after any human change
    }, true);
  });

  function audioLive() {
    var badge = $('audio-badge');
    return badge && badge.getAttribute('data-state') === 'live';
  }

  function tick() {
    if (reduceMotion || document.hidden) return;
    if (audioLive() || document.body.classList.contains('drawer-open')) return;
    if (Date.now() - lastTouch < IDLE_MS) return;
    var mode = $('input-mode');
    if (mode && mode.value !== 'manual' && audioLive()) return;
    if (!base) {
      base = {};
      drift.forEach(function (d) { var n = getNorm(d[0]); if (n !== null) base[d[0]] = n; });
      t0 = Date.now();
    }
    var s = (Date.now() - t0) / 1000;
    drift.forEach(function (d, i) {
      if (base[d[0]] === undefined) return;
      setNorm(d[0], base[d[0]] + d[1] * Math.sin((2 * Math.PI * s) / d[2] + i * 1.7));
    });
  }

  /* Wire Tap to listen → Start mic (after mode switch in capture phase) */
  function wireInvite() {
    var invite = $('invite-listen');
    var mic = $('btn-mic');
    if (!invite || !mic) return;
    invite.addEventListener('click', function () {
      mic.click();
    });
  }

  function init() { buildMacros(); buildSurprise(); wireInvite(); setInterval(tick, 120); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
