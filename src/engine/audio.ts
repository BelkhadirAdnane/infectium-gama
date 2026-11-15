// =========================================================================
// 3. WEB AUDIO API COSMIC & SYSTEM SYNTHESIZER
// =========================================================================
export class CosmicAudio {
  ctx: AudioContext | null;
  enabled: boolean;
  notes: number[];

  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.notes = [130.81, 196.00, 261.63, 329.63, 392.00, 523.25, 587.33, 659.25, 783.99];
  }
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
  playPlanetChime(index) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const baseFreq = this.notes[index % this.notes.length];
    [baseFreq, baseFreq * 1.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.05);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.02, now + 0.9);
      gain.gain.setValueAtTime(0.0001, now + i * 0.05);
      gain.gain.linearRampToValueAtTime(i === 0 ? 0.12 : 0.05, now + 0.08 + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.05);
      osc.stop(now + 1.5);
    });
  }
  playSystemPing() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.07);
      gain.gain.setValueAtTime(0.0001, now + i * 0.07);
      gain.gain.linearRampToValueAtTime(0.09, now + i * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.45);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.5);
    });
  }
  playRebuildFanfare(level) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const chord = level === 1 ? [392, 493.88, 587.33, 783.99] : [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.0001, now + i * 0.06);
      gain.gain.linearRampToValueAtTime(0.08, now + i * 0.06 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.6);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.65);
    });
  }
  playWhoosh() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.35);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.07, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.5);
  }
}
export const audio = new CosmicAudio();

