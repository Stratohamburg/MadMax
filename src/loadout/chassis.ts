import { PROFILES } from "../vehicle/physics/profiles";
import { CELL_SIZE, KG_PER_GAME_MASS } from "./types";
import type { ChassisCell, ChassisDefinition, Facing } from "./types";

function oddCount(length: number, minimum: number): number {
  const n = Math.max(minimum, Math.floor(length / CELL_SIZE));
  return n % 2 ? n : n - 1;
}
export const CHASSIS: Readonly<Record<string, ChassisDefinition>> = Object.fromEntries(
  PROFILES.map((profile) => {
    const g = profile.geometry;
    const hx = (oddCount(g.wheelbase + g.frontOverhang + g.rearOverhang, 7) - 1) / 2;
    const hy = (oddCount(g.width, 3) - 1) / 2;
    const inner: ChassisCell[] = [], outer: ChassisCell[] = [];
    for (let x = -hx - 1; x <= hx + 1; x++) {
      for (let y = -hy - 1; y <= hy + 1; y++) {
        const edge = Math.abs(x) > hx || Math.abs(y) > hy;
        const exposedDirections: Facing[] = [];
        if (x === hx + 1) exposedDirections.push(0);
        if (y === hy + 1) exposedDirections.push(90);
        if (x === -hx - 1) exposedDirections.push(180);
        if (y === -hy - 1) exposedDirections.push(270);
        outer.push({ x, y, slot: edge ? "edge" : "roof", available: true, exposedDirections });
        if (!edge) inner.push({ x, y, slot: "internal", available: true, exposedDirections: [] });
      }
    }
    return [profile.profileId, {
      id: profile.profileId,
      name: profile.label,
      cellSize: CELL_SIZE,
      layers: { inner, outer },
      maxMassKg: profile.mass * KG_PER_GAME_MASS * 2.5,
    } satisfies ChassisDefinition];
  }),
);
