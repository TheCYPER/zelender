import assert from 'node:assert/strict';
import test from 'node:test';
import { createAmbience, renderAmbience } from '../src/scene/ambience';
import type { Weather } from '../src/types';

const weathers: Weather[] = ['sunny', 'rain', 'snow', 'mist'];

test('weather mixes are distinct, stereo, continuous at the loop, and leave chime headroom', () => {
  const levels = new Map<Weather, number>();
  for (const weather of weathers) {
    const [left, right] = renderAmbience(weather);
    let energy = 0, rightEnergy = 0, cross = 0, peak = 0, difference = 0, sum = 0;
    for (let i = 0; i < left.length; i++) {
      energy += left[i] ** 2;
      rightEnergy += right[i] ** 2;
      cross += left[i] * right[i];
      peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      sum += left[i];
      if (i) difference += (left[i] - left[i - 1]) ** 2;
    }
    const rms = Math.sqrt(energy / left.length);
    assert.ok(Number.isFinite(rms) && rms > 0.002 && rms < 0.06, `${weather}: quiet, audible bed`);
    assert.ok(peak < 0.24, `${weather}: ample headroom for overlapping ambience and glass chime`);
    assert.ok(Math.abs(sum / left.length) < 0.0002, `${weather}: no DC offset`);
    const correlation = cross / Math.sqrt(energy * rightEnergy);
    assert.ok(correlation > 0.3 && correlation < 0.85, `${weather}: coherent stereo width`);
    // A loop transition should stay within the bed's usual sample variation,
    // rather than adding a conspicuous impulse once every 32 seconds.
    assert.ok(Math.abs(left[0] - left.at(-1)!) < Math.sqrt(difference / left.length) * 4);
    levels.set(weather, rms);
  }
  assert.ok(levels.get('rain')! > levels.get('sunny')! * 2);
  assert.ok(levels.get('sunny')! > levels.get('mist')! * 1.3);
  assert.ok(levels.get('mist')! > levels.get('snow')! * 1.5);
});

class FakeParam {
  value = 0;
  held = 0;
  cancelAndHoldAtTime() { this.held++; }
  linearRampToValueAtTime(value: number) { this.value = value; }
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  disconnected = false;
  connect(node: FakeNode) { return node; }
  disconnect() { this.disconnected = true; }
}
class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  starts = 0;
  stops = 0;
  start() { this.starts++; }
  stop() { this.stops++; }
}
class FakeContext {
  static instances: FakeContext[] = [];
  state = 'suspended';
  currentTime = 0;
  destination = new FakeNode();
  nodes: FakeNode[] = [];
  sources: FakeSource[] = [];
  resumes: { resolve(): void; reject(error: Error): void }[] = [];
  deferResume = false;
  suspends = 0;
  closes = 0;
  constructor() { FakeContext.instances.push(this); }
  createGain() { const node = new FakeNode(); this.nodes.push(node); return node; }
  createBiquadFilter() { return this.createGain(); }
  createBuffer(channels: number, length: number) {
    const pcm = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (index: number) => pcm[index] };
  }
  createBufferSource() {
    const source = new FakeSource(); this.sources.push(source); return source;
  }
  async resume() {
    if (this.deferResume) await new Promise<void>((resolve, reject) => this.resumes.push({ resolve, reject }));
    if (this.state !== 'closed') this.state = 'running';
  }
  async suspend() { this.state = 'suspended'; this.suspends++; }
  async close() { this.state = 'closed'; this.closes++; }
}

test('ambience only starts on play, survives rapid weather/pause races, and releases every resource', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { value: FakeContext, configurable: true });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'AudioContext', original);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  });
  const ambience = createAmbience();
  await ambience.pause();
  assert.equal(FakeContext.instances.length, 0, 'construction and initial hidden state cannot unlock audio');
  await ambience.play('sunny');
  const context = FakeContext.instances[0];
  assert.equal(context.state, 'running');
  assert.equal(context.sources.length, 1);
  const cancelledPause = ambience.pause();
  await ambience.play('rain');
  await cancelledPause;
  assert.equal(context.suspends, 0, 'a resumed sound must not be suspended by the cancelled fade timer');

  context.deferResume = true;
  const old = ambience.play('snow');
  const latest = ambience.play('mist');
  context.resumes.splice(0).forEach(pending => pending.resolve());
  await Promise.all([old, latest]);
  assert.equal(context.sources.length, 3, 'an old async play must not create a superseded weather voice');
  context.deferResume = false;
  for (let i = 0; i < 12; i++) await ambience.play(weathers[i % 4]);
  assert.equal(context.sources.length, 4, 'rapid weather switching has a bounded number of native voices');
  assert.equal(FakeContext.instances.length, 1);
  await ambience.pause();
  assert.equal(context.state, 'suspended');
  assert.equal(context.nodes[0].gain.value, 0);

  // Browser permission/device changes can resolve an old resume after the
  // pause fade has already suspended the context. It must stay suspended.
  context.deferResume = true;
  const lateResume = ambience.play('rain');
  await ambience.pause();
  context.resumes.splice(0).forEach(resume => resume.resolve());
  await lateResume;
  assert.equal(context.state, 'suspended', 'a late stale resume cannot restart a paused context');

  context.deferResume = true;
  const pending = ambience.play('sunny');
  const pausing = ambience.pause();
  await ambience.dispose();
  context.resumes.splice(0).forEach(resume => resume.reject(new Error('context was closed')));
  await Promise.all([pending, pausing]);
  assert.equal(context.closes, 1);
  assert.ok(context.nodes.every(node => node.disconnected));
  assert.ok(context.sources.every(source => source.stops === 1 && source.disconnected && source.buffer === null));
  await ambience.play('snow');
  await ambience.dispose();
  assert.equal(context.closes, 1, 'cleanup is idempotent and a disposed sound cannot reopen');
  assert.equal(FakeContext.instances.length, 1);
});
