import { describe, it, expect } from "vitest";
import { CATALOG, compose } from "../../src/loadout";
import { newProfile } from "../../src/persistence/profile";
import { grantResource, grantParts, repairAllParts, GM_PART_LIMIT, GM_RESOURCE_LIMIT } from "../../src/persistence/gm";
import { ProfileRepository, unpack } from "../../src/persistence/repository";
import { MemoryStore } from "../../src/persistence/store";
import { PveSession } from "../../src/modes/pve/session";

describe("GM 与初始车辆", () => {
  it("新档所有部件满耐久，默认安装一挺有弹药的机枪且可驾驶", () => {
    const p = newProfile(), loadout = p.blueprints[0].loadout;
    for (const part of loadout.parts) expect(p.inventory[part.instanceId].hp).toBe(CATALOG.parts[part.partId].hp);
    expect(loadout.parts.filter(part => part.partId === "machine-gun")).toHaveLength(1);
    expect(loadout.parts.find(part => part.partId === "machine-gun")).toMatchObject({ layer: "outer", x: 0, y: 0 });
    const c = compose(loadout);
    expect(c.summary.canDrive).toBe(true);
    expect(c.resources.ammo.ballistic).toBeGreaterThan(0);
  });
  it("精确发资源及独立满耐久零件，不修改布局和输入", () => {
    const initial = newProfile(), before = structuredClone(initial);
    const p = grantParts(grantResource(grantResource(initial, "currency", 1000), "scrap", 500), "machine-gun", 3);
    expect(p.currency).toBe(initial.currency + 1000); expect(p.materials.scrap).toBe(initial.materials.scrap + 500);
    const added = Object.values(p.inventory).filter(part => part.id.startsWith("gm:"));
    expect(added).toHaveLength(3); expect(new Set(added.map(part => part.id)).size).toBe(3);
    for (const part of added) expect(part).toMatchObject({ definitionId: "machine-gun", level: 0, hp: CATALOG.parts["machine-gun"].hp });
    expect(p.blueprints).toEqual(initial.blueprints); expect(initial).toEqual(before);
  });
  it.each([0, -1, 1.5, NaN, Infinity, GM_RESOURCE_LIMIT + 1])("拒绝非法资源数量 %s", amount => {
    const p = newProfile(), before = structuredClone(p);
    expect(() => grantResource(p, "currency", amount)).toThrow(); expect(p).toEqual(before);
  });
  it("拒绝非法零件、数量及资源溢出", () => {
    const p = newProfile();
    for (const amount of [0, -1, 1.5, Infinity, GM_PART_LIMIT + 1]) expect(() => grantParts(p, "machine-gun", amount)).toThrow();
    expect(() => grantParts(p, "__proto__", 1)).toThrow();
    expect(() => grantResource({ ...p, currency: Number.MAX_SAFE_INTEGER }, "currency", 1)).toThrow();
    expect(grantParts(p, "machine-gun", GM_PART_LIMIT).inventory).toBeDefined();
    expect(grantResource(p, "scrap", GM_RESOURCE_LIMIT).materials.scrap).toBe(p.materials.scrap + GM_RESOURCE_LIMIT);
  });
  it("全修复保留等级、资源和布局且可持久保存，提交失败不发奖", async () => {
    const store = new MemoryStore(), repo = new ProfileRepository(store);
    const damaged = await repo.update(p => { for (const part of Object.values(p.inventory)) { part.hp = 0; part.level = 2; } return p; });
    const repaired = await repo.update(repairAllParts);
    for (const part of Object.values(repaired.inventory)) {
      expect(part.hp).toBe(CATALOG.parts[part.definitionId].hp); expect(part.level).toBe(2);
    }
    expect(repaired.currency).toBe(damaged.currency); expect(repaired.blueprints).toEqual(damaged.blueprints);
    expect((await repo.load()).profile).toEqual(repaired);
    const before = structuredClone(store.records); store.failNext = true;
    await expect(repo.update(p => grantParts(grantResource(p, "currency", 10), "machine-gun", 2))).rejects.toThrow();
    expect(store.records).toEqual(before);
  });
  it("重置清空旧进度、备份和 pending，失败保留所有记录并可重试", async () => {
    const store = new MemoryStore(), repo = new ProfileRepository(store);
    await repo.update(p => { p.currency = 9999; p.story = ["old"]; return p; });
    const session = new PveSession("old-run", 5, newProfile().blueprints[0].loadout);
    session.start(); session.finish("extracted"); await repo.stage(session.run.settlement!);
    const before = structuredClone(store.records); store.failNext = true;
    await expect(repo.reset()).rejects.toThrow(); expect(store.records).toEqual(before);
    expect(await repo.reset()).toEqual(newProfile());
    expect(store.records.pending).toBeUndefined();
    expect(unpack(store.records.backup!).payload).toEqual(newProfile());
    expect((await repo.load()).profile).toEqual(newProfile());
    // 即使主档损坏，也只能回退到重置后的初始档案。
    store.records.primary = "broken";
    expect((await repo.load()).profile).toEqual(newProfile());
  });
});
