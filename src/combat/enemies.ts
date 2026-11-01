import type { SpawnEntity } from "./pools";
export type EnemyKind = "infantry" | "vehicle" | "building";
export interface EnemyDefinition {
  id: string; name: string; kind: EnemyKind; hp: number; armor: number; radius: number; mass: number;
  speed: number; acceleration: number; stopDistance: number; contactDamage: number;
  weaponId: string; weaponDamage: number; weaponRate: number; facing: number; color: string; runOverSpeed?: number;
}
export const ENEMIES: Readonly<Record<string, EnemyDefinition>> = Object.fromEntries(([
  { id: "rifleman", name: "掠夺者步枪兵", kind: "infantry", hp: 40, armor: 0, radius: .17, mass: .08, speed: .85, acceleration: 2, stopDistance: 3.5, contactDamage: 0, weaponId: "machine-gun", weaponDamage: .45, weaponRate: .4, facing: 0, color: "#b6a376", runOverSpeed: 1.2 },
  { id: "rocketeer", name: "火箭兵", kind: "infantry", hp: 55, armor: 5, radius: .18, mass: .09, speed: .55, acceleration: 1.5, stopDistance: 5, contactDamage: 0, weaponId: "rocket", weaponDamage: .4, weaponRate: .7, facing: 0, color: "#b68c63", runOverSpeed: 1.2 },
  { id: "raider-pickup", name: "机枪皮卡", kind: "vehicle", hp: 140, armor: 15, radius: .42, mass: 1.6, speed: 1.5, acceleration: 1.2, stopDistance: 3, contactDamage: 0, weaponId: "machine-gun", weaponDamage: .7, weaponRate: .8, facing: 0, color: "#a16e4d" },
  { id: "armored-car", name: "机炮装甲车", kind: "vehicle", hp: 260, armor: 45, radius: .5, mass: 3, speed: 1.05, acceleration: .9, stopDistance: 4.5, contactDamage: 0, weaponId: "autocannon", weaponDamage: .7, weaponRate: .65, facing: 0, color: "#788877" },
  { id: "bunker", name: "机枪碉堡", kind: "building", hp: 320, armor: 65, radius: .65, mass: 0, speed: 0, acceleration: 0, stopDistance: 0, contactDamage: 0, weaponId: "machine-gun", weaponDamage: .8, weaponRate: .8, facing: Math.PI / 2, color: "#8e8a70" },
  { id: "rocket-tower", name: "火箭哨塔", kind: "building", hp: 220, armor: 35, radius: .5, mass: 0, speed: 0, acceleration: 0, stopDistance: 0, contactDamage: 0, weaponId: "missile", weaponDamage: .65, weaponRate: .7, facing: Math.PI / 2, color: "#a18b68" },
  { id: "iron-warlord", name: "铁甲督军", kind: "vehicle", hp: 900, armor: 55, radius: .75, mass: 7, speed: .6, acceleration: .6, stopDistance: 6, contactDamage: 0, weaponId: "cannon", weaponDamage: .5, weaponRate: .8, facing: 0, color: "#8e6260" },
] satisfies EnemyDefinition[]).map(def => [def.id, def]));
export function enemySpawn(id: string, position: { x: number; y: number }, overrides: Partial<SpawnEntity> = {}): SpawnEntity {
  const d = ENEMIES[id]; if (!d) throw new Error(`未知敌人：${id}`);
  return { archetype: id, position, hp: d.hp, armor: d.armor, radius: d.radius, mass: d.mass, speed: d.speed,
    acceleration: d.acceleration, stopDistance: d.stopDistance, attack: d.contactDamage, faction: 1, theta: d.facing, ...overrides };
}
