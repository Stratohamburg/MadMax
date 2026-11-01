import type { EntityPool } from "./pools";
import type { Vec2 } from "../vehicle/physics/math";
export class SpatialHash {
  private buckets = new Map<string, number[]>();
  constructor(readonly cellSize = 2) {}
  rebuild(pool: EntityPool): void {
    for (const bucket of this.buckets.values()) bucket.length = 0;
    for (let i = 0; i < pool.capacity; i++) if (pool.active[i]) {
      const key = `${Math.floor(pool.x[i] / this.cellSize)},${Math.floor(pool.y[i] / this.cellSize)}`;
      let bucket = this.buckets.get(key);
      if (!bucket) { bucket = []; this.buckets.set(key, bucket); }
      bucket.push(i);
    }
  }
  query(center: Vec2, radius: number): number[] {
    const result: number[] = [];
    for (let x = Math.floor((center.x - radius) / this.cellSize); x <= Math.floor((center.x + radius) / this.cellSize); x++)
      for (let y = Math.floor((center.y - radius) / this.cellSize); y <= Math.floor((center.y + radius) / this.cellSize); y++)
        for (const slot of this.buckets.get(`${x},${y}`) ?? []) result.push(slot);
    return result;
  }
}
