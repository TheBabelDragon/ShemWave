/**
 * Complex-lattice simulation: configurable rows×cols, four-neighbor coupling,
 * damping, bounded nonlinearity. Separate from drawing.
 *
 * Triplet→grid mapping (deterministic, any size):
 *  - Cell k maps to triplet index (k % tripletCount).
 *  - Selected triplet components are mixed into the lattice center as a bias.
 *  - Does not require grid cells === triplet count.
 */

export class ComplexLattice {
  constructor(rows = 16, cols = 16) {
    this.rows = Math.max(2, rows | 0);
    this.cols = Math.max(2, cols | 0);
    const n = this.rows * this.cols;
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this._tmpRe = new Float64Array(n);
    this._tmpIm = new Float64Array(n);
    this.paused = false;
    this.time = 0;
  }

  index(i, j) {
    return i * this.cols + j;
  }

  getComplex(i, j) {
    const k = this.index(i, j);
    return { re: this.re[k], im: this.im[k] };
  }

  setComplex(i, j, re, im) {
    const k = this.index(i, j);
    this.re[k] = re;
    this.im[k] = im;
  }

  initFromWaveParams(waveParams, allTripletParams) {
    const n = this.rows * this.cols;
    this.re.fill(0);
    this.im.fill(0);

    const list =
      allTripletParams && allTripletParams.length > 0 ? allTripletParams : null;

    if (list) {
      const tCount = list.length;
      for (let k = 0; k < n; k++) {
        const p = list[k % tCount];
        const total = p && Number.isFinite(p.total) ? p.total : 0;
        const amp = total / 100;
        const phase = ((total % 360) * Math.PI) / 180;
        let re = amp * Math.cos(phase);
        let im = amp * Math.sin(phase);
        if (!Number.isFinite(re)) re = 0;
        if (!Number.isFinite(im)) im = 0;
        this.re[k] = re;
        this.im[k] = im;
      }
    }

    if (waveParams && waveParams.components) {
      const ci = Math.floor(this.rows / 2);
      const cj = Math.floor(this.cols / 2);
      for (const c of waveParams.components) {
        const amp = (c.amp || 0) * 2;
        const re = amp * Math.cos(c.phaseOffset || 0);
        const im = amp * Math.sin(c.phaseOffset || 0);
        const k = this.index(ci, cj);
        this.re[k] += Number.isFinite(re) ? re : 0;
        this.im[k] += Number.isFinite(im) ? im : 0;
      }
    }

    this.time = 0;
  }

  inject(i, j, strength) {
    const ii = ((i % this.rows) + this.rows) % this.rows;
    const jj = ((j % this.cols) + this.cols) % this.cols;
    const k = this.index(ii, jj);
    const s = Number.isFinite(strength) ? strength : 0;
    this.re[k] += s;
    if (Math.abs(this.re[k]) > 1e6) this.re[k] = Math.sign(this.re[k]) * 1e6;
  }

  step(alpha = 0.22, beta = 0.03, gamma = 0.08) {
    if (this.paused) return;
    const { rows, cols, re, im, _tmpRe, _tmpIm } = this;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const k = i * cols + j;
        const pr = re[k];
        const pi = im[k];
        const up = ((i - 1 + rows) % rows) * cols + j;
        const dn = ((i + 1) % rows) * cols + j;
        const lf = i * cols + ((j - 1 + cols) % cols);
        const rt = i * cols + ((j + 1) % cols);
        const lapR = (re[up] + re[dn] + re[lf] + re[rt]) / 4 - pr;
        const lapI = (im[up] + im[dn] + im[lf] + im[rt]) / 4 - pi;
        const abs2 = pr * pr + pi * pi;
        const nl = beta * (abs2 / (1 + abs2));
        _tmpRe[k] = pr + alpha * lapR + nl * pr - gamma * pr;
        _tmpIm[k] = pi + alpha * lapI + nl * pi - gamma * pi;
        if (!Number.isFinite(_tmpRe[k])) _tmpRe[k] = 0;
        if (!Number.isFinite(_tmpIm[k])) _tmpIm[k] = 0;
        if (Math.abs(_tmpRe[k]) > 1e6) _tmpRe[k] = Math.sign(_tmpRe[k]) * 1e6;
        if (Math.abs(_tmpIm[k]) > 1e6) _tmpIm[k] = Math.sign(_tmpIm[k]) * 1e6;
      }
    }
    this.re.set(_tmpRe);
    this.im.set(_tmpIm);
    this.time += 1;
  }

  metrics() {
    const n = this.re.length;
    let sum = 0;
    let sum2 = 0;
    const amps = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const a = Math.hypot(this.re[k], this.im[k]);
      amps[k] = a;
      sum += a;
      sum2 += a * a;
    }
    const mean = sum / n;
    const variance = sum2 / n - mean * mean;
    let entropy = 0;
    const total = sum < 1e-12 ? 1e-12 : sum;
    for (let k = 0; k < n; k++) {
      const p = amps[k] / total;
      if (p > 0) entropy -= p * Math.log(p + 1e-12);
    }
    return {
      meanIntensity: mean,
      variance: Number.isFinite(variance) ? variance : 0,
      entropy: Number.isFinite(entropy) ? entropy : 0,
    };
  }

  amplitudeGrid() {
    const out = new Float64Array(this.re.length);
    for (let k = 0; k < this.re.length; k++) {
      out[k] = Math.hypot(this.re[k], this.im[k]);
    }
    return out;
  }

  phaseGrid() {
    const out = new Float64Array(this.re.length);
    for (let k = 0; k < this.re.length; k++) {
      out[k] = Math.atan2(this.im[k], this.re[k]);
    }
    return out;
  }
}
