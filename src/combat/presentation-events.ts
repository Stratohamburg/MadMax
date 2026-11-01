import type { Vec2 } from "../vehicle/physics/math";
export interface PresentationEvent {
  sequence: number; time: number; type: "muzzle" | "impact" | "explosion" | "death";
  position: Vec2; angle: number; weaponId: string; faction: 0 | 1; size: number;
}
