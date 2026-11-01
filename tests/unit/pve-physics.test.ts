import { describe, expect, it } from "vitest";
import { PveSession } from "../../src/modes/pve/session";
import { SCRAPYARD } from "../../src/modes/pve/level";
import { stockLoadout } from "../../src/loadout/presets";
import { createState, IDLE } from "../../src/vehicle/physics/state";
import { geometry } from "../../src/vehicle/physics/geometry";
import { damageModule } from "../../src/combat/modules";
import { EntityPool } from "../../src/combat/pools";
import { FixedClock } from "../../src/simulation/clock";

const quiet = { ...SCRAPYARD, spawn: { x: 0, y: 0 }, regions: [], caches: [], exits: [], waves: [] };
const noWeapons = () => { const l = stockLoadout("sports-car"); return { ...l, parts: l.parts.filter(p => p.partId !== "machine-gun") }; };
function movingSession(mass = 0.2, x = 0.88, y = 0.2, radius = 0.3) {
  const s = new PveSession("contact", 7, noWeapons(), quiet); s.start();
  const id = s.world.entities.spawn({ position: { x, y }, hp: 1000, mass, radius, acceleration: 0, attack: 0 })!;
  const reset = () => {
    s.drive.vehicle = createState(s.composition.profile, { worldVelocity: { x: 4, y: 0 } });
    const p = s.world.entities, slot = p.slot(id); p.x[slot] = x; p.y[slot] = y; p.vx[slot] = p.vy[slot] = 0;
  };
  reset(); return { s, id, reset };
}
describe("副本物理接入", () => {
  it("包含真实碰撞的副本在30/60/120 FPS调度下状态完全一致", () => {
    const replay = (fps: number) => {
      const { s } = movingSession(), clock = new FixedClock();
      clock.advance(0, () => {});
      for (let frame = 1; frame <= fps; frame++) clock.advance(frame / fps, () => s.step(IDLE));
      expect(s.damage).toBeGreaterThan(0);
      return s.snapshot();
    };
    const reference = replay(120);
    expect(replay(30)).toEqual(reference); expect(replay(60)).toEqual(reference);
  });
  it("真实偏心接触改变双方运动，伤害冷却期间仍执行冲量", () => {
    const { s, id, reset } = movingSession(), p = s.world.entities, slot = p.slot(id);
    s.step(IDLE); const hp = p.hp[slot];
    expect(hp).toBeLessThan(1000); expect(p.vx[slot]).toBeGreaterThan(0); expect(Math.abs(s.drive.vehicle.r)).toBeGreaterThan(0.01);
    expect(s.damage).toBeCloseTo(1000 - hp, 10);
    reset(); s.step(IDLE);
    expect(p.hp[slot]).toBe(hp); expect(p.vx[slot]).toBeGreaterThan(0); expect(Math.abs(s.drive.vehicle.r)).toBeGreaterThan(0.01);
    const player = p.slot(s.world.playerId);
    expect(p.vx[player]).toBe(s.drive.vehicle.worldVelocity.x); expect(p.mass[player]).toBe(s.composition.profile.mass);
  });
  it("保守圆接近但车身未接触不产生伤害或动量", () => {
    const { s, id } = movingSession(0.2, 0.5, 0.5, 0.03), p = s.world.entities;
    s.step(IDLE); const slot = p.slot(id);
    expect(p.hp[slot]).toBe(1000); expect(p.vx[slot]).toBe(0); expect(p.vy[slot]).toBe(0); expect(s.damage).toBe(0);
  });
  it("固定建筑承受冲量仍保持原地", () => {
    const { s, id } = movingSession(0), p = s.world.entities;
    s.step(IDLE); const slot = p.slot(id);
    expect(p.x[slot]).toBe(0.88); expect(p.y[slot]).toBe(0.2); expect(p.vx[slot]).toBe(0);
    expect(s.drive.vehicle.speed).toBeLessThan(4); expect(Math.abs(s.drive.vehicle.r)).toBeGreaterThan(0.01);
  });
  it("模块脱落重新派生不移动车身，不补满燃料或电池", () => {
    const l = noWeapons();
    l.parts.push({ instanceId: "cannon", partId: "cannon", layer: "outer", x: 4, y: 1, rotation: 0, facing: 0 });
    const s = new PveSession("detach", 7, l, quiet); s.start();
    s.drive.vehicle = createState(s.composition.profile, { theta: 0.7 });
    s.drive.drivetrain.fuel = 5; s.drive.energy = s.weapons.energy = 3; s.drive.boost.cooldown = 2;
    const before = geometry(s.drive.vehicle, s.composition.profile).footprint;
    s.modules = damageModule(s.modules, "cannon", 1e6); s.step(IDLE);
    const after = geometry(s.drive.vehicle, s.composition.profile).footprint;
    before.forEach((p, i) => { expect(after[i].x).toBeCloseTo(p.x, 12); expect(after[i].y).toBeCloseTo(p.y, 12); });
    expect(s.modules.detached).toContain("cannon"); expect(s.drive.drivetrain.fuel).toBeLessThanOrEqual(5);
    expect(s.drive.energy).toBeLessThanOrEqual(3 + s.composition.resources.rechargeRate / 120);
    expect(s.drive.boost.cooldown).toBeCloseTo(2 - 1 / 120, 12);
  });
  it("非法实体不占用池槽或递增身份", () => {
    const pool = new EntityPool(1);
    expect(() => pool.spawn({ position: { x: 0, y: 0 }, hp: 1, mass: -1 })).toThrow();
    expect(pool.count).toBe(0); expect(pool.nextId).toBe(1);
    expect(pool.spawn({ position: { x: 0, y: 0 }, hp: 1, mass: 0 })).toBe(1);
  });
});
