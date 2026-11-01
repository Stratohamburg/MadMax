import type { Composition } from "../loadout/compose";
import { observe, step } from "./physics/dynamics";
import { clamp, wrap } from "./physics/math";
import { createState, stateFrom } from "./physics/state";
import type { InitialState, Intent, VehicleState } from "./physics/state";
import type { SurfaceSampler } from "./physics/surfaces";
import { advanceBoost as stepBoost, advanceDrivetrain as stepDrivetrain, drivetrainCapacity } from "./physics/mechanics";
import type { BoostState, DrivetrainState } from "./physics/mechanics";
import { reconfigurePhysical } from "./physics/reconfigure";

export { torqueAtRpm } from "./physics/mechanics";
export type { BoostState, DrivetrainState } from "./physics/mechanics";
export interface AssemblyDriveState {
  vehicle: VehicleState;
  drivetrain: DrivetrainState;
  boost: BoostState;
  energy: number;
  output: { driveForce: number; boostForce: number };
}
const mechanics = (c: Composition) => ({ engine: c.engine, gearbox: c.gearbox, wheelRadius: c.profile.wheels.radius });
export function createAssemblyDrive(composition: Composition, initial?: InitialState): AssemblyDriveState {
  return { vehicle: createState(composition.profile, initial),
    drivetrain: { gear: 1, targetGear: 1, rpm: composition.engine?.idleRpm ?? 0, shiftRemaining: 0, fuel: composition.resources.fuelCapacity },
    boost: { remaining: 0, cooldown: 0 }, energy: composition.resources.capacity, output: { driveForce: 0, boostForce: 0 } };
}
/** 兼容接入层调用形式，全部机械计算由核心完成。 */
export function advanceDrivetrain(state: DrivetrainState, composition: Composition, wheelSpeed: number, throttle: number, dt: number) {
  return stepDrivetrain(state, mechanics(composition), wheelSpeed, composition.summary.canDrive ? throttle : 0, dt);
}
export function advanceBoost(state: BoostState, composition: Composition, energy: number, request: boolean, dt: number) {
  return stepBoost(state, composition.boost, energy, request && composition.summary.canControl, dt);
}
export function migrateAssemblyDrive(current: AssemblyDriveState, before: Composition, after: Composition): AssemblyDriveState {
  if (before.loadout.chassisId !== after.loadout.chassisId) throw new Error("assembly: 换车须显式执行生命周期事件");
  const physical = reconfigurePhysical(current.vehicle, before.profile, after.profile);
  const count = after.gearbox?.ratios.length ?? 1;
  const gear = clamp(current.drivetrain.gear, 1, count), targetGear = clamp(current.drivetrain.targetGear, 1, count);
  return { vehicle: stateFrom({ ...physical, assist: current.vehicle.assist }),
    drivetrain: { ...current.drivetrain, gear, targetGear,
      shiftRemaining: gear === targetGear ? 0 : current.drivetrain.shiftRemaining,
      fuel: Math.min(current.drivetrain.fuel, after.resources.fuelCapacity) },
    boost: { remaining: Math.min(current.boost.remaining, after.boost.duration), cooldown: current.boost.cooldown },
    energy: Math.min(current.energy, after.resources.capacity), output: current.output };
}
/** 拖车/车库换车是显式场景事件；供给与冷却不会随重置自动补满。 */
export function relocateAssemblyDrive(current: AssemblyDriveState, composition: Composition, position: { x: number; y: number }, theta: number): AssemblyDriveState {
  const next = createAssemblyDrive(composition, { position, theta });
  return { ...next, drivetrain: { ...next.drivetrain, fuel: Math.min(current.drivetrain.fuel, composition.resources.fuelCapacity) },
    energy: Math.min(current.energy, composition.resources.capacity), boost: { remaining: 0, cooldown: current.boost.cooldown } };
}
export function advanceAssemblyDrive(current: AssemblyDriveState, input: Intent, composition: Composition, surface?: SurfaceSampler): AssemblyDriveState {
  const dt = 1 / 120, mechanical = mechanics(composition);
  const wheelSpeed = current.vehicle.wheelSpeeds.front * composition.profile.power.driveFront + current.vehicle.wheelSpeeds.rear * (1 - composition.profile.power.driveFront);
  const capacity = drivetrainCapacity(current.drivetrain, mechanical, wheelSpeed).wheelForce;
  const command = observe(current.vehicle, composition.profile, input, { surface, driveCapacity: capacity }).command;
  const canControl = composition.summary.canControl;
  const drivetrain = advanceDrivetrain(current.drivetrain, composition, wheelSpeed, canControl ? command.drive : 0, dt);
  const energy = Math.min(composition.resources.capacity, current.energy + composition.resources.rechargeRate * dt);
  const boostRequest = canControl && input.angle !== null && input.targetSpeed >= composition.profile.power.maxSpeed * 0.95 && Math.abs(wrap(input.angle - current.vehicle.theta)) < Math.PI / 3;
  const boost = advanceBoost(current.boost, composition, energy, boostRequest, dt);
  const vehicle = step(current.vehicle, input, composition.profile, dt, { surface, driveCapacity: capacity,
    actuation: { ...command, drive: 1, steeringTarget: canControl ? command.steeringTarget : current.vehicle.delta,
      brake: canControl ? command.brake : 0, rearBrake: canControl ? command.rearBrake : 0 },
    driveForce: canControl && composition.summary.canDrive ? drivetrain.wheelForce : 0, boostForce: canControl ? boost.force : 0 });
  return { vehicle, drivetrain: drivetrain.state, boost: boost.state, energy: boost.energy,
    output: { driveForce: canControl && composition.summary.canDrive ? drivetrain.wheelForce : 0, boostForce: canControl ? boost.force : 0 } };
}
