import type { VehicleProfile } from './config';
import { RULES } from './config';
import { clamp, rad } from './math';
import type { Intent, VehicleState } from './state';

export function availableForces(speed: number, p: VehicleProfile) {
  const z = speed / p.power.maxSpeed;
  return { drive: p.power.driveForce / (1 + p.power.accelerationCurve * z * z), brake: p.power.brakeForce * (1 + p.power.brakingCurve * z * z) };
}
export function powerRequest(s: VehicleState, input: Intent, p: VehicleProfile, rollingScale: number, dt: number, coast = false) {
  const target = clamp(input.targetSpeed, 0, p.power.maxSpeed), available = availableForces(s.speed, p);
  const rolling = p.mass * RULES.gravity * p.power.rolling * rollingScale + p.power.aero * s.speed ** 2;
  if (coast) return { target, drive: 0, brake: 0, request: 0, resistance: s.speed === 0 ? 0 : Math.min(rolling, s.speed * p.mass / dt), front: 0, rear: 0 };
  // 外步内不跨目标的请求；阻力仅在此补偿一次，再单独施加。
  const needed = (target - s.speed) * p.mass / dt + (target > 0 ? rolling : 0);
  const request = clamp(needed, -available.brake, available.drive);
  const share = request >= 0 ? p.power.driveFront : p.power.brakeFront;
  return { target, drive: Math.max(0, request), brake: Math.max(0, -request), request,
    resistance: s.speed === 0 ? 0 : Math.min(rolling, s.speed * p.mass / dt), front: request * share, rear: request * (1 - share) };
}
export function gameLoss(s: Pick<VehicleState, 'theta' | 'speed'>, input: Intent, p: VehicleProfile) {
  const angle = input.angle === null ? 0 : Math.abs(Math.atan2(Math.sin(input.angle - s.theta), Math.cos(input.angle - s.theta)));
  const strength = clamp((angle - p.game.freeAngle) / (rad(90) - p.game.freeAngle), 0, 1) ** p.game.exponent;
  const lambda = input.drift ? p.game.driftLambda : p.game.normalLambda;
  return { angle, strength, deceleration: lambda * s.speed * strength };
}
