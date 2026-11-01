import { compose } from "../../loadout/compose";
import type { Loadout } from "../../loadout/types";
import { evaluateAttribute } from "../../stats/modifiers";
import { WEAPONS } from "../../combat/weapons/definitions";
import { activeModifiers } from "./run";
import type { ModifierRunState } from "./run";
import { adjacencyModifiers } from "./adjacency";
export function diagnoseBuild(loadout: Loadout, state: ModifierRunState, multiplierWarning = 8) {
  const modifiers = [...activeModifiers(state), ...adjacencyModifiers(loadout)], composition = compose(loadout, { modifiers });
  const warnings: string[] = composition.summary.clamped.map(c => `${c.path} 从${c.requested}截断为${c.value}`);
  const weapons = composition.mounts.filter(m => m.weaponId && WEAPONS[m.weaponId]).map(m => {
    const definition = WEAPONS[m.weaponId!];
    const damage = evaluateAttribute(definition.damage, modifiers, "weapon", "damage", definition.tags, m.instanceId);
    const rate = evaluateAttribute(definition.fireRate, modifiers, "weapon", "fireRate", definition.tags, m.instanceId);
    const pellets = evaluateAttribute(definition.pellets, modifiers, "weapon", "pellets", definition.tags, m.instanceId);
    if (damage.more > multiplierWarning || damage.applied.filter(m => m.layer === "more").length > 8) warnings.push(`${m.instanceId}: 乘算积/来源数量超过阈值`);
    const burstDps = Math.max(0, damage.value) * Math.max(0, rate.value) * Math.max(1, Math.floor(pellets.value));
    const heatDuty = definition.heatPerShot > 0 && rate.value > 0 ? Math.min(1, definition.cooling / (definition.heatPerShot * rate.value)) : 1;
    return { instanceId: m.instanceId, weaponId: m.weaponId, damage, rate, pellets, burstDps, sustainedDps: burstDps * heatDuty };
  });
  return { version: "build-diagnostics-1", summary: composition.summary, weapons,
    burstDps: weapons.reduce((s, w) => s + w.burstDps, 0), sustainedDps: weapons.reduce((s, w) => s + w.sustainedDps, 0), warnings };
}
