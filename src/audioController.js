/**
 * Procedural Web Audio Synthesizer for KAMI // ZERO
 * Generates real-time interactive soundscapes:
 * - Hold-to-Fold harmonic riser & paper crease foley
 * - The "BOOM" sub-bass impact + iridescent crystal chord burst
 * - Reverse shatter scatter & UI micro-interactions
 */
export class AudioController {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isInitialized = false;

    this.masterGain = null;
    this.chargeOscA = null;
    this.chargeOscB = null;
    this.chargeGain = null;
    this.chargeFilter = null;

    this.windLoopGain = null;
    this.windLoopFilter = null;
    this.sandLoopGain = null;
    this.lastFlapSoundTime = 0;

    this.lastCreaseMilestone = 0;
  }

  init() {
    if (this.isInitialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.isMuted ? 0.0 : 0.75;
    this.masterGain.connect(this.ctx.destination);

    // Continuous Hold-to-Fold Charge Riser
    this.chargeGain = this.ctx.createGain();
    this.chargeGain.gain.value = 0.0;

    this.chargeFilter = this.ctx.createBiquadFilter();
    this.chargeFilter.type = 'lowpass';
    this.chargeFilter.frequency.value = 180;
    this.chargeFilter.Q.value = 4.5;

    this.chargeOscA = this.ctx.createOscillator();
    this.chargeOscB = this.ctx.createOscillator();
    this.chargeOscA.type = 'sine';
    this.chargeOscB.type = 'triangle';
    this.chargeOscA.frequency.value = 110;
    this.chargeOscB.frequency.value = 165; // Perfect 5th

    this.chargeOscA.connect(this.chargeFilter);
    this.chargeOscB.connect(this.chargeFilter);
    this.chargeFilter.connect(this.chargeGain);
    this.chargeGain.connect(this.masterGain);

    this.chargeOscA.start();
    this.chargeOscB.start();

    // Continuous Hold-to-Gust Desert Wind & Sand Loop (active only while holding Wind Gust)
    const loopDuration = 4.0;
    const loopSize = Math.floor(this.ctx.sampleRate * loopDuration);
    const loopBuffer = this.ctx.createBuffer(1, loopSize, this.ctx.sampleRate);
    const loopData = loopBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < loopSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.04 * white) / 1.04;
      loopData[i] = lastOut * 2.8;
    }

    const windLoopSource = this.ctx.createBufferSource();
    windLoopSource.buffer = loopBuffer;
    windLoopSource.loop = true;

    this.windLoopFilter = this.ctx.createBiquadFilter();
    this.windLoopFilter.type = 'bandpass';
    this.windLoopFilter.frequency.value = 260;
    this.windLoopFilter.Q.value = 2.4;

    this.windLoopGain = this.ctx.createGain();
    this.windLoopGain.gain.value = 0.0;

    const sandLoopFilter = this.ctx.createBiquadFilter();
    sandLoopFilter.type = 'highpass';
    sandLoopFilter.frequency.value = 2100;

    this.sandLoopGain = this.ctx.createGain();
    this.sandLoopGain.gain.value = 0.0;

    windLoopSource.connect(this.windLoopFilter);
    this.windLoopFilter.connect(this.windLoopGain);
    this.windLoopGain.connect(this.masterGain);

    windLoopSource.connect(sandLoopFilter);
    sandLoopFilter.connect(this.sandLoopGain);
    this.sandLoopGain.connect(this.masterGain);

    windLoopSource.start();

    this.isInitialized = true;
  }

  toggleMute() {
    this.init();
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.isMuted ? 0.0 : 0.75,
        this.ctx.currentTime,
        0.06
      );
    }
    return this.isMuted;
  }

  /**
   * Updates the continuous charge riser pitch & filter as the user holds (0..1)
   */
  updateHoldProgress(progress, isHolding) {
    if (!this.isInitialized || this.isMuted || !this.ctx) return;

    const now = this.ctx.currentTime;
    const targetGain = isHolding && progress < 0.995 ? Math.min(0.24, 0.04 + progress * 0.22) : 0.0;
    this.chargeGain.gain.setTargetAtTime(targetGain, now, 0.05);

    if (isHolding) {
      const baseFreq = 110 * Math.pow(2, progress * 1.5);
      this.chargeOscA.frequency.setTargetAtTime(baseFreq, now, 0.04);
      this.chargeOscB.frequency.setTargetAtTime(baseFreq * 1.498, now, 0.04);
      this.chargeFilter.frequency.setTargetAtTime(220 + progress * progress * 3400, now, 0.05);

      // Trigger subtle origami paper-crease snaps at 18% intervals
      const milestone = Math.floor(progress * 6);
      if (milestone > this.lastCreaseMilestone && milestone < 6) {
        this.lastCreaseMilestone = milestone;
        this.playPaperCrease(0.5 + progress * 0.8);
      }
    } else {
      this.lastCreaseMilestone = Math.floor(progress * 6);
    }
  }

  /**
   * Crisp procedural paper fold / facet lock snap
   */
  playPaperCrease(pitchMultiplier = 1.0) {
    if (!this.isInitialized || this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520 * pitchMultiplier, now);
    osc.frequency.exponentialRampToValueAtTime(140 * pitchMultiplier, now + 0.045);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  /**
   * The Climax "BOOM" — Sub-bass drop + crisp origami snap + shimmering iridescent chord
   */
  playBoom() {
    this.init();
    if (!this.isInitialized || this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Silence the charge riser immediately
    this.chargeGain.gain.setTargetAtTime(0.0, now, 0.015);

    // 1. Deep cinematic Sub-Bass Impact Drop (140Hz -> 36Hz)
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(145, now);
    subOsc.frequency.exponentialRampToValueAtTime(36, now + 0.45);
    subOsc.frequency.exponentialRampToValueAtTime(28, now + 1.4);

    subGain.gain.setValueAtTime(0.65, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

    subOsc.connect(subGain);
    subGain.connect(this.masterGain);
    subOsc.start(now);
    subOsc.stop(now + 1.55);

    // 2. White-noise Shockwave Transient Burst
    const bufferSize = this.ctx.sampleRate * 0.35;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.08));
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(1800, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(320, now + 0.32);
    noiseFilter.Q.value = 1.2;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.32, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noiseSource.start(now);

    // 3. Shimmering Iridescent Major-9th Crystal Chord (C4, G4, B4, D5, E5, G5)
    const chordNotes = [261.63, 392.0, 493.88, 587.33, 659.25, 783.99];
    chordNotes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.018);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.09 / Math.sqrt(idx + 1), now + 0.06 + idx * 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 2.6 + idx * 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.018);
      osc.stop(now + 2.8 + idx * 0.15);
    });
  }

  /**
   * Shatter / Unwind sound effect when exploding the origami back into fragments
   */
  playShatter() {
    this.init();
    if (!this.isInitialized || this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const scatterNotes = [783.99, 659.25, 523.25, 392.0, 293.66, 196.0];
    scatterNotes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.032);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.72, now + i * 0.032 + 0.18);

      gain.gain.setValueAtTime(0.06, now + i * 0.032);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.032 + 0.22);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.032);
      osc.stop(now + i * 0.032 + 0.24);
    });
  }

  /**
   * Subtle glassy tick for spatial cards & timeline scrubber
   */
  playHoverTick(freq = 1240) {
    if (!this.isInitialized || this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.25, now + 0.025);

    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.035);
  }

  /**
   * Colossal Desert Wind Gust & Blowing Sandstorm Whoosh
   */
  playDesertWindGust() {
    this.init();
    if (!this.isInitialized || this.isMuted || !this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. Howling Desert Wind Formant (3.2s noise buffer swept through dual resonant bandpass filters)
    const duration = 3.2;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Pink-ish noise shaping for deep organic wind body
      lastOut = (lastOut + 0.04 * white) / 1.04;
      data[i] = lastOut * 2.8;
    }

    const windSource = this.ctx.createBufferSource();
    windSource.buffer = noiseBuffer;

    // Low-mid howling gale resonant sweep
    const galeFilter = this.ctx.createBiquadFilter();
    galeFilter.type = 'bandpass';
    galeFilter.Q.value = 2.6;
    galeFilter.frequency.setValueAtTime(160, now);
    galeFilter.frequency.exponentialRampToValueAtTime(720, now + 0.45);
    galeFilter.frequency.exponentialRampToValueAtTime(420, now + 1.35);
    galeFilter.frequency.exponentialRampToValueAtTime(140, now + duration);

    const galeGain = this.ctx.createGain();
    galeGain.gain.setValueAtTime(0.001, now);
    galeGain.gain.linearRampToValueAtTime(0.55, now + 0.28);
    galeGain.gain.exponentialRampToValueAtTime(0.28, now + 1.4);
    galeGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    windSource.connect(galeFilter);
    galeFilter.connect(galeGain);
    galeGain.connect(this.masterGain);

    // 2. High-frequency blowing desert sand hiss layer
    const sandFilter = this.ctx.createBiquadFilter();
    sandFilter.type = 'highpass';
    sandFilter.frequency.setValueAtTime(2200, now);

    const sandGain = this.ctx.createGain();
    sandGain.gain.setValueAtTime(0.001, now);
    sandGain.gain.linearRampToValueAtTime(0.14, now + 0.35);
    sandGain.gain.exponentialRampToValueAtTime(0.001, now + 2.6);

    windSource.connect(sandFilter);
    sandFilter.connect(sandGain);
    sandGain.connect(this.masterGain);

    windSource.start(now);

    // 3. Rapid Origami Wing-Flutter Snaps against the gale
    for (let i = 0; i < 6; i++) {
      const t = now + 0.08 + i * 0.14;
      const flutterOsc = this.ctx.createOscillator();
      const flutterGain = this.ctx.createGain();
      flutterOsc.type = 'triangle';
      flutterOsc.frequency.setValueAtTime(280 + i * 35, t);
      flutterOsc.frequency.exponentialRampToValueAtTime(95, t + 0.06);

      flutterGain.gain.setValueAtTime(0.08, t);
      flutterGain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

      flutterOsc.connect(flutterGain);
      flutterGain.connect(this.masterGain);
      flutterOsc.start(t);
      flutterOsc.stop(t + 0.07);
    }
  }

  /**
   * Continuous Desert Wind & Wingbeat Audio (active while holding Wind Gust, stops immediately when released)
   */
  updateWindGust(isActive, revealProgress) {
    if (!this.isInitialized || this.isMuted || !this.ctx || !this.windLoopGain) return;
    const now = this.ctx.currentTime;

    if (isActive) {
      const gustMod = 0.78 + 0.22 * Math.sin(now * 4.5);
      this.windLoopGain.gain.setTargetAtTime(0.42 * gustMod, now, 0.07);
      this.sandLoopGain.gain.setTargetAtTime(0.11 * gustMod, now, 0.07);

      const centerFreq = 260 + revealProgress * 320 + Math.sin(now * 3.2) * 85;
      this.windLoopFilter.frequency.setTargetAtTime(centerFreq, now, 0.08);

      // Periodic origami wingbeat whoosh every ~0.28s while flapping
      if (now - this.lastFlapSoundTime > 0.28) {
        this.lastFlapSoundTime = now;
        this.playPaperCrease(0.95 + revealProgress * 0.45);
      }
    } else {
      this.windLoopGain.gain.setTargetAtTime(0.0, now, 0.06);
      this.sandLoopGain.gain.setTargetAtTime(0.0, now, 0.06);
    }
  }
}
