/**
 * Complex-lattice simulation: 8×9 default, four-neighbor coupling,
 * damping, bounded nonlinearity. Separate from drawing.
 */

export class ComplexLattice {
  constructor(rows = 8, cols = 9) {
    this.rows = rows;
    this.cols = cols;
    this.re = new Float64Array(rows * cols);
    this.im = new Float64Array(rows * cols);
    this._tmpRe = new Float64Array(rows * cols);
    this._tmpIm = new Float64Array(rows * cols);
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

  /** Initialize from triplet wave params across the lattice. */
  initFromWaveParams(waveParams, allTripletParams) {
    const n = this.rows * this.cols;
    this.re.fill(0);
    this.im.fill(0);
    if (allTripletParams && allTripletParams.length === n) {
      for (let k = 0; k < n; k++) {
        const p = allTripletParams[k];
        const amp = p.total / 100;
        const phase = ((p.total % 360) * Math.PI) / 180;
        this.re[k] = amp * Math.cos(phase);
        this.im[k] = amp * Math.sin(phase);
      }
    } else if (waveParams) {
      const ci = Math.floor(this.rows / 2);
      const cj = Math.floor(this.cols / 2);
      for (const c of waveParams.components) {
        const amp = c.amp * 2;
        const re = amp * Math.cos(c.phaseOffset);
        const im = amp * Math.sin(c.phaseOffset);
        const k = this.index(ci, cj);
        this.re[k] += re;
        this.im[k] += im;
      }
    }
    this.time = 0;
  }

  inject(i, j, strength) {
    const k = this.index(i % this.rows, j % this.cols);
    this.re[k] += strength;
  }

  /**
   * One evolution step.
   * alpha = neighborCoupling, beta = nonlinearity, gamma = damping
   */
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
