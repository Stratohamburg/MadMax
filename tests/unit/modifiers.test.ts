import { describe, expect, it } from "vitest";
import { activeModifiers, adjacencyGraph, adjacencyModifiers, advanceModifiers, chooseUpgrade, createModifierRun, diagnoseBuild, grantUpgrade, offerChoices, UPGRADES } from "../../src/progression/modifiers";
import { evaluateAttribute } from "../../src/stats/modifiers";
import { compose, emptyLoadout, stockLoadout } from "../../src/loadout";
import { createState } from "../../src/vehicle/physics/state";
import { createWeaponSystem, stepWeapons } from "../../src/combat/weapons";
import { calculateDamage } from "../../src/combat/damage";

describe("局内修饰符", () => {
  it("标签隔离、车辆/武器/伤害均消费同一属性层", () => {
    let state = grantUpgrade(createModifierRun(1), "explosive");
    const modifiers = activeModifiers(state);
    expect(evaluateAttribute(100, modifiers, "weapon", "damage", ["barrage"]).value).toBe(100);
    expect(evaluateAttribute(100, modifiers, "weapon", "damage", ["explosive"]).value).toBe(125);
    const base = compose(stockLoadout("sports-car"));
    state = grantUpgrade(state, "power");
    expect(compose(base.loadout, { modifiers: activeModifiers(state) }).profile.power.driveForce).toBeGreaterThan(base.profile.power.driveForce);
    const upgraded = grantUpgrade(createModifierRun(1), "damage"), c = compose(base.loadout, { modifiers: activeModifiers(upgraded) });
    const mount = c.mounts.find(m => m.weaponId)!;
    const fired = stepWeapons(createWeaponSystem(c), createState(c.profile), c, { query: () => [{ id: 1, hp: 100, radius: 0.3, threat: 1, position: { x: mount.position.x + 3, y: mount.position.y } }] });
    expect(fired.fire[0].bullets[0].damage).toBe(10);
    expect(calculateDamage(100, [{ id: "m", source: "s", group: "s", target: "damage", attribute: "damage", layer: "more", value: 2 }]).final).toBe(200);
  });
  it("堆叠不超上限，限时extend刷新，到期移除并恢复基础属性", () => {
    let state = createModifierRun(1);
    for (let i = 0; i < 10; i++) state = grantUpgrade(state, "grip");
    expect(state.owned[0].stacks).toBe(3);
    state = grantUpgrade(state, "adrenaline"); state = advanceModifiers(state, 10); state = grantUpgrade(state, "adrenaline");
    expect(state.owned.find(u => u.id === "adrenaline")?.expiresAt).toBe(40);
    state = advanceModifiers(state, 31);
    expect(state.owned.some(u => u.id === "adrenaline")).toBe(false);
  });
  it("同层占格四邻接，只给相邻武器实例加成，跨层/拆开消失", () => {
    const a = { instanceId: "a", partId: "machine-gun", layer: "outer" as const, x: 0, y: 0, rotation: 0 as const, facing: 0 as const };
    const b = { ...a, instanceId: "b", x: 1 }, far = { ...a, instanceId: "c", x: 3 };
    const loadout = { ...emptyLoadout("sports-car"), parts: [a, b, far] };
    expect(adjacencyGraph(loadout).a).toEqual(["b"]);
    const modifiers = adjacencyModifiers(loadout);
    expect(evaluateAttribute(100, modifiers, "weapon", "damage", ["barrage"], "a").value).toBeCloseTo(110);
    expect(evaluateAttribute(100, modifiers, "weapon", "damage", ["barrage"], "c").value).toBe(100);
    expect(adjacencyModifiers({ ...loadout, parts: [a, { ...b, x: 2 }] })).toHaveLength(0);
    expect(adjacencyGraph({ ...loadout, parts: [a, { ...b, instanceId: "inner", partId: "battery", layer: "inner", x: 1 }] }).a).toEqual([]);
  });
  it("同种子候选稳定、三选一无重复，满级排除，重复请求不重抽", () => {
    let state = createModifierRun(123);
    for (let i = 0; i < UPGRADES.grip.maxStacks; i++) state = grantUpgrade(state, "grip");
    const offered = offerChoices(state, ["barrage"]);
    expect(offered).toEqual(offerChoices(state, ["barrage"]));
    expect(offered.offered).toHaveLength(3); expect(new Set(offered.offered).size).toBe(3); expect(offered.offered).not.toContain("grip");
    expect(offerChoices(offered, ["barrage"])).toBe(offered);
  });
  it("保底强制匹配标签，刷新限次，选择校验，下一局清空", () => {
    const initial = { ...createModifierRun(42), pity: 3 };
    let state = offerChoices(initial, ["fire"]);
    expect(state.offered).toContain("fire");
    for (let i = 0; i < 3; i++) state = offerChoices(state, ["fire"], true);
    expect(() => offerChoices(state, ["fire"], true)).toThrow("刷新");
    expect(() => chooseUpgrade(state, "unknown")).toThrow("待选");
    state = chooseUpgrade(state, state.offered[0]); expect(state.owned).toHaveLength(1); expect(state.offered).toHaveLength(0);
    expect(createModifierRun(42).owned).toEqual([]);
  });
  it("数值诊断输出贡献与DPS，超过阈值给出告警", () => {
    const loadout = stockLoadout("sports-car");
    const gun = loadout.parts.find(p => p.partId === "machine-gun")!;
    const explosive = { ...loadout, parts: loadout.parts.map(p => p === gun ? { ...p, partId: "cannon" } : p) };
    let state = createModifierRun(1); for (let i = 0; i < 3; i++) state = grantUpgrade(state, "explosive");
    const report = diagnoseBuild(explosive, state, 1.5);
    expect(report.burstDps).toBeGreaterThan(0); expect(report.weapons[0].damage.applied).toHaveLength(3); expect(report.warnings.length).toBeGreaterThan(0);
  });
});
