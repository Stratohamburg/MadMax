import { sweepVehicle } from "./contacts";
import type { Vec2, PhysicsState, Intent } from "../vehicle/model";
import { isPhysicsState, stepPhysicsVehicle } from "../vehicle/model";
import { stateFrom } from "../vehicle/physics/state";
import type { VehicleProfile } from "../vehicle/physics/config";
import type { Rect, World } from "./world";
import type { VehicleConfig } from "../vehicle/config";
import type { LegacyVehicleState } from "../vehicle/legacy-model";
import { stepVehicle as stepLegacyVehicle } from "../vehicle/legacy-model";

interface Hit {
  t: number;
  normal: Vec2;
}
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** Continuous circle-rectangle contact, retained as the broad-phase helper. */
function sweepRect(
  start: Vec2,
  delta: Vec2,
  radius: number,
  rect: Rect,
): Hit | null {
  let best: Hit | null = null;
  function accept(t: number, normal: Vec2): void {
    if (
      t >= -1e-10 &&
      t <= 1 &&
      dot(delta, normal) < -1e-14 &&
      (!best || t < best.t)
    )
      best = { t: Math.max(0, t), normal };
  }
  for (const side of [-1, 1]) {
    if (delta.x !== 0) {
      const plane = (side < 0 ? rect.x : rect.x + rect.width) + side * radius;
      const t = (plane - start.x) / delta.x;
      const y = start.y + delta.y * t;
      if (y >= rect.y && y <= rect.y + rect.height)
        accept(t, { x: side, y: 0 });
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
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const corner = {
        x: sx < 0 ? rect.x : rect.x + rect.width,
        y: sy < 0 ? rect.y : rect.y + rect.height,
      };
      const offset = { x: start.x - corner.x, y: start.y - corner.y };
      const b = 2 * dot(offset, delta);
      const c = dot(offset, offset) - radius * radius;
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) continue;
      const t = (-b - Math.sqrt(discriminant)) / (2 * a);
      const contact = { x: offset.x + delta.x * t, y: offset.y + delta.y * t };
      if (contact.x * sx >= -1e-10 && contact.y * sy >= -1e-10) {
        const length = Math.hypot(contact.x, contact.y);
        if (length > 0)
          accept(t, { x: contact.x / length, y: contact.y / length });
      }
    }
  return best;
}

function sweepBounds(
  start: Vec2,
  delta: Vec2,
  radius: number,
  bounds: Rect,
): Hit | null {
  let best: Hit | null = null;
  for (const axis of ["x", "y"] as const) {
    if (delta[axis] === 0) continue;
    const low = bounds[axis] + radius;
    const high =
      bounds[axis] + (axis === "x" ? bounds.width : bounds.height) - radius;
    const plane = delta[axis] < 0 ? low : high;
    const t = (plane - start[axis]) / delta[axis];
    if (t >= -1e-10 && t <= 1 && (!best || t < best.t)) {
      best = {
        t: Math.max(0, t),
        normal:
          axis === "x"
            ? { x: delta.x < 0 ? 1 : -1, y: 0 }
            : { x: 0, y: delta.y < 0 ? 1 : -1 },
      };
    }
  }
  return best;
}

function initiallyOverlapping(
  start: Vec2,
  delta: Vec2,
  radius: number,
  world: World,
): boolean {
  const insideBounds =
    start.x >= world.bounds.x + radius - 1e-9 &&
    start.x <= world.bounds.x + world.bounds.width - radius + 1e-9 &&
    start.y >= world.bounds.y + radius - 1e-9 &&
    start.y <= world.bounds.y + world.bounds.height - radius + 1e-9;
  if (!insideBounds) return true;
  for (const rect of world.obstacles) {
    // A point on the conservative circle boundary may still move tangentially;
    // only a stationary candidate uses the full-radius occupancy check.
    if (
      Math.hypot(delta.x, delta.y) > 1e-12 &&
      !(
        start.x > rect.x &&
        start.x < rect.x + rect.width &&
        start.y > rect.y &&
        start.y < rect.y + rect.height
      )
    )
      continue;
    const x = Math.max(rect.x, Math.min(start.x, rect.x + rect.width));
    const y = Math.max(rect.y, Math.min(start.y, rect.y + rect.height));
    if (Math.hypot(start.x - x, start.y - y) < radius - 1e-9) return true;
  }
  return false;
}

export function moveCircle(
  start: Vec2,
  delta: Vec2,
  radius: number,
  world: World,
): Vec2 & { collided: boolean; normal?: Vec2 } {
  const position = { ...start };
  let remaining = { ...delta };
  let collided = false;
  if (initiallyOverlapping(position, remaining, radius, world))
    return { ...position, collided: true };
  let lastNormal: Vec2 | undefined;
  for (let contact = 0; contact < 6; contact++) {
    let hit = sweepBounds(position, remaining, radius, world.bounds);
    for (const obstacle of world.obstacles) {
      const candidate = sweepRect(position, remaining, radius, obstacle);
      if (candidate && (!hit || candidate.t < hit.t)) hit = candidate;
    }
    if (!hit) {
      position.x += remaining.x;
      position.y += remaining.y;
      break;
    }
    collided = true;
    lastNormal = hit.normal;
    position.x += remaining.x * hit.t;
    position.y += remaining.y * hit.t;
    remaining = { x: remaining.x * (1 - hit.t), y: remaining.y * (1 - hit.t) };
    const into = Math.min(0, dot(remaining, hit.normal));
    remaining.x -= into * hit.normal.x;
    remaining.y -= into * hit.normal.y;
    if (Math.hypot(remaining.x, remaining.y) < 1e-14) break;
  }
  return { ...position, collided, normal: lastNormal };
}

function isProfile(value: unknown): value is VehicleProfile {
  const p = value as Partial<VehicleProfile> | null;
  return (
    !!p && p.modelVersion === "vehicle-physics-2" && !!p.geometry && !!p.power
  );
}

/**
 * Advance the authoritative physics state and apply the scene's broad-phase
 * contact. With no contact this returns the exact core step result.
 */
export function stepInWorld(
  state: PhysicsState,
  intent: Intent,
  profile: VehicleProfile,
  dt: number,
  world: World,
): PhysicsState;
/** Historical baseline overload used by baseline evidence tests. */
export function stepInWorld(
  state: LegacyVehicleState,
  intent: import("../vehicle/legacy-model").Intent,
  config: VehicleConfig,
  dt: number,
  world: World,
): LegacyVehicleState;
export function stepInWorld(
  state: PhysicsState | LegacyVehicleState,
  intent: Intent | import("../vehicle/legacy-model").Intent,
  profileOrConfig: VehicleProfile | VehicleConfig,
  dt: number,
  world: World,
): PhysicsState | LegacyVehicleState {
  if (isPhysicsState(state) && isProfile(profileOrConfig)) {
    if (
      !Number.isFinite(dt) ||
      dt < 0 ||
      Math.abs(dt * 120 - Math.round(dt * 120)) > 1e-8
    )
      throw new Error("dt: 须为1/120秒的非负整数倍");
    const profile = profileOrConfig;
    let current = state;
    for (let elapsed = 0; elapsed < dt - 1e-10; elapsed += 1 / 120) {
      const candidate = stepPhysicsVehicle(
        current,
        intent as Intent,
        profile,
        1 / 120,
        { surface: world.surface },
      );
      const contact = sweepVehicle(current, candidate, profile, 1 / 120, world);
      current =
        contact === candidate
          ? candidate
          : stateFrom({ ...contact, assist: candidate.assist });
    }
    return current;
  }
  const legacy = state as LegacyVehicleState;
  const config = profileOrConfig as VehicleConfig;
  const candidate = stepLegacyVehicle(
    legacy,
    intent as import("../vehicle/legacy-model").Intent,
    config,
    dt,
  );
  const contact = moveCircle(
    { x: legacy.x, y: legacy.y },
    { x: candidate.x - legacy.x, y: candidate.y - legacy.y },
    config.radius,
    world,
  );
  if (!contact.collided) return candidate;
  const blocked =
    Math.hypot(contact.x - legacy.x, contact.y - legacy.y) < 1e-12;
  return {
    ...candidate,
    x: contact.x,
    y: contact.y,
    speed: 0,
    ...(blocked
      ? {
          heading: legacy.heading,
          motion: legacy.motion,
          turnSign: legacy.turnSign,
        }
      : {}),
  };
}
