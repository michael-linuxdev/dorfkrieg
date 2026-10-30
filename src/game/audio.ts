let ctx: AudioContext | null = null

function context(): AudioContext | null {
  const w = window as Window & { webkitAudioContext?: typeof AudioContext }
  const AC = window.AudioContext ?? w.webkitAudioContext
  if (!AC) return null
  if (!ctx) ctx = new AC()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function playTone(
  enabled: boolean,
  freq: number,
  dur: number,
  type: OscillatorType,
  gain = 0.045,
): void {
  if (!enabled) return
  const audio = context()
  if (!audio) return
  const osc = audio.createOscillator()
  const amp = audio.createGain()
  osc.type = type
  osc.frequency.value = freq
  osc.connect(amp)
  amp.connect(audio.destination)
  const t = audio.currentTime
  amp.gain.setValueAtTime(gain, t)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.start(t)
  osc.stop(t + dur)
}

export function playPlace(enabled: boolean): void {
  playTone(enabled, 240, 0.08, 'square', 0.03)
  setTimeout(() => playTone(enabled, 360, 0.1, 'square', 0.03), 70)
}

export function playCollect(enabled: boolean): void {
  playTone(enabled, 620, 0.09, 'sine', 0.04)
  setTimeout(() => playTone(enabled, 880, 0.12, 'sine', 0.035), 60)
}

export function playError(enabled: boolean): void {
  playTone(enabled, 140, 0.14, 'sawtooth', 0.03)
}

export function playResult(enabled: boolean, win: boolean): void {
  if (win) {
    playTone(enabled, 523, 0.12, 'triangle', 0.04)
    setTimeout(() => playTone(enabled, 659, 0.12, 'triangle', 0.04), 120)
    setTimeout(() => playTone(enabled, 784, 0.2, 'triangle', 0.04), 240)
  } else {
    playTone(enabled, 196, 0.2, 'triangle', 0.04)
    setTimeout(() => playTone(enabled, 146, 0.28, 'triangle', 0.04), 160)
  }
}
