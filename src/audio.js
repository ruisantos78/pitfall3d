// 8-bit Retro Web Audio Synthesizer for Atari Pitfall 3D
// Fully self-contained without external audio assets

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

  // Authentic Atari Pitfall "Tarzan Yell" when grabbing the vine
  playTarzanYell() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;

    // Classic Activision pitched yodel notes
    const notes = [
      660, 587, 523, 660, 587, 523,
      784, 660, 523, 440, 392, 330,
      294, 261, 220, 196, 164, 130
    ];
    const noteDuration = 0.055;

    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * noteDuration);

      const startTime = now + idx * noteDuration;
      const endTime = startTime + noteDuration;

      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, endTime);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(startTime);
      osc.stop(endTime);
    });
  }

  // Classic Atari Jump Boing
  playJump() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.16);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.18);
  }

  // Treasure pickup chime (Gold / Diamonds / Money Bag)
  playTreasure() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6

    freqs.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + i * 0.05);

      const tStart = now + i * 0.05;
      const tEnd = tStart + 0.12;

      gain.gain.setValueAtTime(0.14, tStart);
      gain.gain.exponentialRampToValueAtTime(0.001, tEnd);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(tStart);
      osc.stop(tEnd);
    });
  }

  // Rolling log trip / penalty sound
  playTrip() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;

    // Harsh buzz down
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(50, now + 0.25);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
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

  // Authentic Atari 2600 Life Lost Sound (Descending tragic 8-bit arpeggio with pitch bend)
  playLifeLost() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;

    // Classic 8-bit descending minor cascade
    const notes = [
      { freq: 440, duration: 0.09 }, // A4
      { freq: 370, duration: 0.09 }, // F#4
      { freq: 311, duration: 0.11 }, // Eb4
      { freq: 261, duration: 0.13 }, // C4
      { freq: 207, duration: 0.15 }, // G#3
      { freq: 155, duration: 0.28 }, // Eb3 (deep sad resonant note)
    ];

    let t = now;
    notes.forEach((n, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = idx % 2 === 0 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(n.freq, t);
      osc.frequency.exponentialRampToValueAtTime(n.freq * 0.90, t + n.duration);

      gain.gain.setValueAtTime(0.24, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + n.duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + n.duration);

      t += n.duration * 0.85;
    });

    // Low sub-bass thud at the end
    const thud = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(95, now + 0.45);
    thud.frequency.exponentialRampToValueAtTime(30, now + 0.9);
    thudGain.gain.setValueAtTime(0.28, now + 0.45);
    thudGain.gain.exponentialRampToValueAtTime(0.01, now + 0.9);
    thud.connect(thudGain);
    thudGain.connect(this.ctx.destination);
    thud.start(now + 0.45);
    thud.stop(now + 0.9);

    // Initial impact pop
    this.playNoise(0.06, 0.18, now);
  }

  // Dramatic Game Over Fanfare
  playGameOver() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;

    const notes = [
      { freq: 330, duration: 0.18 },
      { freq: 293, duration: 0.18 },
      { freq: 261, duration: 0.22 },
      { freq: 220, duration: 0.24 },
      { freq: 174, duration: 0.28 },
      { freq: 130, duration: 0.55 },
    ];

    let t = now;
    notes.forEach((n, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.freq, t);
      osc.frequency.exponentialRampToValueAtTime(n.freq * 0.88, t + n.duration);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + n.duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + n.duration);

      t += n.duration * 0.9;
    });
  }

  // Quicksand / Tar pit fall
  playSink() {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.6);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.6);
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
