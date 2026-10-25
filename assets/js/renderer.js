/**
 * Canvas rendering modes: lattice, interference, phase, radial.
 * Waveform Drive modulates interference/radial geometry via audio features.
 */

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function lerpColor(palette, t) {
  if (!palette || !palette.length) return { r: 255, g: 255, b: 255 };
  const x = Math.max(0, Math.min(1, t)) * (palette.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  if (i >= palette.length - 1) return hexToRgb(palette[palette.length - 1]);
  const a = hexToRgb(palette[i]);
  const b = hexToRgb(palette[i + 1]);
  return {
    r: Math.round(a.r + (b.r - a.r) * f),
    g: Math.round(a.g + (b.g - a.g) * f),
    b: Math.round(a.b + (b.b - a.b) * f),
  };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.mode = 'lattice';
    this.palette = ['#0b1026', '#1b3a4b', '#28a89d', '#a8e6cf', '#f7f3e3'];
    this.spatialFrequency = 1.0;
    this.waveSpeed = 0.5;
    this.symmetry = 1.0;
    this.time = 0;
    this.waveParams = null;
    this.cssW = 0;
    this.cssH = 0;
    this.dpr = 1;
    this.audioFeatures = null;
    this.waveformDrive = false;
    this.waveformDisplacement = 0.55;
    this.frequencyResponse = 0.55;
  }

  setPalette(colors) {
    if (Array.isArray(colors) && colors.length) this.palette = colors;
  }

  setAudioDrive(features, enabled, displacement, freqStrength) {
    this.audioFeatures = features || null;
    this.waveformDrive = !!enabled && !!features;
    if (displacement !== undefined) this.waveformDisplacement = displacement;
    if (freqStrength !== undefined) this.frequencyResponse = freqStrength;
  }

  resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cssW = Math.max(160, Math.min(Math.floor(w) || 0, 2400));
    const cssH = Math.max(160, Math.min(Math.floor(h) || 0, 1800));
    if (cssW === this.cssW && cssH === this.cssH && dpr === this.dpr) return;
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(lattice, field) {
    const w = this.cssW;
    const h = this.cssH;
    if (w < 1 || h < 1) return;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.fillStyle = this.palette[0] || '#000';
    this.ctx.fillRect(0, 0, w, h);
    switch (this.mode) {
      case 'interference':
        this._field(w, h, 'interference');
        break;
      case 'phase':
        this._drawPhase(lattice, w, h);
        break;
      case 'radial':
        this._field(w, h, 'radial');
        break;
      default:
        this._drawLattice(lattice, w, h, field);
        break;
    }
    this.time += this.waveSpeed * 0.05;
  }

  _drawLattice(lattice, w, h, field) {
    const amps = lattice.amplitudeGrid();
    let maxA = 1e-9;
    for (let k = 0; k < amps.length; k++) if (amps[k] > maxA) maxA = amps[k];
    let fieldVals = null;
    let maxF = 1e-9;
    if (field && field.values && field.values.length === amps.length) {
      fieldVals = field.values;
      for (let k = 0; k < fieldVals.length; k++) {
        const a = Math.abs(fieldVals[k]);
        if (a > maxF) maxF = a;
      }
    }
    let envBoost = 0;
    if (this.waveformDrive && this.audioFeatures) {
      envBoost = this.audioFeatures.envelope * this.waveformDisplacement * 0.25;
    }
    const cw = w / lattice.cols;
    const ch = h / lattice.rows;
    for (let i = 0; i < lattice.rows; i++) {
      for (let j = 0; j < lattice.cols; j++) {
        const k = i * lattice.cols + j;
        let t = amps[k] / maxA;
        if (fieldVals) t = Math.min(1, t + 0.35 * (Math.abs(fieldVals[k]) / maxF));
        t = Math.min(1, t + envBoost);
        const c = lerpColor(this.palette, t);
        this.ctx.fillStyle = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
        this.ctx.fillRect(j * cw, i * ch, cw + 0.5, ch + 0.5);
      }
    }
  }

  _drawPhase(lattice, w, h) {
    const phases = lattice.phaseGrid();
    const cw = w / lattice.cols;
    const ch = h / lattice.rows;
    for (let i = 0; i < lattice.rows; i++) {
      for (let j = 0; j < lattice.cols; j++) {
        const t = (phases[i * lattice.cols + j] + Math.PI) / (2 * Math.PI);
        const c = lerpColor(this.palette, t);
        this.ctx.fillStyle = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
        this.ctx.fillRect(j * cw, i * ch, cw + 0.5, ch + 0.5);
      }
    }
  }

  _field(w, h, kind) {
    const dw = this.canvas.width;
    const dh = this.canvas.height;
    if (dw < 1 || dh < 1) return;
    const img = this.ctx.createImageData(dw, dh);
    const data = img.data;
    const comps =
      this.waveParams && this.waveParams.components
        ? this.waveParams.components
        : [
            { freqRatio: 1, amp: 1, phaseOffset: 0 },
            { freqRatio: 1.2, amp: 0.8, phaseOffset: 2.094 },
            { freqRatio: 0.9, amp: 0.7, phaseOffset: 4.189 },
          ];
    let sf = this.spatialFrequency;
    let t = this.time;
    let symmetry = this.symmetry;
    let midAmp = 1;
    let highRipple = 0;
    let dispScale = 0;
    let env = 0;
    const feat = this.waveformDrive ? this.audioFeatures : null;
    if (feat) {
      const fr = this.frequencyResponse;
      const wd = this.waveformDisplacement;
      env = feat.envelope;
      sf = sf * (1 + feat.low * fr * 0.85);
      midAmp = 1 + feat.mid * fr * 0.9;
      highRipple = feat.high * fr * 4.5;
      dispScale = wd * env * 1.4;
    }
    const cx = dw / 2;
    const cy = dh / 2;
    const minDim = Math.min(dw, dh);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        let v = 0;
        if (kind === 'radial') {
          const dx = x - cx;
          const dy = y - cy;
          let r = Math.hypot(dx, dy) / minDim;
          const ang = Math.atan2(dy, dx);
          if (feat && dispScale > 0) {
            const wt = ((ang / (Math.PI * 2)) + 1) % 1;
            const sample = feat.sampleWaveform(wt);
            r += sample * dispScale * 0.22;
          }
          for (const c of comps) {
            const amp = c.amp * midAmp;
            v += amp * Math.sin(
              sf * c.freqRatio * r * (12 + highRipple) +
                ang * symmetry +
                c.phaseOffset +
                t * c.freqRatio
            );
          }
          v /= comps.length;
        } else {
          const nx = (x / dw - 0.5) * 2;
          const ny = (y / dh - 0.5) * 2;
          let r = Math.hypot(nx, ny);
          const ang0 = Math.atan2(ny, nx);
          if (feat && dispScale > 0) {
            const wt = ((x / dw) * 0.7 + (y / dh) * 0.3) % 1;
            const sample = feat.sampleWaveform(wt);
            r += sample * dispScale * 0.28;
          }
          for (const c of comps) {
            const ang = ang0 * symmetry + c.phaseOffset;
            const amp = c.amp * midAmp;
            v += amp * Math.sin(
              sf * c.freqRatio * (r * (8 + highRipple * 0.5) + ang) + t * c.freqRatio
            );
          }
          v /= comps.length * 1.5;
        }
        if (feat && env > 0) {
          v = v * (1 + env * this.waveformDisplacement * 0.15);
        }
        const c = lerpColor(this.palette, (v + 1) / 2);
        const i = (y * dw + x) * 4;
        data[i] = c.r;
        data[i + 1] = c.g;
        data[i + 2] = c.b;
        data[i + 3] = 255;
      }
    }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.putImageData(img, 0, 0);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }
}
