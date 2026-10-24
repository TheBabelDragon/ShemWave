# ShemWave

Browser-based **cymatic-inspired wave renderer** driven by editable YAML triplet data and presets.

This is a **visual mathematical model**. It does **not** claim that Hebrew gematria or Shem HaMephorash triplets produce experimentally verified physical frequencies. On-screen metrics are **simulated quantities**, not physical measurements.

## Features

- 72 supplied Hebrew triplets (order and duplicates preserved)
- Deterministic triplet → wave mapping (gematria, phase, amplitude)
- Modes: lattice amplitude, interference, phase topology, radial harmonics
- 8×9 complex-field lattice with neighbor coupling, damping, bounded nonlinearity
- Microphone and audio-file input (local browser only; never uploaded)
- PNG export and JSON preset export
- YAML as the editable source of truth

## Use on GitHub Pages

1. Push branch `feat/yaml-static-renderer` (or merge to `main`).
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow `.github/workflows/pages.yml` deploys the static tree.

Site URL (after first successful deploy):

`https://thebabeldragon.github.io/ShemWave/`

Relative asset paths support repository subpath hosting.

## Local use (no build step)

```bash
# from repo root — any static file server
python3 -m http.server 8080
# open http://localhost:8080
```

Microphone input requires HTTPS or localhost.

## Data

| File | Role |
|------|------|
| `data/triplets.yaml` | Canonical triplet list |
| `data/presets.yaml` | Named visual presets |
| `data/renderer.yaml` | Defaults, bounds, palettes, mapping rules |

Edit YAML and refresh the page. Exported JSON presets are portable snapshots; they do **not** replace the YAML dataset.

## Mapping rules (reproducible)

1. Normalize final Hebrew forms only for calculation (`ך→כ`, `ם→מ`, …).
2. Gematria sum → base phase: `(total % 360) * π/180`.
3. Each letter → frequency ratio in `[0.5, 2.0]`, amplitude ≥ 0.05, phase offset `base + i * 2π/3`.
4. Components feed the selected renderer mode and seed the lattice.

See `data/renderer.yaml` → `mapping`.

## Validation

```bash
pip install pyyaml
python scripts/validate.py
```

## License

See repository license if present. Content is provided for experimental visualization only.
