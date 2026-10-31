import { derived, RULES } from "./config";
import type { PhysicsRules, PhysicalProfile } from "./config";
import { clamp } from "./math";

export function axleLoads(
  p: PhysicalProfile,
  previousPhysicalAcceleration: number,
  rules: PhysicsRules = RULES,
) {
  const d = derived(p, rules),
    total = p.mass * rules.gravity;
  const requestedTransfer =
    (p.mass * previousPhysicalAcceleration * p.geometry.heightCG) /
    p.geometry.wheelbase;
  const transfer = clamp(
    requestedTransfer,
    -d.rearStaticLoad,
    d.frontStaticLoad,
  );
  return {
    front: d.frontStaticLoad - transfer,
    rear: d.rearStaticLoad + transfer,
    total,
    transfer,
    limited: transfer !== requestedTransfer,
  };
}
