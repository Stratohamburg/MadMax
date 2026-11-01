import type { BulletEmission, Target } from "./weapons/types";
import type { Vec2 } from "../vehicle/physics/math";
export const DAMAGE_KINDS = ["physical", "explosive", "fire"] as const;
export interface SpawnEntity { position: Vec2; hp: number; radius?: number; speed?: number; mass?: number; armor?: number; faction?: 0 | 1; threat?: number; attack?: number; archetype?: string; acceleration?: number; stopDistance?: number; theta?: number }
export class EntityPool {
  readonly active: Uint8Array; readonly id: Int32Array; readonly x: Float64Array; readonly y: Float64Array;
  readonly hp: Float64Array; readonly maxHp: Float64Array; readonly radius: Float64Array; readonly speed: Float64Array;
  readonly armor: Float64Array; readonly resistance: Float64Array; readonly faction: Uint8Array; readonly threat: Float64Array;
  readonly attack: Float64Array; readonly cooldown: Float64Array;
  readonly vx: Float64Array; readonly vy: Float64Array; readonly mass: Float64Array;
  readonly archetype: string[]; readonly acceleration: Float64Array; readonly stopDistance: Float64Array; readonly theta: Float64Array;
  nextId = 1;
  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("entity capacity");
    this.active = new Uint8Array(capacity); this.id = new Int32Array(capacity); this.faction = new Uint8Array(capacity);
    this.x = new Float64Array(capacity); this.y = new Float64Array(capacity); this.hp = new Float64Array(capacity);
    this.maxHp = new Float64Array(capacity); this.radius = new Float64Array(capacity); this.speed = new Float64Array(capacity);
    this.armor = new Float64Array(capacity); this.resistance = new Float64Array(capacity * 3); this.threat = new Float64Array(capacity);
    this.attack = new Float64Array(capacity); this.cooldown = new Float64Array(capacity);
    this.vx = new Float64Array(capacity); this.vy = new Float64Array(capacity); this.mass = new Float64Array(capacity);
    this.archetype = Array(capacity).fill(""); this.acceleration = new Float64Array(capacity); this.stopDistance = new Float64Array(capacity); this.theta = new Float64Array(capacity);
  }
  spawn(value: SpawnEntity): number | null {
    const slot = this.active.indexOf(0);
    if (slot < 0) return null;
    if (![value.position.x, value.position.y, value.hp].every(Number.isFinite) || value.hp <= 0) throw new Error("entity spawn");
    if (!Number.isFinite(value.mass ?? 0.15) || (value.mass ?? 0.15) < 0) throw new Error("entity mass");
    if (!Number.isFinite(value.radius ?? 0.3) || (value.radius ?? 0.3) <= 0 ||
      !Number.isFinite(value.speed ?? 0) || (value.speed ?? 0) < 0) throw new Error("entity radius/speed");
    this.active[slot] = 1; this.id[slot] = this.nextId++;
    this.x[slot] = value.position.x; this.y[slot] = value.position.y; this.hp[slot] = this.maxHp[slot] = value.hp;
    this.radius[slot] = value.radius ?? 0.3; this.speed[slot] = value.speed ?? 0;
    this.mass[slot] = value.mass ?? 0.15; this.vx[slot] = this.vy[slot] = 0;
    this.armor[slot] = value.armor ?? 0; this.faction[slot] = value.faction ?? 1;
    this.threat[slot] = value.threat ?? 1; this.attack[slot] = value.attack ?? 8; this.cooldown[slot] = 0;
    this.archetype[slot] = value.archetype ?? ""; this.acceleration[slot] = value.acceleration ?? 2;
    this.stopDistance[slot] = value.stopDistance ?? 0; this.theta[slot] = value.theta ?? 0;
    this.resistance.fill(0, slot * 3, slot * 3 + 3);
    return this.id[slot];
  }
  slot(id: number): number { for (let i = 0; i < this.capacity; i++) if (this.active[i] && this.id[i] === id) return i; return -1; }
  target(slot: number): Target { return { id: this.id[slot], position: { x: this.x[slot], y: this.y[slot] }, hp: this.hp[slot], radius: this.radius[slot], threat: this.threat[slot] }; }
  get count(): number { let n = 0; for (const active of this.active) n += active; return n; }
}
export class ProjectilePool {
  readonly active: Uint8Array; readonly x: Float64Array; readonly y: Float64Array; readonly angle: Float64Array;
  readonly damage: Float64Array; readonly life: Float64Array; readonly faction: Uint8Array; readonly owner: Int32Array;
  readonly count: Float64Array; readonly payload: (BulletEmission | undefined)[]; readonly hits: Set<number>[];
  readonly hitDamage: Map<number, number>[];
  readonly previousX: Float64Array; readonly previousY: Float64Array;
  emittedDamage = 0; aggregated = 0;
  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 6) throw new Error("projectile capacity: 至少6个保留槽");
    this.active = new Uint8Array(capacity); this.x = new Float64Array(capacity); this.y = new Float64Array(capacity);
    this.angle = new Float64Array(capacity); this.damage = new Float64Array(capacity); this.life = new Float64Array(capacity);
    this.faction = new Uint8Array(capacity); this.owner = new Int32Array(capacity); this.count = new Float64Array(capacity);
    this.payload = Array(capacity); this.hits = Array.from({ length: capacity }, () => new Set<number>());
    this.hitDamage = Array.from({ length: capacity }, () => new Map<number, number>());
    this.previousX = new Float64Array(capacity); this.previousY = new Float64Array(capacity);
  }
  spawn(origin: Vec2, emission: BulletEmission, faction: 0 | 1, owner: number): number {
    this.emittedDamage += emission.damage;
    const group = faction * 3 + DAMAGE_KINDS.indexOf(emission.kind);
    let slot = -1;
    for (let i = 6; i < this.capacity; i++) if (!this.active[i]) { slot = i; break; }
    if (slot < 0 && !this.active[group]) slot = group;
    if (slot < 0) {
      let distance = Infinity;
      for (let i = 0; i < this.capacity; i++) if (this.active[i] && this.faction[i] === faction && this.payload[i]!.kind === emission.kind) {
        const d = (this.x[i] - origin.x) ** 2 + (this.y[i] - origin.y) ** 2;
        if (d < distance) { distance = d; slot = i; }
      }
      this.damage[slot] += emission.damage; this.count[slot]++; this.life[slot] = Math.max(this.life[slot], emission.lifetime);
      const old = this.payload[slot]!;
      old.aoe = Math.max(old.aoe, emission.aoe); old.penetration = Math.max(old.penetration, emission.penetration);
      if (emission.burn) old.burn = { dps: (old.burn?.dps ?? 0) + emission.burn.dps, duration: Math.max(old.burn?.duration ?? 0, emission.burn.duration) };
      this.aggregated++;
      return slot;
    }
    this.active[slot] = 1; this.x[slot] = origin.x; this.y[slot] = origin.y; this.angle[slot] = emission.angle;
    this.previousX[slot] = origin.x; this.previousY[slot] = origin.y;
    this.damage[slot] = emission.damage; this.life[slot] = emission.lifetime; this.owner[slot] = owner; this.faction[slot] = faction;
    this.count[slot] = 1; this.payload[slot] = structuredClone(emission); this.hits[slot].clear(); this.hitDamage[slot].clear();
    return slot;
  }
  get activeCount(): number { let count = 0; for (const a of this.active) count += a; return count; }
}
