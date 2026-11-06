// Every sound is synthesised with Web Audio, so there are no audio files to load.
const Sound = (() => {
  let ctx = null;
  let master = null;
  let muted = false;

  // Browsers only allow audio after a user gesture, so call this from a click or key handler.
  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.7;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  // An open AudioContext can keep playing scheduled sounds with nothing visible.
  function syncToPage() {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  }
  document.addEventListener('visibilitychange', syncToPage);
  window.addEventListener('pagehide', () => { if (ctx) ctx.suspend(); });
  window.addEventListener('pageshow', syncToPage);

  function setMuted(value) {
    muted = value;
    if (master) master.gain.value = muted ? 0 : 0.7;
  }

  function tone(from, to, dur, { type = 'sine', gain = 0.2, delay = 0 } = {}) {
    if (!ctx || muted) return;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + dur);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env).connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  const notes = (list, step, opts) => list.forEach((f, i) => tone(f, f, step * 1.6, { ...opts, delay: i * step }));

  const sounds = {
    small: () => tone(520, 880, 0.09, { gain: 0.14 }),
    big: () => { tone(260, 620, 0.16, { gain: 0.22 }); tone(620, 900, 0.1, { gain: 0.12, delay: 0.1 }); },
    star: () => notes([784, 988, 1175, 1568], 0.07, { type: 'triangle', gain: 0.16 }),
    hop: () => tone(240, 480, 0.13, { type: 'triangle', gain: 0.1 }),
    gulp: () => { tone(420, 120, 0.22, { type: 'square', gain: 0.1 }); tone(160, 90, 0.2, { gain: 0.25, delay: 0.16 }); },
    prick: () => { tone(900, 300, 0.14, { type: 'sawtooth', gain: 0.12 }); },
    bump: () => tone(200, 140, 0.12, { type: 'triangle', gain: 0.18 }),
    life: () => notes([440, 370, 294], 0.13, { type: 'triangle', gain: 0.18 }),
    win: () => notes([523, 659, 784, 1047, 784, 1047], 0.12, { type: 'triangle', gain: 0.18 }),
    lose: () => notes([392, 330, 262, 196], 0.18, { type: 'triangle', gain: 0.18 }),
    click: () => tone(660, 720, 0.05, { type: 'triangle', gain: 0.1 }),
  };

  return { unlock, setMuted, play: (name) => { if (sounds[name]) sounds[name](); } };
})();
