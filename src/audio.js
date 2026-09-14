// 8-bit Retro Web Audio Synthesizer for Atari Pitfall 3D
// Fully self-contained without external audio assets.
// The 6 classic effects (jump, treasure, death, fall, trip, vine) were
// re-synthesized from spectral analysis of the authentic Atari 2600 sounds
// (reference: meatfighter/pitfall-js — no audio files copied,
// everything generated via Web Audio API in TIA style: square wave with stepped pitch).

class RetroAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.ambientTimer = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  // TIA sequence: square wave with stepped pitch. notes = [[freqHz, durSec], ...]
  playSteps(notes, volume = 0.2, delay = 0) {
    if (!this.enabled) return;
    this.init();
    const startAt = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    let t = startAt;
    notes.forEach(([freq, dur]) => {
      osc.frequency.setValueAtTime(freq, t);
      t += dur;
    });

    gain.gain.setValueAtTime(volume, startAt);
    gain.gain.setValueAtTime(volume, Math.max(startAt, t - 0.03));
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(startAt);
    osc.stop(t + 0.03);
  }

  // Authentic Atari 2600 Tarzan yell when grabbing the vine:
  // low growl + alternating 175/210Hz yodel + tail (total ~1.9s)
  playTarzanYell() {
    if (!this.enabled) return;
    const notes = [
      [100, 0.45],
      [175, 0.12], [210, 0.12], [175, 0.12], [210, 0.12],
      [175, 0.12], [210, 0.12], [175, 0.11],
      [210, 0.06], [175, 0.06], [210, 0.06], [175, 0.06],
      [175, 0.45],
    ];
    this.playSteps(notes, 0.2);
  }

  // Classic Atari jump: ascending square sweep 300 -> 700Hz (~0.2s)
  playJump() {
    if (!this.enabled) return;
    const notes = [
      [300, 0.05], [420, 0.05], [525, 0.05], [700, 0.07],
    ];
    this.playSteps(notes, 0.22);
  }

  // Authentic treasure pickup: noise snap + low square arpeggio (~0.65s)
  playTreasure() {
    if (!this.enabled) return;
    this.init();
    this.playNoise(0.1, 0.18, this.ctx.currentTime);
    const notes = [
      [140, 0.06], [175, 0.06], [210, 0.2], [175, 0.08], [210, 0.18],
    ];
    this.playSteps(notes, 0.16, 0.1);
  }

  // Authentic trip/stumble: harsh descending buzz 700 → 60 Hz (~0.4s)
  playTrip() {
    if (!this.enabled) return;
    this.init();
    this.playNoise(0.35, 0.12, this.ctx.currentTime);
    const notes = [
      [700, 0.05], [400, 0.05], [300, 0.05], [150, 0.1], [80, 0.15],
    ];
    this.playSteps(notes, 0.26);
  }

  // Crocodile chomp / snap
  playChomp() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;

    // High snap
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(800, now);
    osc1.frequency.exponentialRampToValueAtTime(80, now + 0.1);
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.1);

    // Crunch noise
    this.playNoise(0.2, 0.25, now);
  }

  // Crocodile mouth snapping shut (safety signal!)
  playCrocSnap() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  // Authentic Atari 2600 death jingle: low steps 140 → 80 → 140 → 100 Hz (~2.1s)
  playLifeLost() {
    if (!this.enabled) return;
    this.playSteps(
      [
        [140, 0.55],
        [80, 0.5],
        [140, 0.35],
        [100, 0.7],
      ],
      0.24,
    );
  }

  // Game over: the original death jingle (the cartridge repeats the same sound)
  playGameOver() {
    if (!this.enabled) return;
    this.playSteps(
      [
        [140, 0.55],
        [80, 0.5],
        [140, 0.35],
        [100, 0.7],
      ],
      0.24,
    );
  }

  // Authentic pit fall: two low steps 80 → 140 Hz (~0.4s)
  playSink() {
    if (!this.enabled) return;
    this.playSteps(
      [
        [80, 0.2],
        [140, 0.2],
      ],
      0.28,
    );
  }

  // Whistling fall into a ladder-free pit (pitfall-js 'fall' style, 100%
  // synthesized): descending glissando 900 → 150 Hz (~0.7s, the 8m drop)
  playHoleFall() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.7);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.7);
  }

  // Disappearing quicksand opening / rumbling
  playQuicksandRumble() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(65, now);
    osc.frequency.linearRampToValueAtTime(35, now + 0.3);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  // Quicksand hole closing / solidifying (safe to run!)
  playGroundThud() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  // Wood knock: rolling-log proximity tick, volume scales with distance
  playWoodKnock(volume = 0.2) {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.07);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  // Jump-now cue: bright square beep when a log is about to hit
  playJumpCue() {
    if (!this.enabled) return;
    this.playSteps([[880, 0.09]], 0.2);
  }

  // Footstep tap (triangle 160→70Hz carries on small speakers;
  // pure low sine was inaudible outside headphones)
  playStep() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.06);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  // Release vine whoosh
  playRelease() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.14);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.14);
  }

  // Noise generator for crunches/splashes
  playNoise(duration, volume, startTime) {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, startTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(startTime);
    noise.stop(startTime + duration);
  }

  // Ambient 8-bit jungle bird chirps
  startAmbient() {
    if (this.ambientTimer) return;
    const scheduleNext = () => {
      const delay = 4000 + Math.random() * 6000;
      this.ambientTimer = setTimeout(() => {
        if (this.enabled && this.ctx) {
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          const baseFreq = 1600 + Math.random() * 800;
          osc.frequency.setValueAtTime(baseFreq, now);
          osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.4, now + 0.08);
          gain.gain.setValueAtTime(0.04, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.1);
        }
        scheduleNext();
      }, delay);
    };
    scheduleNext();
  }

  stopAmbient() {
    if (this.ambientTimer) {
      clearTimeout(this.ambientTimer);
      this.ambientTimer = null;
    }
  }
}

export const audio = new RetroAudio();
