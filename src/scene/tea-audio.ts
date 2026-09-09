export type TeaSoundKind = 'pickup' | 'setdown' | 'drink';

/** Local, quiet foley. Only gesture() is allowed to create or resume audio. */
export function createTeaSound() {
  let context: AudioContext | undefined;
  let output: GainNode | undefined;
  let pour: { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | undefined;
  let noise: AudioBuffer | undefined;
  let desiredPour = false;
  let disposed = false;
  let enabled = false;
  let revision = 0;
  let lastEffect = -Infinity;
  const voices = new Set<{ source: AudioScheduledSourceNode; nodes: AudioNode[] }>();
  const cleanup = new AbortController();
  const hidden = () => typeof document !== 'undefined' && document.hidden;

  function stopVoices() {
    for (const voice of voices) {
      voice.source.onended = null;
      try { voice.source.stop(); } catch { /* Already ended. */ }
      voice.source.disconnect();
      voice.nodes.forEach(node => node.disconnect());
    }
    voices.clear();
  }

  function stop() {
    revision++;
    enabled = false;
    desiredPour = false;
    lastEffect = -Infinity;
    if (pour) {
      pour.source.stop();
      pour.source.disconnect();
      pour.source.buffer = null;
      pour.filter.disconnect();
      pour.gain.disconnect();
      pour = undefined;
    }
    stopVoices();
    if (context?.state === 'running') void context.suspend().catch(() => {});
  }

  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
    if (hidden()) stop();
  }, { signal: cleanup.signal });

  function noiseBuffer() {
    if (!context) return undefined;
    if (!noise) {
      noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const data = noise.getChannelData(0);
      let seed = 71421, previous = 0;
      for (let i = 0; i < data.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        previous = previous * 0.6 + (seed / 0xffffffff * 2 - 1) * 0.4;
        data[i] = previous;
      }
    }
    return noise;
  }

  function retain(source: AudioScheduledSourceNode, nodes: AudioNode[], duration: number) {
    if (!context) return;
    const voice = { source, nodes };
    voices.add(voice);
    source.onended = () => {
      source.disconnect();
      if ('buffer' in source) (source as AudioBufferSourceNode).buffer = null;
      nodes.forEach(node => node.disconnect());
      voices.delete(voice);
    };
    source.start(context.currentTime);
    source.stop(context.currentTime + duration);
  }

  function effect(kind: TeaSoundKind) {
    if (!context || !output || context.state !== 'running' || hidden() || disposed) return;
    const now = context.currentTime;
    if (now - lastEffect < 0.065) return;
    lastEffect = now;
    if (kind === 'drink') {
      const source = context.createBufferSource();
      source.buffer = noiseBuffer()!;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(780, now);
      filter.frequency.exponentialRampToValueAtTime(1450, now + 0.25);
      filter.frequency.exponentialRampToValueAtTime(440, now + 0.85);
      filter.Q.value = 1.5;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(0.32, now + 0.12);
      envelope.gain.exponentialRampToValueAtTime(0.15, now + 0.35);
      envelope.gain.exponentialRampToValueAtTime(0.27, now + 0.55);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      source.connect(filter).connect(envelope).connect(output);
      retain(source, [filter, envelope], 0.92);
      return;
    }
    // A short glazed-ceramic contact with a lower wooden tap underneath.
    for (const [frequency, level, decay] of [[kind === 'pickup' ? 1820 : 1510, 0.11, 0.16], [390, 0.08, 0.055]]) {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = frequency;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(level, now + 0.003);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      oscillator.connect(envelope).connect(output);
      retain(oscillator, [envelope], decay + 0.02);
    }
  }

  function syncPour() {
    if (!context || !output || context.state !== 'running' || hidden() || disposed) return;
    if (desiredPour && !pour) {
      const source = context.createBufferSource();
      source.buffer = noiseBuffer()!;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2050;
      filter.Q.value = 0.8;
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(output);
      source.start();
      pour = { source, filter, gain };
    }
    pour?.gain.gain.setTargetAtTime(desiredPour ? 0.52 : 0, context.currentTime, 0.075);
  }

  return {
    gesture(kind: TeaSoundKind) {
      if (disposed || hidden() || typeof AudioContext === 'undefined') return;
      enabled = true;
      const request = ++revision;
      try {
        if (!context) {
          context = new AudioContext();
          output = context.createGain();
          output.gain.value = 0.3;
          output.connect(context.destination);
        }
        const finish = () => {
          if (request !== revision || disposed || hidden()) {
            // A hidden/cancelled gesture must not reactivate a suspended tab.
            if ((!enabled || hidden()) && context?.state === 'running') {
              void context.suspend().catch(() => {});
            }
            return;
          }
          effect(kind);
          syncPour();
        };
        if (context.state === 'suspended') void context.resume().then(finish).catch(() => {});
        else finish();
      } catch { /* The physical interaction still works without audio support. */ }
    },
    effect,
    setPouring(value: boolean, fill = 0) {
      if (disposed) return;
      if (desiredPour !== value) { desiredPour = value; syncPour(); }
      if (pour && context) pour.filter.frequency.setTargetAtTime(1800 + fill * 900, context.currentTime, 0.15);
    },
    stop,
    debug() { return { created: !!context, state: context?.state ?? 'uncreated', pouring: desiredPour, voices: voices.size }; },
    dispose() {
      if (disposed) return;
      disposed = true;
      cleanup.abort();
      stop();
      output?.disconnect();
      noise = undefined;
      if (context && context.state !== 'closed') void context.close().catch(() => {});
    },
  };
}
