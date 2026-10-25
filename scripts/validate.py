#!/usr/bin/env python3
"""Static validation for ShemWave YAML data, assets, and pulse modules."""

from __future__ import annotations

import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("PyYAML required: pip install pyyaml")
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]

GEMATRIA = {
    "א": 1, "ב": 2, "ג": 3, "ד": 4, "ה": 5, "ו": 6, "ז": 7, "ח": 8, "ט": 9,
    "י": 10, "כ": 20, "ל": 30, "מ": 40, "נ": 50, "ס": 60, "ע": 70, "פ": 80,
    "צ": 90, "ק": 100, "ר": 200, "ש": 300, "ת": 400,
}
FINAL = {"ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ"}


def norm(c: str) -> str:
    return FINAL.get(c, c)


def gematria(t: str) -> int:
    return sum(GEMATRIA.get(norm(c), 0) for c in t)


def main() -> int:
    errors: list[str] = []
    trip_path = ROOT / "data" / "triplets.yaml"
    preset_path = ROOT / "data" / "presets.yaml"
    rend_path = ROOT / "data" / "renderer.yaml"

    for p in (trip_path, preset_path, rend_path):
        if not p.exists():
            errors.append(f"missing {p.relative_to(ROOT)}")

    if errors:
        print("\n".join(errors))
        return 1

    with trip_path.open(encoding="utf-8") as f:
        data = yaml.safe_load(f)
    triplets = data.get("triplets") or []
    if len(triplets) != 72:
        errors.append(f"expected 72 triplets, got {len(triplets)}")

    for i, t in enumerate(triplets):
        letters = t.get("letters") or ""
        if len(list(letters)) != 3:
            errors.append(f"triplet {i}: letters length != 3 ({letters!r})")
        for c in letters:
            if norm(c) not in GEMATRIA and c not in FINAL:
                errors.append(f"triplet {i}: non-Hebrew {c!r}")
        if t.get("source_index", i) != i:
            errors.append(f"triplet {i}: source_index mismatch")

    if triplets:
        g0 = gematria(triplets[0]["letters"])
        g0b = gematria(triplets[0]["letters"])
        if g0 != g0b:
            errors.append("gematria not deterministic")
        sample = next((t for t in triplets if "ך" in t["letters"]), None)
        if sample and gematria(sample["letters"]) <= 0:
            errors.append("final-form gematria failed")

    letters_list = [t["letters"] for t in triplets]
    if letters_list.count("והו") < 2:
        errors.append("expected duplicate והו to be preserved")

    with preset_path.open(encoding="utf-8") as f:
        presets = yaml.safe_load(f)
    if not presets.get("presets"):
        errors.append("no presets defined")

    with rend_path.open(encoding="utf-8") as f:
        rend = yaml.safe_load(f)
    for key in ("defaults", "bounds", "modes", "palettes", "mapping"):
        if key not in rend:
            errors.append(f"renderer.yaml missing {key}")

    for pulse_key in (
        "sensitivity",
        "pulseStrength",
        "continuousStrength",
        "fieldDecay",
        "refractoryMs",
        "waveformDisplacement",
        "frequencyResponse",
        "audioSensitivity",
        "audioSmoothing",
    ):
        if pulse_key not in rend.get("defaults", {}):
            errors.append(f"renderer.yaml defaults missing pulse key {pulse_key}")
        if pulse_key not in rend.get("bounds", {}):
            errors.append(f"renderer.yaml bounds missing pulse key {pulse_key}")

    required_assets = (
        "index.html",
        "assets/js/app.js",
        "assets/js/gematria.js",
        "assets/js/simulation.js",
        "assets/js/renderer.js",
        "assets/js/audio.js",
        "assets/js/export.js",
        "assets/js/triplets.js",
        "assets/js/pulse-injection.js",
        "assets/js/audio-features.js",
        "assets/css/app.css",
        "scripts/test_pulse.js",
        "scripts/test_audio_features.js",
    )
    for rel in required_assets:
        if not (ROOT / rel).exists():
            errors.append(f"missing asset {rel}")

    if errors:
        print("FAIL")
        for e in errors:
            print(" -", e)
        return 1

    print("OK")
    print(f"  triplets: {len(triplets)} (order preserved, duplicates kept)")
    print(f"  presets: {len(presets['presets'])}")
    print(f"  sample gematria[{triplets[0]['letters']}] = {gematria(triplets[0]['letters'])}")
    print("  pulse / continuous-injection / audio-features modules: present")
    return 0


if __name__ == "__main__":
    sys.exit(main())
