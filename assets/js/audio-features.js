/**
 * Audio feature extraction for Waveform Drive.
 * Pure over sample/frequency arrays — no microphone required for tests.
 */

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class AudioFeatureExtractor {
  constructor(opts = {}) {
    this.waveformPoints = opts.waveformPoints ?? 64;
    this.sensitivity = opts.sensitivity ?? 1.0;
    this.attack = opts.attack ?? 0.35;
    this.release = opts.release ?? 0.12;
    this.bandSmoothing = opts.bandSmoothing ?? 0.25;

    this.waveform = new Float32Array(this.waveformPoints);
    this.envelope = 0;
    this.rms = 0;
    this.peak = 0;
    this.low = 0;
    this.mid = 0;
    this.high = 0;
    this._lowS = 0;
    this._midS = 0;
    this._highS = 0;
  }

  process(timeSamples, freqBins) {
    this._processWaveform(timeSamples);
    this._processBands(freqBins);
    return this.snapshot();
  }

  _processWaveform(samples) {
    const nPts = this.waveformPoints;
    if (!samples || samples.length === 0) {
      this.waveform.fill(0);
      this.rms = 0;
      this.peak = 0;
      this._smoothEnvelope(0);
      return;
    }

    const n = samples.length;
    let sumSq = 0;
    let peak = 0;
    let valid = 0;

    for (let i = 0; i < nPts; i++) {
      const pos = (i / (nPts - 1 || 1)) * (n - 1);
      const i0 = Math.floor(pos);
      const i1 = Math.min(n - 1, i0 + 1);
      const f = pos - i0;
      let v0 = samples[i0];
      let v1 = samples[i1];
      if (!Number.isFinite(v0)) v0 = 0;
      if (!Number.isFinite(v1)) v1 = 0;
      v0 = Math.max(-1, Math.min(1, v0));
      v1 = Math.max(-1, Math.min(1, v1));
      this.waveform[i] = v0 * (1 - f) + v1 * f;
    }

    for (let i = 0; i < n; i++) {
      let v = samples[i];
      if (!Number.isFinite(v)) continue;
      v = Math.max(-1, Math.min(1, v));
      sumSq += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
      valid += 1;
    }

    this.rms = valid > 0 ? Math.sqrt(sumSq / valid) : 0;
    this.peak = peak;
    const sens = Math.max(0.1, this.sensitivity);
    this._smoothEnvelope(clamp01(this.rms * sens * 3.2));
  }

  _smoothEnvelope(target) {
    const t = clamp01(target);
    const coef = t > this.envelope ? this.attack : this.release;
    this.envelope += (t - this.envelope) * coef;
    if (!Number.isFinite(this.envelope) || this.envelope < 1e-5) this.envelope = 0;
    if (this.envelope > 1) this.envelope = 1;
  }

  _processBands(freqBins) {
    if (!freqBins || freqBins.length === 0) {
      this._smoothBand('_lowS', 0);
      this._smoothBand('_midS', 0);
      this._smoothBand('_highS', 0);
      this.low = this._lowS;
      this.mid = this._midS;
      this.high = this._highS;
      return;
    }

    const n = freqBins.length;
    const lowEnd = Math.max(1, Math.floor(n * 0.12));
    const midEnd = Math.max(lowEnd + 1, Math.floor(n * 0.45));

    let lowSum = 0, midSum = 0, highSum = 0;
    let lowN = 0, midN = 0, highN = 0;
    let maxSeen = 0;
    for (let i = 0; i < n; i++) {
      const v = freqBins[i];
      if (Number.isFinite(v) && v > maxSeen) maxSeen = v;
    }
    const scale = maxSeen > 1.5 ? 255 : 1;

    for (let i = 0; i < n; i++) {
      let v = freqBins[i];
      if (!Number.isFinite(v)) continue;
      v = Math.max(0, v) / scale;
      if (i < lowEnd) { lowSum += v; lowN += 1; }
      else if (i < midEnd) { midSum += v; midN += 1; }
      else { highSum += v; highN += 1; }
    }

    const sens = Math.max(0.1, this.sensitivity);
    this._smoothBand('_lowS', clamp01(((lowN ? lowSum / lowN : 0) * sens) * 1.4));
    this._smoothBand('_midS', clamp01(((midN ? midSum / midN : 0) * sens) * 1.4));
    this._smoothBand('_highS', clamp01(((highN ? highSum / highN : 0) * sens) * 1.4));
    this.low = this._lowS;
    this.mid = this._midS;
    this.high = this._highS;
  }

  _smoothBand(key, target) {
    const t = clamp01(target);
    const cur = this[key];
    this[key] = cur + (t - cur) * this.bandSmoothing;
    if (!Number.isFinite(this[key])) this[key] = 0;
  }

  sampleWaveform(t) {
    const n = this.waveform.length;
    if (n === 0) return 0;
    const x = ((t % 1) + 1) % 1;
    const pos = x * (n - 1);
    const i0 = Math.floor(pos);
    const i1 = Math.min(n - 1, i0 + 1);
    const f = pos - i0;
    return this.waveform[i0] * (1 - f) + this.waveform[i1] * f;
  }

  reset() {
    this.waveform.fill(0);
    this.envelope = 0;
    this.rms = 0;
    this.peak = 0;
    this.low = 0;
    this.mid = 0;
    this.high = 0;
    this._lowS = 0;
    this._midS = 0;
    this._highS = 0;
  }

  snapshot() {
    return {
      waveform: this.waveform,
      envelope: this.envelope,
      rms: this.rms,
      peak: this.peak,
      low: this.low,
      mid: this.mid,
      high: this.high,
    };
  }

  diagnostics() {
    return {
      rms: this.rms,
      peak: this.peak,
      envelope: this.envelope,
      low: this.low,
      mid: this.mid,
      high: this.high,
    };
  }
}
