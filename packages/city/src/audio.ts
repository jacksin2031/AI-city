import {
  type AudioFrame,
  audibleSignals,
  cueBeat,
  pedestrianCue,
  railBeat,
  streetMix,
} from "./audio-mix";

/**
 * Everything is synthesised with the Web Audio API: no audio files, no licensing, and nothing is
 * downloaded or sent anywhere. The sounds only imitate the city; they are not recordings.
 */
type Context = BaseAudioContext;

const noiseBuffers = new WeakMap<Context, AudioBuffer>();
function noise(ctx: Context): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

type ToneOptions = {
  when: number;
  freq: number;
  endFreq?: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
  attack?: number;
};
/** One enveloped oscillator note. */
export function tone(ctx: Context, dest: AudioNode, o: ToneOptions) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, o.when);
  if (o.endFreq) osc.frequency.exponentialRampToValueAtTime(o.endFreq, o.when + o.duration);
  const attack = o.attack ?? 0.005;
  amp.gain.setValueAtTime(0.0001, o.when);
  amp.gain.exponentialRampToValueAtTime(Math.max(o.gain, 0.0002), o.when + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, o.when + o.duration);
  osc.connect(amp).connect(dest);
  osc.start(o.when);
  osc.stop(o.when + o.duration + 0.05);
}

/** A soft electric-piano note: a triangle and a quiet octave, rounded by a low-pass filter. */
export function piano(
  ctx: Context,
  dest: AudioNode,
  when: number,
  freq: number,
  duration: number,
  gain: number,
) {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2200;
  filter.connect(dest);
  tone(ctx, filter, { when, freq, duration, gain, type: "triangle" });
  tone(ctx, filter, { when, freq: freq * 2, duration: duration * 0.6, gain: gain * 0.25 });
}

/** Japanese pedestrian signal, east-west: a quick twittering "ピヨ ピヨ". */
export function chirp(ctx: Context, dest: AudioNode, when: number, gain: number) {
  for (const offset of [0, 0.17])
    tone(ctx, dest, {
      when: when + offset,
      freq: 2700,
      endFreq: 2100,
      duration: 0.1,
      gain: gain * 0.5,
    });
}

/** Japanese pedestrian signal, north-south: the falling cuckoo "カッコー". */
export function cuckoo(ctx: Context, dest: AudioNode, when: number, gain: number) {
  tone(ctx, dest, { when, freq: 1050, duration: 0.2, gain: gain * 0.5 });
  tone(ctx, dest, { when, freq: 2100, duration: 0.2, gain: gain * 0.12 });
  tone(ctx, dest, { when: when + 0.26, freq: 830, duration: 0.5, gain: gain * 0.5 });
  tone(ctx, dest, { when: when + 0.26, freq: 1660, duration: 0.5, gain: gain * 0.12 });
}

/** A wheel passing a rail joint: a short click over a low thump ("ガタン"). */
export function clack(ctx: Context, dest: AudioNode, when: number, gain: number, low: boolean) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = low ? 900 : 1400;
  band.Q.value = 1.2;
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain * 0.9, when);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
  src.connect(band).connect(amp).connect(dest);
  src.start(when, 0.3);
  src.stop(when + 0.1);
  tone(ctx, dest, {
    when,
    freq: low ? 80 : 100,
    endFreq: 50,
    duration: 0.1,
    gain: gain * 0.7,
  });
}

/** Three-note station chime ("ピンポンパン") for a train that has stopped at its platform. */
export function chime(ctx: Context, dest: AudioNode, when: number, gain: number) {
  for (const [i, freq] of [880, 659.25, 783.99].entries())
    piano(ctx, dest, when + i * 0.24, freq, i === 2 ? 1 : 0.5, gain * 0.5);
}

// —— Background music: a gentle, slow city-pop loop in F major ——
const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);
const CHORDS = [
  { bass: 41, notes: [57, 60, 64, 67] }, // Fmaj7
  { bass: 40, notes: [55, 59, 62, 67] }, // Em7
  { bass: 38, notes: [57, 60, 62, 65] }, // Dm7
  { bass: 36, notes: [55, 59, 64, 67] }, // Cmaj7
];
const PENTATONIC = [65, 67, 69, 72, 74, 77]; // F G A C D F
export const BEAT = 60 / 76;
export const BAR = BEAT * 4;

/** Schedules one bar of music starting at `when`. `bar` selects the chord and seeds the melody. */
export function scheduleBar(ctx: Context, dest: AudioNode, when: number, bar: number) {
  const chord = CHORDS[bar % CHORDS.length] ?? CHORDS[0];
  if (!chord) return;
  // A warm pad underneath.
  for (const note of chord.notes)
    tone(ctx, dest, {
      when,
      freq: midi(note - 12),
      duration: BAR * 1.05,
      gain: 0.05,
      type: "sine",
      attack: 0.5,
    });
  // Bass on beats one and three.
  for (const beat of [0, 2])
    tone(ctx, dest, {
      when: when + beat * BEAT,
      freq: midi(chord.bass),
      duration: BEAT * 1.6,
      gain: 0.16,
      type: "sine",
    });
  // Broken-chord eighth notes.
  const order = [0, 1, 2, 3, 2, 1, 2, 3];
  order.forEach((index, i) => {
    const note = chord.notes[index % chord.notes.length];
    if (note === undefined || (i === 5 && bar % 2 === 1)) return;
    piano(ctx, dest, when + i * (BEAT / 2), midi(note + 12), BEAT * 1.4, 0.07);
  });
  // A sparse pentatonic melody, different on every pass but always consonant.
  let seed = (bar * 2654435761) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (const beat of [0.5, 1.5, 2.5, 3]) {
    if (rand() < 0.45) continue;
    const note = PENTATONIC[Math.floor(rand() * PENTATONIC.length)];
    if (note !== undefined) piano(ctx, dest, when + beat * BEAT, midi(note), BEAT * 2, 0.1);
  }
}

export type CityAudio = {
  /** Must be called from a user gesture (a tap) so the browser allows sound. */
  start(): Promise<void>;
  stop(): void;
  isPlaying(): boolean;
  setVolume(volume: number): void;
  update(frame: AudioFrame): void;
  destroy(): void;
};

export function createCityAudio(): CityAudio {
  let ctx: AudioContext | null = null;
  let master: GainNode;
  let music: GainNode;
  let sfx: GainNode;
  let carGain: GainNode;
  let trainGain: GainNode;
  let timer: ReturnType<typeof setInterval> | undefined;
  let nextBar = 0;
  let bar = 0;
  let volume = 0.6;
  let playing = false;
  const signalBeats = new Map<number, number>();
  const dwellState = new Map<number, boolean>();
  let lastRail = -1;

  function build(context: AudioContext) {
    const compressor = context.createDynamicsCompressor();
    compressor.connect(context.destination);
    master = context.createGain();
    master.gain.value = 0;
    master.connect(compressor);
    music = context.createGain();
    music.gain.value = 0.55;
    music.connect(master);
    sfx = context.createGain();
    sfx.gain.value = 1;
    sfx.connect(master);

    const loop = (type: BiquadFilterType, frequency: number, q = 0.7) => {
      const src = context.createBufferSource();
      src.buffer = noise(context);
      src.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      const amp = context.createGain();
      amp.gain.value = 0;
      src.connect(filter).connect(amp);
      src.start();
      return amp;
    };
    // Cars: road noise plus a low engine hum.
    carGain = context.createGain();
    carGain.gain.value = 0;
    carGain.connect(sfx);
    const road = loop("bandpass", 520, 0.8);
    road.gain.value = 0.22;
    road.connect(carGain);
    const engine = context.createOscillator();
    engine.type = "sawtooth";
    engine.frequency.value = 58;
    const engineFilter = context.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 190;
    const engineAmp = context.createGain();
    engineAmp.gain.value = 0.12;
    engine.connect(engineFilter).connect(engineAmp).connect(carGain);
    engine.start();
    // Trains: a deep rumble with a rushing top.
    trainGain = context.createGain();
    trainGain.gain.value = 0;
    trainGain.connect(sfx);
    const rumble = loop("lowpass", 150);
    rumble.gain.value = 0.7;
    rumble.connect(trainGain);
    const rush = loop("bandpass", 1100, 0.6);
    rush.gain.value = 0.1;
    rush.connect(trainGain);
  }

  function pump() {
    if (!ctx) return;
    while (nextBar < ctx.currentTime + 3) {
      scheduleBar(ctx, music, nextBar, bar);
      nextBar += BAR;
      bar++;
    }
  }

  const ramp = (param: AudioParam, value: number, seconds = 0.3) =>
    ctx && param.setTargetAtTime(value, ctx.currentTime, seconds);

  return {
    async start() {
      if (!ctx) {
        const Constructor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Constructor) return;
        ctx = new Constructor();
        build(ctx);
        nextBar = ctx.currentTime + 0.2;
        bar = 0;
        timer = setInterval(pump, 500);
      }
      await ctx.resume();
      playing = true;
      pump();
      ramp(master.gain, volume, 1.5);
    },
    stop() {
      if (!ctx) return;
      playing = false;
      ramp(master.gain, 0, 0.25);
      const context = ctx;
      // Suspend once the fade has finished, so a stopped city costs no CPU.
      setTimeout(() => {
        if (!playing) void context.suspend();
      }, 1200);
    },
    isPlaying: () => playing,
    setVolume(next) {
      volume = Math.min(1, Math.max(0, next));
      if (playing) ramp(master.gain, volume);
    },
    update(frame) {
      if (!ctx || !playing || ctx.state !== "running") return;
      const now = ctx.currentTime;
      const mix = streetMix(frame);
      ramp(carGain.gain, mix.cars * 0.7);
      ramp(trainGain.gain, mix.train * 0.9);

      const heard = new Set<number>();
      for (const { index, signal, gain } of audibleSignals(frame)) {
        heard.add(index);
        const cue = pedestrianCue(signal.group, frame.time);
        if (!cue) {
          signalBeats.delete(index);
          continue;
        }
        const beat = cueBeat(cue, frame.time);
        if (signalBeats.get(index) === beat) continue;
        signalBeats.set(index, beat);
        if (cue.kind === "cuckoo") cuckoo(ctx, sfx, now, gain);
        else chirp(ctx, sfx, now, gain);
      }
      for (const index of signalBeats.keys()) if (!heard.has(index)) signalBeats.delete(index);

      const train = mix.nearestTrain;
      if (train) {
        if (mix.train > 0) {
          const beat = railBeat(train.distance);
          if (beat !== lastRail) {
            if (lastRail >= 0) clack(ctx, sfx, now, train.gain, beat % 2 === 0);
            lastRail = beat;
          }
        }
        const wasDwelling = dwellState.get(train.id) ?? train.dwelling;
        if (train.dwelling && !wasDwelling) chime(ctx, sfx, now, train.gain);
        dwellState.set(train.id, train.dwelling);
      }
    },
    destroy() {
      if (timer) clearInterval(timer);
      playing = false;
      signalBeats.clear();
      dwellState.clear();
      if (ctx) void ctx.close();
      ctx = null;
    },
  };
}
