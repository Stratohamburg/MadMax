import type { Composition } from "../loadout/compose";
import { advancePhysical } from "./physics/physical";
import { RULES, physicalProfile } from "./physics/config";
import { dryHard } from "./physics/surfaces";
import { consumePower, powerBudget } from "./physics/supply";
import { clamp } from "./physics/math";
import { createState, stateFrom } from "./physics/state";
import type { InitialState, Intent, VehicleState } from "./physics/state";
import type { SurfaceSampler } from "./physics/surfaces";
import { advanceBoost as stepBoost, advanceDrivetrain as stepDrivetrain, drivetrainCapacity } from "./physics/mechanics";
import type { BoostState, DrivetrainState } from "./physics/mechanics";
import { reconfigurePhysical } from "./physics/reconfigure";
import { automaticGear, controlVehicle } from "./control/driver";
import type { EffectHistory } from "./physics/forces";

export { torqueAtRpm } from "./physics/mechanics";
export type { BoostState, DrivetrainState } from "./physics/mechanics";
export interface AssemblyDriveState {
  vehicle: VehicleState;
  drivetrain: DrivetrainState;
  boost: BoostState;
  energy: number;
  output: { driveForce: number; boostForce: number; powerAvailable?: number; powerConsumed?: number; driveCapacity?: number; driveRequest?: number; shifting?: boolean; powerLimited?: boolean };
  /** 每个助推器的剩余持续时间和冷却；旧存档可省略并由 aggregate 状态兼容。 */
  thrusters?: Record<string, BoostState>;
  effects?: EffectHistory;
}
const mechanics = (c: Composition) => ({ engine: c.engine, gearbox: c.gearbox, wheelRadius: c.profile.wheels.radius });
export function createAssemblyDrive(composition: Composition, initial?: InitialState): AssemblyDriveState {
  return { vehicle: createState(composition.profile, initial),
    drivetrain: { gear: 1, targetGear: 1, rpm: composition.engine?.idleRpm ?? 0, shiftRemaining: 0, fuel: composition.resources.fuelCapacity },
    boost: { remaining: 0, cooldown: 0 }, energy: composition.resources.capacity, output: { driveForce: 0, boostForce: 0 },
    thrusters: Object.fromEntries(composition.thrusters.map(t => [t.id, { remaining: 0, cooldown: 0 }])), effects: { lastSequence: {} } };
}
/** 兼容接入层调用形式，全部机械计算由核心完成。 */
export function advanceDrivetrain(state: DrivetrainState, composition: Composition, wheelSpeed: number, throttle: number, dt: number, requestedGear?: number) {
  return stepDrivetrain(state, mechanics(composition), wheelSpeed, composition.summary.canDrive ? throttle : 0, dt, requestedGear ?? automaticGear(state, mechanics(composition), wheelSpeed, throttle, composition.profile.controller));
}
export function advanceBoost(state: BoostState, composition: Composition, energy: number, request: boolean, dt: number) {
  return stepBoost(state, composition.boost, energy, request && composition.summary.canControl, dt);
}
export function migrateAssemblyDrive(current: AssemblyDriveState, before: Composition, after: Composition): AssemblyDriveState {
  if (before.loadout.chassisId !== after.loadout.chassisId) throw new Error("assembly: 换车须显式执行生命周期事件");
  const physical = reconfigurePhysical(current.vehicle, before.profile, after.profile);
  const count = after.gearbox?.ratios.length ?? 1;
  const gear = clamp(current.drivetrain.gear, 1, count), targetGear = clamp(current.drivetrain.targetGear, 1, count);
  const thrusters = Object.fromEntries(after.thrusters.map(t => {
    const previous = current.thrusters?.[t.id] ?? { remaining: 0, cooldown: 0 };
    return [t.id, { remaining: Math.min(previous.remaining, t.parameters.duration), cooldown: previous.cooldown }];
  }));
  return { vehicle: stateFrom({ ...physical, assist: current.vehicle.assist }),
    drivetrain: { ...current.drivetrain, gear, targetGear,
      shiftRemaining: gear === targetGear ? 0 : current.drivetrain.shiftRemaining,
      fuel: Math.min(current.drivetrain.fuel, after.resources.fuelCapacity) },
    boost: { remaining: Math.min(current.boost.remaining, after.boost.duration), cooldown: current.boost.cooldown },
    energy: Math.min(current.energy, after.resources.capacity), output: current.output, thrusters, effects: current.effects };
}
/** 拖车/车库换车是显式场景事件；供给与冷却不会随重置自动补满。 */
export function relocateAssemblyDrive(current: AssemblyDriveState, composition: Composition, position: { x: number; y: number }, theta: number): AssemblyDriveState {
  const next = createAssemblyDrive(composition, { position, theta });
  return { ...next, drivetrain: { ...next.drivetrain, fuel: Math.min(current.drivetrain.fuel, composition.resources.fuelCapacity) },
    energy: Math.min(current.energy, composition.resources.capacity), boost: { remaining: 0, cooldown: current.boost.cooldown }, thrusters: Object.fromEntries(Object.keys(next.thrusters ?? {}).map(id => [id, { remaining: 0, cooldown: current.thrusters?.[id]?.cooldown ?? current.boost.cooldown }])), effects: current.effects };
}
/** 同一控制步只计算并提交一次控制历史，随后执行机械与轮胎。 */
export function advanceAssemblyDrive(current: AssemblyDriveState, input: Intent, composition: Composition, surface: SurfaceSampler = dryHard): AssemblyDriveState {
  const dt = RULES.substep, count = Math.round(RULES.outerStep / dt), mechanical = mechanics(composition);
  let next = current, remainingPower = 0, consumed = 0;
  for (let i = 0; i < count; i++) {
    const s = next.vehicle, p = composition.profile, canControl = composition.summary.canControl;
    const wheelSpeed = s.wheelSpeeds.front * p.power.driveFront + s.wheelSpeeds.rear * (1 - p.power.driveFront);
    const capacity = drivetrainCapacity(next.drivetrain, mechanical, wheelSpeed).wheelForce;
    const control = controlVehicle(s, input, p, dt, surface, capacity);
    const gear = canControl ? automaticGear(next.drivetrain, mechanical, wheelSpeed, control.command.drive, p.controller) : next.drivetrain.targetGear;
    const drivetrain = advanceDrivetrain(next.drivetrain, composition, wheelSpeed, canControl ? control.command.drive : 0, dt, gear);
    let budget = powerBudget(Math.min(composition.resources.capacity, next.energy + composition.resources.rechargeRate * dt), composition.resources.maxOutput, dt);
    const auxiliary = consumePower(budget, composition.auxiliaryPower * dt);
    budget = auxiliary.budget;
    let powerLimited = auxiliary.granted + 1e-12 < composition.auxiliaryPower * dt, boostForce = 0;
    const states: Record<string, BoostState> = {}, forces: import("./physics/forces").AppliedForce[] = [];
    for (const thruster of composition.thrusters) {
      const previous = next.thrusters?.[thruster.id] ?? { remaining: 0, cooldown: 0 };
      // 保持喷射器额定耗能，用剩余电量和本步功率限制实际工作时间。
      const allowance = Math.min(budget.energy, budget.remainingPower * dt);
      const result = stepBoost(previous, thruster.parameters, canControl ? allowance : 0, canControl && control.boost, dt);
      const used = canControl ? allowance - result.energy : 0;
      budget = consumePower(budget, used).budget;
      states[thruster.id] = result.state;
      const force = canControl ? result.force : 0;
      boostForce += force;
      powerLimited ||= canControl && (control.boost || previous.remaining > 0) && allowance + 1e-12 < thruster.parameters.energy * Math.min(dt, previous.remaining || thruster.parameters.duration);
      if (force > 0) forces.push({ force: { x: thruster.direction.x * force, y: thruster.direction.y * force }, point: thruster.point, frame: "body", work: "boost" });
    }
    const driveForce = canControl && composition.summary.canDrive ? drivetrain.wheelForce : 0;
    const actuation = { ...control.command, drive: 1, driveForce, forces,
      steeringTarget: canControl ? control.command.steeringTarget : s.delta,
      brake: canControl ? control.command.brake : 0, rearBrake: canControl ? control.command.rearBrake : 0,
      handbrake: canControl ? control.command.handbrake : 0 };
    const vehicle = stateFrom({ ...advancePhysical(s, actuation, physicalProfile(p), dt, surface), assist: canControl ? control.history : s.assist });
    const boost = composition.thrusters.length ? {
      remaining: Math.max(0, ...Object.values(states).map(t => t.remaining)), cooldown: Math.max(0, ...Object.values(states).map(t => t.cooldown)),
    } : { remaining: 0, cooldown: Math.max(0, next.boost.cooldown - dt) };
    remainingPower += budget.remainingPower / count;
    consumed += budget.consumed;
    next = { vehicle, drivetrain: drivetrain.state, boost, energy: budget.energy, effects: current.effects, thrusters: states,
      output: { driveForce, boostForce, driveCapacity: capacity, driveRequest: canControl ? control.command.drive : 0,
        shifting: drivetrain.shifting, powerLimited } };
  }
  return { ...next, output: { ...next.output, powerAvailable: remainingPower, powerConsumed: consumed } };
}
