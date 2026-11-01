import type { PhysicalProfile } from "./config";
import { forward, right } from "./math";
import { mechanicalEnergy } from "./physical";
import { physicalFrom } from "./state";
import type { PhysicalState } from "./state";

/** 同一车体装卸质量，无额外冲量。新质心是同一刚体上的另一个参考点。 */
export function reconfigurePhysical(s: PhysicalState, before: PhysicalProfile, after: PhysicalProfile): PhysicalState {
  for (const key of ["wheelbase", "width", "track", "frontOverhang", "rearOverhang"] as const)
    if (before.geometry[key] !== after.geometry[key]) throw new Error("reconfigure: 更换车体须显式执行生命周期事件");
  const f = forward(s.theta), side = right(s.theta);
  const along = (after.geometry.cgFromRear - before.geometry.cgFromRear) * before.geometry.wheelbase;
  const lateral = after.geometry.cgLateral - before.geometry.cgLateral;
  const dx = f.x * along + side.x * lateral, dy = f.y * along + side.y * lateral;
  const next = physicalFrom({ ...s,
    position: { x: s.position.x + dx, y: s.position.y + dy },
    worldVelocity: { x: s.worldVelocity.x - s.r * dy, y: s.worldVelocity.y + s.r * dx },
  });
  const exchanged = mechanicalEnergy(next, after) - mechanicalEnergy(s, before);
  return physicalFrom({ ...next, energy: { ...s.energy, configurationWork: s.energy.configurationWork + exchanged } });
}
