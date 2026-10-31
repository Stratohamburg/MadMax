import { availableDriveForce } from "./powertrain";
import { derived, RULES } from "./config";
import type { VehicleProfile } from "./config";
import { angleError, approach, clamp, smooth } from "./math";
import type { Intent, VehicleState, Actuation } from "./state";
export function steadyReference(
  speed: number,
  rate: number,
  p: VehicleProfile,
  cf: number,
  cr: number,
) {
  const { lf, lr } = derived(p),
    u = Math.max(speed, 1),
    correction =
      ((p.mass * speed * rate) / p.geometry.wheelbase) *
      (lr / Math.max(cf, 0.1) - lf / Math.max(cr, 0.1));
  return {
    beta:
      (lr * rate) / u -
      (((p.mass * lf) / p.geometry.wheelbase) * speed * rate) /
        Math.max(cr, 0.1),
    delta: Math.atan((p.geometry.wheelbase * rate) / u) + correction,
    correction,
  };
}
/** 只限制控制器的请求；不得作为实际姿态或速度的边界。 */
export function steeringEnvelope(
  speed: number,
  p: VehicleProfile,
  grip: number,
  blend = 0,
): number {
  const reserve = p.assist.gripReserve + blend * 0.85;
  return Math.min(
    p.steering.maxAngle,
    Math.atan(
      (p.geometry.wheelbase * Math.max(0.05, grip) * RULES.gravity * reserve) /
        Math.max(speed * speed, 0.16),
    ),
  );
}
export function routeAssist(
  s: VehicleState,
  input: Intent,
  p: VehicleProfile,
  grip: number,
  cf: number,
  cr: number,
  dt: number,
  loads = {
    front: p.mass * RULES.gravity * p.geometry.cgFromRear,
    rear: p.mass * RULES.gravity * (1 - p.geometry.cgFromRear),
  },
) {
  const h = approach(
    s.h,
    input.drift ? 1 : 0,
    input.drift ? p.drift.enterTime : p.drift.exitTime,
    10,
    dt,
  );
  const routeError =
    input.angle === null
      ? 0
      : angleError(
          input.angle,
          s.speed > 0.3 ? s.motion : s.theta,
          s.assist.turnSign,
        );
  const headingError =
    input.angle === null
      ? 0
      : angleError(input.angle, s.theta, s.assist.turnSign);
  const cap = Math.min(
    p.assist.maxRouteRate,
    (Math.max(0.05, grip) * RULES.gravity * (0.5 + 0.55 * h)) /
      Math.max(s.speed, 0.6),
  );
  const change =
    input.angle === null || s.assist.lastTarget === null
      ? 0
      : angleError(input.angle, s.assist.lastTarget, s.assist.turnSign) / dt;
  const targetRate = approach(
    s.assist.targetRate,
    Math.abs(change) <= p.assist.maxRouteRate * 2 ? change : 0,
    p.assist.referenceTime,
    10,
    dt,
  );
  const desiredRate =
    input.angle === null
      ? 0
      : clamp(p.assist.routeGain * routeError + h * targetRate, -cap, cap);
  const routeRate = approach(
    s.assist.routeRate,
    desiredRate,
    p.assist.referenceTime,
    10,
    dt,
  );
  const normal = steadyReference(s.speed, routeRate, p, cf, cr);
  const extra =
    -Math.sign(routeRate) *
    p.drift.maxBeta *
    h *
    smooth(Math.abs(routeRate) / p.drift.demandRate) *
    smooth(
      (s.speed - p.drift.minSpeed) / (p.drift.fullSpeed - p.drift.minSpeed),
    );
  const betaRef = approach(
    s.assist.betaRef,
    normal.beta + extra,
    p.drift.exitTime,
    p.drift.betaRate,
    dt,
  );
  const rRef = routeRate,
    ff = steadyReference(s.speed, rRef, p, cf, cr).delta;
  const low = smooth(s.speed / 1.2);
  const raw =
    low *
      (ff +
        p.assist.betaGain * (s.beta - betaRef) -
        p.assist.yawGain * (s.r - rRef)) +
    (1 - low) * headingError;
  const limit = steeringEnvelope(s.speed, p, grip, h),
    target = clamp(raw, -limit, limit);
  const error = clamp(input.targetSpeed, 0, p.power.maxSpeed) - s.speed;
  const acceleration = error / 0.55;
  const available = availableDriveForce(s.speed, p);
  const resistance =
    p.mass * RULES.gravity * p.power.rolling + p.power.aero * s.speed * s.speed;
  let drive = clamp((p.mass * acceleration + resistance) / available, 0, 1),
    brake = clamp((-p.mass * acceleration) / p.power.brakeForce, 0, 1);
  // 普通牵引保留横向余量；漂移允许轮胎进入组合滑移区。
  const traction =
    Math.min(
      p.power.driveFront > 0
        ? loads.front / Math.max(p.power.driveFront, 0.01)
        : Infinity,
      p.power.driveFront < 1
        ? loads.rear / Math.max(1 - p.power.driveFront, 0.01)
        : Infinity,
    ) * grip;
  const lateralDemand = clamp(
    (s.speed * Math.abs(rRef)) / Math.max(0.05, grip * RULES.gravity),
    0,
    0.95,
  );
  const tractionReserve = Math.sqrt(1 - lateralDemand * lateralDemand);
  drive = Math.min(
    drive,
    (traction * (tractionReserve + 0.15 * h)) / available,
  );
  if (input.angle === null && input.targetSpeed === 0) {
    drive = 0;
    brake = clamp(s.speed / 0.8 + Math.abs(s.r) * 0.1, 0, 1);
  }
  const driftDemand = Math.min(
    1,
    Math.max(Math.abs(routeRate), Math.abs(targetRate)) / p.drift.demandRate,
  );
  const driftSpeed = smooth(
    (s.speed - p.drift.minSpeed) / (p.drift.fullSpeed - p.drift.minSpeed),
  );
  const rearBrake =
    h *
    driftDemand *
    driftSpeed *
    clamp(
      p.drift.brakeBase +
        p.drift.brakeGain * Math.sign(routeRate) * (s.beta - betaRef) +
        0.15 * Math.max(0, (h - s.h) / dt),
      0,
      1,
    );
  const command: Actuation = {
    steeringTarget: target,
    drive,
    brake,
    rearBrake,
  };
  return {
    target,
    routeError,
    routeRate,
    betaRef,
    extraBeta: extra,
    rRef,
    feedForward: ff,
    steeringLimit: limit,
    command,
    saturated: Math.abs(raw) > limit || drive >= 0.999 || brake >= 0.999,
    history: {
      ...s.assist,
      driftBlend: h,
      betaRef,
      routeRate,
      targetRate,
      lastTarget: input.angle,
      turnSign:
        Math.abs(routeError) > 1e-10
          ? Math.sign(routeError)
          : s.assist.turnSign,
    },
  };
}
