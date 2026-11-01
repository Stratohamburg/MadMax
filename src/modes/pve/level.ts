import type { Vec2 } from "../../vehicle/physics/math";
import type { SpawnEntity } from "../../combat/pools";
import { nextRandom, seedState } from "../../simulation/random";
export interface Loot { id: string; kind: "part" | "material" | "currency"; definitionId: string; amount: number; cells: number; position: Vec2 }
export interface Exit { id: string; name: string; position: Vec2; radius: number; after: number; boss: boolean; duration: number }
export interface Level {
  id: string; name: string; duration: number; capacity: number; lossRate: number; spawn: Vec2;
  regions: { id: string; position: Vec2; radius: number; upgrade: boolean; repair: boolean }[];
  waves: { at: number; count: number; position: Vec2; spread: number; enemy: Omit<SpawnEntity, "position">; boss?: boolean }[];
  caches: { position: Vec2; count: number }[]; exits: Exit[]; story: string; unlock: string;
}
export const SCRAPYARD: Level = {
  id: "scrapyard", name: "废弃货场", duration: 180, capacity: 8, lossRate: 0.25, spawn: { x: -11, y: 19 },
  regions: [{ id: "维修营地", position: { x: -16, y: 13 }, radius: 2, upgrade: false, repair: true },
    { id: "军需仓库", position: { x: -11, y: 4 }, radius: 2, upgrade: true, repair: false }],
  waves: [0, 12, 24, 40, 60, 90, 120, 150].map<Level["waves"][number]>((at, index) => ({ at, count: 3 + index * 2,
    position: { x: -11 + (index % 2 ? 9 : -9), y: 12 - index * 5 }, spread: 3,
    enemy: { hp: 35 + index * 8, speed: 0.6 + index * 0.05, attack: 6 + index, radius: 0.35 } }))
    .concat([{ at: 70, count: 1, position: { x: -11, y: -19 }, spread: 0,
      enemy: { hp: 500, speed: 0.5, attack: 25, radius: 0.8 }, boss: true } as Level["waves"][number]]).sort((a, b) => a.at - b.at),
  caches: [{ position: { x: -11, y: 14 }, count: 3 }, { position: { x: -11, y: 2 }, count: 3 }, { position: { x: -10, y: -15 }, count: 5 }],
  exits: [{ id: "south", name: "南侧撤离", position: { x: -11, y: 24 }, radius: 2, after: 20, boss: false, duration: 5 },
    { id: "north", name: "北侧撤离", position: { x: -11, y: -29 }, radius: 2, after: 0, boss: true, duration: 5 }],
  story: "scrapyard-cleared", unlock: "wasteland",
};
export function generateLevel(level: Level, seed: number, runId: string) {
  let random = seedState(seed ^ 0x1730b), serial = 0;
  const draw = () => { const next = nextRandom(random); random = next.state; return next.value; };
  const enemies = level.waves.flatMap(wave => Array.from({ length: wave.count }, () => ({ at: wave.at, boss: !!wave.boss,
    entity: { ...wave.enemy, position: { x: wave.position.x + (draw() * 2 - 1) * wave.spread, y: wave.position.y + (draw() * 2 - 1) * wave.spread } } })));
  const loot: Loot[] = level.caches.flatMap(cache => Array.from({ length: cache.count }, () => {
    const type = draw(), kind = type < 0.2 ? "part" : type < 0.65 ? "material" : "currency";
    return { id: `${runId}:loot:${serial++}`, kind, definitionId: kind === "part" ? "inner-armor" : kind === "material" ? "scrap" : "credits",
      amount: kind === "part" ? 1 : 10 + Math.floor(draw() * 20), cells: kind === "part" ? 2 : 1,
      position: { x: cache.position.x + draw() - 0.5, y: cache.position.y + draw() - 0.5 } };
  }));
  return { enemies, loot };
}
