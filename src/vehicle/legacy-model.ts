import type { VehicleConfig } from './config';

export interface Vec2 { x: number; y: number }
export interface Intent { targetSpeed: number; angle: number | null; drift: boolean }
export const IDLE: Intent = { targetSpeed: 0, angle: null, drift: false };
export interface Observation {
  targetSpeed: number; targetAngle: number | null; drift: boolean;
  intentAngle: number; lossStrength: number; driveDelta: number; turnLoss: number;
}
export interface LegacyVehicleState extends Vec2 {
  speed: number; heading: number; motion: number; turnSign: number;
  observation: Observation;
}
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const radians = (degrees: number): number => degrees * Math.PI / 180;
export const degrees = (angle: number): number => angle * 180 / Math.PI;
export function shortestAngle(angle: number): number { return Math.atan2(Math.sin(angle), Math.cos(angle)); }
export function angleDifference(target: number, current: number, previousSign = 1): number {
  const delta = shortestAngle(target - current);
  return Math.abs(Math.abs(delta) - Math.PI) <= Number.EPSILON * 4 ? Math.PI * (previousSign || 1) : delta;
}

export function createVehicle(position: Vec2 = { x: -11, y: 19 }, heading = -Math.PI / 2): LegacyVehicleState {
  return { ...position, speed: 0, heading, motion: heading, turnSign: 0,
    observation: { targetSpeed: 0, targetAngle: null, drift: false, intentAngle: 0, lossStrength: 0, driveDelta: 0, turnLoss: 0 } };
}

export function driveSpeed(speed: number, target: number, config: VehicleConfig, dt: number): number {
  target = clamp(target, 0, config.maxSpeed);
  const u = clamp(speed / config.maxSpeed, 0, 1);
  if (speed < target) return Math.min(target, speed + config.acceleration / (1 + config.accelerationCurve * u * u) * dt);
  if (speed > target) return Math.max(target, speed - config.braking * (1 + config.brakingCurve * u * u) * dt);
  return speed;
}

export function turnRate(speed: number, drift: boolean, config: VehicleConfig): number {
  const u = clamp(speed / config.maxSpeed, 0, 1);
  return (drift ? config.driftTurn : config.normalTurn) * speed / (speed + config.steeringSpeed)
    / (1 + (drift ? config.driftTurnCurve : config.normalTurnCurve) * u * u);
}

export function stepVehicle(state: LegacyVehicleState, input: Intent, config: VehicleConfig, dt: number): LegacyVehicleState {
  const target = clamp(input.targetSpeed, 0, config.maxSpeed);
  const delta = input.angle === null ? 0 : angleDifference(input.angle, state.heading, state.turnSign);
  const strength = clamp((Math.abs(delta) - radians(config.freeAngle)) / radians(90 - config.freeAngle), 0, 1);
  const drive = driveSpeed(state.speed, target, config, dt);
  const loss = (input.drift ? config.driftLoss : config.normalLoss) * state.speed * strength ** config.lossExponent * dt;
  const speed = clamp(drive - loss, 0, config.maxSpeed);
  const turn = input.angle === null || speed === 0 ? 0 : Math.sign(delta) * Math.min(Math.abs(delta), turnRate(speed, input.drift, config) * dt);
  const heading = shortestAngle(state.heading + turn);
  const blend = clamp(speed / (config.maxSpeed * config.lowSpeedBlend), 0, 1);
  const grip = input.drift ? config.normalGrip + (config.driftGrip - config.normalGrip) * blend : config.normalGrip;
  let motion = speed === 0 ? heading : shortestAngle(state.motion + shortestAngle(heading - state.motion) * (1 - Math.exp(-grip * dt)));
  const slip = shortestAngle(motion - heading);
  if (Math.abs(slip) > radians(config.maxSlipAngle)) motion = shortestAngle(heading + Math.sign(slip) * radians(config.maxSlipAngle));
  return { ...state, x: state.x + Math.cos(motion) * speed * dt, y: state.y + Math.sin(motion) * speed * dt,
    speed, heading, motion, turnSign: turn === 0 ? state.turnSign : Math.sign(turn),
    observation: { targetSpeed: target, targetAngle: input.angle, drift: input.drift, intentAngle: Math.abs(delta),
      lossStrength: strength, driveDelta: drive - state.speed, turnLoss: loss } };
}
