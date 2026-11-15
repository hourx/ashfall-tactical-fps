// All sound is synthesised at runtime with WebAudio: a noise buffer for gunshots and
// filters for the rest. No audio files, so nothing to fetch and nothing to license.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioCtor) return null;
    ctx = new AudioCtor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    // Two seconds of white noise, reused by every shot and footstep.
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function noiseBurst({ duration = 0.14, gain = 0.5, cutoff = 2400, q = 0.8, type = 'lowpass' }) {
    const audio = ensure();
    if (!audio || muted) return;
    const source = audio.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = 1;
    const filter = audio.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    filter.Q.value = q;
    const env = audio.createGain();
    const t = audio.currentTime;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter).connect(env).connect(master);
    source.start(t);
    source.stop(t + duration + 0.02);
  }

  function tone({ freq = 440, to = freq, duration = 0.12, gain = 0.16, type = 'square' }) {
    const audio = ensure();
    if (!audio || muted) return;
    const osc = audio.createOscillator();
    const env = audio.createGain();
    const t = audio.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + duration);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    // Browsers demand a gesture before audio: call this from the first click.
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    isMuted: () => muted,
    shot(weaponId) {
      if (weaponId === 'vantage') {
        noiseBurst({ duration: 0.2, gain: 0.55, cutoff: 1600 });
        tone({ freq: 160, to: 60, duration: 0.16, gain: 0.3, type: 'triangle' });
      } else if (weaponId === 'cinder') {
        noiseBurst({ duration: 0.1, gain: 0.4, cutoff: 3200 });
        tone({ freq: 220, to: 90, duration: 0.08, gain: 0.18, type: 'square' });
      } else {
        noiseBurst({ duration: 0.11, gain: 0.36, cutoff: 2600 });
        tone({ freq: 260, to: 120, duration: 0.07, gain: 0.14, type: 'square' });
      }
    },
    knife() {
      noiseBurst({ duration: 0.08, gain: 0.2, cutoff: 5200, type: 'highpass' });
    },
    toss() {
      noiseBurst({ duration: 0.16, gain: 0.12, cutoff: 1500, q: 1.4, type: 'bandpass' });
    },
    hitmarker(headshot) {
      tone({ freq: headshot ? 1500 : 1080, duration: 0.06, gain: 0.12, type: 'triangle' });
    },
    kill() {
      tone({ freq: 720, to: 1080, duration: 0.14, gain: 0.12, type: 'triangle' });
    },
    hurt() {
      noiseBurst({ duration: 0.12, gain: 0.22, cutoff: 700 });
    },
    death() {
      tone({ freq: 220, to: 55, duration: 0.7, gain: 0.2, type: 'sawtooth' });
    },
    reload() {
      noiseBurst({ duration: 0.05, gain: 0.16, cutoff: 1800 });
      setTimeout(() => noiseBurst({ duration: 0.05, gain: 0.14, cutoff: 1400 }), 160);
    },
    buy() {
      tone({ freq: 880, duration: 0.06, gain: 0.1, type: 'square' });
      setTimeout(() => tone({ freq: 1320, duration: 0.07, gain: 0.08, type: 'square' }), 70);
    },
    beep(fast) {
      tone({ freq: fast ? 1450 : 980, duration: 0.05, gain: 0.09, type: 'square' });
    },
    plant() {
      tone({ freq: 380, to: 900, duration: 0.5, gain: 0.16, type: 'sawtooth' });
    },
    defuse() {
      tone({ freq: 900, to: 300, duration: 0.6, gain: 0.14, type: 'sawtooth' });
    },
    explode() {
      noiseBurst({ duration: 0.9, gain: 0.7, cutoff: 900 });
      tone({ freq: 90, to: 24, duration: 0.9, gain: 0.4, type: 'sine' });
    },
    // A frag is smaller than the charge, so the report is shorter and brighter.
    blast() {
      noiseBurst({ duration: 0.5, gain: 0.5, cutoff: 1500 });
      tone({ freq: 120, to: 34, duration: 0.45, gain: 0.28, type: 'sine' });
    },
    roundStart() {
      tone({ freq: 520, duration: 0.1, gain: 0.12, type: 'triangle' });
      setTimeout(() => tone({ freq: 780, duration: 0.16, gain: 0.12, type: 'triangle' }), 130);
    },
  };
}
