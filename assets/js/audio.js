/**
 * Browser-side microphone / file analysis via Web Audio API.
 * Never uploads audio. Cleans up tracks on stop.
 */

export class AudioInput {
  constructor() {
    this.ctx = null;
    this.source = null;
    this.analyser = null;
    this.stream = null;
    this.raf = null;
    this.active = false;
    this.onLevel = null;
    this._data = null;
  }

  async startMic() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone API not supported in this browser');
    }
    await this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this._setupAnalyser();
    this.active = true;
    this._tick();
  }

  async startFile(file) {
    if (!file) throw new Error('No audio file selected');
    await this.stop();
    const buf = await file.arrayBuffer();
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuf = await this.ctx.decodeAudioData(buf.slice(0));
    this.source = this.ctx.createBufferSource();
    this.source.buffer = audioBuf;
    this.source.loop = true;
    this._setupAnalyser();
    this.source.start(0);
    this.active = true;
    this._tick();
  }

  _setupAnalyser() {
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.source.connect(this.analyser);
    this._data = new Uint8Array(this.analyser.frequencyBinCount);
  }

  _tick() {
    if (!this.active || !this.analyser) return;
    this.analyser.getByteFrequencyData(this._data);
    const lowN = Math.max(1, Math.floor(this._data.length / 8));
    let bass = 0;
    let total = 0;
    for (let i = 0; i < this._data.length; i++) {
      total += this._data[i];
      if (i < lowN) bass += this._data[i];
    }
    bass = bass / (lowN * 255);
    const overall = total / (this._data.length * 255);
    if (this.onLevel) this.onLevel(bass, overall);
    this.raf = requestAnimationFrame(() => this._tick());
  }

  async stop() {
    this.active = false;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    try {
      if (this.source && this.source.stop) this.source.stop();
    } catch (_) {}
    this.source = null;
    this.analyser = null;
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    if (this.ctx) {
      try { await this.ctx.close(); } catch (_) {}
      this.ctx = null;
    }
  }
}
