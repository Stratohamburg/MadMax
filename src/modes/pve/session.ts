import { CombatWorld } from "../../combat/world";
import { calculateDamage } from "../../combat/damage";
import { createModules, damageByDirection, moduleComposition, serviceVehicle } from "../../combat/modules";
import { createWeaponSystem, stepWeapons } from "../../combat/weapons/system";
import type { PassiveEvent, WeaponVisual } from "../../combat/weapons/types";
import type { Loadout } from "../../loadout/types";
import { CATALOG } from "../../loadout/model";
import { activeModifiers, advanceModifiers, chooseUpgrade, createModifierRun, offerChoices } from "../../progression/modifiers/run";
import { adjacencyModifiers } from "../../progression/modifiers/adjacency";
import { advanceAssemblyDrive, createAssemblyDrive } from "../../vehicle/assembly-drive";
import { applyExternalImpulse } from "../../vehicle/physics/physical";
import { stateFrom } from "../../vehicle/physics/state";
import type { Intent } from "../../vehicle/physics/state";
import { geometry } from "../../vehicle/physics/geometry";
import { sweepVehicle } from "../../scene/contacts";
import { WORLD } from "../../scene/world";
import { SCRAPYARD, generateLevel } from "./level";
import type { Level } from "./level";
import { advanceRun, endRun, prepareRun, pickup, transition } from "./run";
import type { Outcome } from "./run";
import type { AttributeModifier } from "../../stats/modifiers";
export interface SessionOptions { hp?: Record<string, number>; modifiers?: readonly AttributeModifier[] }

/** DOM 无关，调用一次就是一个 1/120 秒逻辑步。暂停选择不消耗局内时间。 */
export class PveSession {
  run; modules; composition; drive; upgrades; weapons; readonly world;
  readonly generated; readonly ground; readonly bossIds = new Set<number>(); readonly visited = new Set<string>();
  visuals: WeaponVisual[] = []; notice = ""; damage = 0; spawned = 0; sequence = 0; pendingUpgrades = 0;
  private lastThreshold = 0; private signature = ""; private events: PassiveEvent[] = [];
  private modifierList: AttributeModifier[] = [];
  private collisionCooldown = new Map<number, number>();
  constructor(readonly runId: string, readonly seed: number, loadout: Loadout, readonly level: Level = SCRAPYARD, readonly options: SessionOptions = {}) {
    this.run = prepareRun(runId, seed, loadout);
    this.modules = createModules(loadout);
    for (const part of loadout.parts) if (options.hp?.[part.instanceId] !== undefined) this.modules.hp[part.instanceId] = Math.max(0, Math.min(CATALOG.parts[part.partId].hp, options.hp[part.instanceId]));
    this.modifierList = [...(options.modifiers ?? []), ...adjacencyModifiers(loadout)];
    this.composition = moduleComposition(this.modules, this.modifierList);
    this.drive = createAssemblyDrive(this.composition, { position: level.spawn, theta: -Math.PI / 2 });
    this.upgrades = createModifierRun(seed ^ 0x7712);
    this.weapons = createWeaponSystem(this.composition, seed ^ 0x5212);
    this.world = new CombatWorld(seed ^ 0x2191);
    this.world.playerId = this.world.entities.spawn({ position: level.spawn, hp: 400, faction: 0,
      radius: geometry(this.drive.vehicle, this.composition.profile).conservativeRadius, attack: 0 })!;
    this.world.playerDamage = (amount, sourceId) => {
      const source = this.world.entities.slot(sourceId), p = this.drive.vehicle.position;
      const angle = source < 0 ? 0 : Math.atan2(this.world.entities.y[source] - p.y, this.world.entities.x[source] - p.x) - this.drive.vehicle.theta;
      const result = damageByDirection(this.modules, amount, angle); this.modules = result.modules;
      this.events.push({ sequence: this.sequence++, type: "hit", magnitude: amount });
      return result.hullDamage;
    };
    this.generated = generateLevel(level, seed, runId); this.ground = [...this.generated.loot];
  }
  start(): void {
    if (!this.composition.summary.canDrive) throw new Error(this.composition.summary.issues.join("；"));
    this.run = transition(transition(this.run, "enter"), "running");
  }
  get tags() { return [...new Set(this.modules.loadout.parts.flatMap(p => CATALOG.parts[p.partId].tags))]; }
  get modifiers() { return this.modifierList; }
  choose(id: string): void {
    if (this.run.phase !== "running") return;
    this.upgrades = chooseUpgrade(this.upgrades, id); this.refreshComposition(); this.offer();
  }
  reroll(): void { if (this.run.phase === "running") this.upgrades = offerChoices(this.upgrades, this.tags, true); }
  private offer(): void {
    if (!this.upgrades.offered.length && this.pendingUpgrades > 0) {
      this.pendingUpgrades--; this.upgrades = offerChoices(this.upgrades, this.tags);
    }
  }
  private refreshComposition(): void {
    const signature = JSON.stringify([this.modules, this.upgrades.owned]);
    if (signature !== this.signature) {
      this.modifierList = [...(this.options.modifiers ?? []), ...activeModifiers(this.upgrades), ...adjacencyModifiers(this.modules.loadout)];
      this.composition = moduleComposition(this.modules, this.modifiers); this.signature = signature;
      this.weapons.energy = Math.min(this.weapons.energy, this.composition.resources.capacity);
      for (const kind of Object.keys(this.weapons.ammo)) this.weapons.ammo[kind] = Math.min(this.weapons.ammo[kind], this.composition.resources.ammo[kind] ?? 0);
      this.drive.drivetrain.fuel = Math.min(this.drive.drivetrain.fuel, this.composition.resources.fuelCapacity);
    }
  }
  finish(outcome: Outcome): void {
    if (this.run.phase !== "running") return;
    this.run = transition(endRun(this.run, this.level, outcome, { kills: this.world.kills, damage: this.damage },
      this.modules.hp, this.modules.detached), "settlement");
  }
  step(intent: Intent): void {
    if (this.run.phase !== "running" || this.upgrades.offered.length) return;
    const dt = 1 / 120, p = this.world.entities;
    this.upgrades = advanceModifiers(this.upgrades, dt); this.refreshComposition();
    const before = this.drive.vehicle;
    // 武器与喷射使用同一电池。驾驶阶段只充电一次。
    this.drive.energy = this.weapons.energy;
    this.drive = advanceAssemblyDrive(this.drive, intent, this.composition, WORLD.surface);
    this.weapons.energy = this.drive.energy;
    const swept = sweepVehicle(before, this.drive.vehicle, this.composition.profile, dt, WORLD);
    this.drive.vehicle = stateFrom({ ...swept, assist: this.drive.vehicle.assist });
    let player = p.slot(this.world.playerId);
    if (player < 0) { this.finish("destroyed"); return; }
    p.x[player] = this.drive.vehicle.position.x; p.y[player] = this.drive.vehicle.position.y;
    p.radius[player] = geometry(this.drive.vehicle, this.composition.profile).conservativeRadius;
    while (this.spawned < this.generated.enemies.length && this.generated.enemies[this.spawned].at <= this.run.time + 1e-10) {
      const spawn = this.generated.enemies[this.spawned]; const id = p.spawn(spawn.entity);
      if (id === null) break;
      if (spawn.boss) this.bossIds.add(id); this.spawned++;
    }
    this.world.rebuild();
    if (intent.drift) this.events.push({ sequence: this.sequence++, type: "drift", magnitude: dt });
    this.events.push({ sequence: this.sequence++, type: "speed", magnitude: this.drive.vehicle.speed });
    if (this.drive.boost.remaining > 0) this.events.push({ sequence: this.sequence++, type: "boost", magnitude: dt });
    // 接触伤害按实体冷却，避免每个逻辑步重复撞击结算。
    for (let i = 0; i < p.capacity; i++) if (p.active[i] && p.faction[i] === 1 && this.drive.vehicle.speed > 1 &&
      Math.hypot(p.x[i] - p.x[player], p.y[i] - p.y[player]) <= p.radius[i] + p.radius[player] &&
      (this.collisionCooldown.get(p.id[i]) ?? 0) <= this.run.time) {
      const raw = calculateDamage(this.drive.vehicle.speed * this.composition.profile.mass * 6, this.modifiers, ["collision"]).final;
      const hp = p.hp[i]; this.world.hurt(i, raw, "physical", this.world.playerId); this.damage += hp - p.hp[i];
      this.collisionCooldown.set(p.id[i], this.run.time + 0.5);
      this.events.push({ sequence: this.sequence++, type: "collision", magnitude: raw });
      this.world.hurt(player, Math.min(15, raw * 0.1), "physical", p.id[i]);
    }
    const shot = stepWeapons(this.weapons, this.drive.vehicle, this.composition, this.world, { modifiers: this.modifiers, events: this.events });
    this.events = []; this.weapons = shot.state; this.visuals = shot.visuals;
    this.world.emit(shot.fire, this.world.playerId, 0, this.modifiers);
    for (const recoil of shot.recoil) this.drive.vehicle = stateFrom({ ...applyExternalImpulse(this.drive.vehicle, this.composition.profile, recoil.impulse, recoil.point), assist: this.drive.vehicle.assist });
    this.world.step();
    for (const event of this.world.events) {
      if (event.type === "damage" && event.targetId !== this.world.playerId) this.damage += event.amount;
      if (event.type === "death" && event.targetId !== this.world.playerId) this.events.push({ sequence: this.sequence++, type: "kill", magnitude: 1 });
    }
    player = p.slot(this.world.playerId);
    if (player < 0) { this.finish("destroyed"); return; }
    const position = this.drive.vehicle.position;
    const inRepair = this.level.regions.some(region => region.repair && Math.hypot(position.x - region.position.x, position.y - region.position.y) <= region.radius);
    const serviced = serviceVehicle(this.modules, this.weapons, dt, inRepair);
    this.modules = serviced.modules; this.weapons = serviced.weapons;
    if (inRepair) {
      this.drive.drivetrain.fuel = Math.min(this.composition.resources.fuelCapacity, this.drive.drivetrain.fuel + dt * 5);
      p.hp[player] = Math.min(p.maxHp[player], p.hp[player] + dt * 30);
    }
    if (this.modules.fireEvents.length) {
      const fires = this.modules.fireEvents.length; this.modules = { ...this.modules, fireEvents: [] };
      this.world.hurt(player, fires * 35, "fire", this.world.playerId);
    }
    for (let i = this.ground.length - 1; i >= 0; i--) if (Math.hypot(position.x - this.ground[i].position.x, position.y - this.ground[i].position.y) < 1) {
      const result = pickup(this.run, this.ground[i], this.level.capacity); this.run = result.state;
      if (result.reason) this.notice = result.reason; else { this.ground.splice(i, 1); this.notice = "已搜刮物资"; }
    }
    for (const region of this.level.regions) if (region.upgrade && !this.visited.has(region.id) && Math.hypot(position.x - region.position.x, position.y - region.position.y) <= region.radius) {
      this.visited.add(region.id); this.pendingUpgrades++;
    }
    const threshold = [3, 8, 15].filter(k => this.world.kills >= k).length;
    this.pendingUpgrades += threshold - this.lastThreshold; this.lastThreshold = threshold;
    const bossDead = this.bossIds.size > 0 && [...this.bossIds].every(id => p.slot(id) < 0);
    this.run = advanceRun(this.run, this.level, position, dt, bossDead);
    this.refreshComposition();
    if (p.slot(this.world.playerId) < 0) this.finish("destroyed");
    else if (this.run.outcome) this.finish(this.run.outcome);
    else this.offer();
  }
  snapshot() { return { run: this.run, drive: this.drive, modules: this.modules, upgrades: this.upgrades, weapons: this.weapons,
    world: this.world.snapshot(), spawned: this.spawned, ground: this.ground, pendingUpgrades: this.pendingUpgrades, damage: this.damage }; }
}
