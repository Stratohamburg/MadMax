import { CATALOG, validateLoadout } from "../loadout/model";
import { stockLoadout } from "../loadout/presets";
import type { Loadout } from "../loadout/types";
import type { Settlement } from "../modes/pve/run";
import type { AttributeModifier } from "../stats/modifiers";
export const PROFILE_VERSION = 2;
export interface PartInstance { id: string; definitionId: string; level: number; hp: number }
export interface Blueprint { id: string; name: string; loadout: Loadout }
export interface Profile {
  version: 2; inventory: Record<string, PartInstance>; blueprints: Blueprint[]; currency: number; materials: Record<string, number>;
  unlocks: { chassis: string[]; parts: string[]; levels: string[] }; story: string[]; appliedRuns: string[];
  stats: { runs: number; extracted: number; kills: number; damage: number; time: number; xp: number };
}
export function newProfile(): Profile {
  const loadout = stockLoadout("sports-car");
  return { version: 2, inventory: Object.fromEntries(loadout.parts.map(p => [p.instanceId, { id: p.instanceId, definitionId: p.partId, level: 0, hp: CATALOG.parts[p.partId].hp }])),
    blueprints: [{ id: "default", name: "初始跑车", loadout }], currency: 250, materials: { scrap: 100 },
    unlocks: { chassis: ["sports-car"], parts: Object.keys(CATALOG.parts), levels: ["scrapyard"] }, story: [], appliedRuns: [],
    stats: { runs: 0, extracted: 0, kills: 0, damage: 0, time: 0, xp: 0 } };
}
const integer = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
const strings = (n: unknown): n is string[] => Array.isArray(n) && n.every(v => typeof v === "string") && new Set(n).size === n.length;
export function validateProfile(value: unknown): asserts value is Profile {
  const p = value as Profile;
  if (!p || p.version !== 2 || !p.inventory || typeof p.inventory !== "object" || Array.isArray(p.inventory) || !integer(p.currency) || !p.materials ||
    !Object.values(p.materials).every(integer) || !Array.isArray(p.blueprints) || !p.unlocks ||
    !strings(p.unlocks.chassis) || !strings(p.unlocks.parts) || !strings(p.unlocks.levels) || !strings(p.story) || !strings(p.appliedRuns) || !p.stats ||
    !Object.values(p.stats).every(n => typeof n === "number" && Number.isFinite(n) && n >= 0) ||
    ![p.stats.runs, p.stats.extracted, p.stats.kills, p.stats.xp].every(integer)) throw new Error("档案格式无效");
  for (const [id, part] of Object.entries(p.inventory)) if (part.id !== id || !Object.hasOwn(CATALOG.parts, part.definitionId) || !integer(part.level) || part.level > 5 ||
    !Number.isFinite(part.hp) || part.hp < 0 || part.hp > CATALOG.parts[part.definitionId].hp) throw new Error("部件实例无效");
  if (new Set(p.blueprints.map(b => b.id)).size !== p.blueprints.length) throw new Error("方案 ID 重复");
  for (const b of p.blueprints) if (typeof b.id !== "string" || !b.id || typeof b.name !== "string" || !b.name.trim() || b.name.length > 40 || validateLoadout(b.loadout).length) throw new Error("装配方案无效");
}
export function resolveLoadout(profile: Profile, loadout: Loadout) {
  const missing = loadout.parts.filter(part => profile.inventory[part.instanceId]?.definitionId !== part.partId).map(p => p.instanceId);
  return { loadout: { ...structuredClone(loadout), parts: loadout.parts.filter(p => !missing.includes(p.instanceId)).map(p => ({ ...p })) }, missing };
}
/** 还原布局仅重排已有实例，缺失项保留在返回值中供玩家查看。 */
export function ownedStock(profile: Profile, chassisId: string) {
  if (!profile.unlocks.chassis.includes(chassisId)) throw new Error("底盘尚未解锁");
  const stock = stockLoadout(chassisId), used = new Set<string>(), missing: string[] = [];
  const parts = stock.parts.flatMap(part => {
    const instance = Object.values(profile.inventory).sort((a, b) => a.id < b.id ? -1 : 1).find(p => p.definitionId === part.partId && !used.has(p.id));
    if (!instance) { missing.push(part.partId); return []; }
    used.add(instance.id); return [{ ...part, instanceId: instance.id }];
  });
  return { loadout: { ...stock, parts }, missing };
}
export function saveBlueprint(profile: Profile, id: string, name: string, loadout: Loadout): Profile {
  if (!id || !name.trim() || name.length > 40 || validateLoadout(loadout).length || resolveLoadout(profile, loadout).missing.length || !profile.unlocks.chassis.includes(loadout.chassisId)) throw new Error("无法保存方案：名称、装配或库存引用无效");
  const next = structuredClone(profile), blueprint = { id, name: name.trim(), loadout: structuredClone(loadout) };
  const index = next.blueprints.findIndex(b => b.id === id);
  if (index < 0) next.blueprints.push(blueprint); else next.blueprints[index] = blueprint;
  return next;
}
export function deleteBlueprint(profile: Profile, id: string): Profile { return { ...profile, blueprints: profile.blueprints.filter(b => b.id !== id) }; }
function spend(profile: Profile, currency: number, scrap: number): Profile {
  if (profile.currency < currency || (profile.materials.scrap ?? 0) < scrap) throw new Error("货币或废料不足");
  return { ...structuredClone(profile), currency: profile.currency - currency, materials: { ...profile.materials, scrap: (profile.materials.scrap ?? 0) - scrap } };
}
export function upgradePart(profile: Profile, id: string): Profile {
  const part = profile.inventory[id]; if (!part || part.level >= 5) throw new Error("无法升级");
  const level = part.level + 1, next = spend(profile, 50 * level, 10 * level);
  next.inventory[id].level = level; return next;
}
export function repairPart(profile: Profile, id: string): Profile {
  const part = profile.inventory[id]; if (!part || part.hp >= CATALOG.parts[part.definitionId].hp) throw new Error("无需维修");
  const next = spend(profile, 20, 5); next.inventory[id].hp = CATALOG.parts[part.definitionId].hp; return next;
}
export function buyPart(profile: Profile, definitionId: string, id: string): Profile {
  if (!profile.unlocks.parts.includes(definitionId) || !Object.hasOwn(CATALOG.parts, definitionId) || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id) || Object.hasOwn(profile.inventory, id)) throw new Error("不能购买此部件");
  const next = spend(profile, 50, 10); next.inventory[id] = { id, definitionId, level: 0, hp: CATALOG.parts[definitionId].hp }; return next;
}
export function unlockContent(profile: Profile, kind: "chassis" | "parts", id: string): Profile {
  if (!Object.hasOwn(CATALOG[kind === "chassis" ? "chassis" : "parts"], id) || profile.unlocks[kind].includes(id)) throw new Error("解锁目标无效");
  const next = spend(profile, 100, 20); next.unlocks[kind].push(id); return next;
}
export function instanceModifiers(profile: Profile, loadout: Loadout): AttributeModifier[] {
  return loadout.parts.flatMap(part => {
    const level = profile.inventory[part.instanceId]?.level ?? 0, definition = CATALOG.parts[part.partId];
    if (!level || (!definition.weaponId && !definition.engine)) return [];
    return [{ id: `level:${part.instanceId}`, source: `level:${part.instanceId}`, group: "garage-level", target: definition.weaponId ? "weapon" : "vehicle",
      attribute: definition.weaponId ? "damage" : "power", layer: "increased", value: level * 0.05,
      ...(definition.weaponId ? { instanceId: part.instanceId } : {}) } satisfies AttributeModifier];
  });
}
export function applySettlement(profile: Profile, result: Settlement): Profile {
  if (profile.appliedRuns.includes(result.runId)) return profile;
  if (result.version !== 1 || !result.runId || ![result.kills, result.xp, result.currency].every(integer) ||
    ![result.time, result.damage].every(n => Number.isFinite(n) && n >= 0) || validateLoadout(result.initialLoadout).length) throw new Error("结算无效");
  const next = structuredClone(profile);
  for (const id of result.lost) delete next.inventory[id];
  for (const [id, hp] of Object.entries(result.durability)) if (next.inventory[id]) {
    if (!Number.isFinite(hp)) throw new Error("结算耐久无效");
    next.inventory[id].hp = Math.max(0, Math.min(CATALOG.parts[next.inventory[id].definitionId].hp, hp));
  }
  for (const loot of result.loot) {
    if (!integer(loot.amount) || loot.amount <= 0) throw new Error("战利品数量无效");
    if (loot.kind === "part") {
      if (!Object.hasOwn(CATALOG.parts, loot.definitionId) || Object.hasOwn(next.inventory, loot.id) || loot.amount !== 1) throw new Error("战利品实例冲突");
      next.inventory[loot.id] = { id: loot.id, definitionId: loot.definitionId, level: 0, hp: CATALOG.parts[loot.definitionId].hp };
    } else if (loot.kind === "material") next.materials[loot.definitionId] = (next.materials[loot.definitionId] ?? 0) + loot.amount;
  }
  next.currency += result.currency;
  next.story = [...new Set([...next.story, ...result.story])]; next.unlocks.levels = [...new Set([...next.unlocks.levels, ...result.unlocks])];
  next.stats.runs++; if (result.outcome === "extracted") next.stats.extracted++;
  next.stats.kills += result.kills; next.stats.damage += result.damage; next.stats.time += result.time; next.stats.xp += result.xp;
  next.appliedRuns.push(result.runId); validateProfile(next); return next;
}
