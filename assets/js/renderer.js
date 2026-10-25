/**
 * Canvas rendering modes: lattice, interference, phase, radial.
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
    this.ctx = canvas.getContext('2d');
    this.mode = 'lattice';
    this.palette = ['#0b1026', '#1b3a4b', '#28a89d', '#a8e6cf', '#f7f3e3'];
    this.spatialFrequency = 1.0;
    this.waveSpeed = 0.5;
    this.symmetry = 1.0;
    this.time = 0;
    this.waveParams = null;
  }

  setPalette(colors) {
    if (Array.isArray(colors) && colors.length) this.palette = colors;
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(lattice) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w < 1 || h < 1) return;
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
        this._drawLattice(lattice, w, h);
        break;
    }
    this.time += this.waveSpeed * 0.05;
  }

  _drawLattice(lattice, w, h) {
    const amps = lattice.amplitudeGrid();
    let maxA = 1e-9;
    for (let k = 0; k < amps.length; k++) if (amps[k] > maxA) maxA = amps[k];
    const cw = w / lattice.cols;
    const ch = h / lattice.rows;
    for (let i = 0; i < lattice.rows; i++) {
      for (let j = 0; j < lattice.cols; j++) {
        const a = amps[i * lattice.cols + j] / maxA;
        const c = lerpColor(this.palette, a);
        this.ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
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
        this.ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`;
        this.ctx.fillRect(j * cw, i * ch, cw + 0.5, ch + 0.5);
      }
    }
  }

  _field(w, h, kind) {
    const img = this.ctx.createImageData(w, h);
    const data = img.data;
    const comps = this.waveParams?.components || [
      { freqRatio: 1, amp: 1, phaseOffset: 0 },
      { freqRatio: 1.2, amp: 0.8, phaseOffset: 2.094 },
      { freqRatio: 0.9, amp: 0.7, phaseOffset: 4.189 },
    ];
    const sf = this.spatialFrequency;
    const t = this.time;
    const cx = w / 2;
    const cy = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        if (kind === 'radial') {
          const dx = x - cx;
          const dy = y - cy;
          const r = Math.hypot(dx, dy) / Math.min(w, h);
          const ang = Math.atan2(dy, dx);
          for (const c of comps) {
            v += c.amp * Math.sin(
              sf * c.freqRatio * r * 12 + ang * this.symmetry + c.phaseOffset + t * c.freqRatio
            );
          }
          v /= comps.length;
        } else {
          const nx = (x / w - 0.5) * 2;
          const ny = (y / h - 0.5) * 2;
          for (const c of comps) {
            const ang = Math.atan2(ny, nx) * this.symmetry + c.phaseOffset;
            const r = Math.hypot(nx, ny);
            v += c.amp * Math.sin(sf * c.freqRatio * (r * 8 + ang) + t * c.freqRatio);
          }
          v /= comps.length * 1.5;
        }
        const c = lerpColor(this.palette, (v + 1) / 2);
        const i = (y * w + x) * 4;
        data[i] = c.r;
        data[i + 1] = c.g;
        data[i + 2] = c.b;
        data[i + 3] = 255;
      }
    }
    this.ctx.putImageData(img, 0, 0);
  }
}
