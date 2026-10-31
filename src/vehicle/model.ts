/**
 * Web-consumer facade for vehicle-physics-2.
 *
 * Production code uses the functions ending in `Physics`. The historical
 * baseline helpers are isolated in legacy-model.ts and remain available only
 * for baseline evidence and its regression tests.
 */
import type { Vec2 } from "./physics/math";
import type { VehicleProfile } from "./physics/config";
import { createState, resetState, collisionStop } from "./physics/state";
import { createPhysics, observe, step } from "./physics/dynamics";
import { geometry } from "./physics/geometry";
import { getProfile, PROFILES } from "./physics/profiles";
import type {
  InitialState,
  Intent as PhysicsIntent,
  VehicleState as PhysicsVehicleState,
} from "./physics/state";
import type {
  Observation as PhysicsObservation,
  StepOptions,
} from "./physics/dynamics";
import { MODEL_VERSION, PROFILE_SCHEMA_VERSION, RULES } from "./physics/config";
import * as Legacy from "./legacy-model";

export type {
  Vec2,
  VehicleProfile,
  InitialState,
  StepOptions,
  PhysicsObservation,
};
export type Intent = PhysicsIntent;
/** Baseline-compatible view; modern production code uses PhysicsVehicleState. */
export interface VehicleState extends Legacy.LegacyVehicleState {
  position?: PhysicsVehicleState["position"];
  worldVelocity?: PhysicsVehicleState["worldVelocity"];
  theta?: number;
  r?: number;
  delta?: number;
  h?: number;
  tires?: PhysicsVehicleState["tires"];
  previousLongAcceleration?: number;
  assist?: PhysicsVehicleState["assist"];
  energy?: PhysicsVehicleState["energy"];
  time?: number;
  beta?: number;
  u?: number;
  v?: number;
}
export type PhysicsState = PhysicsVehicleState;
export type Observation = PhysicsObservation;
export {
  MODEL_VERSION,
  PROFILE_SCHEMA_VERSION,
  RULES,
  PROFILES,
  getProfile,
  geometry,
};
export { createState, resetState, collisionStop, observe, step, createPhysics };
export type {
  TireHistory,
  AssistHistory,
  EnergyLedger,
  AuthoritativeState,
} from "./physics/state";
export {
  SNAPSHOT_VERSION,
  createVehicleSnapshot,
  restoreVehicleSnapshot,
} from "./snapshot";
export type { VehicleSnapshot } from "./snapshot";

/** Stable default used by the web client. */
export const DEFAULT_PROFILE = getProfile("sports-car");
export function createPhysicsVehicle(
  position: Vec2 = { x: -11, y: 19 },
  theta = -Math.PI / 2,
  profile: VehicleProfile = DEFAULT_PROFILE,
  initial: InitialState = {},
): PhysicsVehicleState {
  return createState(profile, { ...initial, position, theta });
}
export function stepPhysicsVehicle(
  state: PhysicsVehicleState,
  input: Intent,
  profile: VehicleProfile,
  dt = RULES.outerStep,
  options: StepOptions = {},
): PhysicsVehicleState {
  return step(state, input, profile, dt, options);
}
export function observePhysicsVehicle(
  state: PhysicsVehicleState,
  profile: VehicleProfile,
  input: Intent = { targetSpeed: state.speed, angle: null, drift: false },
  options: StepOptions = {},
): PhysicsObservation {
  return observe(state, profile, input, options);
}
export function isPhysicsState(value: unknown): value is PhysicsVehicleState {
  const state = value as Partial<PhysicsVehicleState> | null;
  return (
    !!state &&
    !!state.position &&
    !!state.worldVelocity &&
    typeof state.theta === "number" &&
    typeof state.delta === "number" &&
    typeof state.r === "number"
  );
}

// Historical baseline surface. These exports are intentionally isolated and
// are not imported by src/main.ts or the new scene chain.
export const IDLE = Legacy.IDLE;
export const clamp = Legacy.clamp;
export const radians = Legacy.radians;
export const degrees = Legacy.degrees;
export const shortestAngle = Legacy.shortestAngle;
export const angleDifference = Legacy.angleDifference;
export const createVehicle = Legacy.createVehicle;
export const driveSpeed = Legacy.driveSpeed;
export const turnRate = Legacy.turnRate;
export const stepVehicle = Legacy.stepVehicle;
export type LegacyVehicleState = Legacy.LegacyVehicleState;
