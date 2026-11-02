import { derived } from "./config";
import type { PhysicalProfile } from "./config";
import { clamp, dot, forward, right } from "./math";
import type { Vec2 } from "./math";
import { mechanicalEnergy } from "./physical";
import { physicalFrom } from "./state";
import type { PhysicalState } from "./state";

/** mass=0 表示固定在世界中的静止物体（逆质量为零），并非无质量运动粒子。 */
export interface CircleBody { position: Vec2; velocity: Vec2; mass: number; radius: number }
export interface BodyContact { point: Vec2; normal: Vec2; closingSpeed: number; impulse: number; dissipation: number }
/** 车身 OBB 与圆形刚体，无恢复法向接触。控制模式和伤害不进入此模块。 */
export function resolveBodyContact(s: PhysicalState, p: PhysicalProfile, other: CircleBody): {
  vehicle: PhysicalState; other: CircleBody; contact: BodyContact | null;
} {
  if (![other.position.x, other.position.y, other.velocity.x, other.velocity.y, other.mass, other.radius].every(Number.isFinite) ||
    other.mass < 0 || other.radius <= 0) throw new Error("body contact: 实体参数非法");
  if (other.mass === 0 && (other.velocity.x !== 0 || other.velocity.y !== 0)) throw new Error("body contact: 固定物体速度须为零");
  const f = forward(s.theta), side = right(s.theta), d = derived(p);
  const relative = { x: other.position.x - s.position.x, y: other.position.y - s.position.y };
  const x = dot(relative, f), y = dot(relative, side);
  const minX = -d.lr - p.geometry.rearOverhang, maxX = d.lf + p.geometry.frontOverhang;
  const minY = -p.geometry.width / 2 - p.geometry.cgLateral, maxY = p.geometry.width / 2 - p.geometry.cgLateral;
  let px = clamp(x, minX, maxX), py = clamp(y, minY, maxY);
  let nx = x - px, ny = y - py, distance = Math.hypot(nx, ny), penetration: number;
  if (distance > other.radius) return { vehicle: s, other, contact: null };
  if (distance > 1e-12) { nx /= distance; ny /= distance; penetration = other.radius - distance; }
  else {
    const faces = [
      { depth: maxX - x, nx: 1, ny: 0, px: maxX, py: y },
      { depth: x - minX, nx: -1, ny: 0, px: minX, py: y },
      { depth: maxY - y, nx: 0, ny: 1, px: x, py: maxY },
      { depth: y - minY, nx: 0, ny: -1, px: x, py: minY },
    ].sort((a, b) => a.depth - b.depth);
    ({ nx, ny, px, py } = faces[0]); penetration = other.radius + faces[0].depth;
  }
  const normal = { x: f.x * nx + side.x * ny, y: f.y * nx + side.y * ny };
  const arm = { x: f.x * px + side.x * py, y: f.y * px + side.y * py };
  const point = { x: s.position.x + arm.x, y: s.position.y + arm.y };
  const cross = arm.x * normal.y - arm.y * normal.x;
  const relativeNormal = dot({ x: other.velocity.x - s.worldVelocity.x + s.r * arm.y,
    y: other.velocity.y - s.worldVelocity.y - s.r * arm.x }, normal);
  const invA = 1 / p.mass, invB = other.mass === 0 ? 0 : 1 / other.mass, inverse = invA + invB;
  const restitution = -relativeNormal > p.contact.bounceThreshold ? p.contact.restitution : 0;
  const impulse = Math.max(0, -relativeNormal) * (1 + restitution) / (inverse + cross * cross / d.inertia);
  const tangent = { x: -normal.y, y: normal.x }, ct = arm.x * tangent.y - arm.y * tangent.x;
  const relativeTangent = (other.velocity.x - s.worldVelocity.x + s.r * arm.y) * tangent.x +
    (other.velocity.y - s.worldVelocity.y - s.r * arm.x) * tangent.y + cross * ct / d.inertia * impulse;
  const tangentImpulse = clamp(-relativeTangent / (inverse + ct * ct / d.inertia), -p.contact.friction * impulse, p.contact.friction * impulse);
  const nextOther: CircleBody = { ...other,
    position: { x: other.position.x + normal.x * penetration * invB / inverse, y: other.position.y + normal.y * penetration * invB / inverse },
    velocity: { x: other.velocity.x + normal.x * impulse * invB + tangent.x * tangentImpulse * invB,
      y: other.velocity.y + normal.y * impulse * invB + tangent.y * tangentImpulse * invB } };
  const next = physicalFrom({ ...s,
    position: { x: s.position.x - normal.x * penetration * invA / inverse, y: s.position.y - normal.y * penetration * invA / inverse },
    worldVelocity: { x: s.worldVelocity.x - normal.x * impulse * invA - tangent.x * tangentImpulse * invA,
      y: s.worldVelocity.y - normal.y * impulse * invA - tangent.y * tangentImpulse * invA },
    r: s.r - (impulse * cross + tangentImpulse * ct) / d.inertia });
  const otherEnergy = (body: CircleBody) => 0.5 * body.mass * (body.velocity.x ** 2 + body.velocity.y ** 2);
  const exchange = otherEnergy(other) - otherEnergy(nextOther);
  const dissipation = Math.max(0, mechanicalEnergy(s, p) + otherEnergy(other) - mechanicalEnergy(next, p) - otherEnergy(nextOther));
  return { vehicle: physicalFrom({ ...next, energy: { ...s.energy,
    externalWork: s.energy.externalWork + exchange, collisionDissipation: s.energy.collisionDissipation + dissipation } }),
    other: nextOther, contact: { point, normal, impulse, closingSpeed: Math.max(0, -relativeNormal), dissipation } };
}
