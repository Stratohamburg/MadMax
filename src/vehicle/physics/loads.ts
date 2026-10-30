import { derived, RULES } from './config';
import type { PhysicsRules, VehicleProfile } from './config';
import { clamp } from './math';

export function axleLoads(p: VehicleProfile, previousPhysicalAcceleration: number, rules: PhysicsRules = RULES) {
  const d = derived(p, rules), total = p.mass * rules.gravity;
  const requestedTransfer = p.mass * previousPhysicalAcceleration * p.geometry.heightCG / p.geometry.wheelbase;
  const transfer = clamp(requestedTransfer, -d.rearStaticLoad, d.frontStaticLoad);
  return { front: d.frontStaticLoad - transfer, rear: d.rearStaticLoad + transfer,
    total, transfer, limited: transfer !== requestedTransfer };
}
/** 限制物理纵向请求，避免下一子步出现负轴载荷。游戏代价从不调用这里。 */
export function limitLongAcceleration(p: VehicleProfile, acceleration: number, rules = RULES): number {
  if (p.geometry.heightCG === 0) return acceleration;
  const factor = rules.gravity * p.geometry.wheelbase / p.geometry.heightCG;
  return clamp(acceleration, -factor * (1 - p.geometry.cgFromRear), factor * p.geometry.cgFromRear);
}
