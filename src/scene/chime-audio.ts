/** A quiet, inharmonic glass strike, synthesized locally after a user gesture. */
export function createChimeSound(): { ring(): void; dispose(): void } {
  let context: AudioContext | undefined;
  let output: GainNode | undefined;
  let disposed = false;
  let lastStrike = -Infinity;
  const voices = new Set<OscillatorNode>();
  const cleanup = new AbortController();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    for (const voice of voices) voice.stop();
    lastStrike = -Infinity;
    if (context?.state === 'running') void context.suspend().catch(() => {});
  }, { signal: cleanup.signal });

  function strike() {
    if (!context || !output || disposed || document.hidden || context.state !== 'running') return;
    const now = context.currentTime;
    if (now - lastStrike < 0.12) return;
    lastStrike = now;
    // Closely spaced lower partials create a slow glass-like shimmer. The higher
    // partials fade quickly, so the attack stays clear without a harsh long tail.
    const partials = [
      { ratio: 1, level: 0.12, decay: 2.6 },
      { ratio: 1.004, level: 0.036, decay: 1.8 },
      { ratio: 2.71, level: 0.035, decay: 0.9 },
      { ratio: 4.93, level: 0.009, decay: 0.36 },
    ];
    for (const partial of partials) {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1660 * partial.ratio, now);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(partial.level, now + 0.004);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + partial.decay);
      oscillator.connect(envelope).connect(output);
      voices.add(oscillator);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
        voices.delete(oscillator);
      };
      oscillator.start(now);
      oscillator.stop(now + partial.decay + 0.02);
    }
  }

  return {
    ring() {
      if (disposed || document.hidden || typeof AudioContext === 'undefined') return;
      try {
        // Creation/resume happens here, synchronously inside the click handler.
        // A scene update never creates or unlocks an audio context.
        if (!context) {
          context = new AudioContext();
          output = context.createGain();
          output.gain.value = 0.38;
          output.connect(context.destination);
        }
        if (context.state === 'suspended') void context.resume().then(strike).catch(() => {});
        else strike();
      } catch {
        // The physical chime still responds if browser audio is unavailable.
      }
    },
    dispose() {
      disposed = true;
      cleanup.abort();
      for (const voice of voices) voice.stop();
      voices.clear();
      output?.disconnect();
      if (context && context.state !== 'closed') void context.close().catch(() => {});
    },
  };
}
