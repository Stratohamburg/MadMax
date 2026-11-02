import type { Vec2 } from "./math";
import type { PhysicalProfile } from "./config";
import type { PhysicalState } from "./state";
import { applyExternalImpulse } from "./physical";

export interface AppliedForce {
  force: Vec2;
  /** world: 世界作用点；body: 相对当前质心的车体坐标。 */
  point: Vec2;
  frame: "world" | "body";
  work: "external" | "boost";
}
export interface ImpulseEvent {
  tick: number;
  source: string;
  sequence: number;
  impulse: Vec2;
  point: Vec2;
  frame: "world" | "body";
}
/** 每个来源保留已消费序号，随车辆运行状态序列化。来源必须是稳定实体/挂点 ID。 */
export interface EffectHistory { lastSequence: Record<string, number> }
export const createEffectHistory = (): EffectHistory => ({ lastSequence: {} });
export function worldEffect(s: PhysicalState, vector: Vec2, point: Vec2, frame: "world" | "body") {
  if (![vector.x, vector.y, point.x, point.y].every(Number.isFinite) || !["world", "body"].includes(frame))
    throw new Error("effect: 非有限或未知坐标系");
  if (frame === "world") return { vector, point };
  const c = Math.cos(s.theta), n = Math.sin(s.theta);
  return { vector: { x: c * vector.x - n * vector.y, y: n * vector.x + c * vector.y },
    point: { x: s.position.x + c * point.x - n * point.y, y: s.position.y + n * point.x + c * point.y } };
}
export function applyImpulseEvents(state: PhysicalState, p: PhysicalProfile, history: EffectHistory,
  tick: number, events: readonly ImpulseEvent[]) {
  const next = { lastSequence: { ...history.lastSequence } };
  for (const event of [...events].sort((a, b) => a.source < b.source ? -1 : a.source > b.source ? 1 : a.sequence - b.sequence)) {
    if (!event.source || !Number.isSafeInteger(event.sequence) || event.sequence < 0 || event.tick !== tick || !Number.isSafeInteger(tick) || tick < 0)
      throw new Error("effect: 来源、序号或模拟步非法");
    const last = Object.hasOwn(next.lastSequence, event.source) ? next.lastSequence[event.source] : -1;
    if (event.sequence <= last) continue;
    const world = worldEffect(state, event.impulse, event.point, event.frame);
    state = applyExternalImpulse(state, p, world.vector, world.point);
    Object.defineProperty(next.lastSequence, event.source, { value: event.sequence, enumerable: true, writable: true, configurable: true });
  }
  return { state, history: next };
}
