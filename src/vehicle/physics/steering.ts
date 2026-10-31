import type { PhysicalProfile } from "./config";
import { approach, clamp } from "./math";
export function advanceSteering(
  delta: number,
  target: number,
  speed: number,
  p: PhysicalProfile,
  dt: number,
): number {
  const limit = p.steering.maxAngle;
  // 机械行程、响应时间与角速度限制属于真实执行器。
  return approach(
    delta,
    clamp(target, -limit, limit),
    p.steering.response,
    p.steering.rate,
    dt,
  );
}
