import { clamp, radians, shortestAngle } from '../vehicle/model';
import { geometry, isPhysicsState } from '../vehicle/model';
import type { Vec2, PhysicsState } from '../vehicle/model';
import type { Observation } from '../vehicle/physics/dynamics';
import type { VehicleProfile } from '../vehicle/physics/config';
import type { VehicleConfig } from '../vehicle/config';
import type { LegacyVehicleState } from '../vehicle/legacy-model';

export interface Trail { from: Vec2; to: Vec2; born: number; intensity: number }
export const TRAIL_LIFETIME = 6;
export const TRAIL_CAPACITY = 1600;

function legacyTires(state: LegacyVehicleState, config: VehicleConfig): Vec2[] {
  const forward = { x: Math.cos(state.heading), y: Math.sin(state.heading) };
  const side = { x: -forward.y, y: forward.x };
  return [-1, 1].map(sign => ({
    x: state.x - forward.x * config.bodyLength * 0.28 + side.x * config.radius * 0.82 * sign,
    y: state.y - forward.y * config.bodyLength * 0.28 + side.y * config.radius * 0.82 * sign,
  }));
}

function physicsTires(state: PhysicsState, profile: VehicleProfile): Vec2[] {
  const g = geometry(state, profile);
  return [g.wheels.frontLeft, g.wheels.frontRight, g.wheels.rearLeft, g.wheels.rearRight];
}

export class Trails {
  segments: Trail[] = [];
  sample(before: PhysicsState, after: PhysicsState, profile: VehicleProfile, time: number, observation?: Observation): void;
  sample(before: LegacyVehicleState, after: LegacyVehicleState, config: VehicleConfig, time: number): void;
  sample(before: PhysicsState | LegacyVehicleState, after: PhysicsState | LegacyVehicleState, profileOrConfig: VehicleProfile | VehicleConfig, time: number, observation?: Observation): void {
    this.segments = this.segments.filter(segment => time - segment.born < TRAIL_LIFETIME);
    if (isPhysicsState(before) && isPhysicsState(after) && (profileOrConfig as VehicleProfile).modelVersion === 'vehicle-physics-1') {
      const profile = profileOrConfig as VehicleProfile;
      if (after.speed <= 0) return;
      // 质心几何转弯本身不算打滑；实际侧滑必须同时越过可见阈值。
      if (Math.abs(after.beta) <= radians(3)) return;
      const obs = observation;
      const slip = obs ? Math.max(Math.abs(obs.front.slipVelocity), Math.abs(obs.rear.slipVelocity)) : Math.abs(after.beta) * after.speed;
      if (slip <= 0.05) return;
      const from = physicsTires(before, profile); const to = physicsTires(after, profile);
      const intensity = clamp(slip / Math.max(1, after.speed), 0, 1) * clamp(after.speed / 3, 0, 1);
      for (let i = 0; i < from.length; i++) this.segments.push({ from: from[i], to: to[i], intensity, born: time });
    } else {
      const b = before as LegacyVehicleState; const a = after as LegacyVehicleState; const config = profileOrConfig as VehicleConfig;
      const slip = Math.abs(shortestAngle(a.heading - a.motion));
      if (a.speed <= 0 || slip <= radians(3)) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance === 0) return;
      const from = legacyTires(b, config); const to = legacyTires(a, config);
      const intensity = clamp((slip - radians(3)) / radians(30), 0, 1) * clamp(a.speed / 3, 0, 1);
      for (let i = 0; i < 2; i++) this.segments.push({ from: from[i], to: to[i], intensity, born: time });
    }
    if (this.segments.length > TRAIL_CAPACITY) this.segments.splice(0, this.segments.length - TRAIL_CAPACITY);
  }
  clear(): void { this.segments = []; }
}
