import { POND, pondFraction } from './common';

/** A fixed-step damped wave equation. Heights are actual surface displacement. */
export class PondWaves {
  readonly columns = 97;
  readonly rows = 73;
  readonly width = POND.rx * 2.28;
  readonly depth = POND.rz * 2.28;
  readonly dx = this.width / (this.columns - 1);
  readonly dz = this.depth / (this.rows - 1);
  readonly heights = new Float32Array(this.columns * this.rows);
  readonly wet = new Uint8Array(this.heights.length);
  private velocities = new Float32Array(this.heights.length);
  private next = new Float32Array(this.heights.length);
  private accumulator = 0;

  constructor() {
    for (let z = 0; z < this.rows; z++) for (let x = 0; x < this.columns; x++) {
      this.wet[z * this.columns + x] = Number(pondFraction(this.x(x), this.z(z)) <= 1.005);
    }
  }

  x(column: number) { return POND.x - this.width / 2 + column * this.dx; }
  z(row: number) { return POND.z - this.depth / 2 + row * this.dz; }

  impulse(x: number, z: number, strength: number) {
    for (let row = 1; row < this.rows - 1; row++) for (let col = 1; col < this.columns - 1; col++) {
      const i = row * this.columns + col;
      if (!this.wet[i]) continue;
      const radiusSquared = (this.x(col) - x) ** 2 + (this.z(row) - z) ** 2;
      if (radiusSquared < 0.7) this.velocities[i] -= strength * 8 * Math.exp(-radiusSquared / 0.07);
    }
  }

  step(dt: number) {
    this.accumulator += Math.min(dt, 0.05);
    const step = 1 / 90;
    const damping = Math.exp(-1.35 * step);
    while (this.accumulator >= step) {
      this.accumulator -= step;
      for (let row = 1; row < this.rows - 1; row++) for (let col = 1; col < this.columns - 1; col++) {
        const i = row * this.columns + col;
        if (!this.wet[i]) continue;
        const h = this.heights[i];
        const laplacian = (this.heights[i - 1] + this.heights[i + 1] - 2 * h) / this.dx ** 2
          + (this.heights[i - this.columns] + this.heights[i + this.columns] - 2 * h) / this.dz ** 2;
        this.velocities[i] = (this.velocities[i] + 2.56 * laplacian * step) * damping;
        this.next[i] = Math.max(-0.15, Math.min(0.15, h + this.velocities[i] * step));
      }
      this.heights.set(this.next);
    }
  }
}
