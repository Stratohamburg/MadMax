import { describe, expect, it } from "vitest";
import { calculateDamage } from "../../src/combat/damage";
import { EntityPool, ProjectilePool } from "../../src/combat/pools";
import { SpatialHash } from "../../src/combat/spatial";
import { CombatWorld } from "../../src/combat/world";
import { createModules, damageByDirection, damageModule, moduleComposition, moduleCondition, repairModules, serviceVehicle } from "../../src/combat/modules";
import { stockLoadout } from "../../src/loadout";
import type { BulletEmission } from "../../src/combat/weapons";
const bullet = (patch: Partial<BulletEmission> = {}): BulletEmission => ({ angle: 0, speed: 240, damage: 10, kind: "physical", aoe: 0, penetration: 0, lifetime: 2, ...patch });

describe("池化战斗与伤害", () => {
  it("实体池固定容量，空间哈希重建后只查询当前桶", () => {
    const pool = new EntityPool(2), index = new SpatialHash();
    const id = pool.spawn({ position: { x: 0, y: 0 }, hp: 10 })!;
    pool.spawn({ position: { x: 10, y: 10 }, hp: 10 });
    expect(pool.spawn({ position: { x: 0, y: 0 }, hp: 10 })).toBeNull();
    index.rebuild(pool); expect(index.query({ x: 0, y: 0 }, 1)).toContain(pool.slot(id));
    pool.x[0] = 20; index.rebuild(pool); expect(index.query({ x: 0, y: 0 }, 1)).not.toContain(0);
    pool.active[0] = 0; expect(pool.spawn({ position: { x: 0, y: 0 }, hp: 10 })).not.toBeNull();
  });
  it("共享分层顺序为100×1.5×2，暴击/抗性/护甲可观测", () => {
    const result = calculateDamage(100, [
      { id: "a", source: "a", group: "a", target: "damage", attribute: "damage", layer: "increased", value: 0.5 },
      { id: "b", source: "b", group: "b", target: "damage", attribute: "damage", layer: "more", value: 2 },
    ], [], { resistance: 0.2, armor: 100 }, true);
    expect(result.afterLayers).toBe(300); expect(result.afterCritical).toBe(600); expect(result.final).toBe(240);
    expect(calculateDamage(10, [], [], { resistance: 100, armor: 10000 }).final).toBeGreaterThanOrEqual(0);
  });
  it("高速扫掠不穿透目标，溢出伤害只发一次死亡", () => {
    const world = new CombatWorld();
    const id = world.entities.spawn({ position: { x: 1, y: 0 }, hp: 5 })!;
    world.projectiles.spawn({ x: 0, y: 0 }, bullet(), 0, 1); world.step();
    expect(world.entities.slot(id)).toBe(-1);
    expect(world.events.filter(e => e.type === "death")).toHaveLength(1);
    world.step(); expect(world.events.filter(e => e.type === "death")).toHaveLength(0);
    world.rebuild(); expect(world.query({ x: 0, y: 0 }, 10)).toHaveLength(0);
  });
  it("穿透弹跨步不会再次伤害同目标，命中后回收", () => {
    const world = new CombatWorld();
    const id = world.entities.spawn({ position: { x: 0, y: 0 }, hp: 100, radius: 1 })!;
    world.projectiles.spawn({ x: 0, y: 0 }, bullet({ speed: 1, penetration: 1 }), 0, 1);
    world.step(); world.step(); expect(world.entities.hp[world.entities.slot(id)]).toBe(90);
    for (let i = 0; i < 250; i++) world.step();
    expect(world.projectiles.activeCount).toBe(0);
  });
  it("爆炸范围内每目标只结算一次，直击不额外叠加", () => {
    const world = new CombatWorld();
    const a = world.entities.spawn({ position: { x: 1, y: 0 }, hp: 100 })!;
    const b = world.entities.spawn({ position: { x: 1, y: 0.5 }, hp: 100 })!;
    world.projectiles.spawn({ x: 0, y: 0 }, bullet({ aoe: 1 }), 0, 1); world.step();
    expect(world.entities.hp[world.entities.slot(a)]).toBe(90); expect(world.entities.hp[world.entities.slot(b)]).toBe(90);
  });
  it("制导有有限角速度，燃烧持续扣血并按时结束", () => {
    const world = new CombatWorld();
    const id = world.entities.spawn({ position: { x: 0, y: 2 }, hp: 100, radius: 0.5 })!;
    const slot = world.projectiles.spawn({ x: 0, y: 0 }, bullet({ speed: 1, homingTarget: id, turnRate: 1 }), 0, 1);
    world.step(); expect(world.projectiles.angle[slot]).toBeCloseTo(1 / 120);
    world.projectiles.spawn({ x: 0, y: 2 }, bullet({ speed: 0, burn: { dps: 12, duration: 1 }, source: "flame" }), 0, 1); world.step();
    const after = world.entities.hp[world.entities.slot(id)];
    for (let i = 0; i < 120; i++) world.step();
    expect(world.entities.hp[world.entities.slot(id)]).toBeCloseTo(after - 12, 6);
  });
  it("容量饱和合并同阵营同类型载荷，预期总伤害不丢失", () => {
    const pool = new ProjectilePool(6);
    for (let i = 0; i < 100; i++) pool.spawn({ x: 0, y: 0 }, bullet(), 0, 1);
    expect(pool.activeCount).toBe(1); expect(pool.aggregated).toBe(99);
    expect(Array.from(pool.damage).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(pool.emittedDamage).toBe(1000);
    const world = new CombatWorld(1, 6); const id = world.entities.spawn({ position: { x: 1, y: 0 }, hp: 2000 })!;
    for (let i = 0; i < 100; i++) world.projectiles.spawn({ x: 0, y: 0 }, bullet(), 0, 1);
    world.step(); expect(world.entities.hp[world.entities.slot(id)]).toBe(1000);
  });
  it("接触攻击受冷却限制，同种子逐步状态和事件一致", () => {
    const build = () => { const w = new CombatWorld(123); w.playerId = w.entities.spawn({ position: { x: 0, y: 0 }, hp: 100, faction: 0 })!; w.entities.spawn({ position: { x: 0.3, y: 0 }, hp: 100, attack: 10 }); return w; };
    const a = build(), b = build();
    for (let i = 0; i < 60; i++) { a.step(); b.step(); expect(a.snapshot()).toEqual(b.snapshot()); }
    expect(a.entities.hp[a.entities.slot(a.playerId)]).toBe(90);
  });
  it("满池穿透弹合并新载荷后只补结新增伤害，不吞掉也不重复旧伤害", () => {
    const world = new CombatWorld(1, 6), id = world.entities.spawn({ position: { x: 0, y: 0 }, hp: 1000, radius: 1 })!;
    const emission = bullet({ speed: 0.1, penetration: 100 });
    world.projectiles.spawn({ x: 0, y: 0 }, emission, 0, 1); world.step();
    expect(world.entities.hp[world.entities.slot(id)]).toBe(990);
    world.projectiles.spawn({ x: 0, y: 0 }, { ...emission, damage: 20 }, 0, 1); world.step(); world.step();
    expect(world.entities.hp[world.entities.slot(id)]).toBe(970);
  });
  it("扫掠按实际入射点排序，先命中外缘更近的大目标", () => {
    const world = new CombatWorld();
    const small = world.entities.spawn({ position: { x: 1, y: 0 }, hp: 100, radius: 0.1 })!;
    const large = world.entities.spawn({ position: { x: 1.2, y: 0 }, hp: 100, radius: 0.6 })!;
    world.projectiles.spawn({ x: 0, y: 0 }, bullet(), 0, 1); world.step();
    expect(world.entities.hp[world.entities.slot(small)]).toBe(100); expect(world.entities.hp[world.entities.slot(large)]).toBe(90);
  });
});

describe("模块损伤与维修", () => {
  it("50%为受损，零为毁坏，内部发动机不丢质量并失去动力", () => {
    let modules = createModules(stockLoadout("sports-car"));
    const engine = modules.loadout.parts.find(p => p.partId === "engine-l4")!;
    const mass = moduleComposition(modules).profile.mass;
    modules = damageModule(modules, engine.instanceId, 50);
    expect(moduleCondition(modules.hp[engine.instanceId], 100)).toBe("Damaged");
    expect(moduleComposition(modules).engine!.maxPower).toBe(85);
    modules = damageModule(modules, engine.instanceId, 50);
    expect(moduleComposition(modules).summary.canDrive).toBe(false);
    expect(moduleComposition(modules).profile.mass).toBe(mass);
  });
  it("外挂脱落后重新派生质量减少，方向装甲先吸收伤害", () => {
    let modules = createModules(stockLoadout("sports-car"));
    const gun = modules.loadout.parts.find(p => p.partId === "machine-gun")!;
    const original = moduleComposition(modules).profile.mass;
    const result = damageByDirection(modules, 20, gun.facing * Math.PI / 180);
    expect(result.hullDamage).toBe(0);
    modules = damageModule(result.modules, gun.instanceId, 1000);
    expect(modules.detached).toContain(gun.instanceId);
    expect(moduleComposition(modules).profile.mass).toBeLessThan(original);
  });
  it("弹药箱和电池毁坏后不再提供弹药容量或电力功能", () => {
    let modules = createModules(stockLoadout("sports-car"));
    const ammo = modules.loadout.parts.find(p => p.partId === "ammo-box")!, battery = modules.loadout.parts.find(p => p.partId === "battery")!;
    modules = damageModule(modules, ammo.instanceId, 10000); modules = damageModule(modules, battery.instanceId, 10000);
    const c = moduleComposition(modules); expect(c.resources.ammo).toEqual({}); expect(c.resources.capacity).toBe(0); expect(c.resources.maxOutput).toBe(0);
  });
  it("机械师修复受损但不复活，维修区将内部毁坏件恢复到50%", () => {
    const stock = stockLoadout("sports-car");
    let modules = createModules({ ...stock, parts: [...stock.parts, { instanceId: "mechanic", partId: "mechanic", layer: "inner", x: 0, y: 0, rotation: 0, facing: 0 }] });
    const engine = modules.loadout.parts.find(p => p.partId === "engine-l4")!;
    modules = damageModule(modules, engine.instanceId, 100);
    expect(repairModules(modules, 1, false).hp[engine.instanceId]).toBe(0);
    modules = repairModules(modules, 1, true); expect(modules.hp[engine.instanceId]).toBe(50);
    expect(repairModules(modules, 1, false).hp[engine.instanceId]).toBeGreaterThan(50);
    const served = serviceVehicle(modules, { random: 1, weapons: {}, ammo: { ballistic: 0 }, energy: 0 }, 1 / 120, true);
    expect(served.weapons.ammo.ballistic).toBe(400);
    const tank = modules.loadout.parts.find(p => p.partId === "fuel-tank")!;
    expect(damageModule(modules, tank.instanceId, 1000).fireEvents).toContain(tank.instanceId);
  });
});
