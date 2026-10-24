/**
 * Hebrew gematria with final-form normalization.
 * Display text is never altered; only calculation uses medial forms.
 */

export const GEMATRIA_MAP = Object.freeze({
  'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
  'י': 10, 'כ': 20, 'ל': 30, 'מ': 40, 'נ': 50, 'ס': 60, 'ע': 70, 'פ': 80,
  'צ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400,
});

export const FINAL_MAP = Object.freeze({
  'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ',
});

export function normalizeChar(c) {
  return FINAL_MAP[c] || c;
}

export function letterValue(c) {
  const n = normalizeChar(c);
  return GEMATRIA_MAP[n] ?? 0;
}

export function gematria(text) {
  let sum = 0;
  for (const c of text) sum += letterValue(c);
  return sum;
}

export function isHebrewLetter(c) {
  return c in GEMATRIA_MAP || c in FINAL_MAP;
}

export function validateTripletLetters(letters) {
  if (typeof letters !== 'string' || [...letters].length !== 3) {
    return { ok: false, error: 'letters must be exactly three characters' };
  }
  for (const c of letters) {
    if (!isHebrewLetter(c)) {
      return { ok: false, error: `non-Hebrew character: ${c}` };
    }
  }
  return { ok: true };
}

/**
 * Deterministic triplet → wave parameters.
 * Same triplet + same mapping config ⇒ same parameters.
 */
export function tripletToWaveParams(letters, mapping) {
  const chars = [...letters];
  const values = chars.map(letterValue);
  const total = values.reduce((a, b) => a + b, 0);
  const basePhase = ((total % mapping.basePhaseModulo) * Math.PI) / 180;

  const span = mapping.freqMax - mapping.freqMin;
  const components = values.map((v, i) => {
    const freqRatio = mapping.freqMin + (v / mapping.gematriaMax) * span;
    const amp = Math.max(mapping.ampFloor, v / mapping.gematriaMax);
    const phaseOffset = basePhase + i * mapping.angularStep;
    return { letter: chars[i], value: v, freqRatio, amp, phaseOffset };
  });

  return { total, basePhase, components };
}
