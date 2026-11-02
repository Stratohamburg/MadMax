import { CATALOG } from "../loadout/model";
import { uniqueId } from "../simulation/identity";
import type { Profile } from "./profile";

export const GM_RESOURCE_LIMIT = 1_000_000;
export const GM_PART_LIMIT = 100;

function quantity(value: number, limit: number) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > limit) throw new Error(`数量须为 1～${limit} 的整数`);
}
export function grantResource(profile: Profile, kind: "currency" | "scrap", amount: number): Profile {
  quantity(amount, GM_RESOURCE_LIMIT);
  if (kind !== "currency" && kind !== "scrap") throw new Error("物资类型无效");
  const total = (kind === "currency" ? profile.currency : profile.materials.scrap ?? 0) + amount;
  if (!Number.isSafeInteger(total)) throw new Error("资源总量超出安全范围");
  const next = structuredClone(profile);
  if (kind === "currency") next.currency = total; else next.materials.scrap = total;
  return next;
}
export function grantParts(profile: Profile, definitionId: string, amount: number): Profile {
  quantity(amount, GM_PART_LIMIT);
  if (!Object.hasOwn(CATALOG.parts, definitionId)) throw new Error("零件类型无效");
  const next = structuredClone(profile);
  for (let i = 0; i < amount; i++) {
    const id = `gm:${uniqueId()}`;
    if (Object.hasOwn(next.inventory, id)) throw new Error("零件实例冲突，请重试");
    next.inventory[id] = { id, definitionId, level: 0, hp: CATALOG.parts[definitionId].hp };
  }
  return next;
}
export function repairAllParts(profile: Profile): Profile {
  const next = structuredClone(profile);
  for (const part of Object.values(next.inventory)) part.hp = CATALOG.parts[part.definitionId].hp;
  return next;
}
