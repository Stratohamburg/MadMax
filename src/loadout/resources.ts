import { CATALOG } from "./model";
import type { Loadout } from "./types";

/** 这里只汇总预算；武器/副本拥有运行时的剩余量。 */
export function resourceBudget(loadout: Loadout, catalog = CATALOG) {
  let capacity = 0, maxOutput = 0, rechargeRate = 0, powerDraw = 0, fuelCapacity = 0;
  const ammo: Record<string, number> = {};
  for (const part of loadout.parts) {
    const definition = catalog.parts[part.partId];
    capacity += definition.battery?.capacity ?? 0;
    maxOutput += definition.battery?.maxOutput ?? 0;
    rechargeRate += definition.battery?.rechargeRate ?? 0;
    powerDraw += definition.powerDraw;
    fuelCapacity += definition.fuelCapacity ?? 0;
    for (const [kind, count] of Object.entries(definition.ammo ?? {})) ammo[kind] = (ammo[kind] ?? 0) + count;
  }
  return { capacity, maxOutput, rechargeRate, powerDraw, fuelCapacity, ammo, powerSufficient: powerDraw <= maxOutput };
}
