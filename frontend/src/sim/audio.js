let ctx = null;

export function playHorn() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  ctx = ctx || new AudioCtx();

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.03);
  gain.gain.setValueAtTime(0.16, now + 0.45);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  gain.connect(ctx.destination);

  [392, 494].forEach((freq) => {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.6);
  });
}
