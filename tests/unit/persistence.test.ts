import { describe, expect, it } from "vitest";
import legacy from "../fixtures/profile-v1.json";
import { MemoryStore } from "../../src/persistence/store";
import { envelope, FutureVersionError, ProfileRepository } from "../../src/persistence/repository";
import { applySettlement, buyPart, deleteBlueprint, instanceModifiers, newProfile, ownedStock, repairPart, resolveLoadout, saveBlueprint, unlockContent, upgradePart } from "../../src/persistence/profile";
import { PveSession } from "../../src/modes/pve/session";
import { stockLoadout } from "../../src/loadout/presets";
const result = () => { const s = new PveSession("settlement-1", 5, stockLoadout("sports-car")); s.start();
  s.run.carry = [{ id: "settlement-1:loot:1", kind: "currency", definitionId: "credits", amount: 20, cells: 1, position: { x: 0, y: 0 } },
    { id: "settlement-1:loot:2", kind: "part", definitionId: "inner-armor", amount: 1, cells: 2, position: { x: 0, y: 0 } }];
  s.finish("extracted"); return s.run.settlement!;
};
describe("版本化档案与事务", () => {
  it("首次启动创建初始实例，重新加载保留资源", async () => {
    const repo = new ProfileRepository(new MemoryStore());
    expect((await repo.load()).profile.inventory).toEqual(newProfile().inventory);
    await repo.update(p => ({ ...p, currency: 37 })); expect((await repo.load()).profile.currency).toBe(37);
  });
  it("显式迁移旧版 fixture，补齐等级耐久并保留进度", async () => {
    const store = new MemoryStore(); store.records.primary = envelope(legacy, 1);
    const p = (await new ProfileRepository(store).load()).profile;
    expect(p.version).toBe(2); expect(p.inventory["legacy:armor"]).toMatchObject({ level: 0, hp: 240 });
    expect(p.currency).toBe(123); expect(p.story).toEqual(["legacy-story"]); expect(p.appliedRuns).toEqual([]);
  });
  it("未来版本拒绝，即使旧备份可用也不覆盖", async () => {
    const store = new MemoryStore(); store.records = { primary: envelope({ future: true }, 3), backup: envelope(newProfile()) };
    const before = structuredClone(store.records);
    await expect(new ProfileRepository(store).load()).rejects.toBeInstanceOf(FutureVersionError); expect(store.records).toEqual(before);
  });
  it("校验失败回退有效备份并提示，双坏不覆盖", async () => {
    const store = new MemoryStore(); store.records = { primary: envelope(newProfile()).replace('"currency":250', '"currency":999'), backup: envelope(newProfile()) };
    const loaded = await new ProfileRepository(store).load(); expect(loaded.notice).toContain("已恢复"); expect(loaded.profile.currency).toBe(250);
    store.records = { primary: "bad", backup: "also-bad" }; const before = structuredClone(store.records);
    await expect(new ProfileRepository(store).load()).rejects.toThrow(); expect(store.records).toEqual(before);
  });
  it("提交中断只留下原档与 pending，重启完整入档一次", async () => {
    const store = new MemoryStore(), repo = new ProfileRepository(store); await repo.load();
    await repo.stage(result()); const before = structuredClone(store.records); store.failNext = true;
    await expect(repo.load()).rejects.toThrow("中断"); expect(store.records).toEqual(before);
    const loaded = await new ProfileRepository(store).load(); expect(loaded.notice).toContain("待入档");
    expect(loaded.profile.currency).toBe(270); expect(loaded.profile.inventory["settlement-1:loot:2"]).toBeDefined();
    expect((await repo.settle(result())).profile.currency).toBe(270); expect(store.records.pending).toBeUndefined();
  });
  it("并发重复结算只更新一次奖励和统计", async () => {
    const repo = new ProfileRepository(new MemoryStore()); await repo.load();
    await Promise.all([repo.settle(result()), repo.settle(result())]);
    const p = (await repo.load()).profile; expect(p.stats.runs).toBe(1); expect(p.appliedRuns).toEqual(["settlement-1"]); expect(p.currency).toBe(270);
  });
});
describe("方案与长期成长", () => {
  it("保存命名、加载和删除，丢失实例明确报告而不补造", () => {
    const initial = newProfile(), l = initial.blueprints[0].loadout;
    const p = saveBlueprint(initial, "custom", "长途车", l); expect(p.blueprints[1].name).toBe("长途车");
    delete p.inventory[l.parts[0].instanceId];
    expect(resolveLoadout(p, l).missing).toEqual([l.parts[0].instanceId]);
    expect(ownedStock(p, l.chassisId).loadout.parts).toHaveLength(l.parts.length - 1);
    expect(deleteBlueprint(p, "custom").blueprints).toHaveLength(1);
    expect(() => saveBlueprint(p, "bad", "坏引用", l)).toThrow();
  });
  it("升级、维修、购买和解锁原子消耗，资源不足不修改输入", () => {
    const initial = newProfile(), id = initial.blueprints[0].loadout.parts.find(p => p.partId === "machine-gun")!.instanceId;
    let p = upgradePart(initial, id); expect(p.currency).toBe(200); expect(p.materials.scrap).toBe(90);
    expect(instanceModifiers(p, p.blueprints[0].loadout)[0]).toMatchObject({ target: "weapon", instanceId: id, value: 0.05 });
    p.inventory[id].hp = 0; p = repairPart(p, id); expect(p.inventory[id].hp).toBeGreaterThan(0);
    p = buyPart(p, "inner-armor", "purchase:1"); expect(p.inventory["purchase:1"]).toBeDefined();
    p = unlockContent(p, "chassis", "rally-car"); expect(p.unlocks.chassis).toContain("rally-car");
    const before = structuredClone(p); expect(() => upgradePart(p, id)).toThrow(); expect(p).toEqual(before);
  });
  it("损失及耐久保存，下次出击不能恢复毁坏功能", () => {
    const p = newProfile(), l = p.blueprints[0].loadout;
    const engine = l.parts.find(p => p.partId === "engine-l4")!.instanceId;
    const r = { ...result(), durability: { [engine]: 0 }, lost: [l.parts[0].instanceId] };
    const updated = applySettlement(p, r); expect(updated.inventory[l.parts[0].instanceId]).toBeUndefined(); expect(updated.inventory[engine].hp).toBe(0);
    const s = new PveSession("next", 1, resolveLoadout(updated, l).loadout, undefined, { hp: { [engine]: 0 } });
    expect(s.composition.summary.canDrive).toBe(false);
  });
});
