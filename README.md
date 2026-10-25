# ShemWave

Browser-based **cymatic-inspired wave renderer** driven by editable YAML triplet data and presets.

Deployed as a static site (no backend, no bundler). Intended URL:

**https://thebabeldragon.github.io/ShemWave/**

This is a **visual mathematical model**. On-screen metrics are **simulated quantities**, not physical measurements. The project does **not** claim that Hebrew gematria or Shem HaMephorash triplets produce experimentally verified physical frequencies.

## Features

- 72 supplied Hebrew triplets (order and duplicates preserved)
- Deterministic triplet → wave mapping (gematria, phase, amplitude)
- Modes: lattice amplitude, interference, phase topology, radial harmonics
- 8×9 complex-field lattice with neighbor coupling, damping, bounded nonlinearity
- Microphone and local audio-file input (never uploaded)
- PNG export; JSON preset export / import
- YAML as the editable source of truth

## GitHub Pages

1. Ensure branch content includes `index.html`, `assets/js/app.js`, and the `data/*.yaml` files.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Workflows:
   - `.github/workflows/pages.yml` — verifies required assets, then deploys
   - `.github/workflows/static.yml` — alternate static deploy on `main`
4. After a green deploy, open `https://thebabeldragon.github.io/ShemWave/`.

Relative asset paths support the `/ShemWave/` repository subpath.

## Local static server

```bash
# from repository root
python3 -m http.server 8080
# open http://localhost:8080
```

No Node.js or Python packages are required to *run* the site. Microphone access needs **HTTPS or localhost**.

## Controls

| Control | Effect |
|---------|--------|
| Triplet | Selects one of 72 forms; reseeds the field from gematria mapping |
| Preset | Applies named parameter set from `data/presets.yaml` |
| Mode | lattice / interference / phase / radial |
| Spatial frequency, wave speed, coupling, damping, symmetry, palette | Live parameter adjustment |
| Pause / Pulse | Pause simulation; inject energy at lattice origin |
| Microphone / Audio file / Stop | Local analysis only; stop releases tracks and AudioContext |
| Export PNG / Export JSON / Copy / Import JSON | Snapshot canvas or portable params (does not overwrite YAML) |

## Audio privacy

- Permission is requested only after an explicit button click.
- Analysis stays in the browser (Web Audio API).
- **Stop audio** ends media tracks, cancels animation callbacks, and closes the AudioContext.
- Denied permission, missing APIs, and decode errors surface in the status line.

## Data files

| File | Role |
|------|------|
| `data/triplets.yaml` | Canonical 72 triplets (IDs, letters, order, duplicates) |
| `data/presets.yaml` | Named visual presets |
| `data/renderer.yaml` | Defaults, bounds, palettes, mapping rules |

## Mapping rules (reproducible)

1. Normalize final forms only for calculation (`ך→כ`, `ם→מ`, `ן→נ`, `ף→פ`, `ץ→צ`).
2. Gematria total → base phase: `(total % 360) * π/180`.
3. Each letter → frequency ratio in `[0.5, 2.0]`, amplitude ≥ 0.05, phase `base + i·2π/3`.
4. Components seed the lattice and drive interference / radial modes.

## Validation

```bash
pip install pyyaml
python scripts/validate.py
```

Checks YAML load, 72-count, ordering, duplicates, Hebrew letters, presets, renderer keys, and required static assets.

## Known browser limitations

- ES modules and Canvas 2D required.
- Microphone blocked on non-secure origins (except localhost).
- `js-yaml` is loaded from jsDelivr CDN; offline use needs a local copy.
- Reduced-motion preference draws a single frame instead of continuous animation.

## License

Provided for experimental visualization only.
