# ShemWave

Browser-based **cymatic-inspired wave renderer** driven by editable YAML triplet data and presets, with optional **acoustic pulse injection**.

Deployed as a static site (no backend, no bundler). Intended URL:

**https://thebabeldragon.github.io/ShemWave/**

This is a **visual mathematical model**. On-screen metrics and pulse fields are **simulated quantities**, not physical measurements. The project does **not** claim that Hebrew gematria or Shem HaMephorash triplets produce experimentally verified physical frequencies, nor that the visualization models real-world cymatics.

## Features

- 72 supplied Hebrew triplets (order and duplicates preserved)
- Deterministic triplet → wave mapping (gematria, phase, amplitude)
- Modes: lattice amplitude, interference, phase topology, radial harmonics
- 8×9 complex-field lattice with neighbor coupling, damping, bounded nonlinearity
- **Input modes**: Manual / Baseline · Continuous Audio · Pulse Injection
- Microphone and local audio-file input (never uploaded)
- PNG export; JSON preset export / import
- YAML as the editable source of truth

## GitHub Pages

1. Ensure branch content includes `index.html`, `assets/js/app.js`, and the `data/*.yaml` files.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Workflows:
   - `.github/workflows/pages.yml` — verifies required assets, then deploys
   - `.github/workflows/validate.yml` — YAML validation + pulse unit tests
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
| **Continuous Audio** | Live level (bass / overall) continuously modulates spatial frequency and perturbation. |
| **Pulse Injection** | Discrete acoustic transients inject energy into a **persistent decaying field** applied on top of the triplet baseline each frame. |

### Pulse injection walkthrough

1. Select **Pulse Injection** in the Input mode dropdown.
2. Optionally tune **Sensitivity**, **Pulse strength**, **Field decay λ**, and **Refractory ms**.
3. Click **Start microphone** (permission prompt appears only then) *or* use **Inject Pulse** for deterministic testing without a mic.
4. Clap or tap near the mic — a pulse should appear in the diagnostics line and visibly perturb the canvas, then decay.
5. **Clear field** zeros residual energy; **Stop audio** releases tracks and the AudioContext.
6. Switching triplets or presets clears the pulse field and reseeds the baseline from gematria.

### Parameter meanings

| Control | Meaning |
|---------|---------|
| Sensitivity | Higher = lower effective threshold (more detections). Adaptive noise floor still applies. |
| Pulse strength | Scale factor applied to detected / manual pulse magnitude. |
| Field decay λ | Per-frame multiplier on the pulse field (`F ← λ F`). Closer to 1 = longer trails. |
| Refractory ms | Minimum time between accepted pulses (prevents one clap → many events). |

### Detector model (brief)

Short-window RMS / envelope with adaptive noise floor, hysteresis (must fall below a fraction of threshold before re-arming), and refractory timing. Detection is pure over sample arrays and unit-tested without hardware.

### Field model (visualization only)

`F_{t+1} = λ F_t + I_t`

Baseline lattice evolution continues independently; the pulse field is added to the real part of the complex lattice each frame before the lattice step. Values are hard-clipped. Not a physical simulation claim.

## Audio privacy

- Permission is requested only after an explicit **Start microphone** click.
- Analysis stays in the browser (Web Audio API).
- **Stop audio** ends media tracks, cancels animation callbacks, and closes the AudioContext.
- Denied permission, missing APIs, and decode errors surface in the status line.
- No autoplay capture, no upload, no remote processing.

## Validation and tests

```bash
pip install pyyaml
python scripts/validate.py
node scripts/test_pulse.js
```

- `validate.py` checks YAML load, 72-count, ordering, duplicates, Hebrew letters, presets, renderer keys (including pulse defaults), and required static assets.
- `test_pulse.js` covers silence, transients, refractory, sensitivity, field decay, accumulation, bounds, and clear — no microphone required.

## Known browser limitations

- ES modules and Canvas 2D required.
- Microphone blocked on non-secure origins (except localhost).
- `js-yaml` is loaded from jsDelivr CDN; offline use needs a local copy.
- Reduced-motion preference draws a single frame instead of continuous animation.

## License

Provided for experimental visualization only.
