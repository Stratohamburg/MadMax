import type { Intent } from "../../vehicle/physics/state";
import type { Vec2 } from "../../vehicle/physics/math";

export const HUB_SPAWN = { position: { x: -11, y: 19 }, theta: -Math.PI / 2 };
export const STATIONS = [
  { id: "shop", name: "商店", subtitle: "零件 / 底盘", x: -15, y: 13, color: "#d8b676" },
  { id: "equipment", name: "装备", subtitle: "装配 / 维修", x: -11, y: 13, color: "#96c9bc" },
  { id: "deploy", name: "出击", subtitle: "废弃货场", x: -7, y: 13, color: "#d4937d" },
] as const;
export type Station = typeof STATIONS[number];
export interface ParkingState { candidate: Station["id"] | null; elapsed: number; latched: Station["id"] | null }
export const emptyParking = (): ParkingState => ({ candidate: null, elapsed: 0, latched: null });
export function insideStation(position: Vec2, station: Station, margin = 0): boolean {
  return Math.abs(position.x - station.x) <= 1.4 + margin && Math.abs(position.y - station.y) <= 1.4 + margin;
}
export function advanceParking(current: ParkingState, position: Vec2, speed: number, input: Intent, dt: number, yawRate = 0) {
  const next = { ...current }; let entered: Station | null = null;
  if (next.latched && !insideStation(position, STATIONS.find(s => s.id === next.latched)!, 0.5)) next.latched = null;
  const station = STATIONS.find(s => insideStation(position, s));
  if (!station || station.id === next.latched || speed > 0.15 || Math.abs(yawRate) > 0.1 || input.targetSpeed > 0.01 || input.angle !== null) {
    next.candidate = null; next.elapsed = 0;
  } else {
    next.elapsed = (next.candidate === station.id ? next.elapsed : 0) + dt; next.candidate = station.id;
    if (next.elapsed + 1e-10 >= 0.7) { entered = station; next.latched = station.id; next.candidate = null; next.elapsed = 0; }
  }
  return { state: next, entered };
}
