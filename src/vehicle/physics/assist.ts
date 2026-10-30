import { derived, RULES } from './config';
import type { VehicleProfile } from './config';
import { angleError, approach, clamp, smooth } from './math';
import { steeringLimit } from './steering';
import type { Intent, VehicleState } from './state';

export function steadyReference(speed: number, routeRate: number, p: VehicleProfile, frontStiffness: number, rearStiffness: number) {
  const { lf, lr } = derived(p), u = Math.max(speed, RULES.lowSpeedEnd);
  const beta = lr * routeRate / u - p.mass * lf / p.geometry.wheelbase * speed * routeRate / Math.max(rearStiffness, 0.1);
  const correction = p.mass * speed * routeRate / p.geometry.wheelbase * (lr / Math.max(frontStiffness, 0.1) - lf / Math.max(rearStiffness, 0.1));
  return { beta, delta: Math.atan(p.geometry.wheelbase * routeRate / u) + correction, correction };
}
export function routeAssist(s: VehicleState, input: Intent, p: VehicleProfile, grip: number, frontStiffness: number, rearStiffness: number, dt: number) {
  const error = input.angle === null ? 0 : angleError(input.angle, s.motion, s.assist.turnSign);
  const predictedError = error - (s.r - s.assist.targetRate) * p.assist.prediction;
  const soft = smooth((Math.abs(s.beta) - RULES.softSlip * 0.75) / (RULES.hardSlip - RULES.softSlip * 0.75));
  const cap = Math.min(p.assist.maxRouteRate, grip * RULES.gravity * p.assist.gripReserve / Math.max(s.speed, 0.6)) * (1 - 0.8 * soft);
  const desiredRate = input.angle === null ? 0 : clamp(s.assist.targetRate + p.assist.routeGain * predictedError, -cap, cap);
  const routeRate = approach(s.assist.routeRate, desiredRate, p.assist.referenceTime, 10, dt);
  const normal = steadyReference(s.speed, routeRate, p, frontStiffness, rearStiffness / Math.max(0.1, 1 + s.h * (p.drift.rearStiffness - 1)));
  const drift = steadyReference(s.speed, routeRate, p, frontStiffness, rearStiffness);
  const speedEnvelope = smooth((s.speed - p.drift.minSpeed) / (p.drift.fullSpeed - p.drift.minSpeed));
  const demand = smooth(Math.abs(routeRate) / p.drift.demandRate);
  const extra = clamp(drift.beta - normal.beta, -p.drift.maxBeta, p.drift.maxBeta) * speedEnvelope * demand;
  const desiredBeta = input.angle === null ? 0 : clamp(normal.beta + extra, -RULES.softSlip * 0.75, RULES.softSlip * 0.75);
  const betaRef = approach(s.assist.betaRef, desiredBeta, p.drift.exitTime, p.drift.betaRate, dt);
  const betaDotRef = clamp((betaRef - s.assist.betaRef) / dt, -p.drift.betaRate, p.drift.betaRate);
  const rRef = routeRate - betaDotRef;
  const ff = steadyReference(s.speed, rRef, p, frontStiffness, rearStiffness).delta;
  const schedule = clamp(s.speed / 3, 0.2, 1) * clamp(grip, 0.4, 1.3);
  const raw = ff + p.assist.betaGain * schedule * (s.beta - betaRef) - p.assist.yawGain * (s.r - rRef);
  const limit = steeringLimit(s.speed, p);
  return { target: clamp(raw, -limit, limit), routeError: error, routeRate, betaRef, extraBeta: extra, rRef,
    feedForward: ff, softStability: soft,
    history: { ...s.assist, betaRef, routeRate, turnSign: Math.abs(error) > 1e-12 ? Math.sign(error) : s.assist.turnSign } };
}
