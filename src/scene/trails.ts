import { clamp, radians, shortestAngle } from "../vehicle/model";
import {
  geometry,
  isPhysicsState,
  observePhysicsVehicle,
} from "../vehicle/model";
import type { Vec2, PhysicsState } from "../vehicle/model";
import type { Observation } from "../vehicle/physics/dynamics";
import type { VehicleProfile } from "../vehicle/physics/config";
import type { VehicleConfig } from "../vehicle/config";
import type { LegacyVehicleState } from "../vehicle/legacy-model";

export interface Trail {
  from: Vec2;
  to: Vec2;
  born: number;
  intensity: number;
}
export const TRAIL_LIFETIME = 6;
export const TRAIL_CAPACITY = 1600;

function legacyTires(state: LegacyVehicleState, config: VehicleConfig): Vec2[] {
  const forward = { x: Math.cos(state.heading), y: Math.sin(state.heading) };
  const side = { x: -forward.y, y: forward.x };
  return [-1, 1].map((sign) => ({
    x:
      state.x -
      forward.x * config.bodyLength * 0.28 +
      side.x * config.radius * 0.82 * sign,
    y:
      state.y -
      forward.y * config.bodyLength * 0.28 +
      side.y * config.radius * 0.82 * sign,
  }));
}

function physicsTires(state: PhysicsState, profile: VehicleProfile): Vec2[] {
  const g = geometry(state, profile);
  return [
    g.wheels.frontLeft,
    g.wheels.frontRight,
    g.wheels.rearLeft,
    g.wheels.rearRight,
  ];
}

export class Trails {
  segments: Trail[] = [];
  sample(
    before: PhysicsState,
    after: PhysicsState,
    profile: VehicleProfile,
    time: number,
    observation?: Observation,
  ): void;
  sample(
    before: LegacyVehicleState,
    after: LegacyVehicleState,
    config: VehicleConfig,
    time: number,
  ): void;
  sample(
    before: PhysicsState | LegacyVehicleState,
    after: PhysicsState | LegacyVehicleState,
    profileOrConfig: VehicleProfile | VehicleConfig,
    time: number,
    observation?: Observation,
  ): void {
    this.segments = this.segments.filter(
      (segment) => time - segment.born < TRAIL_LIFETIME,
    );
    if (
      isPhysicsState(before) &&
      isPhysicsState(after) &&
      (profileOrConfig as VehicleProfile).modelVersion === "vehicle-physics-2"
    ) {
      const profile = profileOrConfig as VehicleProfile;
      const obs = observation ?? observePhysicsVehicle(after, profile);
      const from = physicsTires(before, profile),
        to = physicsTires(after, profile);
      for (const [axle, index] of [
        ["front", 0],
        ["rear", 2],
      ] as const) {
        const tire = obs[axle],
          slip = Math.hypot(tire.slipVelocity, tire.longSlip);
        const frictionWorkRate = Math.abs(
          tire.fx * tire.longSlip + tire.fy * tire.slipVelocity,
        );
        if (slip < 0.15 || frictionWorkRate < 0.01 * profile.mass) continue;
        const intensity =
          clamp(slip / 3, 0, 1) *
          clamp(frictionWorkRate / (profile.mass * 5), 0, 1);
        for (let wheel = index; wheel < index + 2; wheel++)
          this.segments.push({
            from: from[wheel],
            to: to[wheel],
            intensity,
            born: time,
          });
      }
    } else {
      const b = before as LegacyVehicleState;
      const a = after as LegacyVehicleState;
      const config = profileOrConfig as VehicleConfig;
      const slip = Math.abs(shortestAngle(a.heading - a.motion));
      if (a.speed <= 0 || slip <= radians(3)) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance === 0) return;
      const from = legacyTires(b, config);
      const to = legacyTires(a, config);
      const intensity =
        clamp((slip - radians(3)) / radians(30), 0, 1) *
        clamp(a.speed / 3, 0, 1);
      for (let i = 0; i < 2; i++)
        this.segments.push({ from: from[i], to: to[i], intensity, born: time });
    }
    if (this.segments.length > TRAIL_CAPACITY)
      this.segments.splice(0, this.segments.length - TRAIL_CAPACITY);
  }
  clear(): void {
    this.segments = [];
  }
}
