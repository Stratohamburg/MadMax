import { compose } from "../loadout/compose";
import { CATALOG, compareId } from "../loadout/model";
import type { Loadout } from "../loadout/types";
import type { AttributeModifier } from "../stats/modifiers";
import { wrap } from "../vehicle/physics/math";
import type { WeaponSystemState } from "./weapons/types";
export type ModuleCondition = "Normal" | "Damaged" | "Destroyed";
export const moduleCondition = (hp: number, maxHp: number): ModuleCondition => hp <= 0 ? "Destroyed" : hp <= maxHp * 0.5 ? "Damaged" : "Normal";
export interface VehicleModules { loadout: Loadout; hp: Record<string, number>; detached: string[]; fireEvents: string[] }
export function createModules(loadout: Loadout): VehicleModules {
  return { loadout: structuredClone(loadout), hp: Object.fromEntries(loadout.parts.map(p => [p.instanceId, CATALOG.parts[p.partId].hp])), detached: [], fireEvents: [] };
}
export function moduleComposition(modules: VehicleModules, modifiers: readonly AttributeModifier[] = []) {
  return compose(modules.loadout, { modifiers, health: Object.fromEntries(modules.loadout.parts.map(p => [p.instanceId, modules.hp[p.instanceId] / CATALOG.parts[p.partId].hp])) });
}
export function damageModule(current: VehicleModules, instanceId: string, amount: number): VehicleModules {
  if (!Number.isFinite(amount) || amount < 0) throw new Error("module damage");
  const part = current.loadout.parts.find(p => p.instanceId === instanceId);
  if (!part || current.hp[instanceId] <= 0) return current;
  const hp = { ...current.hp, [instanceId]: Math.max(0, current.hp[instanceId] - amount) };
  const definition = CATALOG.parts[part.partId], destroyed = hp[instanceId] <= 0;
  return { loadout: destroyed && definition.exposed ? { ...current.loadout, parts: current.loadout.parts.filter(p => p.instanceId !== instanceId) } : current.loadout,
    hp, detached: destroyed && definition.exposed ? [...current.detached, instanceId] : [...current.detached],
    fireEvents: destroyed && definition.fuelCapacity ? [...current.fireEvents, instanceId] : [...current.fireEvents] };
}
export function damageByDirection(current: VehicleModules, amount: number, localAngle: number) {
  let modules = current, remaining = amount;
  const candidates = current.loadout.parts.filter(p => current.hp[p.instanceId] > 0 &&
    (p.layer === "outer" ? Math.abs(wrap(p.facing * Math.PI / 180 - localAngle)) <= Math.PI / 3 : CATALOG.parts[p.partId].tags.includes("armor")))
    .sort((a, b) => (a.layer === "outer" ? 0 : 1) - (b.layer === "outer" ? 0 : 1) || compareId(a.instanceId, b.instanceId));
  for (const part of candidates) {
    const absorbed = Math.min(remaining, modules.hp[part.instanceId]);
    modules = damageModule(modules, part.instanceId, absorbed); remaining -= absorbed;
    if (remaining <= 0) break;
  }
  if (remaining > 0) {
    const internal = modules.loadout.parts.filter(p => p.layer === "inner" && modules.hp[p.instanceId] > 0).sort((a, b) => compareId(a.instanceId, b.instanceId));
    if (internal.length) modules = damageModule(modules, internal[0].instanceId, remaining * 0.5);
  }
  return { modules, hullDamage: remaining };
}
export function repairModules(current: VehicleModules, dt: number, inRepairZone: boolean) {
  const hp = { ...current.hp };
  const mechanic = current.loadout.parts.some(p => CATALOG.parts[p.partId].seat === "mechanic" && hp[p.instanceId] > 0);
  for (const part of current.loadout.parts) {
    const max = CATALOG.parts[part.partId].hp;
    if (inRepairZone && hp[part.instanceId] <= 0) hp[part.instanceId] = max * 0.5;
    else if (inRepairZone || mechanic) { if (hp[part.instanceId] > 0) hp[part.instanceId] = Math.min(max, hp[part.instanceId] + (inRepairZone ? 40 : 2) * dt); }
  }
  return { ...current, hp };
}

export function serviceVehicle(current: VehicleModules, weapons: WeaponSystemState, dt: number, inRepairZone: boolean) {
  const modules = repairModules(current, dt, inRepairZone);
  return { modules, weapons: inRepairZone ? { ...weapons, ammo: { ...moduleComposition(modules).resources.ammo } } : weapons };
}
