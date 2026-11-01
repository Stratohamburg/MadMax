import type { AttributeModifier } from "../../stats/modifiers";
export interface Upgrade {
  id: string; name: string; rarity: "common" | "rare" | "epic"; weight: number; maxStacks: number;
  duration: number | null; refresh: "replace" | "extend"; tags: readonly string[];
  modifier: Omit<AttributeModifier, "id" | "source" | "group">;
}
const upgrade = (id: string, name: string, target: AttributeModifier["target"], attribute: string, value: number,
  patch: Partial<Omit<Upgrade, "modifier">> & { layer?: AttributeModifier["layer"] } = {}): Upgrade => ({
  id, name, rarity: patch.rarity ?? "common", weight: patch.weight ?? 1, maxStacks: patch.maxStacks ?? 5,
  duration: patch.duration ?? null, refresh: patch.refresh ?? "replace", tags: patch.tags ?? [],
  modifier: { target, attribute, layer: patch.layer ?? "increased", value, allTags: patch.tags?.length ? patch.tags : undefined },
});
export const UPGRADES: Readonly<Record<string, Upgrade>> = Object.fromEntries([
  upgrade("power", "强劲动力", "vehicle", "power", 0.2),
  upgrade("grip", "抓地强化", "vehicle", "grip", 0.08, { maxStacks: 3 }),
  upgrade("speed", "公路狂奔", "vehicle", "maxSpeed", 0.1, { maxStacks: 3 }),
  upgrade("load", "加固底盘", "vehicle", "massLimit", 0.2, { maxStacks: 3 }),
  upgrade("damage", "火力强化", "weapon", "damage", 0.25, { maxStacks: 8 }),
  upgrade("rate", "快速装填", "weapon", "fireRate", 0.15),
  upgrade("range", "远程火力", "weapon", "range", 0.15),
  upgrade("barrage", "额外弹丸", "weapon", "pellets", 1, { layer: "flat", tags: ["barrage"], rarity: "rare" }),
  upgrade("explosive", "爆破专精", "weapon", "damage", 1.25, { layer: "more", tags: ["explosive"], rarity: "rare", maxStacks: 3 }),
  upgrade("fire", "燃烧专精", "weapon", "damage", 1.4, { layer: "more", tags: ["fire"], rarity: "epic", maxStacks: 3 }),
  upgrade("collision", "碰撞专精", "damage", "damage", 0.5, { tags: ["collision"], rarity: "rare", maxStacks: 3 }),
  upgrade("adrenaline", "短时超载", "vehicle", "power", 1.5, { layer: "more", rarity: "rare", duration: 20, maxStacks: 1, refresh: "extend" }),
].map(u => [u.id, u]));
export const TAGS = ["vehicle", "weapon", "engine", "gearbox", "battery", "electric", "fuel", "seat", "driver", "passenger", "repair", "armor", "ammo", "tire", "grip", "boost", "radar", "vision", "barrage", "explosive", "fire", "collision", "drift", "guided", "turret", "fixed", "passive"] as const;
