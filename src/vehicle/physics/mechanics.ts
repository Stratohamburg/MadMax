import { clamp } from "./math";

/** 机械参数只含有效能力，不依赖装配、健康、模式或驾驶意图。 */
export interface EngineParameters {
  idleRpm: number;
  redlineRpm: number;
  maxPower: number;
  maxTorque: number;
  torqueCurve: readonly (readonly [number, number])[];
  fuelConsumption: number;
}
export interface GearboxParameters {
  ratios: readonly number[];
  finalDrive: number;
  shiftTime: number;
  efficiency: number;
  maxInputTorque: number;
}
export interface DrivetrainParameters {
  engine?: EngineParameters;
  gearbox?: GearboxParameters;
  wheelRadius: number;
}
export interface DrivetrainState {
  gear: number;
  targetGear: number;
  rpm: number;
  shiftRemaining: number;
  fuel: number;
}
export interface BoostParameters { force: number; duration: number; cooldown: number; energy: number }
export interface BoostState { remaining: number; cooldown: number }
export const NM_PER_GAME_TORQUE = 2500;

export function validateDrivetrain(p: DrivetrainParameters): void {
  if (!Number.isFinite(p.wheelRadius) || p.wheelRadius <= 0) throw new Error("drivetrain: 车轮半径非法");
  const e = p.engine, g = p.gearbox;
  if (e && (![e.idleRpm, e.redlineRpm, e.maxPower, e.maxTorque].every(v => Number.isFinite(v) && v > 0) ||
    e.idleRpm >= e.redlineRpm || !Number.isFinite(e.fuelConsumption) || e.fuelConsumption < 0 ||
    !e.torqueCurve.length || e.torqueCurve.some(([rpm, torque], i) => !Number.isFinite(rpm) || rpm < 0 ||
      !Number.isFinite(torque) || torque < 0 || (i > 0 && rpm <= e.torqueCurve[i - 1][0]))))
    throw new Error("drivetrain: 发动机参数非法");
  if (g && (!g.ratios.length || g.ratios.some(v => !Number.isFinite(v) || v <= 0) ||
    ![g.finalDrive, g.shiftTime, g.maxInputTorque, g.efficiency].every(v => Number.isFinite(v) && v > 0) || g.efficiency > 1))
    throw new Error("drivetrain: 变速箱参数非法");
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
function rpmForGear(p: DrivetrainParameters, wheelSpeed: number, gear: number): number {
  return Math.max(p.engine!.idleRpm, Math.abs(wheelSpeed) * p.gearbox!.ratios[gear - 1] * p.gearbox!.finalDrive * 30 / Math.PI);
}
/** 当前挡位全油门能力；不推进时间或触发换挡。 */
export function drivetrainCapacity(s: DrivetrainState, p: DrivetrainParameters, wheelSpeed: number) {
  const e = p.engine, g = p.gearbox;
  if (!e || !g || s.fuel <= 0 || s.shiftRemaining > 0) return { wheelForce: 0, torque: 0 };
  const rpm = rpmForGear(p, wheelSpeed, s.gear);
  if (rpm >= e.redlineRpm) return { wheelForce: 0, torque: 0 };
  const torque = Math.max(0, Math.min(e.maxTorque * torqueAtRpm(rpm, e.torqueCurve), 9550 * e.maxPower / rpm, g.maxInputTorque));
  return { torque, wheelForce: torque * g.ratios[s.gear - 1] * g.finalDrive * g.efficiency / (NM_PER_GAME_TORQUE * p.wheelRadius) };
}
export function advanceDrivetrain(s: DrivetrainState, p: DrivetrainParameters, wheelSpeed: number, throttle: number, dt: number) {
  if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(wheelSpeed) || !Number.isFinite(throttle) ||
    ![s.rpm, s.shiftRemaining, s.fuel].every(Number.isFinite) || s.fuel < 0 || s.shiftRemaining < 0)
    throw new Error("drivetrain: 非法状态、步长或输入");
  const next = { ...s }, e = p.engine, g = p.gearbox;
  if (!e || !g) return { state: next, wheelForce: 0, torque: 0, shifting: false };
  if (![s.gear, s.targetGear].every(gear => Number.isInteger(gear) && gear >= 1 && gear <= g.ratios.length))
    throw new Error("drivetrain: 挡位非法");
  throttle = clamp(throttle, 0, 1);
  const wheelRpm = rpmForGear(p, wheelSpeed, next.gear);
  next.rpm = clamp(wheelRpm, e.idleRpm, e.redlineRpm);
  if (next.shiftRemaining > 0) {
    next.shiftRemaining = Math.max(0, next.shiftRemaining - dt);
    if (next.shiftRemaining <= 1e-10) { next.shiftRemaining = 0; next.gear = next.targetGear; }
    next.rpm = clamp(rpmForGear(p, wheelSpeed, next.targetGear), e.idleRpm, e.redlineRpm);
    return { state: next, wheelForce: 0, torque: 0, shifting: true };
  }
  if (next.fuel <= 0) return { state: next, wheelForce: 0, torque: 0, shifting: false };
  if (wheelRpm >= e.redlineRpm * 0.86 && next.gear < g.ratios.length && throttle > 0) next.targetGear = next.gear + 1;
  else if (wheelRpm < e.redlineRpm * 0.35 && next.gear > 1 && rpmForGear(p, wheelSpeed, next.gear - 1) < e.redlineRpm * 0.8) next.targetGear = next.gear - 1;
  if (next.targetGear !== next.gear) {
    next.shiftRemaining = g.shiftTime;
    return { state: next, wheelForce: 0, torque: 0, shifting: true };
  }
  const capacity = drivetrainCapacity(next, p, wheelSpeed);
  const consumption = e.fuelConsumption * (0.1 + throttle * 0.9) * dt;
  const supply = consumption > next.fuel ? next.fuel / consumption : 1;
  next.fuel = Math.max(0, next.fuel - consumption);
  return { state: next, wheelForce: capacity.wheelForce * throttle * supply, torque: capacity.torque * throttle * supply, shifting: false };
}
export function advanceBoost(s: BoostState, boost: BoostParameters, energy: number, request: boolean, dt: number) {
  if (![s.remaining, s.cooldown, boost.force, boost.duration, boost.cooldown, boost.energy, energy, dt].every(Number.isFinite) ||
    Math.min(s.remaining, s.cooldown, boost.force, boost.duration, boost.cooldown, boost.energy, energy) < 0 || dt <= 0)
    throw new Error("boost: 非法状态、能力或步长");
  const next = { ...s };
  next.cooldown = Math.max(0, next.cooldown - dt);
  if (boost.force <= 0) return { state: { remaining: 0, cooldown: next.cooldown }, force: 0, energy };
  if (next.remaining <= 0 && next.cooldown <= 1e-10 && request && (boost.energy <= 0 || energy > 0)) next.remaining = boost.duration;
  if (next.remaining <= 0) return { state: next, force: 0, energy };
  const activeTime = Math.min(dt, next.remaining, boost.energy > 0 ? energy / boost.energy : dt);
  const force = boost.force * activeTime / dt;
  next.remaining = Math.max(0, next.remaining - activeTime);
  energy = Math.max(0, energy - boost.energy * activeTime);
  if (next.remaining <= 1e-10 || (boost.energy > 0 && energy <= 0)) { next.remaining = 0; next.cooldown = boost.cooldown; }
  return { state: next, force, energy };
}
