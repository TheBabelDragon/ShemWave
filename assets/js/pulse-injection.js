/**
 * Acoustic pulse detection, continuous envelope, and persistent field dynamics.
 * Detection is pure over sample windows — no microphone required for tests.
 *
 * Field model (visualization only, not physical):
 *   F_{t+1} = λ · F_t + I_t
 * where λ is decay and I_t is discrete pulse or continuous-envelope injection.
 */

/** @typedef {{ strength: number, t: number }} PulseEvent */

export class PulseDetector {
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

  process(samples, nowMs) {
    const now = nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (!samples || samples.length === 0) {
      this.lastLevel = 0;
      this.lastRms = 0;
      return null;
    }

    let sumSq = 0;
    let peak = 0;
    let n = 0;
    for (let i = 0; i < samples.length; i++) {
      let v = samples[i];
      if (!Number.isFinite(v)) continue;
      v = Math.max(-1, Math.min(1, v));
      sumSq += v * v;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
      n += 1;
    }
    if (n === 0) {
      this.lastLevel = 0;
      this.lastRms = 0;
      return null;
    }
    const rms = Math.sqrt(sumSq / n);
    this.lastRms = rms;
    this.lastLevel = peak;

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
      const over = (rms - this.effectiveThreshold) / Math.max(1e-6, this.effectiveThreshold);
      const strength = Math.min(3, 0.4 + over * 1.2);
      return { strength, t: now };
    }
    return null;
  }

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
 * Continuous RMS envelope for sustained mic → field injection.
 * No refractory / onset requirement: steady sound stays active.
 * Noise floor is calibrated primarily on quiet windows and must not
 * chase sustained input upward until injection collapses.
 */
export class ContinuousEnvelopeDetector {
  constructor(opts = {}) {
    this.sensitivity = opts.sensitivity ?? 1.0;
    this.noiseFloorAlpha = opts.noiseFloorAlpha ?? 0.02;
    this.attack = opts.attack ?? 0.35;
    this.release = opts.release ?? 0.1;
    this.margin = opts.margin ?? 1.75;
    this.headroom = opts.headroom ?? 0.22;
    this.minThreshold = opts.minThreshold ?? 0.02;

    this.noiseFloor = 0.015;
    this.envelope = 0;
    this.lastRms = 0;
    this.lastLevel = 0;
    this.threshold = this.minThreshold;
    this.active = false;
  }

  process(samples) {
    if (!samples || samples.length === 0) {
      return this._smoothToward(0);
    }

    let sumSq = 0;
    let n = 0;
    for (let i = 0; i < samples.length; i++) {
      let v = samples[i];
      if (!Number.isFinite(v)) continue;
      v = Math.max(-1, Math.min(1, v));
      sumSq += v * v;
      n += 1;
    }
    if (n === 0) {
      return this._smoothToward(0);
    }

    const rms = Math.sqrt(sumSq / n);
    this.lastRms = Number.isFinite(rms) ? rms : 0;

    const sens = Math.max(0.1, this.sensitivity);
    const quietGate = this.noiseFloor * 1.35;
    if (!this.active && this.lastRms <= quietGate) {
      if (this.lastRms < this.noiseFloor) {
        this.noiseFloor = this.noiseFloor * 0.85 + this.lastRms * 0.15;
      } else {
        this.noiseFloor =
          this.noiseFloor * (1 - this.noiseFloorAlpha) + this.lastRms * this.noiseFloorAlpha;
      }
    } else if (!this.active && this.lastRms > quietGate) {
      this.noiseFloor =
        this.noiseFloor * (1 - this.noiseFloorAlpha * 0.25) +
        this.lastRms * (this.noiseFloorAlpha * 0.25);
    }

    this.threshold = Math.max(
      this.minThreshold / sens,
      (this.noiseFloor * this.margin) / sens
    );

    let raw = 0;
    if (this.lastRms > this.threshold) {
      raw = (this.lastRms - this.threshold) / Math.max(1e-6, this.headroom);
      raw = Math.max(0, Math.min(1, raw));
    }

    return this._smoothToward(raw);
  }

  _smoothToward(target) {
    const t = Number.isFinite(target) ? Math.max(0, Math.min(1, target)) : 0;
    const coef = t > this.envelope ? this.attack : this.release;
    this.envelope += (t - this.envelope) * coef;
    if (!Number.isFinite(this.envelope) || this.envelope < 1e-5) this.envelope = 0;
    if (this.envelope > 1) this.envelope = 1;
    this.lastLevel = this.envelope;
    this.active = this.envelope > 0.02;
    return this.envelope;
  }

  reset() {
    this.noiseFloor = 0.015;
    this.envelope = 0;
    this.lastRms = 0;
    this.lastLevel = 0;
    this.threshold = this.minThreshold;
    this.active = false;
  }

  diagnostics() {
    return {
      rms: this.lastRms,
      noiseFloor: this.noiseFloor,
      threshold: this.threshold,
      level: this.lastLevel,
      active: this.active,
    };
  }
}

export class PersistentField {
  constructor(rows = 8, cols = 9, opts = {}) {
    this.rows = rows;
    this.cols = cols;
    this.decay = opts.decay ?? 0.92;
    this.maxValue = opts.maxValue ?? 8;
    this.values = new Float64Array(rows * cols);
    this.paused = false;
  }

  index(i, j) {
    return (
      (((i % this.rows) + this.rows) % this.rows) * this.cols +
      (((j % this.cols) + this.cols) % this.cols)
    );
  }

  inject(i, j, amount, spread = true) {
    const a = Math.max(-this.maxValue, Math.min(this.maxValue, amount));
    if (!Number.isFinite(a)) return;
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

  injectRandom(amount) {
    const i = Math.floor(Math.random() * this.rows);
    const j = Math.floor(Math.random() * this.cols);
    this.inject(i, j, amount, true);
    return { i, j };
  }

  injectContinuous(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const a = Math.min(this.maxValue * 0.25, amount);
    const ci = Math.floor(this.rows / 2);
    const cj = Math.floor(this.cols / 2);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        const d = Math.hypot(i - ci, j - cj);
        const w = Math.exp(-d * 0.55);
        this.inject(i, j, a * w * 0.35, false);
      }
    }
  }

  step() {
    if (this.paused) return;
    const lambda = this.decay;
    for (let k = 0; k < this.values.length; k++) {
      let v = this.values[k] * lambda;
      if (!Number.isFinite(v)) v = 0;
      if (Math.abs(v) < 1e-8) v = 0;
      if (Math.abs(v) > this.maxValue) v = Math.sign(v) * this.maxValue;
      this.values[k] = v;
    }
  }

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

  isBounded() {
    for (let k = 0; k < this.values.length; k++) {
      if (!Number.isFinite(this.values[k])) return false;
      if (Math.abs(this.values[k]) > this.maxValue + 1e-6) return false;
    }
    return true;
  }
}
