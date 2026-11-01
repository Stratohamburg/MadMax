import { describe, expect, it } from "vitest";
import { compose, stockLoadout } from "../../src/loadout";
import { createState } from "../../src/vehicle/physics/state";
import { chooseTarget, createWeaponSystem, stepWeapons, WEAPONS, worldMount } from "../../src/combat/weapons";
import type { Target, TargetQuery, WeaponDefinition } from "../../src/combat/weapons";
import { nextRandom } from "../../src/simulation/random";
import { applyExternalImpulse } from "../../src/vehicle/physics/physical";
const composition = (partId = "machine-gun") => {
  const stock = stockLoadout("sports-car");
  return compose({ ...stock, parts: [...stock.parts.filter(p => p.partId !== "machine-gun"),
    { instanceId: "weapon", partId, x: 0, y: 0, layer: "outer" as const, rotation: 0, facing: 0 }] });
};
const target = (id = 1, x = 2, y = 0): Target => ({ id, position: { x, y }, hp: 100, threat: 1, radius: 0.3 });
const query = (...targets: Target[]): TargetQuery => ({ query: () => targets });
const definitions = (id: string, patch: Partial<WeaponDefinition>) => ({ ...WEAPONS, [id]: { ...WEAPONS[id], ...patch } });

describe("自动武器合同", () => {
  it("目录覆盖四类，参数合法；播种状态可复现且零种子可运行", () => {
    expect(new Set(Object.values(WEAPONS).map(w => w.trigger)).size).toBe(4);
    for (const weapon of Object.values(WEAPONS)) { expect(weapon.fireRate).toBeGreaterThan(0); expect(weapon.heatRecovery).toBeLessThan(weapon.heatMax); }
    expect(nextRandom(123)).toEqual(nextRandom(123));
    expect(nextRandom(0).state).not.toBe(0);
  });
  it("世界挂点随车体旋转；目标规则平局按稳定ID", () => {
    const mount = worldMount({ x: 10, y: 20 }, Math.PI / 2, { x: 2, y: 1 }, Math.PI / 4);
    expect(mount.origin.x).toBeCloseTo(9); expect(mount.origin.y).toBeCloseTo(22);
    expect(mount.baseAngle).toBeCloseTo(Math.PI * 0.75);
    const a = target(2), b = target(1);
    expect(chooseTarget([a, b], { x: 0, y: 0 }, "nearest")?.id).toBe(1);
    expect(chooseTarget([{ ...a, threat: 5 }, b], { x: 0, y: 0 }, "threat")?.id).toBe(2);
    expect(chooseTarget([{ ...a, hp: 2 }, b], { x: 0, y: 0 }, "lowest-hp")?.id).toBe(2);
  });
  it("无人为开火输入也会射击，无目标停火", () => {
    const c = composition(), vehicle = createState(c.profile), state = createWeaponSystem(c);
    expect(stepWeapons(state, vehicle, c, query(target())).fire).toHaveLength(1);
    expect(stepWeapons(state, vehicle, c, query()).fire).toHaveLength(0);
  });
  it("炮台以有限转速对准，不可达扇形目标被忽略", () => {
    const c = composition("cannon"), vehicle = createState(c.profile);
    let state = createWeaponSystem(c), shots = 0;
    const targets = query(target(1, 0, 3));
    for (let i = 0; i < 120; i++) {
      const result = stepWeapons(state, vehicle, c, targets); state = result.state; shots += result.fire.length;
      expect(Math.abs(state.weapons.weapon.angle)).toBeLessThanOrEqual(WEAPONS.cannon.turnRate * (i + 1) / 120 + 1e-9);
    }
    expect(shots).toBe(0);
    for (let i = 0; i < 120; i++) { const result = stepWeapons(state, vehicle, c, targets); state = result.state; shots += result.fire.length; }
    expect(shots).toBeGreaterThan(0);
    expect(stepWeapons(createWeaponSystem(c), vehicle, c, query(target(1, -3))).fire).toHaveLength(0);
  });
  it("固定武器射界外停火，转动车头后入界开火", () => {
    const c = composition("shotgun"), state = createWeaponSystem(c);
    expect(stepWeapons(state, createState(c.profile), c, query(target(1, 0, 2))).fire).toHaveLength(0);
    const result = stepWeapons(state, createState(c.profile, { theta: Math.PI / 2 }), c, query(target(1, 0, 2)));
    expect(result.fire).toHaveLength(1);
    expect(result.fire[0].bullets).toHaveLength(7);
  });
  it("制导需保持同目标，切换/离开清零，重新锁定后发射", () => {
    const c = composition("missile"), vehicle = createState(c.profile);
    let state = createWeaponSystem(c);
    for (let i = 0; i < 40; i++) { const result = stepWeapons(state, vehicle, c, query(target())); state = result.state; expect(result.fire).toHaveLength(0); }
    state = stepWeapons(state, vehicle, c, query(target(2))).state;
    expect(state.weapons.weapon.lockProgress).toBeCloseTo(1 / 120);
    state = stepWeapons(state, vehicle, c, query()).state;
    expect(state.weapons.weapon.lockProgress).toBe(0);
    let count = 0;
    for (let i = 0; i < 85; i++) { const result = stepWeapons(state, vehicle, c, query(target())); state = result.state; count += result.fire.length; }
    expect(count).toBe(1);
  });
  it("制导离开区域可按配置衰减进度", () => {
    const c = composition("missile"), vehicle = createState(c.profile);
    const options = { definitions: definitions("missile", { lockLoss: "decay", lockDecay: 0.5 }) };
    let state = createWeaponSystem(c);
    for (let i = 0; i < 30; i++) state = stepWeapons(state, vehicle, c, query(target()), options).state;
    const before = state.weapons.weapon.lockProgress;
    state = stepWeapons(state, vehicle, c, query(), options).state;
    expect(state.weapons.weapon.lockProgress).toBeCloseTo(before - 0.5 / 120);
  });
  it("被动碰撞事件去重且受内置冷却限制", () => {
    const stock = stockLoadout("sports-car");
    const c = compose({ ...stock, parts: [...stock.parts, { instanceId: "passive", partId: "spikes", layer: "outer", x: 5, y: 0, rotation: 0, facing: 0 }] });
    const vehicle = createState(c.profile), options = { events: [{ sequence: 1, type: "collision" as const, magnitude: 1 }] };
    const first = stepWeapons(createWeaponSystem(c), vehicle, c, query(), options);
    expect(first.fire).toHaveLength(1);
    expect(stepWeapons(first.state, vehicle, c, query(), options).fire).toHaveLength(0);
    const newer = { events: [{ sequence: 2, type: "collision" as const, magnitude: 1 }] };
    expect(stepWeapons(first.state, vehicle, c, query(), newer).fire).toHaveLength(0);
  });
  it("过热停火，降低到恢复阈值后恢复射击", () => {
    const c = composition(), vehicle = createState(c.profile), options = { definitions: definitions("machine-gun", { heatPerShot: 2, heatMax: 2, heatRecovery: 0.5, cooling: 2 }) };
    const first = stepWeapons(createWeaponSystem(c), vehicle, c, query(target()), options);
    expect(first.state.weapons.weapon.overheated).toBe(true);
    let state = first.state, shots = 0;
    for (let i = 0; i < 80; i++) { const result = stepWeapons(state, vehicle, c, query(target()), options); state = result.state; shots += result.fire.length; }
    expect(shots).toBe(0);
    for (let i = 0; i < 40; i++) { const result = stepWeapons(state, vehicle, c, query(target()), options); state = result.state; shots += result.fire.length; }
    expect(shots).toBeGreaterThan(0);
  });
  it("共享弹药按实例稳定顺序供给，缺电停火，供电不足降低射速", () => {
    const stock = stockLoadout("sports-car");
    const c = compose({ ...stock, parts: [...stock.parts.filter(p => p.partId !== "machine-gun"),
      { instanceId: "b", partId: "machine-gun", x: 0, y: 0, layer: "outer", rotation: 0, facing: 0 },
      { instanceId: "a", partId: "machine-gun", x: 1, y: 0, layer: "outer", rotation: 0, facing: 0 }] });
    const vehicle = createState(c.profile), state = createWeaponSystem(c);
    state.ammo.ballistic = 1;
    const result = stepWeapons(state, vehicle, c, query(target()));
    expect(result.fire.map(f => f.weaponInstanceId)).toEqual(["a"]);
    expect(result.state.ammo.ballistic).toBe(0);
    expect(stepWeapons({ ...state, energy: 0 }, vehicle, c, query(target())).fire).toHaveLength(0);
    const low = { ...c, resources: { ...c.resources, maxOutput: 4 } };
    const slowed = stepWeapons(createWeaponSystem(low), vehicle, low, query(target()));
    const normal = stepWeapons(createWeaponSystem(c), vehicle, c, query(target()));
    expect(slowed.state.weapons.a.cooldown).toBeGreaterThan(normal.state.weapons.a.cooldown);
  });
  it("受损武器射速减半且散布加倍，毁坏停火", () => {
    const c = composition("shotgun"), vehicle = createState(c.profile), state = createWeaponSystem(c, 10);
    const damaged = compose(c.loadout, { health: { weapon: 0.5 } });
    const normal = stepWeapons(state, vehicle, c, query(target()));
    const result = stepWeapons(state, vehicle, damaged, query(target()));
    expect(result.state.weapons.weapon.cooldown).toBeGreaterThan(normal.state.weapons.weapon.cooldown);
    expect(result.fire[0].bullets[0].angle).toBeCloseTo(normal.fire[0].bullets[0].angle * 2);
    expect(stepWeapons(state, vehicle, compose(c.loadout, { health: { weapon: 0 } }), query(target())).fire).toHaveLength(0);
  });
  it("后坐力作用在世界挂点，射界状态保留1.5倍车身净空", () => {
    const c = composition("cannon"), vehicle = createState(c.profile);
    const result = stepWeapons(createWeaponSystem(c), vehicle, c, query(target()));
    expect(result.recoil).toHaveLength(1);
    expect(result.recoil[0].impulse.x).toBeCloseTo(-WEAPONS.cannon.recoil);
    expect(applyExternalImpulse(vehicle, c.profile, result.recoil[0].impulse, result.recoil[0].point).worldVelocity.x).toBeLessThan(0);
    expect(result.visuals[0].clearRadius).toBeGreaterThan(c.profile.geometry.width * 0.75);
    expect(result.visuals[0].rimProgress).toBeGreaterThanOrEqual(0);
    expect(result.visuals[0].rimProgress).toBeLessThanOrEqual(1);
  });
  it("同种子/输入得到相同弹丸，JSON状态恢复后事件继续一致", () => {
    const c = composition("shotgun"), vehicle = createState(c.profile), state = createWeaponSystem(c, 123);
    const first = stepWeapons(state, vehicle, c, query(target()));
    expect(stepWeapons(state, vehicle, c, query(target()))).toEqual(first);
    expect(stepWeapons(JSON.parse(JSON.stringify(first.state)), vehicle, c, query(target()))).toEqual(stepWeapons(first.state, vehicle, c, query(target())));
    expect(state.weapons).toEqual({});
  });
});
