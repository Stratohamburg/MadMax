import type { Vec2, VehicleState } from '../vehicle/model';
import type { VehicleConfig } from '../vehicle/config';
import { stepVehicle } from '../vehicle/model';
import type { Intent } from '../vehicle/model';
import type { Rect, World } from './world';

interface Hit { t: number; normal: Vec2 }
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** 连续圆-矩形接触：矩形面和四个圆角分别求交，避免方形膨胀造成角落误挡。 */
function sweepRect(start: Vec2, delta: Vec2, radius: number, rect: Rect): Hit | null {
  let best: Hit | null = null;
  function accept(t: number, normal: Vec2): void {
    if (t >= -1e-10 && t <= 1 && dot(delta, normal) < -1e-14 && (!best || t < best.t)) best = { t: Math.max(0, t), normal };
  }
  for (const side of [-1, 1]) {
    if (delta.x !== 0) {
      const plane = (side < 0 ? rect.x : rect.x + rect.width) + side * radius;
      const t = (plane - start.x) / delta.x;
      const y = start.y + delta.y * t;
      if (y >= rect.y && y <= rect.y + rect.height) accept(t, { x: side, y: 0 });
    }
    if (delta.y !== 0) {
      const plane = (side < 0 ? rect.y : rect.y + rect.height) + side * radius;
      const t = (plane - start.y) / delta.y;
      const x = start.x + delta.x * t;
      if (x >= rect.x && x <= rect.x + rect.width) accept(t, { x: 0, y: side });
    }
  }
  const a = dot(delta, delta);
  if (a === 0) return best;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const corner = { x: sx < 0 ? rect.x : rect.x + rect.width, y: sy < 0 ? rect.y : rect.y + rect.height };
    const offset = { x: start.x - corner.x, y: start.y - corner.y };
    const b = 2 * dot(offset, delta);
    const c = dot(offset, offset) - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) continue;
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    const contact = { x: offset.x + delta.x * t, y: offset.y + delta.y * t };
    if (contact.x * sx >= -1e-10 && contact.y * sy >= -1e-10) {
      const length = Math.hypot(contact.x, contact.y);
      if (length > 0) accept(t, { x: contact.x / length, y: contact.y / length });
    }
  }
  return best;
}

function sweepBounds(start: Vec2, delta: Vec2, radius: number, bounds: Rect): Hit | null {
  let best: Hit | null = null;
  for (const axis of ['x', 'y'] as const) {
    if (delta[axis] === 0) continue;
    const low = bounds[axis] + radius;
    const high = bounds[axis] + (axis === 'x' ? bounds.width : bounds.height) - radius;
    const plane = delta[axis] < 0 ? low : high;
    const t = (plane - start[axis]) / delta[axis];
    if (t >= -1e-10 && t <= 1 && (!best || t < best.t)) {
      best = { t: Math.max(0, t), normal: axis === 'x' ? { x: delta.x < 0 ? 1 : -1, y: 0 } : { x: 0, y: delta.y < 0 ? 1 : -1 } };
    }
  }
  return best;
}

export function moveCircle(start: Vec2, delta: Vec2, radius: number, world: World): Vec2 & { collided: boolean } {
  const position = { ...start };
  let remaining = { ...delta };
  let collided = false;
  for (let contact = 0; contact < 6; contact++) {
    let hit = sweepBounds(position, remaining, radius, world.bounds);
    for (const obstacle of world.obstacles) {
      const candidate = sweepRect(position, remaining, radius, obstacle);
      if (candidate && (!hit || candidate.t < hit.t)) hit = candidate;
    }
    if (!hit) { position.x += remaining.x; position.y += remaining.y; break; }
    collided = true;
    position.x += remaining.x * hit.t; position.y += remaining.y * hit.t;
    remaining = { x: remaining.x * (1 - hit.t), y: remaining.y * (1 - hit.t) };
    const into = Math.min(0, dot(remaining, hit.normal));
    remaining.x -= into * hit.normal.x; remaining.y -= into * hit.normal.y;
    if (Math.hypot(remaining.x, remaining.y) < 1e-14) break;
  }
  return { ...position, collided };
}

export function stepInWorld(state: VehicleState, intent: Intent, config: VehicleConfig, dt: number, world: World): VehicleState {
  const candidate = stepVehicle(state, intent, config, dt);
  const contact = moveCircle(state, { x: candidate.x - state.x, y: candidate.y - state.y }, config.radius, world);
  if (!contact.collided) return candidate;
  const blocked = Math.hypot(contact.x - state.x, contact.y - state.y) < 1e-12;
  return { ...candidate, x: contact.x, y: contact.y, speed: 0,
    ...(blocked ? { heading: state.heading, motion: state.motion, turnSign: state.turnSign } : {}) };
}
