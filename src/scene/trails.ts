import { clamp, radians, shortestAngle } from '../vehicle/model';
import type { Vec2, VehicleState } from '../vehicle/model';
import type { VehicleConfig } from '../vehicle/config';

export interface Trail { from: Vec2; to: Vec2; born: number; intensity: number }
export const TRAIL_LIFETIME = 6;
export const TRAIL_CAPACITY = 1600;
function tires(state: VehicleState, config: VehicleConfig): Vec2[] {
  const forward = { x: Math.cos(state.heading), y: Math.sin(state.heading) };
  const side = { x: -forward.y, y: forward.x };
  return [-1, 1].map(sign => ({
    x: state.x - forward.x * config.bodyLength * 0.28 + side.x * config.radius * 0.82 * sign,
    y: state.y - forward.y * config.bodyLength * 0.28 + side.y * config.radius * 0.82 * sign,
  }));
}
export class Trails {
  segments: Trail[] = [];
  sample(before: VehicleState, after: VehicleState, config: VehicleConfig, time: number): void {
    this.segments = this.segments.filter(segment => time - segment.born < TRAIL_LIFETIME);
    const slip = Math.abs(shortestAngle(after.heading - after.motion));
    if (after.speed <= 0 || slip <= radians(3)) return;
    const distance = Math.hypot(after.x - before.x, after.y - before.y);
    if (distance === 0) return;
    const from = tires(before, config); const to = tires(after, config);
    const intensity = clamp((slip - radians(3)) / radians(30), 0, 1) * clamp(after.speed / 3, 0, 1);
    for (let i = 0; i < 2; i++) this.segments.push({ from: from[i], to: to[i], intensity, born: time });
    if (this.segments.length > TRAIL_CAPACITY) this.segments.splice(0, this.segments.length - TRAIL_CAPACITY);
  }
  clear(): void { this.segments = []; }
}
