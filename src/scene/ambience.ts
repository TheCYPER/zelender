import type { Weather } from '../types';

const SAMPLE_RATE = 24000;
const LOOP_SECONDS = 32;
const CROSSFADE_SECONDS = 1.6;

/** Deterministic PCM makes the mix inspectable offline, without an audio device. */
export function renderAmbience(weather: Weather, sampleRate = SAMPLE_RATE, seconds = LOOP_SECONDS, seed = 9173): [Float32Array, Float32Array] {
  const frames = Math.round(seconds * sampleRate);
  const overlap = Math.min(Math.round(sampleRate * 0.4), Math.floor(frames / 4));
  const channels: [Float32Array, Float32Array] = [new Float32Array(frames + overlap), new Float32Array(frames + overlap)];
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const tau = Math.PI * 2;
  const coefficient = (hz: number) => 1 - Math.exp(-tau * hz / sampleRate);
  const rates = [coefficient(65), coefficient(280), coefficient(680), coefficient(2100), coefficient(4200)];
  const filtered = [new Float64Array(5), new Float64Array(5)];
  const profile = {
    sunny: { water: 0.135, air: 0.035, rain: 0, rustle: 0.009, bubbles: 62 },
    rain: { water: 0.075, air: 0.042, rain: 0.17, rustle: 0.006, bubbles: 85 },
    snow: { water: 0.018, air: 0.056, rain: 0, rustle: 0.002, bubbles: 9 },
    mist: { water: 0.075, air: 0.045, rain: 0, rustle: 0.01, bubbles: 34 },
  }[weather];

  // Shared low water and independent higher air place the pond in the middle,
  // with foliage/rain extending to either side. No bright unfiltered noise bed.
  for (let i = 0; i < channels[0].length; i++) {
    const t = i / sampleRate;
    const shared = random() * 2 - 1;
    const gust = 0.62 + 0.21 * Math.sin(t * 0.39 + 0.4) + 0.17 * Math.sin(t * 0.93);
    const current = 0.83 + 0.12 * Math.sin(t * 1.17) + 0.05 * Math.sin(t * 3.91);
    for (let channel = 0; channel < 2; channel++) {
      const noise = shared * 0.55 + (random() * 2 - 1) * 0.45;
      const bands = filtered[channel];
      for (let band = 0; band < bands.length; band++) bands[band] += rates[band] * (noise - bands[band]);
      const water = (bands[2] - bands[0]) * profile.water * current;
      const air = (bands[1] - bands[0]) * profile.air * (0.35 + gust * gust);
      const rain = (bands[4] - bands[1]) * profile.rain * (0.88 + 0.12 * gust);
      const leaves = (bands[3] - bands[2]) * profile.rustle * Math.pow(gust, 4);
      channels[channel][i] = water + air + rain + leaves;
    }
  }

  function event(start: number, duration: number, pan: number, sample: (t: number, progress: number) => number, echo = 0) {
    const offset = Math.floor(start * sampleRate);
    const length = Math.floor(duration * sampleRate);
    const left = Math.sqrt((1 - pan) * 0.5);
    const right = Math.sqrt((1 + pan) * 0.5);
    for (let i = 0; i < length; i++) {
      const value = sample(i / sampleRate, i / length);
      const index = offset + i;
      if (index >= 0 && index < channels[0].length) {
        channels[0][index] += value * left;
        channels[1][index] += value * right;
      }
      // Quiet early reflections broaden distant details, without a long reverb
      // that would compete with the separate glass wind chime.
      if (echo) {
        const first = index + Math.round(sampleRate * 0.087);
        const second = index + Math.round(sampleRate * 0.171);
        if (first >= 0 && first < channels[0].length) {
          channels[0][first] += value * right * echo;
          channels[1][first] += value * left * echo;
        }
        if (second >= 0 && second < channels[0].length) {
          channels[0][second] += value * left * echo * 0.4;
          channels[1][second] += value * right * echo * 0.4;
        }
      }
    }
  }

  // Short sliding resonances give the stream actual droplets instead of just
  // changing a noise filter. Staggered sizes avoid a mechanical drip rhythm.
  for (let i = 0; i < profile.bubbles * seconds / LOOP_SECONDS; i++) {
    const start = 0.45 + random() * Math.max(0, seconds - 1);
    const duration = 0.024 + random() * 0.065;
    const hz = 650 + random() * 1200;
    const level = (0.006 + random() * 0.011) * (weather === 'snow' ? 0.3 : 1);
    event(start, duration, (random() - 0.5) * 0.9, (t, p) => {
      const envelope = Math.sin(Math.PI * Math.min(1, p * 5) * 0.5) * Math.exp(-p * 5) * (1 - p);
      return Math.sin(tau * hz * (t + t * t * 4)) * envelope * level;
    });
  }

  if (weather === 'rain') {
    // Diffuse rain above is joined by small, uneven leaf/eave impacts nearby.
    // Soft attacks and limited bandwidth keep this from becoming harsh hiss.
    for (let i = 0; i < seconds * 24; i++) {
      const duration = 0.017 + random() * 0.055;
      const level = 0.009 + random() * 0.018;
      const hz = 450 + random() * 1800;
      let smooth = 0;
      event(random() * seconds, duration, (random() - 0.5) * 1.8, (t, p) => {
        smooth += 0.4 * (random() * 2 - 1 - smooth);
        const attack = Math.min(1, p * 14);
        return (smooth * 0.8 + Math.sin(tau * hz * t) * 0.2) * attack * Math.exp(-p * 5) * (1 - p) * level;
      });
    }
  }

  function birdPhrase(start: number, distant: boolean) {
    const pan = (random() < 0.5 ? -1 : 1) * 0.65;
    const pitch = (distant ? 1700 : 2350) + random() * 650;
    const count = distant ? 2 : 3 + Math.floor(random() * 2);
    let next = start;
    for (let chirp = 0; chirp < count; chirp++) {
      const duration = 0.09 + random() * 0.08;
      const sweep = (random() - 0.4) * 850;
      const level = distant ? 0.0028 : 0.006;
      event(next, duration, pan, (t, p) => {
        const phase = tau * (pitch * t + sweep * t * t / (2 * duration));
        const flutter = 1 + 0.1 * Math.sin(tau * 37 * t);
        const breath = (random() - 0.5) * 0.06;
        return (Math.sin(phase + 0.45 * Math.sin(tau * 18 * t)) * flutter + Math.sin(phase * 2) * 0.07 + breath)
          * Math.pow(Math.sin(Math.PI * p), 1.6) * level;
      }, 0.25);
      next += duration + 0.05 + random() * 0.065;
    }
  }
  if (weather === 'sunny') {
    birdPhrase(seconds * 0.2, false);
    birdPhrase(seconds * 0.69, false);
  } else if (weather === 'mist') {
    birdPhrase(seconds * 0.42, true);
    // A restrained, woody bamboo/branch movement, not a musical sustained note.
    for (const start of [seconds * 0.19, seconds * 0.78]) {
      event(start, 0.28, -0.7, (t, p) => (Math.sin(tau * 243 * t) + Math.sin(tau * 391 * t) * 0.35)
        * Math.min(1, p * 30) * Math.exp(-p * 15) * (1 - p) * 0.004, 0.15);
    }
  } else if (weather === 'snow') {
    // Snow itself is quiet: mostly muffled air and just two soft branch brushes.
    for (const start of [seconds * 0.3, seconds * 0.82]) {
      let smooth = 0;
      event(start, 0.65, 0.6, (_t, p) => {
        smooth += 0.09 * (random() * 2 - 1 - smooth);
        return smooth * Math.sin(Math.PI * p) ** 2 * 0.024;
      });
    }
  }

  // Overlap the end's continuation with the beginning. At the loop boundary
  // both value and filter history stay continuous; no periodic silence/click.
  for (const channel of channels) {
    for (let i = 0; i < overlap; i++) {
      const blend = i / overlap;
      channel[i] = channel[frames + i] * (1 - blend) + channel[i] * blend;
    }
  }
  return [channels[0].subarray(0, frames), channels[1].subarray(0, frames)];
}

interface WeatherVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Call play only from an already authorized audio gesture/visibility resume. */
export function createAmbience(): { play(weather: Weather): Promise<void>; pause(): Promise<void>; dispose(): Promise<void> } {
  let context: AudioContext | undefined;
  let output: GainNode | undefined;
  let highpass: BiquadFilterNode | undefined;
  let lowpass: BiquadFilterNode | undefined;
  let desired: Weather | null = null;
  let revision = 0;
  let disposed = false;
  let pauseTimer: ReturnType<typeof setTimeout> | undefined;
  let resolvePause: (() => void) | undefined;
  const voices = new Map<Weather, WeatherVoice>();

  function cancelPause() {
    if (pauseTimer !== undefined) clearTimeout(pauseTimer);
    pauseTimer = undefined;
    resolvePause?.();
    resolvePause = undefined;
  }

  function ramp(parameter: AudioParam, value: number, seconds: number) {
    if (!context) return;
    parameter.cancelAndHoldAtTime(context.currentTime);
    parameter.linearRampToValueAtTime(value, context.currentTime + seconds);
  }

  return {
    async play(weather) {
      if (disposed) return;
      const request = ++revision;
      desired = weather;
      cancelPause();
      if (!context) {
        // Synchronous creation/resume preserves the initiating browser gesture.
        context = new AudioContext({ latencyHint: 'playback' });
        output = context.createGain();
        output.gain.value = 0;
        highpass = context.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 70;
        highpass.Q.value = 0.7;
        lowpass = context.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 5200;
        lowpass.Q.value = 0.7;
        output.connect(highpass).connect(lowpass).connect(context.destination);
      }
      try {
        await context.resume();
      } catch (error) {
        // A close/superseding pause may reject an older pending resume.
        if (disposed || request !== revision) return;
        throw error;
      }
      if (disposed || request !== revision || desired !== weather) {
        // A delayed resume may finish after pause's fade timer has already
        // suspended the context. Reassert the current paused intent without
        // interrupting a newer play request for another weather.
        if (!disposed && desired === null && context.state === 'running') {
          await context.suspend().catch(() => {});
        }
        return;
      }
      if (!voices.has(weather)) {
        const pcm = renderAmbience(weather);
        const buffer = context.createBuffer(2, pcm[0].length, SAMPLE_RATE);
        buffer.getChannelData(0).set(pcm[0]);
        buffer.getChannelData(1).set(pcm[1]);
        const source = context.createBufferSource();
        const gain = context.createGain();
        gain.gain.value = 0;
        source.buffer = buffer;
        source.loop = true;
        source.connect(gain).connect(output!);
        source.start();
        voices.set(weather, { source, gain });
      }
      // At most four native buffer voices; silent ones preserve their phase.
      // Retargetable linear ramps keep rapid changes continuous and bounded.
      for (const [kind, voice] of voices) ramp(voice.gain.gain, kind === weather ? 1 : 0, CROSSFADE_SECONDS);
      ramp(output!.gain, 0.8, 0.55);
    },
    async pause() {
      desired = null;
      const request = ++revision;
      cancelPause();
      if (!context || disposed || context.state === 'closed') return;
      ramp(output!.gain, 0, 0.16);
      await new Promise<void>(resolve => {
        resolvePause = resolve;
        pauseTimer = setTimeout(() => {
          pauseTimer = undefined;
          resolvePause = undefined;
          if (disposed || request !== revision || desired !== null || !context || context.state === 'closed') {
            resolve();
            return;
          }
          void context.suspend().then(resolve, resolve);
        }, 190);
      });
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      desired = null;
      revision++;
      cancelPause();
      for (const { source, gain } of voices.values()) {
        source.stop();
        source.disconnect();
        source.buffer = null;
        gain.disconnect();
      }
      voices.clear();
      output?.disconnect();
      highpass?.disconnect();
      lowpass?.disconnect();
      if (context && context.state !== 'closed') await context.close().catch(() => {});
    },
  };
}
