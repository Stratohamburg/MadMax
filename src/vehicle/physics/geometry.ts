import { derived } from './config';
import type { VehicleProfile } from './config';
import { add, forward, right, scale } from './math';
import type { Vec2 } from './math';
import type { VehicleState } from './state';

export function ackermann(delta: number, p: VehicleProfile): { left: number; right: number } {
  if (Math.abs(delta) < 1e-12) return { left: 0, right: 0 };
  const { wheelbase: L, track } = p.geometry;
  const radius = Math.abs(L / Math.tan(delta)), sign = Math.sign(delta);
  const inner = sign * Math.atan(L / (radius - track / 2)), outer = sign * Math.atan(L / (radius + track / 2));
  return sign > 0 ? { left: outer, right: inner } : { left: inner, right: outer };
}
export function geometry(s: Pick<VehicleState, 'position' | 'theta' | 'delta'>, p: VehicleProfile) {
  const { lf, lr, bodyLength } = derived(p), f = forward(s.theta), side = right(s.theta);
  const point = (along: number, lateral = 0): Vec2 => add(s.position, add(scale(f, along), scale(side, lateral)));
  const front = lf + p.geometry.frontOverhang, rear = -lr - p.geometry.rearOverhang;
  const half = p.geometry.width / 2, track = p.geometry.track / 2;
  const footprint = [point(front, -half), point(front, half), point(rear, half), point(rear, -half)];
  return { frontAxle: point(lf), rearAxle: point(-lr),
    wheels: { frontLeft: point(lf, -track), frontRight: point(lf, track), rearLeft: point(-lr, -track), rearRight: point(-lr, track) },
    frontBoundary: point(front), rearBoundary: point(rear), footprint, bodyLength,
    conservativeRadius: Math.hypot(Math.max(front, -rear), half),
    aabb: { minX: Math.min(...footprint.map(v => v.x)), maxX: Math.max(...footprint.map(v => v.x)), minY: Math.min(...footprint.map(v => v.y)), maxY: Math.max(...footprint.map(v => v.y)) },
    wheelAngles: ackermann(s.delta, p) };
}
export function kinematic(speed: number, delta: number, p: VehicleProfile) {
  const { lr } = derived(p), L = p.geometry.wheelbase;
  const beta = Math.atan(lr / L * Math.tan(delta));
  return { beta, r: speed * Math.cos(beta) / L * Math.tan(delta), rearRadius: delta === 0 ? Infinity : L / Math.tan(delta), frontRadius: delta === 0 ? Infinity : L / Math.sin(delta) };
}
/** 几何验证专用：解析圆弧，只接受一致的运动学状态，生产积分不调用此入口。 */
export function advanceKinematic(position: Vec2, theta: number, speed: number, delta: number, p: VehicleProfile, dt: number) {
  const k = kinematic(speed, delta, p), angle = theta + k.beta;
  const displacement = Math.abs(k.r) < 1e-12 ? scale(forward(angle), speed * dt) : {
    x: speed / k.r * (Math.sin(angle + k.r * dt) - Math.sin(angle)),
    y: speed / k.r * (-Math.cos(angle + k.r * dt) + Math.cos(angle)),
  };
  return { position: add(position, displacement), theta: theta + k.r * dt, ...k };
}
