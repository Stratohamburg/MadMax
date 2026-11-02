import type { PhysicalProfile } from "./config";
import { derived } from "./config";
import { physicalFrom, type PhysicalState } from "./state";
import { clamp, dot } from "./math";
import { mechanicalEnergy } from "./physical";

export interface StaticContact { normal: { x: number; y: number }; point: { x: number; y: number }; depth: number }

/** 场景只提供几何接触，法向/切向冲量与能量记账由车辆物理核心完成。 */
export function resolveStaticContacts(s: PhysicalState, p: PhysicalProfile, contacts: readonly StaticContact[]) {
  let next = s;
  const inertia = derived(p).inertia;
  // 穿透修正只做一次，静止重叠也必须分离；不向速度注入能量。
  const position = { ...s.position };
  for (const c of contacts) {
    const applied = (position.x - s.position.x) * c.normal.x + (position.y - s.position.y) * c.normal.y;
    const correction = Math.max(0, c.depth - applied) + 1e-8;
    position.x += c.normal.x * correction; position.y += c.normal.y * correction;
  }
  const constraints = contacts.map(c => {
    const arm = { x: c.point.x - s.position.x, y: c.point.y - s.position.y };
    const speed = (s.worldVelocity.x - s.r * arm.y) * c.normal.x + (s.worldVelocity.y + s.r * arm.x) * c.normal.y;
    return { ...c, arm, target: speed < -p.contact.bounceThreshold ? -p.contact.restitution * speed : 0, jn: 0, jt: 0 };
  });
  for (let iteration = 0; iteration < 12; iteration++) {
    let changed = false;
    for (const c of constraints) {
      const arm = c.arm,
        cross = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.y - a.y * b.x,
        contactV = { x: next.worldVelocity.x - next.r * arm.y, y: next.worldVelocity.y + next.r * arm.x },
        n = c.normal, cn = cross(arm, n), vn = dot(contactV, n),
        totalN = Math.max(0, c.jn + (c.target - vn) / (1 / p.mass + (cn * cn) / inertia)),
        jn = totalN - c.jn, tangent = { x: -n.y, y: n.x },
        ct = cross(arm, tangent), vt = dot(contactV, tangent) + ((cn * ct) / inertia) * jn,
        totalT = clamp(c.jt - vt / (1 / p.mass + (ct * ct) / inertia), -p.contact.friction * totalN, p.contact.friction * totalN),
        jt = totalT - c.jt;
      c.jn = totalN; c.jt = totalT;
      if (Math.abs(jn) + Math.abs(jt) < 1e-14) continue;
      changed = true;
      next = physicalFrom({ ...next,
        worldVelocity: { x: next.worldVelocity.x + (jn * n.x + jt * tangent.x) / p.mass, y: next.worldVelocity.y + (jn * n.y + jt * tangent.y) / p.mass },
        r: next.r + (cn * jn + ct * jt) / inertia,
      });
    }
    if (!changed) break;
  }
  const loss = Math.max(0, mechanicalEnergy(s, p) - mechanicalEnergy(next, p));
  return physicalFrom({ ...next, position, energy: { ...next.energy, collisionDissipation: next.energy.collisionDissipation + loss } });
}
