/**
 * Acoustic pulse detection and persistent field dynamics.
 * Detection is pure over sample windows — no microphone required for tests.
 *
 * Field model (visualization only, not physical):
 *   F_{t+1} = λ · F_t + I_t + W_t
 * where λ is decay, I_t is pulse injection, W_t is optional baseline drive.
 */

/** @typedef {{ strength: number, t: number }} PulseEvent */

export class PulseDetector {
  /**
   * @param {object} [opts]
   * @param {number} [opts.threshold] absolute RMS threshold (0–1 scale)
   * @param {number} [opts.sensitivity] multiplies adaptive threshold (higher = more sensitive)
   * @param {number} [opts.refractoryMs] minimum ms between accepted pulses
   * @param {number} [opts.noiseFloorAlpha] EMA coefficient for noise floor (0–1)
   * @param {number} [opts.hysteresis] release threshold as fraction of attack threshold
   */
  constructor(opts = {}) {
    this.threshold = opts.threshold ?? 0.12;
    this.sensitivity = opts.sensitivity ?? 1.0;
    this.refractoryMs = opts.refractoryMs ?? 180;
    this.noiseFloorAlpha = opts.noiseFloorAlpha ?? 0.05;
    this.hysteresis = opts.hysteresis ?? 0.55;

    this.noiseFloor = 0.02;
    this.lastPulseAt = -Infinity;
    this.armed = true;
    this.pulseCount = 0;
    this.lastLevel = 0;
    this.lastRms = 0;
    this.effectiveThreshold = this.threshold;
  }

  /**
   * Process a time-domain sample window (Float32Array or number[] in [-1, 1]).
   * @param {ArrayLike<number>} samples
   * @param {number} [nowMs] timestamp for refractory (defaults to performance.now())
   * @returns {PulseEvent|null}
   */
  process(samples, nowMs) {
    const now = nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (!samples || samples.length === 0) {
      this.lastLevel = 0;
      this.lastRms = 0;
      return null;
    }

    let sumSq = 0;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
      const v = samples[i];
      const a = v * v;
      sumSq += a;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
    const rms = Math.sqrt(sumSq / samples.length);
    this.lastRms = rms;
    this.lastLevel = peak;

    // Adaptive noise floor (only rises slowly; falls faster when quiet)
    if (rms < this.noiseFloor) {
      this.noiseFloor = this.noiseFloor * 0.9 + rms * 0.1;
    } else {
      this.noiseFloor =
        this.noiseFloor * (1 - this.noiseFloorAlpha) + rms * this.noiseFloorAlpha;
    }

    const adaptive = this.noiseFloor * (2.5 / Math.max(0.1, this.sensitivity));
    this.effectiveThreshold = Math.max(this.threshold / Math.max(0.1, this.sensitivity), adaptive);

    if (!this.armed) {
      if (rms < this.effectiveThreshold * this.hysteresis) {
        this.armed = true;
      }
      return null;
    }

    if (now - this.lastPulseAt < this.refractoryMs) {
      return null;
    }

    if (rms >= this.effectiveThreshold) {
      this.armed = false;
      this.lastPulseAt = now;
      this.pulseCount += 1;
      // Strength scales with how far above threshold, clipped
      const over = (rms - this.effectiveThreshold) / Math.max(1e-6, this.effectiveThreshold);
      const strength = Math.min(3, 0.4 + over * 1.2);
      return { strength, t: now };
    }
    return null;
  }

  /** Force a synthetic pulse (manual inject / tests). */
  forcePulse(strength = 1.0, nowMs) {
    const now = nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.lastPulseAt = now;
    this.pulseCount += 1;
    this.armed = false;
    return { strength: Math.max(0.1, Math.min(5, strength)), t: now };
  }

  reset() {
    this.noiseFloor = 0.02;
    this.lastPulseAt = -Infinity;
    this.armed = true;
    this.pulseCount = 0;
    this.lastLevel = 0;
    this.lastRms = 0;
    this.effectiveThreshold = this.threshold;
  }

  diagnostics() {
    return {
      level: this.lastLevel,
      rms: this.lastRms,
      threshold: this.effectiveThreshold,
      noiseFloor: this.noiseFloor,
      pulseCount: this.pulseCount,
      armed: this.armed,
    };
  }
}

/**
 * Persistent scalar field overlaid on the lattice.
 * Stores one float per lattice cell; decays each step and accepts injections.
 */
export class PersistentField {
  /**
   * @param {number} rows
   * @param {number} cols
   * @param {object} [opts]
   * @param {number} [opts.decay] λ in [0, 1); higher = longer persistence
   * @param {number} [opts.maxValue] hard clip bound
   */
  constructor(rows = 8, cols = 9, opts = {}) {
    this.rows = rows;
    this.cols = cols;
    this.decay = opts.decay ?? 0.92;
    this.maxValue = opts.maxValue ?? 8;
    this.values = new Float64Array(rows * cols);
    this.paused = false;
  }

  index(i, j) {
    return ((i % this.rows) + this.rows) % this.rows * this.cols +
      (((j % this.cols) + this.cols) % this.cols);
  }

  /**
   * Inject energy at a cell (and optionally soft neighbors).
   * @param {number} i
   * @param {number} j
   * @param {number} amount
   * @param {boolean} [spread]
   */
  inject(i, j, amount, spread = true) {
    const a = Math.max(-this.maxValue, Math.min(this.maxValue, amount));
    const k = this.index(i, j);
    this.values[k] = Math.max(-this.maxValue, Math.min(this.maxValue, this.values[k] + a));
    if (spread) {
      const half = a * 0.35;
      for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nk = this.index(i + di, j + dj);
        this.values[nk] = Math.max(
          -this.maxValue,
          Math.min(this.maxValue, this.values[nk] + half)
        );
      }
    }
  }

  /** Random-cell inject for manual testing. */
  injectRandom(amount) {
    const i = Math.floor(Math.random() * this.rows);
    const j = Math.floor(Math.random() * this.cols);
    this.inject(i, j, amount, true);
    return { i, j };
  }

  /**
   * One decay step: F ← λ F  (baseline W_t applied by caller if desired).
   */
  step() {
    if (this.paused) return;
    const λ = this.decay;
    for (let k = 0; k < this.values.length; k++) {
      let v = this.values[k] * λ;
      if (!Number.isFinite(v)) v = 0;
      if (Math.abs(v) < 1e-8) v = 0;
      if (Math.abs(v) > this.maxValue) v = Math.sign(v) * this.maxValue;
      this.values[k] = v;
    }
  }

  /** Apply pulse field into a ComplexLattice (adds to real part). */
  applyToLattice(lattice) {
    if (!lattice || lattice.re.length !== this.values.length) return;
    for (let k = 0; k < this.values.length; k++) {
      lattice.re[k] += this.values[k];
    }
  }

  clear() {
    this.values.fill(0);
  }

  resize(rows, cols) {
    if (rows === this.rows && cols === this.cols) return;
    this.rows = rows;
    this.cols = cols;
    this.values = new Float64Array(rows * cols);
  }

  energy() {
    let s = 0;
    for (let k = 0; k < this.values.length; k++) s += Math.abs(this.values[k]);
    return s;
  }

  /** Bounded check for tests. */
  isBounded() {
    for (let k = 0; k < this.values.length; k++) {
      if (!Number.isFinite(this.values[k])) return false;
      if (Math.abs(this.values[k]) > this.maxValue + 1e-6) return false;
    }
    return true;
  }
}
