// 8-bit Retro Web Audio Synthesizer for Atari Pitfall 3D
// Fully self-contained without external audio assets.
// Os 6 efeitos clássicos (pulo, tesouro, morte, queda, tropeço, cipó) foram
// re-sintetizados por análise espectral dos sons autênticos do Atari 2600
// (referência: meatfighter/pitfall-js — nenhum arquivo de áudio copiado,
// tudo gerado via Web Audio API em estilo TIA: onda quadrada com pitch em degraus).

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

  // Sequência TIA: onda quadrada com pitch em degraus. notes = [[freqHz, durSec], ...]
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

  // Autêntico grito do Tarzan do Atari 2600 ao agarrar o cipó:
  // rosnado grave + iodel alternado 175/210Hz + cauda (total ~1.9s)
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

  // Pulo clássico do Atari: varredura quadrada ascendente 300 -> 700Hz (~0.2s)
  playJump() {
    if (!this.enabled) return;
    const notes = [
      [300, 0.05], [420, 0.05], [525, 0.05], [700, 0.07],
    ];
    this.playSteps(notes, 0.22);
  }

  // Tesouro autêntico: estalo de ruído + arpejo quadrado grave (~0.65s)
  playTreasure() {
    if (!this.enabled) return;
    this.init();
    this.playNoise(0.1, 0.18, this.ctx.currentTime);
    const notes = [
      [140, 0.06], [175, 0.06], [210, 0.2], [175, 0.08], [210, 0.18],
    ];
    this.playSteps(notes, 0.16, 0.1);
  }

  // Tropeço autêntico (kneel): zumbido áspero descendente 700 -> 60Hz (~0.4s)
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

  // Morte autêntica do Atari 2600: degraus graves 140 -> 80 -> 140 -> 100Hz (~2.1s)
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

  // Fim de jogo: o jingle de morte original (o cartucho repete o mesmo som)
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

  // Queda no buraco autêntica: dois degraus graves 80 -> 140Hz (~0.4s)
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

  // Footstep tap
  playStep() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.04);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
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
