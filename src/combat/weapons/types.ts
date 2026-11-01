import type { Vec2 } from "../../vehicle/physics/math";
import type { AttributeModifier } from "../../stats/modifiers";
export type Trigger = "turret" | "fixed" | "guided" | "passive";
export type PassiveEventType = "hit" | "collision" | "kill" | "drift" | "speed" | "boost";
export type DamageKind = "physical" | "explosive" | "fire";
export interface Target { id: number; position: Vec2; hp: number; threat: number; radius: number }
export interface TargetQuery { query(center: Vec2, radius: number): readonly Target[] }
export interface PassiveEvent { sequence: number; type: PassiveEventType; magnitude: number }
export interface WeaponDefinition {
  id: string; trigger: Trigger; range: number; arc: number; turnRate: number;
  fireRate: number; spread: number; damage: number; pellets: number; speed: number;
  aoe: number; penetration: number; lifetime: number; recoil: number; kind: DamageKind;
  ammoType?: string; ammoCost: number; powerDraw: number;
  heatPerShot: number; heatMax: number; heatRecovery: number; cooling: number;
  lockTime: number; lockLoss: "reset" | "decay"; lockDecay: number;
  passiveEvents: readonly PassiveEventType[]; eventThreshold: number;
  targetRule: "nearest" | "threat" | "lowest-hp";
  tags: readonly string[];
  burn?: { dps: number; duration: number };
}
export interface WeaponRuntime {
  angle: number; cooldown: number; heat: number; overheated: boolean;
  lockTarget: number | null; lockProgress: number; lastEventSequence: number; shots: number;
}
export interface WeaponSystemState {
  random: number; weapons: Record<string, WeaponRuntime>; ammo: Record<string, number>; energy: number;
}
export interface BulletEmission {
  angle: number; speed: number; damage: number; kind: DamageKind; aoe: number;
  penetration: number; lifetime: number; burn?: { dps: number; duration: number };
  homingTarget?: number; turnRate?: number;
  source?: string;
  weaponId?: string;
}
export interface FireEvent {
  weaponInstanceId: string; weaponId: string; origin: Vec2; angle: number; targetId: number | null;
  bullets: BulletEmission[]; tags: readonly string[];
}
export interface RecoilEvent { weaponInstanceId: string; point: Vec2; impulse: Vec2 }
export interface WeaponVisual {
  instanceId: string; origin: Vec2; baseAngle: number; aimAngle: number; arc: number; range: number;
  weaponId?: string;
  clearCenter: Vec2; clearRadius: number; rimProgress: number; heatProgress: number;
  overheated: boolean; lockProgress: number; target: Vec2 | null;
}
export interface WeaponOptions {
  events?: readonly PassiveEvent[];
  modifiers?: readonly AttributeModifier[];
  definitions?: Readonly<Record<string, WeaponDefinition>>;
}
