/**
 * Little sounds, synthesised on the spot.
 *
 * No audio files: every cue is a short envelope on one or two oscillators, so
 * the bundle gains nothing and nothing has to load before the game is playable.
 *
 * Off by default and behind a visible toggle, because this runs in a room with
 * thirty other children in it, and because the `AudioContext` cannot legally be
 * created until a user gesture anyway - so a game that assumed sound would spend
 * its first minute logging autoplay warnings.
 */

export type SoundName = 'success' | 'gentle' | 'unlock' | 'win' | 'click';

export interface SoundBoard {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  play(name: SoundName): void;
}

interface Note {
  /** Hertz. */
  frequency: number;
  /** Seconds from the start of the cue. */
  at: number;
  duration: number;
  type: OscillatorType;
  gain: number;
}

const CUES: Record<SoundName, readonly Note[]> = {
  click: [{ frequency: 660, at: 0, duration: 0.06, type: 'sine', gain: 0.12 }],
  gentle: [
    { frequency: 392, at: 0, duration: 0.14, type: 'sine', gain: 0.14 },
    { frequency: 349, at: 0.12, duration: 0.18, type: 'sine', gain: 0.12 },
  ],
  success: [
    { frequency: 523, at: 0, duration: 0.12, type: 'triangle', gain: 0.16 },
    { frequency: 659, at: 0.1, duration: 0.12, type: 'triangle', gain: 0.16 },
    { frequency: 784, at: 0.2, duration: 0.2, type: 'triangle', gain: 0.16 },
  ],
  unlock: [
    { frequency: 784, at: 0, duration: 0.1, type: 'sine', gain: 0.14 },
    { frequency: 1047, at: 0.08, duration: 0.16, type: 'sine', gain: 0.14 },
  ],
  win: [
    { frequency: 523, at: 0, duration: 0.14, type: 'triangle', gain: 0.18 },
    { frequency: 659, at: 0.14, duration: 0.14, type: 'triangle', gain: 0.18 },
    { frequency: 784, at: 0.28, duration: 0.14, type: 'triangle', gain: 0.18 },
    { frequency: 1047, at: 0.42, duration: 0.45, type: 'triangle', gain: 0.2 },
  ],
};

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  const scope = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

export function createSoundBoard(initiallyEnabled = false): SoundBoard {
  let enabled = initiallyEnabled;
  let context: AudioContext | null = null;

  /** Created on first use, which is always inside a click or key handler. */
  const ensureContext = (): AudioContext | null => {
    if (context) return context;
    const Constructor = audioContextConstructor();
    if (!Constructor) return null;
    try {
      context = new Constructor();
    } catch {
      context = null;
    }
    return context;
  };

  return {
    isEnabled: () => enabled,
    setEnabled(next) {
      enabled = next;
      if (!next && context) void context.suspend().catch(() => undefined);
    },
    play(name) {
      if (!enabled) return;
      const audio = ensureContext();
      if (!audio) return;
      if (audio.state === 'suspended') void audio.resume().catch(() => undefined);

      const now = audio.currentTime;
      for (const note of CUES[name]) {
        const oscillator = audio.createOscillator();
        const envelope = audio.createGain();
        oscillator.type = note.type;
        oscillator.frequency.value = note.frequency;

        const start = now + note.at;
        const end = start + note.duration;
        envelope.gain.setValueAtTime(0.0001, start);
        envelope.gain.exponentialRampToValueAtTime(note.gain, start + 0.015);
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);

        oscillator.connect(envelope).connect(audio.destination);
        oscillator.start(start);
        oscillator.stop(end + 0.02);
      }
    },
  };
}
