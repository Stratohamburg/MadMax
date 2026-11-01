import type { WeaponDefinition } from "./types";
const weapon = (id: string, trigger: WeaponDefinition["trigger"], overrides: Partial<WeaponDefinition>): WeaponDefinition => ({
  id, trigger, range: 7, arc: Math.PI * 2, turnRate: 2.5, fireRate: 5, spread: 0.06,
  damage: 8, pellets: 1, speed: 20, aoe: 0, penetration: 0, lifetime: 1,
  recoil: 0.015, kind: "physical", ammoType: "ballistic", ammoCost: 1, powerDraw: 0,
  heatPerShot: 1, heatMax: 20, heatRecovery: 6, cooling: 4,
  lockTime: 0, lockLoss: "reset", lockDecay: 1, passiveEvents: [], eventThreshold: 0,
  targetRule: "nearest", tags: ["weapon", trigger], ...overrides,
});
export const WEAPONS: Readonly<Record<string, WeaponDefinition>> = Object.fromEntries([
  weapon("machine-gun", "turret", { powerDraw: 8, tags: ["weapon", "turret", "barrage"] }),
  weapon("shotgun", "fixed", { range: 4, arc: Math.PI / 3, fireRate: 1.2, pellets: 7, spread: 0.3, damage: 5 }),
  weapon("rocket", "fixed", { range: 10, arc: Math.PI / 4, fireRate: 0.6, damage: 70, speed: 7, aoe: 1.5, kind: "explosive", ammoType: "rocket", lifetime: 2, recoil: 0.3, tags: ["weapon", "fixed", "explosive"] }),
  weapon("cannon", "turret", { range: 12, arc: Math.PI * 1.5, turnRate: 0.9, fireRate: 0.4, damage: 150, speed: 25, aoe: 1, recoil: 0.8, kind: "explosive", tags: ["weapon", "turret", "explosive"] }),
  weapon("missile", "guided", { range: 14, arc: Math.PI / 2, fireRate: 0.5, damage: 90, speed: 10, aoe: 1.5, ammoType: "rocket", powerDraw: 18, lockTime: 0.7, lifetime: 2, kind: "explosive", tags: ["weapon", "guided", "explosive"] }),
  weapon("flamethrower", "fixed", { range: 3, arc: Math.PI / 2, fireRate: 12, damage: 4, speed: 6, spread: 0.3, kind: "fire", ammoType: undefined, powerDraw: 12, heatPerShot: 2, burn: { dps: 6, duration: 2 }, tags: ["weapon", "fixed", "fire"] }),
  weapon("autocannon", "turret", { range: 10, arc: Math.PI, turnRate: 1.6, fireRate: 4, damage: 22, aoe: 0.35, kind: "explosive", powerDraw: 10, ammoCost: 2, recoil: 0.08, tags: ["weapon", "turret", "barrage", "explosive"] }),
  weapon("spikes", "passive", { range: 0.8, fireRate: 1, damage: 20, speed: 0, aoe: 0.8, ammoType: undefined, passiveEvents: ["collision"], eventThreshold: 0.1, tags: ["weapon", "passive", "collision"] }),
  weapon("reactive-armor", "passive", { range: 1.5, fireRate: 0.2, damage: 40, speed: 0, aoe: 1.5, ammoType: undefined, kind: "explosive", passiveEvents: ["hit"], eventThreshold: 1, tags: ["weapon", "passive", "explosive"] }),
].map(w => [w.id, w]));
