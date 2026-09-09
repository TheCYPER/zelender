import assert from 'node:assert/strict';
import test from 'node:test';
import { createTeaSound } from '../src/scene/tea-audio';

class Param {
  value = 0;
  changes: number[] = [];
  setValueAtTime(value: number) { this.value = value; this.changes.push(value); }
  exponentialRampToValueAtTime(value: number) { this.setValueAtTime(value); }
  setTargetAtTime(value: number) { this.setValueAtTime(value); }
}
class Node {
  gain = new Param();
  frequency = new Param();
  Q = new Param();
  disconnected = false;
  connect(node: Node) { return node; }
  disconnect() { this.disconnected = true; }
}
class Source extends Node {
  buffer: unknown = null;
  loop = false;
  starts = 0;
  stops = 0;
  onended: (() => void) | null = null;
  start() { this.starts++; }
  stop() { this.stops++; }
}
class Context {
  static instances: Context[] = [];
  state = 'suspended';
  currentTime = 0;
  sampleRate = 24000;
  destination = new Node();
  nodes: Node[] = [];
  sources: Source[] = [];
  pending: (() => void)[] = [];
  defer = false;
  suspends = 0;
  closes = 0;
  constructor() { Context.instances.push(this); }
  createGain() { const node = new Node(); this.nodes.push(node); return node; }
  createBiquadFilter() { return this.createGain(); }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
  createOscillator() { return this.createBufferSource(); }
  createBuffer(_channels: number, length: number) { const data = new Float32Array(length); return { getChannelData: () => data }; }
  async resume() {
    if (this.defer) await new Promise<void>(resolve => this.pending.push(resolve));
    if (this.state !== 'closed') this.state = 'running';
  }
  async suspend() { this.state = 'suspended'; this.suspends++; }
  async close() { this.state = 'closed'; this.closes++; }
}
class Page extends EventTarget {
  hidden = false;
}

test('tea foley is gesture gated, pours with bounded voices, and cannot resume after hide/cancel/dispose', async t => {
  const originals = ['AudioContext', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const page = new Page();
  Object.defineProperty(globalThis, 'AudioContext', { value: Context, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: page, configurable: true });
  t.after(() => originals.forEach(([key, original]) => {
    if (original) Object.defineProperty(globalThis, key, original);
    else Reflect.deleteProperty(globalThis, key);
  }));
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  const sound = createTeaSound();
  sound.setPouring(true);
  sound.effect('setdown');
  assert.equal(Context.instances.length, 0, 'animation cannot unlock browser audio');
  sound.gesture('pickup');
  await flush();
  const context = Context.instances[0];
  assert.equal(context.state, 'running');
  assert.equal(context.sources.length, 3, 'ceramic contact has two partials, pour has one loop');
  assert.equal(context.sources.filter(source => source.loop).length, 1);
  const loop = context.sources.find(source => source.loop)!;
  const data = (loop.buffer as { getChannelData(): Float32Array }).getChannelData();
  assert.ok(data.some(sample => Math.abs(sample) > 0.01), 'water sound has real nonzero samples');
  for (let i = 0; i < 30; i++) { sound.setPouring(false); sound.setPouring(true, i / 30); }
  assert.equal(context.sources.length, 3, 'rapid pouring transitions reuse one bounded loop');
  context.currentTime = 1;
  sound.gesture('drink');
  assert.equal(context.sources.length, 4);
  assert.ok(context.nodes.some(node => node.frequency.changes.includes(780) && node.frequency.changes.includes(1450)), 'sip has its own moving resonance');

  page.hidden = true;
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(context.state, 'suspended');
  assert.equal(sound.debug().pouring, false);
  assert.equal(sound.debug().voices, 0);
  sound.gesture('pickup');
  assert.equal(context.sources.length, 4, 'hidden gestures are ignored');
  page.hidden = false;
  page.dispatchEvent(new Event('visibilitychange'));
  assert.equal(context.state, 'suspended', 'visibility alone does not restart foley');

  context.defer = true;
  sound.gesture('pickup');
  sound.stop();
  context.pending.splice(0).forEach(resolve => resolve());
  await flush();
  assert.equal(context.state, 'suspended', 'cancel wins over a late browser resume');
  assert.equal(context.sources.length, 4);

  // A stale gesture must also not suspend a newer active gesture.
  context.currentTime = 2;
  sound.gesture('pickup');
  sound.gesture('drink');
  context.pending.splice(0).forEach(resolve => resolve());
  await flush();
  assert.equal(context.state, 'running');
  assert.equal(context.sources.length, 5, 'only the newest resumed gesture sounds');

  sound.dispose();
  await flush();
  assert.equal(context.closes, 1);
  assert.ok(context.nodes.every(node => node.disconnected));
  assert.ok(context.sources.every(source => source.disconnected && source.stops > 0));
  sound.gesture('pickup');
  sound.setPouring(true);
  sound.dispose();
  assert.equal(Context.instances.length, 1);
  assert.equal(context.closes, 1);
});
