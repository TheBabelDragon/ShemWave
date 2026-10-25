# ShemWave

Browser-based **cymatic-inspired wave renderer** driven by editable YAML triplet data and presets, with optional **acoustic field injection**.

Deployed as a static site (no backend, no bundler). Intended URL:

**https://thebabeldragon.github.io/ShemWave/**

This is a **visual mathematical model**. On-screen metrics and injection fields are **simulated quantities**, not physical measurements. The project does **not** claim that Hebrew gematria or Shem HaMephorash triplets produce experimentally verified physical frequencies, nor that the visualization models real-world cymatics.

## Features

- 72 supplied Hebrew triplets (order and duplicates preserved)
- Deterministic triplet → wave mapping (gematria, phase, amplitude)
- Modes: lattice amplitude, interference, phase topology, radial harmonics
- 8×9 complex-field lattice with neighbor coupling, damping, bounded nonlinearity
- **Input modes**: Manual / Baseline · Continuous Audio · Continuous Injection · Pulse Injection
- Microphone and local audio-file input (never uploaded)
- PNG export; JSON preset export / import
- YAML as the editable source of truth

## GitHub Pages

1. Ensure branch content includes `index.html`, `assets/js/app.js`, and the `data/*.yaml` files.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Workflows:
   - `.github/workflows/pages.yml` — verifies required assets, then deploys
   - `.github/workflows/validate.yml` — YAML validation + pulse/envelope unit tests
4. After a green deploy, open `https://thebabeldragon.github.io/ShemWave/`.

Relative asset paths support the `/ShemWave/` repository subpath.

## Local static server

```bash
# from repository root
python3 -m http.server 8080
# open http://localhost:8080
```

No Node.js or Python packages are required to *run* the site. Microphone access needs **HTTPS or localhost**.

## Input modes

| Mode | Behavior |
|------|----------|
| **Manual / Baseline** | Triplet-driven lattice only. No microphone. |
| **Continuous Audio** | Live level (bass / overall) continuously **modulates renderer parameters** (spatial frequency, perturbation). Does **not** drive the persistent field. |
| **Continuous Injection (Mic → Field)** | Sustained microphone energy above an adaptive noise floor maintains a **positive injection** into the simulated persistent field. Holding a steady tone keeps injection active; silence stops new energy (residual field may decay). |
| **Pulse Injection** | **Discrete** acoustic transients inject one-shot energy into the field (onset + refractory). Claps/taps, not sustained drive. |

### Continuous Injection walkthrough

1. Select **Continuous Injection (Mic → Field)**.
2. Tune **Sensitivity**, **Continuous field strength**, and **Field decay λ** (defaults are conservative).
3. Click **Start microphone** (permission only then).
4. Speak or hold a steady tone — diagnostics should show `inj > 0` and rising/stable `fieldE` while sound continues.
5. Stop sounding — injection level returns to zero; residual field energy decays via λ.
6. **Stop audio** releases tracks and resets the envelope; **Clear field** zeros residual energy; **Reset** restores defaults and clears field + detectors.

### Continuous envelope pipeline

1. **RMS** of each time-domain sample window  
2. **Adaptive noise floor** updated mainly on quiet / inactive windows (does not chase sustained input upward until injection collapses)  
3. **Activation threshold** = max(minThreshold, noiseFloor × margin / sensitivity)  
4. Excess RMS normalized into **[0, 1]** with headroom  
5. **Attack / release** smoothing to avoid flicker  
6. Per-frame field inject scaled by level × continuousStrength, cadence-limited so energy stays bounded against decay  

Unit-tested without hardware (`scripts/test_pulse.js`).

### Pulse injection (brief)

Short-window RMS with adaptive floor, hysteresis, and refractory timing. Manual **Inject Pulse** works without a mic.

### Field model (visualization only)

`F_{t+1} = λ F_t + I_t`

`I_t` may be a discrete pulse or a continuous-envelope contribution. Baseline lattice evolution continues independently. Values are hard-clipped. **Not a physical measurement.**

## Audio privacy

- Permission is requested only after an explicit **Start microphone** click.
- Analysis stays in the browser (Web Audio API).
- **Stop audio** ends media tracks and closes the AudioContext; continuous envelope state is cleared.
- Denied permission, missing APIs, and decode errors surface in the status line.
- No autoplay capture, no upload, no remote processing.

## Validation and tests

```bash
pip install pyyaml
python scripts/validate.py
node scripts/test_pulse.js
```

- `validate.py` checks YAML load, 72-count, ordering, duplicates, Hebrew letters, presets, renderer keys (including continuousStrength), and required static assets.
- `test_pulse.js` covers pulse detection, continuous envelope (silence, noise, sustained, floor chase, release, NaN safety), field decay, continuous inject bounds — no microphone required.

## Known browser limitations

- ES modules and Canvas 2D required.
- Microphone blocked on non-secure origins (except localhost).
- `js-yaml` is loaded from jsDelivr CDN; offline use needs a local copy.
- Reduced-motion preference draws a single frame instead of continuous animation.

## License

Provided for experimental visualization only.
