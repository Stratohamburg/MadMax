import { evaluateAttribute } from "../stats/modifiers";
import type { AttributeModifier } from "../stats/modifiers";
export interface DamageDefense { resistance: number; armor: number }
export function calculateDamage(base: number, modifiers: readonly AttributeModifier[] = [], tags: readonly string[] = [],
  defense: DamageDefense = { resistance: 0, armor: 0 }, critical = false, criticalMultiplier = 2) {
  if (![base, defense.resistance, defense.armor, criticalMultiplier].every(Number.isFinite) || base < 0) throw new Error("damage: 非法数值");
  const layers = evaluateAttribute(base, modifiers, "damage", "damage", tags);
  const afterLayers = Math.max(0, layers.value), afterCritical = afterLayers * (critical ? Math.max(1, criticalMultiplier) : 1);
  const afterResistance = afterCritical * (1 - Math.min(0.9, Math.max(0, defense.resistance)));
  const final = afterResistance * 100 / (100 + Math.max(0, defense.armor));
  return { base, flat: layers.flat, increased: layers.increased, more: layers.more, afterLayers,
    critical, afterCritical, afterResistance, final, contributions: layers.applied };
}
