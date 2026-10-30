import type { VehicleProfile } from './config';
import { approach, clamp } from './math';
export function steeringLimit(speed: number, p: VehicleProfile): number {
  const z = speed / p.power.maxSpeed;
  return p.steering.maxAngle * (p.steering.highSpeedRatio + (1 - p.steering.highSpeedRatio) / (1 + p.steering.speedCurve * z * z));
}
export function advanceSteering(delta: number, target: number, speed: number, p: VehicleProfile, dt: number): number {
  const limit = steeringLimit(speed, p);
  // 速度改变时也经过执行器回到新行程，禁止瞬间截断旧转角。
  return approach(delta, clamp(target, -limit, limit), p.steering.response, p.steering.rate, dt);
}
