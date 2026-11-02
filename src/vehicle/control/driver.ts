import { derived, RULES } from "../physics/config";
import type { VehicleProfile } from "../physics/config";
import { physicalObservation } from "../physics/physical";
import { dryHard } from "../physics/surfaces";
import type { SurfaceSampler } from "../physics/surfaces";
import type { Intent, VehicleState } from "../physics/state";
import type { DrivetrainParameters, DrivetrainState } from "../physics/mechanics";
import { rpmForGear } from "../physics/mechanics";
import { wrap } from "../physics/math";
import { routeAssist } from "./route";

/** 纯控制计算，返回下一控制历史；调用方只在控制步提交一次。 */
export function controlVehicle(s: VehicleState, input: Intent, p: VehicleProfile,
  dt = RULES.substep, surface: SurfaceSampler = dryHard, driveCapacity?: number) {
  if (!Number.isFinite(input.targetSpeed) || (input.angle !== null && !Number.isFinite(input.angle)) || !Number.isFinite(dt) || !(dt > 0) ||
    (input.handbrake !== undefined && typeof input.handbrake !== "boolean"))
    throw new Error("intent: 速度、方向和控制步长必须有限");
  const o = physicalObservation(s, p, surface), d = derived(p);
  const grip = Math.min(o.front.capY / d.frontStaticLoad, o.rear.capY / d.rearStaticLoad);
  const route = routeAssist(s, input, p, grip, o.front.stiffness, o.rear.stiffness, dt, o.loads, driveCapacity);
  return { ...route, boost: input.boost ?? (input.angle !== null &&
    input.targetSpeed >= p.power.maxSpeed * p.controller.boostSpeedFraction &&
    Math.abs(wrap(input.angle - s.theta)) < p.controller.boostAlignment) };
}

/** 自动变速策略属于驾驶控制，手动/AI 可请求同一机械执行器。 */
export function automaticGear(s: DrivetrainState, p: DrivetrainParameters, wheelSpeed: number,
  throttle: number, policy: VehicleProfile["controller"]): number {
  if (!p.engine || !p.gearbox || s.shiftRemaining > 0 || s.fuel <= 0) return s.targetGear;
  const rpm = rpmForGear(p, wheelSpeed, s.gear), redline = p.engine.redlineRpm;
  if (rpm >= redline * policy.shiftUpFraction && s.gear < p.gearbox.ratios.length && throttle > 0) return s.gear + 1;
  if (rpm < redline * policy.shiftDownFraction && s.gear > 1 &&
    rpmForGear(p, wheelSpeed, s.gear - 1) < redline * policy.downshiftLimit) return s.gear - 1;
  return s.gear;
}
