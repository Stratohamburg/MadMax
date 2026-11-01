import { compose } from "../loadout/compose";
import { stockLoadout } from "../loadout/presets";
import { WEAPONS } from "./weapons/definitions";
import { createWeaponSystem, stepWeapons } from "./weapons/system";
import type { Target, WeaponSystemState } from "./weapons/types";
import { ENEMIES } from "./enemies";
import type { EntityPool } from "./pools";
const configurations = new Map<string, ReturnType<typeof makeConfiguration>>();
function makeConfiguration(id: string) {
  const d = ENEMIES[id], stock = stockLoadout("sports-car");
  const composition = compose({ ...stock, parts: [...stock.parts.filter(p => p.partId !== "machine-gun"), { instanceId: "enemy-gun", partId: d.weaponId, layer: "outer", x: 0, y: 0, rotation: 0, facing: 0 }] });
  composition.mounts = composition.mounts.map(m => ({ ...m, position: { x: 0, y: 0 }, angle: 0 }));
  composition.resources = { ...composition.resources, capacity: 1000, maxOutput: 100, ammo: { ballistic: 1500, rocket: 50 } };
  const original = WEAPONS[d.weaponId];
  return { composition, definitions: { [d.weaponId]: { ...original, damage: original.damage * d.weaponDamage, fireRate: original.fireRate * d.weaponRate, arc: d.id === "bunker" ? Math.PI : original.arc } } };
}
export function enemyWeaponStep(pool: EntityPool, slot: number, target: Target, state?: WeaponSystemState) {
  const id = pool.archetype[slot]; let config = configurations.get(id);
  if (!config) { config = makeConfiguration(id); configurations.set(id, config); }
  const c = config.composition, current = state ?? createWeaponSystem(c, pool.id[slot]);
  const charged = { ...current, energy: Math.min(c.resources.capacity, current.energy + 50 / 120) };
  // 武器只消费挂载姿态；无需为每个敌人每步创建整套车辆轮胎/动力链状态。
  const pose = { position: { x: pool.x[slot], y: pool.y[slot] }, theta: pool.theta[slot], delta: 0 };
  return stepWeapons(charged, pose, c, { query: () => [target] }, { definitions: config.definitions });
}
