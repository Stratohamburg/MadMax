import type { PhysicalProfile } from "../vehicle/physics/config";
import { derived } from "../vehicle/physics/config";
import { geometry } from "../vehicle/physics/geometry";
import { mechanicalEnergy } from "../vehicle/physics/physical";
import { physicalFrom } from "../vehicle/physics/state";
import type { PhysicalState } from "../vehicle/physics/state";
import { dot, forward, right, clamp } from "../vehicle/physics/math";
import type { Vec2 } from "../vehicle/physics/math";
import type { World, Rect } from "./world";
interface Contact {
  normal: Vec2;
  point: Vec2;
  depth: number;
}
function overlapCenter(vertices: Vec2[], rect: Rect): Vec2 {
  let polygon = vertices;
  for (const [normal, offset] of [
    [{ x: 1, y: 0 }, rect.x],
    [{ x: -1, y: 0 }, -rect.x - rect.width],
    [{ x: 0, y: 1 }, rect.y],
    [{ x: 0, y: -1 }, -rect.y - rect.height],
  ] as [Vec2, number][]) {
    const clipped: Vec2[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length],
        da = dot(a, normal) - offset,
        db = dot(b, normal) - offset;
      if (da >= 0) clipped.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        clipped.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
      }
    }
    polygon = clipped;
  }
  return polygon.length
    ? {
        x: polygon.reduce((sum, v) => sum + v.x, 0) / polygon.length,
        y: polygon.reduce((sum, v) => sum + v.y, 0) / polygon.length,
      }
    : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
function contacts(
  s: PhysicalState,
  p: PhysicalProfile,
  world: World,
): Contact[] {
  const g = geometry(s, p),
    vertices = g.footprint,
    result: Contact[] = [];
  const bounds = world.bounds;
  const supportPoint = (normal: Vec2) => {
    const minimum = Math.min(...vertices.map((v) => dot(v, normal))),
      edge = vertices.filter((v) => dot(v, normal) < minimum + 1e-7);
    return {
      x: edge.reduce((sum, v) => sum + v.x, 0) / edge.length,
      y: edge.reduce((sum, v) => sum + v.y, 0) / edge.length,
    };
  };
  for (const [normal, offset] of [
    [{ x: 1, y: 0 }, bounds.x],
    [{ x: -1, y: 0 }, -bounds.x - bounds.width],
    [{ x: 0, y: 1 }, bounds.y],
    [{ x: 0, y: -1 }, -bounds.y - bounds.height],
  ] as [Vec2, number][]) {
    const point = supportPoint(normal),
      depth = offset - dot(point, normal);
    if (depth > 1e-10) result.push({ normal, point, depth });
  }
  for (const rect of world.obstacles) {
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ];
    let depth = Infinity,
      normal: Vec2 = { x: 0, y: 0 },
      separate = false;
    for (const axis of [
      forward(s.theta),
      right(s.theta),
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]) {
      const a = vertices.map((v) => dot(v, axis)),
        b = corners.map((v) => dot(v, axis)),
        negative = Math.max(...a) - Math.min(...b),
        positive = Math.max(...b) - Math.min(...a);
      if (negative <= 1e-10 || positive <= 1e-10) {
        separate = true;
        break;
      }
      if (Math.min(negative, positive) < depth) {
        depth = Math.min(negative, positive);
        normal = positive < negative ? axis : { x: -axis.x, y: -axis.y };
      }
    }
    if (!separate)
      result.push({ normal, depth, point: overlapCenter(vertices, rect) });
  }
  return result;
}
function resolve(
  s: PhysicalState,
  p: PhysicalProfile,
  world: World,
): PhysicalState {
  let next = s;
  const I = derived(p).inertia,
    start = mechanicalEnergy(s, p);
  for (let iteration = 0; iteration < 12; iteration++) {
    const hits = contacts(next, p, world);
    if (!hits.length) break;
    for (const c of hits) {
      const arm = {
          x: c.point.x - next.position.x,
          y: c.point.y - next.position.y,
        },
        cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x;
      const contactV = {
        x: next.worldVelocity.x - next.r * arm.y,
        y: next.worldVelocity.y + next.r * arm.x,
      };
      const n = c.normal,
        cn = cross(arm, n),
        vn = dot(contactV, n),
        jn = Math.max(0, -vn / (1 / p.mass + (cn * cn) / I));
      const tangent = { x: -n.y, y: n.x },
        ct = cross(arm, tangent),
        vt = dot(contactV, tangent) + ((cn * ct) / I) * jn;
      const jt = clamp(
        -vt / (1 / p.mass + (ct * ct) / I),
        -0.25 * jn,
        0.25 * jn,
      );
      next = physicalFrom({
        ...next,
        position: {
          x: next.position.x + n.x * (c.depth + 1e-8),
          y: next.position.y + n.y * (c.depth + 1e-8),
        },
        worldVelocity: {
          x: next.worldVelocity.x + (jn * n.x + jt * tangent.x) / p.mass,
          y: next.worldVelocity.y + (jn * n.y + jt * tangent.y) / p.mass,
        },
        r: next.r + (cn * jn + ct * jt) / I,
      });
    }
  }
  return physicalFrom({
    ...next,
    energy: {
      ...next.energy,
      collisionDissipation:
        next.energy.collisionDissipation + start - mechanicalEnergy(next, p),
    },
  });
}
function interpolate(
  a: PhysicalState,
  b: PhysicalState,
  t: number,
): PhysicalState {
  return physicalFrom({
    ...b,
    position: {
      x: a.position.x + (b.position.x - a.position.x) * t,
      y: a.position.y + (b.position.y - a.position.y) * t,
    },
    theta: a.theta + (b.theta - a.theta) * t,
  });
}
/** 连续采样+二分接触时刻；仅接触改变速度，完全不读取玩家意图。 */
export function sweepVehicle(
  a: PhysicalState,
  b: PhysicalState,
  p: PhysicalProfile,
  dt: number,
  world: World,
): PhysicalState {
  let from = a,
    to = b,
    remaining = dt;
  for (let collision = 0; collision < 12; collision++) {
    const distance =
      Math.hypot(
        to.position.x - from.position.x,
        to.position.y - from.position.y,
      ) +
      geometry(from, p).conservativeRadius * Math.abs(to.theta - from.theta);
    const feature = Math.max(
      0.002,
      Math.min(
        p.geometry.width,
        ...world.obstacles.flatMap((o) => [o.width, o.height]),
      ) * 0.2,
    );
    const steps = Math.max(1, Math.ceil(distance / feature));
    let low = 0,
      high: number | null = null;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (contacts(interpolate(from, to, t), p, world).length) {
        high = t;
        low = Math.max(0, (i - 1) / steps);
        break;
      }
    }
    if (high === null) return to;
    let hitFraction: number = high;
    for (let i = 0; i < 24; i++) {
      const mid: number = (low + hitFraction) / 2;
      if (contacts(interpolate(from, to, mid), p, world).length)
        hitFraction = mid;
      else low = mid;
    }
    const hit = resolve(interpolate(from, to, hitFraction), p, world);
    remaining *= 1 - hitFraction;
    from = hit;
    to = physicalFrom({
      ...hit,
      position: {
        x: hit.position.x + hit.worldVelocity.x * remaining,
        y: hit.position.y + hit.worldVelocity.y * remaining,
      },
      theta: hit.theta + hit.r * remaining,
    });
    if (remaining < 1e-10) return hit;
  }
  // 多接触未消除的几何误差继续做接触投影，动量不按模式或意图清空。
  return resolve(from, p, world);
}
