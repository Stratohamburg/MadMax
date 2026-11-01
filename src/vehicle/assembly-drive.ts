import type { Composition } from "../loadout/compose";
import { observe, step } from "./physics/dynamics";
import { clamp, wrap } from "./physics/math";
import { createState } from "./physics/state";
import type { InitialState, Intent, VehicleState } from "./physics/state";
import type { SurfaceSampler } from "./physics/surfaces";

export interface DrivetrainState { gear: number; targetGear: number; rpm: number; shiftRemaining: number; fuel: number }
export interface BoostState { remaining: number; cooldown: number }
export interface AssemblyDriveState {
  vehicle: VehicleState;
  drivetrain: DrivetrainState;
  boost: BoostState;
  energy: number;
}
export function createAssemblyDrive(composition: Composition, initial?: InitialState): AssemblyDriveState {
  return { vehicle: createState(composition.profile, initial),
    drivetrain: { gear: 1, targetGear: 1, rpm: composition.engine?.idleRpm ?? 0, shiftRemaining: 0, fuel: composition.resources.fuelCapacity },
    boost: { remaining: 0, cooldown: 0 }, energy: composition.resources.capacity };
}
export function torqueAtRpm(rpm: number, curve: readonly (readonly [number, number])[]): number {
  if (!curve.length) return 0;
  if (rpm <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1], b = curve[i];
    if (rpm <= b[0]) return a[1] + (b[1] - a[1]) * (rpm - a[0]) / (b[0] - a[0]);
  }
  return curve.at(-1)![1];
}
export function advanceDrivetrain(state: DrivetrainState, composition: Composition, wheelSpeed: number, throttle: number, dt: number) {
  if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(wheelSpeed) || !Number.isFinite(throttle)) throw new Error("drivetrain: 非法步长或输入");
  const engine = composition.engine, gearbox = composition.gearbox;
  const next = { ...state };
  if (!engine || !gearbox || !composition.summary.canDrive || next.fuel <= 0) return { state: next, wheelForce: 0, torque: 0, shifting: false };
  throttle = clamp(throttle, 0, 1);
  const rpmForGear = (gear: number) => Math.max(engine.idleRpm, Math.abs(wheelSpeed) * gearbox.ratios[gear - 1] * gearbox.finalDrive * 30 / Math.PI);
  if (next.shiftRemaining > 0) {
    next.shiftRemaining = Math.max(0, next.shiftRemaining - dt);
    if (next.shiftRemaining <= 1e-10) { next.shiftRemaining = 0; next.gear = next.targetGear; }
    next.rpm = Math.max(engine.idleRpm, Math.min(engine.redlineRpm, rpmForGear(next.targetGear)));
    return { state: next, wheelForce: 0, torque: 0, shifting: true };
  }
  const wheelRpm = rpmForGear(next.gear);
  next.rpm = clamp(wheelRpm, engine.idleRpm, engine.redlineRpm);
  if (wheelRpm >= engine.redlineRpm * 0.86 && next.gear < gearbox.ratios.length && throttle > 0) next.targetGear = next.gear + 1;
  else if (wheelRpm < engine.redlineRpm * 0.35 && next.gear > 1 && rpmForGear(next.gear - 1) < engine.redlineRpm * 0.8) next.targetGear = next.gear - 1;
  if (next.targetGear !== next.gear) {
    next.shiftRemaining = gearbox.shiftTime;
    return { state: next, wheelForce: 0, torque: 0, shifting: true };
  }
  const torque = Math.max(0, Math.min(engine.maxTorque * torqueAtRpm(next.rpm, engine.torqueCurve),
    9550 * engine.maxPower / next.rpm, gearbox.maxInputTorque));
  const redlineFactor = wheelRpm >= engine.redlineRpm ? 0 : 1;
  const profileScale = composition.profile.power.driveForce /
    (Math.min(engine.maxTorque, gearbox.maxInputTorque) * gearbox.ratios[0] * gearbox.finalDrive * gearbox.efficiency / (2500 * composition.profile.wheels.radius));
  let wheelForce = torque * gearbox.ratios[next.gear - 1] * gearbox.finalDrive * gearbox.efficiency /
    (2500 * composition.profile.wheels.radius) * throttle * redlineFactor * profileScale;
  const consumption = engine.fuelConsumption * (0.1 + throttle * 0.9) * dt;
  if (consumption > next.fuel) wheelForce *= next.fuel / consumption;
  next.fuel = Math.max(0, next.fuel - consumption);
  return { state: next, wheelForce, torque, shifting: false };
}
export function advanceBoost(state: BoostState, composition: Composition, energy: number, request: boolean, dt: number) {
  const next = { ...state }, boost = composition.boost;
  if (next.cooldown > 0) next.cooldown = Math.max(0, next.cooldown - dt);
  if (!composition.summary.canDrive || boost.force <= 0) return { state: { remaining: 0, cooldown: next.cooldown }, force: 0, energy };
  if (next.remaining <= 0 && next.cooldown <= 1e-10 && request && (boost.energy <= 0 || energy > 0)) next.remaining = boost.duration;
  if (next.remaining <= 0) return { state: next, force: 0, energy };
  const activeTime = Math.min(dt, next.remaining, boost.energy > 0 ? energy / boost.energy : dt);
  const force = boost.force * activeTime / dt;
  next.remaining = Math.max(0, next.remaining - activeTime);
  energy = Math.max(0, energy - boost.energy * activeTime);
  if (next.remaining <= 1e-10 || (boost.energy > 0 && energy <= 0)) { next.remaining = 0; next.cooldown = boost.cooldown; }
  return { state: next, force, energy };
}
export function advanceAssemblyDrive(current: AssemblyDriveState, input: Intent, composition: Composition, surface?: SurfaceSampler): AssemblyDriveState {
  const dt = 1 / 120;
  const command = observe(current.vehicle, composition.profile, input, { surface }).command;
  const wheelSpeed = current.vehicle.wheelSpeeds.front * composition.profile.power.driveFront + current.vehicle.wheelSpeeds.rear * (1 - composition.profile.power.driveFront);
  const drivetrain = advanceDrivetrain(current.drivetrain, composition, wheelSpeed, command.drive, dt);
  const energy = Math.min(composition.resources.capacity, current.energy + composition.resources.rechargeRate * dt);
  const boostRequest = input.angle !== null && input.targetSpeed >= composition.profile.power.maxSpeed * 0.95 && Math.abs(wrap(input.angle - current.vehicle.theta)) < Math.PI / 3;
  const canDrive = composition.summary.canDrive && drivetrain.state.fuel > 0;
  const boost = canDrive ? advanceBoost(current.boost, composition, energy, boostRequest, dt)
    : { state: { remaining: 0, cooldown: current.boost.cooldown }, force: 0, energy };
  const vehicle = step(current.vehicle, input, composition.profile, dt, { surface,
    actuation: { ...command, drive: canDrive ? 1 : 0, steeringTarget: canDrive ? command.steeringTarget : current.vehicle.delta },
    driveForce: canDrive ? drivetrain.wheelForce : 0, boostForce: canDrive ? boost.force : 0 });
  return { vehicle, drivetrain: drivetrain.state, boost: boost.state, energy: boost.energy };
}
