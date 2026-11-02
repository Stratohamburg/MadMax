import { calculateDamage } from "./damage";
import { DAMAGE_KINDS, EntityPool, ProjectilePool } from "./pools";
import { SpatialHash } from "./spatial";
import { nextRandom, seedState } from "../simulation/random";
import { clamp, wrap } from "../vehicle/physics/math";
import type { Vec2 } from "../vehicle/physics/math";
import type { FireEvent, TargetQuery, WeaponSystemState, WeaponVisual } from "./weapons/types";
import type { AttributeModifier } from "../stats/modifiers";
import type { PresentationEvent } from "./presentation-events";
import { ENEMIES } from "./enemies";
import { enemyWeaponStep } from "./enemy-weapons";
import { advanceEnemyVehicle, enemyComposition } from "./enemy-vehicles";
import { applyImpulseEvents } from "../vehicle/physics/forces";
import { stateFrom } from "../vehicle/physics/state";
import { geometry } from "../vehicle/physics/geometry";
import { resolveVehicleContact } from "../vehicle/physics/vehicle-contact";
import { sweepVehicle, type StaticWorld } from "../vehicle/physics/scene-contact";
import type { AssemblyDriveState } from "../vehicle/assembly-drive";
export type CombatEvent = { type: "damage" | "death"; targetId: number; sourceId: number; amount: number; kind: string; position: Vec2 };
interface Burn { source: string; owner: number; dps: number; remaining: number }
export class CombatWorld implements TargetQuery {
  readonly entities: EntityPool; readonly projectiles: ProjectilePool; readonly spatial = new SpatialHash();
  readonly events: CombatEvent[] = []; readonly burns = new Map<number, Burn[]>();
  readonly presentation: PresentationEvent[] = []; private presentationSequence = 0;
  readonly enemyWeapons = new Map<number, WeaponSystemState>(); enemyVisuals: WeaponVisual[] = [];
  readonly enemyVehicles = new Map<number, AssemblyDriveState>();
  random: number; time = 0; playerId = 0; totalDamage = 0; kills = 0;
  /** 接入车辆模块护甲；返回真正到达车体的伤害。 */
  playerDamage?: (amount: number, sourceId: number, kind: (typeof DAMAGE_KINDS)[number]) => number;
  constructor(seed = 1, projectileCapacity = 2048, enemyCapacity = 128) {
    this.random = seedState(seed); this.entities = new EntityPool(enemyCapacity + 1); this.projectiles = new ProjectilePool(projectileCapacity);
  }
  query(center: Vec2, radius: number) {
    return this.spatial.query(center, radius).filter(slot => this.entities.active[slot] && this.entities.faction[slot] === 1 &&
      (this.entities.x[slot] - center.x) ** 2 + (this.entities.y[slot] - center.y) ** 2 <= radius * radius)
      .map(slot => this.entities.target(slot));
  }
  rebuild(): void { this.spatial.rebuild(this.entities); }
  present(value: Omit<PresentationEvent, "sequence" | "time">): void {
    if (this.presentation.length >= 512) this.presentation.shift();
    this.presentation.push({ ...value, sequence: this.presentationSequence++, time: this.time, position: { ...value.position } });
  }
  emit(fire: readonly FireEvent[], owner = this.playerId, faction: 0 | 1 = 0, modifiers: readonly AttributeModifier[] = []): void {
    for (const event of fire) {
      this.present({ type: "muzzle", position: event.origin, angle: event.angle, weaponId: event.weaponId, faction, size: 1 });
      for (const bullet of event.bullets) {
      const random = nextRandom(this.random); this.random = random.state;
      const damage = calculateDamage(bullet.damage, modifiers, event.tags, undefined, random.value < 0.05);
      this.projectiles.spawn(event.origin, { ...bullet, weaponId: event.weaponId, damage: damage.afterCritical, source: event.weaponInstanceId }, faction, owner);
      }
    }
  }
  hurt(slot: number, raw: number, kind: (typeof DAMAGE_KINDS)[number], sourceId: number, hullOnly = false): void {
    const p = this.entities;
    if (!p.active[slot]) return;
    let amount = calculateDamage(raw, [], [], { armor: p.armor[slot], resistance: p.resistance[slot * 3 + DAMAGE_KINDS.indexOf(kind)] }).final;
    if (!hullOnly && p.id[slot] === this.playerId && this.playerDamage) amount = this.playerDamage(amount, sourceId, kind);
    const actual = Math.min(p.hp[slot], amount); p.hp[slot] -= actual;
    this.totalDamage += actual;
    this.events.push({ type: "damage", targetId: p.id[slot], sourceId, amount: actual, kind, position: { x: p.x[slot], y: p.y[slot] } });
    if (p.hp[slot] <= 0) {
      p.active[slot] = 0; this.burns.delete(p.id[slot]); if (p.faction[slot] === 1) this.kills++;
      this.events.push({ type: "death", targetId: p.id[slot], sourceId, amount: 0, kind, position: { x: p.x[slot], y: p.y[slot] } });
      this.enemyWeapons.delete(p.id[slot]);
      this.enemyVehicles.delete(p.id[slot]);
      this.present({ type: "death", position: { x: p.x[slot], y: p.y[slot] }, angle: p.theta[slot], weaponId: ENEMIES[p.archetype[slot]]?.kind === "infantry" ? "spikes" : "reactive-armor", faction: p.faction[slot] as 0 | 1, size: p.radius[slot] * 2 });
    }
  }
  private burn(slot: number, source: string, owner: number, dps: number, duration: number): void {
    const id = this.entities.id[slot], burns = this.burns.get(id) ?? [], old = burns.find(b => b.source === source);
    if (old) { old.remaining = Math.max(old.remaining, duration); old.dps = Math.max(old.dps, dps); }
    else if (burns.length < 8) burns.push({ source, owner, dps, remaining: duration });
    this.burns.set(id, burns);
  }
  private hit(slot: number, projectile: number): void {
    const bullets = this.projectiles, payload = bullets.payload[projectile]!;
    const id = this.entities.id[slot], previous = bullets.hitDamage[projectile].get(id) ?? 0;
    const unspent = Math.max(0, bullets.damage[projectile] - previous);
    if (unspent <= 0) return;
    this.hurt(slot, unspent, payload.kind, bullets.owner[projectile]);
    this.present({ type: "impact", position: { x: bullets.x[projectile], y: bullets.y[projectile] }, angle: bullets.angle[projectile], weaponId: payload.weaponId ?? "machine-gun", faction: bullets.faction[projectile] as 0 | 1, size: 1 });
    if (payload.burn && this.entities.active[slot]) this.burn(slot, payload.source ?? String(bullets.owner[projectile]), bullets.owner[projectile], payload.burn.dps, payload.burn.duration);
    bullets.hits[projectile].add(this.entities.id[slot]);
    bullets.hitDamage[projectile].set(id, bullets.damage[projectile]);
  }
  private explode(projectile: number): void {
    const p = this.entities, bullets = this.projectiles, payload = bullets.payload[projectile]!;
    this.present({ type: "explosion", position: { x: bullets.x[projectile], y: bullets.y[projectile] }, angle: bullets.angle[projectile], weaponId: payload.weaponId ?? "rocket", faction: bullets.faction[projectile] as 0 | 1, size: payload.aoe });
    let maxRadius = 0;
    for (let i = 0; i < p.capacity; i++) if (p.active[i]) maxRadius = Math.max(maxRadius, p.radius[i]);
    for (const slot of this.spatial.query({ x: bullets.x[projectile], y: bullets.y[projectile] }, payload.aoe + maxRadius))
      if (p.active[slot] && p.faction[slot] !== bullets.faction[projectile] &&
        Math.hypot(p.x[slot] - bullets.x[projectile], p.y[slot] - bullets.y[projectile]) <= payload.aoe + p.radius[slot]) this.hit(slot, projectile);
    bullets.active[projectile] = 0;
  }
  step(moveEnemies = true, preserveEvents = false): void {
    const dt = 1 / 120, p = this.entities, b = this.projectiles;
    if (!preserveEvents) this.events.length = 0;
    if (moveEnemies) this.advanceEnemies(dt);
    const player = p.slot(this.playerId);
    this.enemyVisuals = [];
    if (player >= 0) for (let i = 0; i < p.capacity; i++) if (p.active[i] && p.faction[i] === 1 && ENEMIES[p.archetype[i]]) {
      const drive = this.enemyVehicles.get(p.id[i]);
      const shot = enemyWeaponStep(p, i, p.target(player), this.enemyWeapons.get(p.id[i]), drive);
      this.enemyWeapons.set(p.id[i], shot.state);
      this.enemyVisuals.push(...shot.visuals.map(v => ({ ...v, instanceId: `enemy:${p.id[i]}` })));
      this.emit(shot.fire, p.id[i], 1);
      if (drive) {
        let next = { ...drive, energy: shot.state.energy };
        if (shot.recoil.length) {
          const tick = Math.round(this.time * 120), composition = enemyComposition(ENEMIES[p.archetype[i]]);
          const result = applyImpulseEvents(drive.vehicle, composition.profile, drive.effects ?? { lastSequence: {} }, tick,
            shot.recoil.map((r, index) => ({ ...r, source: r.weaponInstanceId, sequence: tick * 1024 + index, tick, frame: "world" as const })));
          next = { ...next, vehicle: stateFrom({ ...result.state, assist: drive.vehicle.assist }), effects: result.history };
        }
        this.enemyVehicles.set(p.id[i], next);
        if (shot.recoil.length) this.syncEnemyVehicle(i);
      }
    }
    for (let i = 0; i < p.capacity; i++) if (p.active[i] && p.faction[i] === 1 && player >= 0) {
      p.cooldown[i] = Math.max(0, p.cooldown[i] - dt);
      const dx = p.x[player] - p.x[i], dy = p.y[player] - p.y[i], distance = Math.hypot(dx, dy), reach = p.radius[i] + p.radius[player];
      if (p.attack[i] > 0 && distance <= reach && p.cooldown[i] <= 1e-10) { this.hurt(player, p.attack[i], "physical", p.id[i]); p.cooldown[i] = 0.75; }
    }
    this.rebuild();
    for (const [id, burns] of this.burns) {
      const slot = p.slot(id);
      if (slot < 0) { this.burns.delete(id); continue; }
      for (const burn of burns) { const duration = Math.min(dt, burn.remaining); this.hurt(slot, burn.dps * duration, "fire", burn.owner); burn.remaining -= duration; }
      if (p.active[slot]) this.burns.set(id, burns.filter(burn => burn.remaining > 1e-10));
    }
    let maxRadius = 0;
    for (let i = 0; i < p.capacity; i++) if (p.active[i]) maxRadius = Math.max(maxRadius, p.radius[i]);
    for (let i = 0; i < b.capacity; i++) if (b.active[i]) {
      const payload = b.payload[i]!;
      if (payload.homingTarget !== undefined) {
        const target = p.slot(payload.homingTarget);
        if (target >= 0) { const desired = Math.atan2(p.y[target] - b.y[i], p.x[target] - b.x[i]); b.angle[i] += clamp(wrap(desired - b.angle[i]), -(payload.turnRate ?? 2) * dt, (payload.turnRate ?? 2) * dt); }
      }
      const startX = b.x[i], startY = b.y[i], dx = Math.cos(b.angle[i]) * payload.speed * dt, dy = Math.sin(b.angle[i]) * payload.speed * dt;
      b.previousX[i] = startX; b.previousY[i] = startY;
      b.x[i] += dx; b.y[i] += dy; b.life[i] -= dt;
      if (payload.speed === 0 && payload.aoe > 0) { this.explode(i); continue; }
      const hits: { slot: number; t: number }[] = [];
      for (const slot of this.spatial.query({ x: startX + dx / 2, y: startY + dy / 2 }, Math.hypot(dx, dy) / 2 + maxRadius)) {
        if (!p.active[slot] || p.faction[slot] === b.faction[i] || (b.hitDamage[i].get(p.id[slot]) ?? 0) >= b.damage[i]) continue;
        const length2 = dx * dx + dy * dy;
        const ox = startX - p.x[slot], oy = startY - p.y[slot], c = ox * ox + oy * oy - p.radius[slot] ** 2;
        if (c <= 0) hits.push({ slot, t: 0 });
        else if (length2 > 0) {
          const linear = ox * dx + oy * dy, discriminant = linear * linear - length2 * c;
          if (discriminant >= 0) { const t = (-linear - Math.sqrt(discriminant)) / length2; if (t >= 0 && t <= 1) hits.push({ slot, t }); }
        }
      }
      hits.sort((a, c) => a.t - c.t || p.id[a.slot] - p.id[c.slot]);
      for (const hit of hits) {
        if (payload.aoe > 0) { b.x[i] = startX + dx * hit.t; b.y[i] = startY + dy * hit.t; this.explode(i); break; }
        b.x[i] = startX + dx * hit.t; b.y[i] = startY + dy * hit.t;
        this.hit(hit.slot, i);
        if (payload.penetration <= 0) { b.active[i] = 0; break; }
        payload.penetration--;
      }
      if (b.active[i]) { b.x[i] = startX + dx; b.y[i] = startY + dy; }
      if (b.active[i] && (b.life[i] <= 1e-10 || Math.abs(b.x[i]) > 1000 || Math.abs(b.y[i]) > 1000)) {
        if (payload.aoe > 0) this.explode(i); else b.active[i] = 0;
      }
    }
    this.time += dt;
  }
  snapshot() {
    const p = this.entities, b = this.projectiles;
    return { time: this.time, random: this.random, kills: this.kills, totalDamage: this.totalDamage,
      entities: Array.from(p.active, (active, i) => active ? { ...p.target(i), faction: p.faction[i], cooldown: p.cooldown[i], velocity: { x: p.vx[i], y: p.vy[i] }, mass: p.mass[i], archetype: p.archetype[i], theta: p.theta[i] } : null),
      projectiles: Array.from(b.active, (active, i) => active ? { x: b.x[i], y: b.y[i], damage: b.damage[i], life: b.life[i], angle: b.angle[i], count: b.count[i] } : null),
      events: structuredClone(this.events), aggregated: b.aggregated, enemyWeapons: structuredClone(Object.fromEntries(this.enemyWeapons)),
      enemyVehicles: structuredClone(Object.fromEntries(this.enemyVehicles)), presentation: structuredClone(this.presentation) };
  }
  /** 实体池只保存权威车辆状态的投影，不能反向覆盖车辆运动和资源。 */
  syncEnemyVehicle(slot: number): void {
    const p = this.entities, state = this.enemyVehicles.get(p.id[slot]);
    if (!state) return;
    const profile = enemyComposition(ENEMIES[p.archetype[slot]]).profile, v = state.vehicle;
    p.x[slot] = v.position.x; p.y[slot] = v.position.y; p.vx[slot] = v.worldVelocity.x; p.vy[slot] = v.worldVelocity.y;
    p.theta[slot] = v.theta; p.mass[slot] = profile.mass; p.radius[slot] = geometry(v, profile).conservativeRadius;
  }
  advanceEnemies(dt = 1 / 120, scene?: StaticWorld): void {
    const p = this.entities, player = p.slot(this.playerId);
    if (player < 0) return;
    for (let i = 0; i < p.capacity; i++) if (p.active[i] && p.faction[i] === 1) {
      if (p.mass[i] === 0) { p.vx[i] = p.vy[i] = 0; continue; }
      const dx = p.x[player] - p.x[i], dy = p.y[player] - p.y[i], distance = Math.hypot(dx, dy);
      const definition = ENEMIES[p.archetype[i]];
      if (definition?.kind === "vehicle") {
        const previous = this.enemyVehicles.get(p.id[i]);
        const next = advanceEnemyVehicle(previous, definition,
          { x: p.x[i], y: p.y[i] }, { x: p.vx[i], y: p.vy[i] }, p.theta[i],
          { x: p.x[player], y: p.y[player] }, dt);
        this.enemyVehicles.set(p.id[i], next);
        if (scene) {
          const before = previous?.vehicle ?? stateFrom({ ...next.vehicle, position: { x: p.x[i], y: p.y[i] }, theta: p.theta[i] });
          next.vehicle = stateFrom({ ...sweepVehicle(before, next.vehicle, enemyComposition(definition).profile, dt, scene), assist: next.vehicle.assist });
        }
        this.syncEnemyVehicle(i);
        continue;
      }
      const speed = distance > Math.max(p.stopDistance[i], p.radius[i] + p.radius[player]) ? p.speed[i] : 0;
      const ax = (distance > 0 ? dx / distance * speed : 0) - p.vx[i];
      const ay = (distance > 0 ? dy / distance * speed : 0) - p.vy[i];
      const ratio = Math.min(1, p.acceleration[i] * dt / Math.max(1e-12, Math.hypot(ax, ay)));
      p.vx[i] += ax * ratio; p.vy[i] += ay * ratio;
      p.x[i] += p.vx[i] * dt; p.y[i] += p.vy[i] * dt;
      if (definition && distance > 0) {
        const desired = definition.kind === "infantry" || speed === 0 ? Math.atan2(dy, dx) : Math.atan2(p.vy[i], p.vx[i]);
        p.theta[i] += clamp(wrap(desired - p.theta[i]), -dt * (definition.kind === "infantry" ? 4 : 1.3), dt * (definition.kind === "infantry" ? 4 : 1.3));
      }
    }
    const vehicles = [...this.enemyVehicles.keys()].sort((a, b) => a - b)
      .map(id => ({ id, slot: p.slot(id) })).filter(v => v.slot >= 0);
    for (let i = 0; i < vehicles.length; i++) for (let j = i + 1; j < vehicles.length; j++) {
      const ai = vehicles[i].slot, bi = vehicles[j].slot;
      if (Math.hypot(p.x[ai] - p.x[bi], p.y[ai] - p.y[bi]) > p.radius[ai] + p.radius[bi]) continue;
      const a = this.enemyVehicles.get(vehicles[i].id)!, b = this.enemyVehicles.get(vehicles[j].id)!;
      const hit = resolveVehicleContact(a.vehicle, enemyComposition(ENEMIES[p.archetype[ai]]).profile, b.vehicle, enemyComposition(ENEMIES[p.archetype[bi]]).profile);
      if (!hit.contact) continue;
      a.vehicle = stateFrom({ ...hit.vehicle, assist: a.vehicle.assist }); b.vehicle = stateFrom({ ...hit.other, assist: b.vehicle.assist });
      this.syncEnemyVehicle(ai); this.syncEnemyVehicle(bi);
    }
  }
}
