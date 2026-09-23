let audioCtx = null;

// Two-tone alarm, loud enough to cut through a cab. Browsers only allow audio
// after the user has interacted with the page once.
export function playAlarm() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  audioCtx = audioCtx || new AudioCtx();
  const now = audioCtx.currentTime;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
  gain.gain.setValueAtTime(0.2, now + 1.1);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
  gain.connect(audioCtx.destination);

  const osc = audioCtx.createOscillator();
  osc.type = 'square';
  [880, 660, 880, 660].forEach((f, i) => osc.frequency.setValueAtTime(f, now + i * 0.3));
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 1.2);
}

export function vibrate() {
  if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]);
}

// Reads text aloud in the operator's language. If the device has no voice for
// that language, nothing is spoken and the alert stays on screen only.
export function speak(text, lang) {
  const synth = window.speechSynthesis;
  if (!synth || !text) return false;
  const voices = synth.getVoices();
  const voice = voices.find((v) => v.lang === lang) || voices.find((v) => v.lang?.startsWith(lang.slice(0, 2)));
  if (voices.length && !voice) return false;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  if (voice) utterance.voice = voice;
  utterance.rate = 0.95;
  synth.cancel();
  synth.speak(utterance);
  return true;
}
