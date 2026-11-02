import { describe, expect, it } from "vitest";
import { compose, stockLoadout } from "../../src/loadout";
import { advanceAssemblyDrive, createAssemblyDrive, migrateAssemblyDrive } from "../../src/vehicle/assembly-drive";
import { controlVehicle } from "../../src/vehicle/control/driver";
import { RULES, derived } from "../../src/vehicle/physics/config";
import { getProfile } from "../../src/vehicle/physics/profiles";
import { advancePhysical, mechanicalEnergy } from "../../src/vehicle/physics/physical";
import { createState, stateFrom, IDLE } from "../../src/vehicle/physics/state";
import { resolveStaticContacts } from "../../src/vehicle/physics/world-contact";
import { resolveVehicleContact } from "../../src/vehicle/physics/vehicle-contact";
import { createWeaponSystem, stepWeapons } from "../../src/combat/weapons/system";
import { WEAPONS } from "../../src/combat/weapons/definitions";
import { PveSession } from "../../src/modes/pve/session";
import { SCRAPYARD } from "../../src/modes/pve/level";
import { ENEMIES, enemySpawn } from "../../src/combat/enemies";
import { enemyComposition } from "../../src/combat/enemy-vehicles";
import { CombatWorld } from "../../src/combat/world";
import { physicalObservation } from "../../src/vehicle/physics/physical";

describe("架构合同的实际执行", () => {
  it("非零空气阻力增加滑行损耗，载荷敏感性使重载轮胎抓地非线性", () => {
    const p = getProfile("sports-car"), s = createState(p, { worldVelocity: { x: 6, y: 0 } });
    const command = { steeringTarget: 0, drive: 0, brake: 0, rearBrake: 0 };
    const coast = advancePhysical(s, command, p, 1 / 240);
    const drag = advancePhysical(s, command, { ...p, power: { ...p.power, aero: 0.2 } }, 1 / 240);
    expect(drag.speed).toBeLessThan(coast.speed);
    expect(mechanicalEnergy(drag, p)).toBeLessThan(mechanicalEnergy(coast, p));
    const sensitive = { ...p, tires: { front: { ...p.tires.front, loadSensitivity: 0.2 }, rear: { ...p.tires.rear, loadSensitivity: 0.2 } } };
    const base = physicalObservation(s, sensitive);
    const loaded = physicalObservation(s, { ...sensitive, mass: p.mass * 2 });
    expect(loaded.front.load).toBeCloseTo(base.front.load * 2, 12);
    expect(loaded.front.capY).toBeLessThan(base.front.capY * 2);
    expect(loaded.front.capY).toBeGreaterThan(base.front.capY);
  });

  it("高射速在单步内多次充放电，储能有界且所有发射均扣除能量", () => {
    const c = compose(stockLoadout("sports-car")), v = createState(c.profile);
    c.resources = { ...c.resources, maxOutput: 240 }; c.auxiliaryPower = 0;
    const definitions = { ...WEAPONS, "machine-gun": { ...WEAPONS["machine-gun"], fireRate: 240, powerDraw: 240, heatPerShot: 0 } };
    const state = createWeaponSystem(c);
    const mount = c.mounts.find(m => m.weaponId === "machine-gun")!;
    const result = stepWeapons(state, v, c, { query: () => [{ id: 1, position: { x: mount.position.x + 3, y: mount.position.y }, radius: 0.1, hp: 100, threat: 1 }] }, { definitions });
    expect(result.fire).toHaveLength(2);
    expect(state.energy - result.state.energy).toBeCloseTo(2, 12);
    expect(result.powerConsumed).toBeCloseTo(2, 12);
    for (const gun of Object.values(result.state.weapons)) expect(gun.charge).toBeLessThanOrEqual(1);
  });

  it("独立手刹能力确实改变后轮制动，脚刹零输入保持独立", () => {
    const p = getProfile("sports-car"), s = createState(p, { worldVelocity: { x: 6, y: 0 } });
    const command = { steeringTarget: 0, drive: 0, brake: 0, rearBrake: 0, handbrake: 1 };
    const weak = advancePhysical(s, command, { ...p, power: { ...p.power, handbrakeForce: 0.1 } }, 1 / 240);
    const strong = advancePhysical(s, command, { ...p, power: { ...p.power, handbrakeForce: 30 } }, 1 / 240);
    expect(strong.wheelSpeeds.rear).toBeLessThan(weak.wheelSpeeds.rear);
    expect(strong.energy.brakeDissipation).toBeGreaterThan(weak.energy.brakeDissipation);
    expect(controlVehicle(s, { ...IDLE, handbrake: true }, p).command.handbrake).toBe(1);
  });

  it("装配每个控制步仅提交对应命令的历史，无驾驶员不施加手刹", () => {
    const c = compose(stockLoadout("sports-car")), s = createAssemblyDrive(c, { worldVelocity: { x: 3, y: 0 } });
    const input = { targetSpeed: 6, angle: 1.1, drift: true };
    const next = advanceAssemblyDrive(s, input, c);
    expect(next.vehicle.h).toBeCloseTo(1 - Math.exp(-RULES.outerStep / c.profile.drift.enterTime), 12);
    const noDriver = compose({ ...c.loadout, parts: c.loadout.parts.filter(p => p.partId !== "driver-seat") });
    const uncontrolled = createAssemblyDrive(noDriver, { worldVelocity: { x: 3, y: 0 } });
    expect(advanceAssemblyDrive(uncontrolled, { ...IDLE, handbrake: true }, noDriver).vehicle.energy.brakeDissipation).toBe(0);
  });

  it("静止穿透只修正位置，恢复系数只在阈值以上反弹且能量闭合", () => {
    const p = getProfile("sports-car"), s = createState(p);
    const contact = [{ normal: { x: -1, y: 0 }, point: { x: 0.6, y: 0 }, depth: 0.1 }];
    const rest = resolveStaticContacts(s, p, contact);
    expect(rest.position.x).toBeCloseTo(-0.1, 7); expect(rest.speed).toBe(0);
    const moving = createState(p, { worldVelocity: { x: 4, y: 0 } });
    const elastic = { ...p, contact: { friction: 0, restitution: 0.5, bounceThreshold: 0.5 } };
    const hit = resolveStaticContacts(moving, elastic, contact);
    expect(hit.worldVelocity.x).toBeCloseTo(-2, 12);
    expect(mechanicalEnergy(hit, p) + hit.energy.collisionDissipation).toBeCloseTo(mechanicalEnergy(moving, p), 12);
    const slow = resolveStaticContacts(createState(p, { worldVelocity: { x: 0.1, y: 0 } }), elastic, contact);
    expect(slow.worldVelocity.x).toBeCloseTo(0, 12);
  });

  it("偏心车辆接触交换动量和双方横摆，能量损失不重复记账", () => {
    const p = getProfile("sports-car"), a = createState(p, { worldVelocity: { x: 5, y: 0 } });
    const b = createState(p, { position: { x: 1.19, y: 0.25 } });
    const hit = resolveVehicleContact(a, p, b, p);
    expect(hit.contact?.impulse).toBeGreaterThan(0);
    expect(Math.abs(hit.vehicle.r)).toBeGreaterThan(0); expect(Math.abs(hit.other.r)).toBeGreaterThan(0);
    expect(hit.vehicle.worldVelocity.x + hit.other.worldVelocity.x).toBeCloseTo(5, 12);
    expect(hit.vehicle.worldVelocity.y + hit.other.worldVelocity.y).toBeCloseTo(0, 12);
    const initial = mechanicalEnergy(a, p) + mechanicalEnergy(b, p), final = mechanicalEnergy(hit.vehicle, p) + mechanicalEnergy(hit.other, p);
    expect(final).toBeLessThanOrEqual(initial);
    expect(final + hit.vehicle.energy.collisionDissipation + hit.other.energy.collisionDissipation).toBeCloseTo(initial, 12);
    expect(hit.vehicle.energy.externalWork + hit.other.energy.externalWork).toBeCloseTo(0, 12);
  });

  it("多喷射器和武器共用受损电池预算，限流不能降低额定耗能来保留全推力", () => {
    const c = compose(stockLoadout("sports-car"));
    c.resources = { ...c.resources, maxOutput: 6, rechargeRate: 0 }; c.auxiliaryPower = 2;
    c.thrusters = [-1, 1].map((side, i) => ({ id: `booster:${i}`, point: { x: 0, y: side * 0.2 }, direction: { x: 1, y: 0 }, parameters: { force: 10, energy: 20, duration: 1, cooldown: 3 } }));
    const initial = createAssemblyDrive(c), next = advanceAssemblyDrive(initial, { targetSpeed: 10, angle: 0, drift: false, boost: true }, c);
    expect(next.output.powerConsumed).toBeLessThanOrEqual(6 / 120 + 1e-12);
    expect(next.vehicle.energy.boostWork).toBeGreaterThan(0);
    expect(next.output.boostForce).toBeLessThanOrEqual(2 + 1e-12);
    const weapons = { ...createWeaponSystem(c), energy: next.energy };
    const shot = stepWeapons(weapons, next.vehicle, c, { query: () => [] }, { powerAvailable: next.output.powerAvailable });
    expect(next.output.powerConsumed! + shot.powerConsumed).toBeLessThanOrEqual(6 / 120 + 1e-12);
    expect(initial.energy - shot.state.energy).toBeCloseTo(next.output.powerConsumed! + shot.powerConsumed, 12);
    const after = { ...c, thrusters: [c.thrusters[1]] };
    const migrated = migrateAssemblyDrive(next, c, after);
    expect(Object.keys(migrated.thrusters!)).toEqual(["booster:1"]);
    expect(migrated.thrusters!["booster:1"]).toEqual(next.thrusters!["booster:1"]);
  });

  it("电力武器从零充能，不超本步功率，JSON续算及断电行为确定", () => {
    const c = compose(stockLoadout("sports-car")), v = createState(c.profile), query = { query: () => [{ id: 1, position: { x: 3, y: 0 }, radius: 0.1, hp: 100, threat: 1 }] };
    let state = createWeaponSystem(c), shots = 0;
    for (let tick = 0; tick < 120; tick++) {
      const result = stepWeapons(state, v, c, query, { powerAvailable: 2 });
      expect(state.energy - result.state.energy).toBeLessThanOrEqual(2 / 120 + 1e-12);
      expect(result.powerConsumed).toBeCloseTo(state.energy - result.state.energy, 12);
      if (tick === 0) expect(result.fire).toHaveLength(0);
      state = result.state; shots += result.fire.length;
      for (const gun of Object.values(state.weapons)) expect(gun.charge).toBeLessThanOrEqual(WEAPONS["machine-gun"].powerDraw / WEAPONS["machine-gun"].fireRate);
    }
    expect(shots).toBe(1);
    expect(stepWeapons(JSON.parse(JSON.stringify(state)), v, c, query)).toEqual(stepWeapons(state, v, c, query));
    expect(stepWeapons(state, v, c, query, { powerAvailable: 0 }).fire).toHaveLength(0);
  });

  it("敌车偏心碰撞保留资源、机械和横摆，下一步接管不重建状态", () => {
    const quiet = { ...SCRAPYARD, spawn: { x: 0, y: 0 }, regions: [], caches: [], exits: [], waves: [] };
    const stock = stockLoadout("sports-car"), session = new PveSession("enemy-contact", 1, { ...stock, parts: stock.parts.filter(p => p.partId !== "machine-gun") }, quiet);
    session.start();
    const p = session.world.entities, id = p.spawn(enemySpawn("raider-pickup", { x: 0.9, y: 0.25 }))!, slot = p.slot(id);
    const c = enemyComposition(ENEMIES["raider-pickup"]), enemy = createAssemblyDrive(c, { position: { x: 0.9, y: 0.25 }, r: 0.3 });
    enemy.drivetrain.fuel = 2; enemy.energy = 3; enemy.boost.cooldown = 2;
    session.world.enemyVehicles.set(id, enemy);
    session.drive.vehicle = createState(session.composition.profile, { worldVelocity: { x: 4, y: 0 } });
    session.step(IDLE);
    const hit = session.world.enemyVehicles.get(id)!;
    expect(hit).toBeDefined(); expect(hit.drivetrain.fuel).toBeLessThanOrEqual(2);
    expect(hit.energy).toBeLessThan(4); expect(hit.boost.cooldown).toBeGreaterThan(1.9);
    expect(Math.abs(hit.vehicle.r - 0.3)).toBeGreaterThan(0.01);
    expect(p.mass[slot]).toBe(c.profile.mass);
    const fuel = hit.drivetrain.fuel; session.step(IDLE);
    expect(session.world.enemyVehicles.get(id)!.drivetrain.fuel).toBeLessThanOrEqual(fuel);
    expect(session.world.snapshot().enemyVehicles[id].vehicle.r).toBe(session.world.enemyVehicles.get(id)!.vehicle.r);
  });

  it("敌车开火使用实际挂点和同一冲量入口，供给和去重记录可保存", () => {
    const world = new CombatWorld(3), p = world.entities;
    world.playerId = p.spawn({ position: { x: 3, y: 0 }, hp: 10000, faction: 0 })!;
    const id = p.spawn(enemySpawn("raider-pickup", { x: 0, y: 0 }))!;
    for (let i = 0; i < 120; i++) world.step();
    const drive = world.enemyVehicles.get(id)!;
    expect(Object.keys(drive.effects!.lastSequence)).toEqual(["enemy-gun"]);
    expect(drive.vehicle.energy.externalWork).not.toBe(0);
    expect(world.enemyWeapons.get(id)!.energy).toBe(drive.energy);
  });
});
