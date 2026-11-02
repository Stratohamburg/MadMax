import { derived, type PhysicalProfile } from "./config";
import { geometry } from "./geometry";
import { clamp, dot, forward, right, type Vec2 } from "./math";
import { mechanicalEnergy } from "./physical";
import { physicalFrom, type PhysicalState } from "./state";
import type { BodyContact } from "./body-contact";

/** 两个车辆 OBB 的离散接触；共同接触点交换线动量和角动量。 */
export function resolveVehicleContact(a: PhysicalState, pa: PhysicalProfile, b: PhysicalState, pb: PhysicalProfile):
  { vehicle: PhysicalState; other: PhysicalState; contact: BodyContact | null } {
  const va = geometry(a, pa).footprint, vb = geometry(b, pb).footprint;
  let depth = Infinity, normal: Vec2 = { x: 0, y: 0 };
  for (const axis of [forward(a.theta), right(a.theta), forward(b.theta), right(b.theta)]) {
    const aa = va.map(v => dot(v, axis)), bb = vb.map(v => dot(v, axis));
    const positive = Math.max(...aa) - Math.min(...bb), negative = Math.max(...bb) - Math.min(...aa);
    if (positive < 0 || negative < 0) return { vehicle: a, other: b, contact: null };
    if (Math.min(positive, negative) < depth) {
      depth = Math.min(positive, negative);
      normal = positive < negative ? axis : { x: -axis.x, y: -axis.y };
    }
  }
  const tangent = { x: -normal.y, y: normal.x };
  const an = Math.max(...va.map(v => dot(v, normal))), bn = Math.min(...vb.map(v => dot(v, normal)));
  const edgeA = va.filter(v => dot(v, normal) >= an - 1e-7), edgeB = vb.filter(v => dot(v, normal) <= bn + 1e-7);
  const at = edgeA.map(v => dot(v, tangent)), bt = edgeB.map(v => dot(v, tangent));
  const t = (Math.max(Math.min(...at), Math.min(...bt)) + Math.min(Math.max(...at), Math.max(...bt))) / 2;
  const n = (an + bn) / 2, point = { x: normal.x * n + tangent.x * t, y: normal.y * n + tangent.y * t };
  const armA = { x: point.x - a.position.x, y: point.y - a.position.y }, armB = { x: point.x - b.position.x, y: point.y - b.position.y };
  const cross = (v: Vec2, w: Vec2) => v.x * w.y - v.y * w.x;
  const ia = derived(pa).inertia, ib = derived(pb).inertia, inv = 1 / pa.mass + 1 / pb.mass;
  const cnA = cross(armA, normal), cnB = cross(armB, normal), ctA = cross(armA, tangent), ctB = cross(armB, tangent);
  const rv = { x: b.worldVelocity.x - b.r * armB.y - a.worldVelocity.x + a.r * armA.y,
    y: b.worldVelocity.y + b.r * armB.x - a.worldVelocity.y - a.r * armA.x };
  const vn = dot(rv, normal), restitution = -vn > Math.max(pa.contact.bounceThreshold, pb.contact.bounceThreshold) ? Math.min(pa.contact.restitution, pb.contact.restitution) : 0;
  const jn = Math.max(0, -(1 + restitution) * vn / (inv + cnA ** 2 / ia + cnB ** 2 / ib));
  const vt = dot(rv, tangent) + jn * (cnA * ctA / ia + cnB * ctB / ib), friction = Math.sqrt(pa.contact.friction * pb.contact.friction);
  const jt = clamp(-vt / (inv + ctA ** 2 / ia + ctB ** 2 / ib), -friction * jn, friction * jn);
  const impulse = { x: normal.x * jn + tangent.x * jt, y: normal.y * jn + tangent.y * jt };
  const update = (s: PhysicalState, p: PhysicalProfile, inertia: number, arm: Vec2, sign: number) => physicalFrom({ ...s,
    position: { x: s.position.x + sign * normal.x * depth / (p.mass * inv), y: s.position.y + sign * normal.y * depth / (p.mass * inv) },
    worldVelocity: { x: s.worldVelocity.x + sign * impulse.x / p.mass, y: s.worldVelocity.y + sign * impulse.y / p.mass },
    r: s.r + sign * cross(arm, impulse) / inertia });
  const na = update(a, pa, ia, armA, -1), nb = update(b, pb, ib, armB, 1);
  const da = mechanicalEnergy(na, pa) - mechanicalEnergy(a, pa), db = mechanicalEnergy(nb, pb) - mechanicalEnergy(b, pb);
  const loss = Math.max(0, -da - db), share = loss / 2;
  const ledger = (s: PhysicalState, delta: number) => physicalFrom({ ...s, energy: { ...s.energy,
    collisionDissipation: s.energy.collisionDissipation + share, externalWork: s.energy.externalWork + delta + share } });
  return { vehicle: ledger(na, da), other: ledger(nb, db), contact: { point, normal, closingSpeed: Math.max(0, -vn), impulse: jn, dissipation: loss } };
}
