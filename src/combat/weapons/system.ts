import type { Composition } from "../../loadout/compose";
import { compareId } from "../../loadout/model";
import { evaluateAttribute } from "../../stats/modifiers";
import { nextRandom, seedState } from "../../simulation/random";
import { geometry } from "../../vehicle/physics/geometry";
import { clamp, wrap } from "../../vehicle/physics/math";
import type { Vec2 } from "../../vehicle/physics/math";
import type { VehicleState } from "../../vehicle/physics/state";
import { WEAPONS } from "./definitions";
import { muzzleOffset } from "./presentation";
import type { FireEvent, RecoilEvent, Target, TargetQuery, WeaponDefinition, WeaponOptions, WeaponRuntime, WeaponSystemState, WeaponVisual } from "./types";

export const newWeaponRuntime = (): WeaponRuntime => ({ angle: 0, cooldown: 0, heat: 0, overheated: false, lockTarget: null, lockProgress: 0, lastEventSequence: -1, shots: 0 });
export function createWeaponSystem(composition: Composition, seed = 1): WeaponSystemState {
  return { random: seedState(seed), weapons: {}, ammo: { ...composition.resources.ammo }, energy: composition.resources.capacity };
}
export function worldMount(position: Vec2, theta: number, local: Vec2, facing: number) {
  return { origin: { x: position.x + local.x * Math.cos(theta) - local.y * Math.sin(theta),
    y: position.y + local.x * Math.sin(theta) + local.y * Math.cos(theta) }, baseAngle: theta + facing };
}
export function inSector(target: Target, origin: Vec2, angle: number, range: number, arc: number): boolean {
  const dx = target.position.x - origin.x, dy = target.position.y - origin.y;
  return target.hp > 0 && dx * dx + dy * dy <= range * range + 1e-10 &&
    Math.abs(wrap(Math.atan2(dy, dx) - angle)) <= arc / 2 + 1e-10;
}
export function chooseTarget(targets: readonly Target[], origin: Vec2, rule: WeaponDefinition["targetRule"]): Target | undefined {
  const score = (t: Target) => rule === "threat" ? -t.threat : rule === "lowest-hp" ? t.hp : (t.position.x - origin.x) ** 2 + (t.position.y - origin.y) ** 2;
  return [...targets].sort((a, b) => score(a) - score(b) || a.id - b.id)[0];
}
export function stepWeapons(current: WeaponSystemState, vehicle: Pick<VehicleState, "position" | "theta" | "delta">, composition: Composition, query: TargetQuery, options: WeaponOptions = {}) {
  const dt = 1 / 120, definitions = options.definitions ?? WEAPONS;
  const next: WeaponSystemState = { random: current.random, weapons: {}, ammo: { ...current.ammo }, energy: current.energy };
  const fire: FireEvent[] = [], recoil: RecoilEvent[] = [], visuals: WeaponVisual[] = [];
  const mounts = composition.mounts.filter(m => m.weaponId && definitions[m.weaponId]).sort((a, b) => compareId(a.instanceId, b.instanceId));
  const demand = mounts.reduce((sum, m) => sum + definitions[m.weaponId!].powerDraw, 0);
  const powerRatio = demand > 0 ? Math.min(1, composition.resources.maxOutput / demand) : 1;
  for (const mount of mounts) {
    const definition = definitions[mount.weaponId!];
    const component = composition.components.find(c => c.part.instanceId === mount.instanceId)!;
    if (component.performance <= 0) continue;
    const state = { ...(current.weapons[mount.instanceId] ?? newWeaponRuntime()) };
    const modifiers = options.modifiers ?? composition.modifiers;
    const attribute = (base: number, name: string) => evaluateAttribute(base, modifiers, "weapon", name, definition.tags, mount.instanceId).value;
    const range = Math.max(0.01, attribute(definition.range, "range"));
    const fireRate = Math.max(0, attribute(definition.fireRate, "fireRate") * component.performance * (definition.powerDraw > 0 ? powerRatio : 1));
    const damage = Math.max(0, attribute(definition.damage, "damage"));
    const pellets = Math.max(1, Math.floor(attribute(definition.pellets, "pellets")));
    const spread = Math.max(0, attribute(definition.spread, "spread") * (component.performance < 1 ? 2 : 1));
    const transformed = worldMount(vehicle.position, vehicle.theta, mount.position, mount.angle);
    const { origin, baseAngle } = transformed;
    if (definition.arc < Math.PI * 2 - 1e-10) state.angle = clamp(state.angle, -definition.arc / 2, definition.arc / 2);
    state.cooldown = Math.max(-dt, state.cooldown - dt);
    state.heat = Math.max(0, state.heat - definition.cooling * dt);
    if (state.overheated && state.heat <= definition.heatRecovery) state.overheated = false;
    const targets = query.query(origin, range).filter(t => inSector(t, origin, baseAngle, range, definition.arc));
    const target = chooseTarget(targets, origin, definition.targetRule);
    let trigger = false;
    if (definition.trigger === "turret" && target) {
      const desired = wrap(Math.atan2(target.position.y - origin.y, target.position.x - origin.x) - baseAngle);
      const fullCircle = definition.arc >= Math.PI * 2 - 1e-10;
      const difference = fullCircle ? wrap(desired - state.angle) : desired - state.angle;
      const angle = state.angle + clamp(difference, -definition.turnRate * dt, definition.turnRate * dt);
      state.angle = fullCircle ? wrap(angle) : clamp(angle, -definition.arc / 2, definition.arc / 2);
      trigger = Math.abs(wrap(desired - state.angle)) <= 0.04;
    } else if (definition.trigger === "fixed") { state.angle = 0; trigger = !!target; }
    else if (definition.trigger === "guided") {
      if (target) {
        if (state.lockTarget !== target.id) state.lockProgress = 0;
        state.lockTarget = target.id; state.lockProgress += dt;
        state.angle = 0;
      } else {
        state.lockProgress = definition.lockLoss === "reset" ? 0 : Math.max(0, state.lockProgress - definition.lockDecay * dt);
      }
      trigger = !!target && state.lockProgress + 1e-10 >= definition.lockTime;
    } else if (definition.trigger === "passive") {
      const events = (options.events ?? []).filter(e => e.sequence > state.lastEventSequence).sort((a, b) => a.sequence - b.sequence);
      trigger = events.some(e => definition.passiveEvents.includes(e.type) && e.magnitude >= definition.eventThreshold);
      if (events.length) state.lastEventSequence = events.at(-1)!.sequence;
    }
    const aimAngle = baseAngle + state.angle;
    while (trigger && state.cooldown <= 1e-10 && !state.overheated && fireRate > 0) {
      const ammo = definition.ammoType, cost = definition.ammoCost;
      const energyCost = definition.powerDraw / definition.fireRate;
      if ((ammo && (next.ammo[ammo] ?? 0) < cost) || next.energy + 1e-10 < energyCost) break;
      if (ammo) next.ammo[ammo] -= cost;
      next.energy = Math.max(0, next.energy - energyCost);
      const bullets = [];
      for (let i = 0; i < pellets; i++) {
        const random = nextRandom(next.random); next.random = random.state;
        bullets.push({ angle: aimAngle + (random.value * 2 - 1) * spread, speed: definition.speed, damage,
          kind: definition.kind, aoe: definition.aoe, penetration: definition.penetration,
          lifetime: Math.min(definition.lifetime, range / Math.max(0.01, definition.speed)), burn: definition.burn,
          homingTarget: definition.trigger === "guided" ? target?.id : undefined, turnRate: definition.trigger === "guided" ? 2 : undefined, weaponId: definition.id });
      }
      const muzzle = muzzleOffset(definition.id);
      fire.push({ weaponInstanceId: mount.instanceId, weaponId: definition.id, origin: { x: origin.x + Math.cos(aimAngle) * muzzle, y: origin.y + Math.sin(aimAngle) * muzzle }, angle: aimAngle, targetId: target?.id ?? null, bullets, tags: definition.tags });
      recoil.push({ weaponInstanceId: mount.instanceId, point: { ...origin }, impulse: { x: -Math.cos(aimAngle) * definition.recoil, y: -Math.sin(aimAngle) * definition.recoil } });
      state.cooldown += 1 / fireRate; state.heat += definition.heatPerShot; state.shots++;
      if (state.heat >= definition.heatMax) state.overheated = true;
      if (definition.trigger === "guided") { state.lockProgress = 0; trigger = false; }
      if (definition.trigger === "passive") trigger = false;
    }
    if (!trigger || state.cooldown < 0) state.cooldown = Math.max(0, state.cooldown);
    next.weapons[mount.instanceId] = state;
    visuals.push({ instanceId: mount.instanceId, weaponId: definition.id, origin, baseAngle, aimAngle, arc: definition.arc, range,
      clearCenter: { ...vehicle.position }, clearRadius: geometry(vehicle, composition.profile).conservativeRadius * 1.5,
      rimProgress: fireRate > 0 ? clamp(1 - state.cooldown * fireRate, 0, 1) : 0,
      heatProgress: clamp(state.heat / definition.heatMax, 0, 1), overheated: state.overheated,
      lockProgress: definition.lockTime > 0 ? clamp(state.lockProgress / definition.lockTime, 0, 1) : 0, target: target ? { ...target.position } : null });
  }
  return { state: next, fire, recoil, visuals };
}
