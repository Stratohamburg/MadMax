import { RULES, validateProfile, physicalProfile } from "./physics/config";
import type { VehicleProfile } from "./physics/config";
import { dryHard } from "./physics/surfaces";
import type { SurfaceSampler } from "./physics/surfaces";
import { createState, stateFrom } from "./physics/state";
import type { Actuation, InitialState, Intent, VehicleState } from "./physics/state";
import { controlVehicle } from "./control/driver";
import {
  advancePhysical,
  mechanicalEnergy,
  physicalObservation,
} from "./physics/physical";
export interface StepOptions {
  surface?: SurfaceSampler;
  fixedSteering?: number;
  coast?: boolean;
  substep?: number;
  actuation?: Actuation;
  driveForce?: number;
  boostForce?: number;
  externalForce?: { x: number; y: number };
  externalTorque?: number;
  forces?: readonly import("./physics/forces").AppliedForce[];
  /** 当前机械全油门轮端能力，供控制器换算请求；不直接施力。 */
  driveCapacity?: number;
}
function actuatorRequest(base: Actuation, options: StepOptions): Actuation {
  let command = options.actuation ?? base;
  for (const key of ["driveForce", "boostForce", "externalForce", "externalTorque"] as const)
    if (options[key] !== undefined) command = { ...command, [key]: options[key] };
  if (options.fixedSteering !== undefined)
    command = { ...command, steeringTarget: options.fixedSteering };
  if (options.coast) command = { ...command, drive: 0, brake: 0, rearBrake: 0, handbrake: 0 };
  if (options.forces) command = { ...command, forces: options.forces };
  return command;
}
export function observe(
  s: VehicleState,
  p: VehicleProfile,
  input: Intent = { targetSpeed: s.speed, angle: null, drift: false },
  options: StepOptions = {},
) {
  const o = physicalObservation(s, p, options.surface ?? dryHard),
    route = controlVehicle(s, input, p, RULES.substep, options.surface ?? dryHard, options.driveCapacity);
  const command = actuatorRequest(route.command, options),
    actualEnergy = mechanicalEnergy(s, p);
  return {
    ...o,
    modelVersion: p.modelVersion,
    profileId: p.profileId,
    profileRevision: p.profileRevision,
    speed: s.speed,
    motion: s.motion,
    theta: s.theta,
    beta: s.beta,
    u: s.u,
    v: s.v,
    r: s.r,
    delta: s.delta,
    h: s.h,
    route,
    deltaTarget: options.fixedSteering ?? command.steeringTarget,
    targetSpeed: input.targetSpeed,
    input: { ...input },
    command,
    power: {
      target: input.targetSpeed,
      drive: command.drive,
      brake: command.brake,
      request:
        command.drive * p.power.driveForce - command.brake * p.power.brakeForce,
      resistance: p.mass * RULES.gravity * p.power.rolling,
    },
    energy: { mechanical: actualEnergy, total: actualEnergy, ...s.energy },
    physicalLongAcceleration: s.previousLongAcceleration,
  };
}
export type Observation = ReturnType<typeof observe>;
export function step(
  s: VehicleState,
  input: Intent,
  p: VehicleProfile,
  dt = RULES.outerStep,
  options: StepOptions = {},
): VehicleState {
  if (
    !Number.isFinite(dt) ||
    dt < 0 ||
    Math.abs(dt / RULES.outerStep - Math.round(dt / RULES.outerStep)) > 1e-8
  )
    throw new Error("dt: 须为1/120秒的非负整数倍");
  if (
    !Number.isFinite(input.targetSpeed) ||
    (input.angle !== null && !Number.isFinite(input.angle))
  )
    throw new Error("intent: 速度/方向必须有限");
  const substep = options.substep ?? RULES.substep;
  if (substep !== 1 / 240 && substep !== 1 / 480)
    throw new Error("substep: 只支持1/240或1/480");
  const physical = physicalProfile(p),
    surface = options.surface ?? dryHard;
  for (let i = 0; i < Math.round(dt / substep); i++) {
    const a = controlVehicle(s, input, p, substep, surface, options.driveCapacity);
    const command = actuatorRequest(a.command, options);
    const next = advancePhysical(s, command, physical, substep, surface);
    s = stateFrom({ ...next, assist: a.history });
  }
  return s;
}
export function createPhysics(profile: VehicleProfile) {
  const errors = validateProfile(profile);
  if (errors.length) throw new Error(errors.join("\n"));
  const p = structuredClone(profile);
  const freeze = (o: object): void => {
    for (const v of Object.values(o)) if (v && typeof v === "object") freeze(v);
    Object.freeze(o);
  };
  freeze(p);
  return {
    profile: p,
    create: (initial?: InitialState) => createState(p, initial),
    step: (
      s: VehicleState,
      i: Intent,
      dt = RULES.outerStep,
      o: StepOptions = {},
    ) => step(s, i, p, dt, o),
    observe: (s: VehicleState, i?: Intent, o?: StepOptions) =>
      observe(s, p, i, o),
  };
}
