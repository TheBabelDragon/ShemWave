# ShemWave

Browser-based **cymatic-inspired wave renderer** driven by editable YAML triplet data and presets, with optional **acoustic field injection** and **waveform-driven geometry**.

**https://thebabeldragon.github.io/ShemWave/**

This is a **visual mathematical model**. Metrics and injection fields are **simulated quantities**, not physical measurements.

## Features

- 72 supplied Hebrew triplets (order and duplicates preserved)
- Deterministic triplet → wave mapping
- Modes: lattice amplitude, interference, phase topology, radial harmonics
- Default lattice **16×16** (configurable up to 32×32)
- **Input modes**: Manual · Continuous Audio · Continuous Injection · Waveform Drive · Pulse Injection
- Live oscilloscope + L/M/H band meters
- Microphone and local audio-file input (never uploaded)
- PNG / JSON preset export; YAML source of truth

## Input modes

| Mode | Behavior |
|------|----------|
| **Manual / Baseline** | Triplet-driven lattice only. |
| **Continuous Audio** | Live level **modulates renderer parameters** (not the field). |
| **Continuous Injection** | Sustained envelope injects energy into the **persistent field**. |
| **Waveform Drive** | Signed **waveform** deforms interference/radial geometry; **L/M/H** bands scale structure. |
| **Pulse Injection** | Discrete transients inject one-shot field energy. |

### Waveform Drive

1. Select **Waveform Drive** and renderer mode **Interference** or **Radial**.
2. Tune Displacement, Frequency response, Audio sensitivity, Smoothing.
3. Start mic or load a file — surface deforms with waveform polarity; bass expands structure; highs add finer ripples.
4. Oscilloscope and L/M/H meters update under the canvas.
5. Stop audio / switch modes — features reset; baseline animation continues.

**Triplet→grid mapping:** cell `k` uses triplet `(k % 72)`; selected triplet is mixed into the center. Grid size need not equal triplet count.

## Validation

```bash
pip install pyyaml
python scripts/validate.py
node scripts/test_pulse.js
node scripts/test_audio_features.js
```

Unit tests cover synthetic samples only — **not** live microphone hardware.

## Audio privacy

Permission only on **Start microphone**. Analysis stays in-browser. **Stop audio** releases tracks and clears feature state.

## License

Provided for experimental visualization only.
