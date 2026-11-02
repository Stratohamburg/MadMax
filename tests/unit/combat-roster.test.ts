import { describe, expect, it } from "vitest";
import { ENEMIES, enemySpawn } from "../../src/combat/enemies";
import { WEAPONS } from "../../src/combat/weapons/definitions";
import { WEAPON_DESIGNS, muzzleOffset } from "../../src/combat/weapons/presentation";
import { CombatWorld } from "../../src/combat/world";
import { createWeaponSystem, newWeaponRuntime, stepWeapons } from "../../src/combat/weapons/system";
import { compose, stockLoadout } from "../../src/loadout";
import { createState, IDLE } from "../../src/vehicle/physics/state";
import { PveSession } from "../../src/modes/pve/session";
import { SCRAPYARD } from "../../src/modes/pve/level";
import { CombatEffects } from "../../src/render/combat";
import { resolveBodyContact } from "../../src/vehicle/physics/body-contact";
import { MemoryStore } from "../../src/persistence/store";
import { ProfileRepository } from "../../src/persistence/repository";
import { FixedClock } from "../../src/simulation/clock";

describe("武器配置与完整反馈", () => {
  it("九种现有武器均有独立外形、枪口、弹道和特效参数", () => {
    expect(Object.keys(WEAPON_DESIGNS).sort()).toEqual(Object.keys(WEAPONS).sort());
    expect(new Set(Object.values(WEAPON_DESIGNS).map(d => d.moving)).size).toBe(9);
    for (const [id, d] of Object.entries(WEAPON_DESIGNS)) {
      expect(d.name).toBeTruthy(); expect(d.base).toContain("M"); expect(d.detail).toContain("M");
      for (const value of [d.scale, d.width, d.flash, d.impact]) expect(value).toBeGreaterThan(0);
      expect(muzzleOffset(id)).toBeGreaterThanOrEqual(0);
      expect(WEAPONS[id].turnRate).toBeGreaterThan(0);
    }
    expect(WEAPONS.cannon.arc).toBeCloseTo(Math.PI * 1.5); expect(WEAPONS.autocannon.arc).toBeCloseTo(Math.PI);
  });
  it("炮台发射坐标等于实际枪口位置", () => {
    const c = compose(stockLoadout("sports-car")), vehicle = createState(c.profile);
    const query = { query: () => [{ id: 1, position: { x: 2, y: 0 }, hp: 100, threat: 1, radius: .2 }] };
    let first = stepWeapons(createWeaponSystem(c), vehicle, c, query);
    for (let i = 0; i < 120 && !first.fire.length; i++) first = stepWeapons(first.state, vehicle, c, query);
    expect(first.fire).toHaveLength(1);
    const fire = first.fire[0], v = first.visuals[0];
    expect(fire.origin.x - v.origin.x).toBeCloseTo(Math.cos(v.aimAngle) * muzzleOffset(fire.weaponId));
    expect(fire.origin.y - v.origin.y).toBeCloseTo(Math.sin(v.aimAngle) * muzzleOffset(fire.weaponId));
    const world = new CombatWorld(1); world.emit(first.fire);
    expect(world.presentation[0].type).toBe("muzzle"); expect(world.projectiles.payload.find(Boolean)?.weaponId).toBe("machine-gun");
  });
  it("有限射界状态在丢失目标后仍约束于可达转角", () => {
    const stock = stockLoadout("sports-car"), c = compose({ ...stock, parts: [...stock.parts.filter(p => p.partId !== "machine-gun"),
      { instanceId: "gun", partId: "cannon", layer: "outer", x: 0, y: 0, rotation: 0, facing: 0 }] });
    const state = createWeaponSystem(c); state.weapons.gun = { ...newWeaponRuntime(), angle: Math.PI };
    const result = stepWeapons(state, createState(c.profile), c, { query: () => [] });
    expect(result.state.weapons.gun.angle).toBeCloseTo(WEAPONS.cannon.arc / 2); expect(result.fire).toHaveLength(0);
  });
  for (const id of Object.keys(WEAPONS)) it(`${id} 从真实武器系统产生开火与命中反馈`, () => {
    const stock = stockLoadout("sports-car"), c = compose({ ...stock, parts: [...stock.parts.filter(p => p.partId !== "machine-gun"),
      { instanceId: "gun", partId: id, layer: "outer", x: WEAPONS[id].trigger === "passive" ? 5 : 0, y: 0, rotation: 0, facing: 0 }] });
    c.resources = { ...c.resources, capacity: 1000, maxOutput: 100, ammo: { ballistic: 500, rocket: 20 } };
    const vehicle = createState(c.profile), mount = c.mounts.find(m => m.weaponId === id)!, world = new CombatWorld(7);
    world.playerId = world.entities.spawn({ position: vehicle.position, hp: 10000, faction: 0 })!;
    const enemy = world.entities.spawn({ position: { x: mount.position.x + .65, y: mount.position.y }, hp: 10000, attack: 0 })!; world.rebuild();
    let state = createWeaponSystem(c);
    for (let i = 0; i < 360; i++) {
      const result = stepWeapons(state, vehicle, c, world, { events: [{ sequence: i, type: id === "spikes" ? "collision" : "hit", magnitude: 10 }] });
      state = result.state; world.emit(result.fire); world.step();
    }
    expect(world.entities.hp[world.entities.slot(enemy)]).toBeLessThan(10000);
    expect(world.presentation.some(e => e.type === "muzzle" && e.weaponId === id)).toBe(true);
    expect(world.presentation.some(e => e.type === "impact" && e.weaponId === id)).toBe(true);
    expect(world.presentation.some(e => e.type === "explosion" && e.weaponId === id)).toBe(WEAPONS[id].aoe > 0);
  });
  it("枪口和命中事件不丢失；展示消费去重、有上限且不修改世界", () => {
    const world = new CombatWorld(1); world.playerId = world.entities.spawn({ position: { x: 0, y: 0 }, hp: 100, faction: 0 })!;
    world.entities.spawn({ position: { x: 1, y: 0 }, hp: 100, attack: 0 }); world.rebuild();
    world.emit([{ weaponId: "machine-gun", weaponInstanceId: "gun", origin: { x: 0, y: 0 }, angle: 0, targetId: null, tags: [], bullets: [{ angle: 0, speed: 240, damage: 1, kind: "physical", aoe: 0, penetration: 0, lifetime: 1 }] }]);
    world.step(); expect(world.presentation.map(e => e.type)).toContain("impact");
    const before = structuredClone(world.snapshot()), effects = new CombatEffects();
    effects.ingest(world.presentation, world.time); const count = effects.active.length; effects.ingest(world.presentation, world.time); expect(effects.active.length).toBe(count);
    expect(world.snapshot()).toEqual(before);
    for (let i = 0; i < 1000; i++) world.present({ type: "muzzle", position: { x: 0, y: 0 }, angle: 0, weaponId: "machine-gun", faction: 1, size: 1 });
    expect(world.presentation).toHaveLength(512); effects.ingest(world.presentation, world.time); expect(effects.active).toHaveLength(256);
    effects.ingest([], world.time + 1); expect(effects.active).toHaveLength(0);
  });
});
describe("敌人配置与真实攻击", () => {
  it("真实敌方交火在30/60/120渲染帧率下产生相同完整状态与展示事件", () => {
    const replay = (fps: number) => {
      const level = { ...SCRAPYARD, spawn: { x: 0, y: 0 }, regions: [], caches: [], exits: [], waves: [
        { at: 0, count: 1, position: { x: 0, y: -3 }, spread: 0, enemy: enemySpawn("bunker", { x: 0, y: 0 }) },
        { at: 0, count: 1, position: { x: -2, y: -2 }, spread: 0, enemy: enemySpawn("rifleman", { x: 0, y: 0 }) },
      ] };
      const s = new PveSession("exchange", 7, stockLoadout("sports-car"), level), clock = new FixedClock(); s.start();
      clock.advance(0, () => {});
      for (let frame = 1; frame <= fps * 2; frame++) clock.advance(frame / fps, () => s.step(IDLE));
      return s.snapshot();
    };
    const result = replay(30); expect(replay(60)).toEqual(result); expect(replay(120)).toEqual(result);
    for (const faction of [0, 1]) expect(result.world.presentation.some(e => e.type === "muzzle" && e.faction === faction)).toBe(true);
    expect(result.world.presentation.some(e => e.type === "impact")).toBe(true);
  });
  it("全部敌人配置有效且波次包含人、车辆与建筑", () => {
    expect(new Set(Object.values(ENEMIES).map(d => d.kind))).toEqual(new Set(["infantry", "vehicle", "building"]));
    const waveIds = new Set(SCRAPYARD.waves.map(w => w.enemy.archetype));
    for (const d of Object.values(ENEMIES)) {
      expect(WEAPONS[d.weaponId]).toBeDefined(); expect(d.hp).toBeGreaterThan(0); expect(d.radius).toBeGreaterThan(0); expect(waveIds.has(d.id)).toBe(true);
      if (d.kind === "building") { expect(d.speed).toBe(0); expect(d.mass).toBe(0); }
    }
  });
  for (const id of Object.keys(ENEMIES)) it(`${id} 发射真实敌方弹丸并命中玩家，建筑不移动`, () => {
    const d = ENEMIES[id], world = new CombatWorld(7), position = { x: Math.cos(d.facing) * 3, y: Math.sin(d.facing) * 3 };
    world.playerId = world.entities.spawn({ position, hp: 10000, faction: 0 })!;
    const enemy = world.entities.spawn(enemySpawn(id, { x: 0, y: 0 }))!, slot = world.entities.slot(enemy);
    for (let i = 0; i < 600; i++) world.step();
    expect(world.projectiles.emittedDamage).toBeGreaterThan(0); expect(world.entities.hp[world.entities.slot(world.playerId)]).toBeLessThan(10000);
    expect(world.presentation.some(e => e.faction === 1 && e.type === "muzzle")).toBe(true);
    expect(world.presentation.some(e => e.faction === 1 && e.type === "impact")).toBe(true);
    if (d.kind === "building") { expect(world.entities.x[slot]).toBe(0); expect(world.entities.y[slot]).toBe(0); }
  });
  it("高速真实接触撞死步兵，车体扣血且死亡不重复", () => {
    const level = { ...SCRAPYARD, spawn: { x: 0, y: 0 }, regions: [], caches: [], exits: [], waves: [] };
    const s = new PveSession("ram", 1, stockLoadout("sports-car"), level); s.start();
    s.drive.vehicle = createState(s.composition.profile, { position: { x: 0, y: 0 }, theta: 0, worldVelocity: { x: 3, y: 0 } });
    const id = s.world.entities.spawn(enemySpawn("rifleman", { x: .53, y: 0 }))!, player = s.world.entities.slot(s.world.playerId), hp = s.world.entities.hp[player];
    s.step(IDLE); expect(s.world.entities.slot(id)).toBe(-1); expect(s.world.entities.hp[player]).toBeLessThan(hp); expect(s.world.kills).toBe(1);
    for (let i = 0; i < 60; i++) s.step(IDLE); expect(s.world.kills).toBe(1); expect(s.damage).toBeGreaterThan(0);
  });
  it("慢速接触不会触发碾压；高速碾压的击杀和伤害只入档一次", async () => {
    const level = { ...SCRAPYARD, spawn: { x: 0, y: 0 }, regions: [], caches: [], exits: [], waves: [] };
    const run = (speed: number) => {
      const s = new PveSession(`ram:${speed}`, 1, stockLoadout("sports-car"), level); s.start();
      s.drive.vehicle = createState(s.composition.profile, { worldVelocity: { x: speed, y: 0 } });
      const id = s.world.entities.spawn(enemySpawn("rocketeer", { x: .53, y: 0 }))!; s.step(IDLE); return { s, id };
    };
    const slow = run(.5); expect(slow.s.world.entities.slot(slow.id)).toBeGreaterThanOrEqual(0); expect(slow.s.world.kills).toBe(0);
    const { s } = run(3); s.finish("extracted");
    expect(s.run.settlement?.kills).toBe(1); expect(s.run.settlement?.damage).toBeGreaterThan(0);
    const repo = new ProfileRepository(new MemoryStore()); await repo.load();
    await repo.settle(s.run.settlement!); await repo.settle(s.run.settlement!);
    const profile = (await repo.load()).profile; expect(profile.stats.kills).toBe(1); expect(profile.stats.damage).toBe(s.damage); expect(profile.stats.runs).toBe(1);
  });
  it("碉堡背面射界外停火，友军不挡住敌方弹丸也不受伤", () => {
    const world = new CombatWorld(2), p = world.entities;
    world.playerId = p.spawn({ position: { x: 0, y: -3 }, hp: 10000, faction: 0 })!;
    const bunker = p.spawn(enemySpawn("bunker", { x: 0, y: 0 }))!;
    for (let i = 0; i < 120; i++) world.step(); expect(world.projectiles.emittedDamage).toBe(0);
    const player = p.slot(world.playerId); p.y[player] = 3;
    const friend = p.spawn(enemySpawn("bunker", { x: 0, y: 1.5 }))!, slot = p.slot(friend); p.theta[slot] = -Math.PI / 2;
    for (let i = 0; i < 240; i++) world.step();
    expect(p.hp[slot]).toBe(ENEMIES.bunker.hp); expect(p.hp[p.slot(bunker)]).toBe(ENEMIES.bunker.hp);
    expect(p.hp[player]).toBeLessThan(10000);
    expect(world.presentation.some(e => e.type === "impact" && e.faction === 1)).toBe(true);
  });
  it("碉堡的静态接触不会改变其位置或速度", () => {
    const c = compose(stockLoadout("sports-car")), state = createState(c.profile, { worldVelocity: { x: 2, y: 0 } });
    const other = { position: { x: .6, y: 0 }, velocity: { x: 0, y: 0 }, radius: .5, mass: 0 };
    const result = resolveBodyContact(state, c.profile, other); expect(result.contact?.impulse).toBeGreaterThan(0);
    expect(result.other.position).toEqual(other.position); expect(result.other.velocity).toEqual(other.velocity);
  });
});
