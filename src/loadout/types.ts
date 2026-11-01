/** 格子坐标：车头 +x，右侧 +y；格中心为整数坐标。 */
export const LOADOUT_VERSION = "vehicle-loadout-1" as const;
export const CELL_SIZE = 0.12;
export const KG_PER_GAME_MASS = 1000;
export type Layer = "inner" | "outer";
export type Slot = "internal" | "roof" | "edge";
export type Rotation = 0 | 90 | 180 | 270;
export type Facing = Rotation | 45 | 135 | 225 | 315;
export interface Cell { x: number; y: number }
export interface ChassisCell extends Cell {
  slot: Slot;
  available: boolean;
  exposedDirections: readonly Facing[];
}
export interface ChassisDefinition {
  id: string;
  name: string;
  cellSize: number;
  layers: Readonly<Record<Layer, readonly ChassisCell[]>>;
  maxMassKg: number;
}
export interface EngineDefinition {
  idleRpm: number;
  redlineRpm: number;
  maxPower: number;
  maxTorque: number;
  torqueCurve: readonly (readonly [number, number])[];
  fuelConsumption: number;
}
export interface GearboxDefinition {
  ratios: readonly number[];
  finalDrive: number;
  shiftTime: number;
  efficiency: number;
  maxInputTorque: number;
}
export interface PartDefinition {
  id: string;
  name: string;
  layer: Layer;
  shape: readonly Cell[];
  rotations: readonly Rotation[];
  slots: readonly Slot[];
  maxCount: number;
  massKg: number;
  hp: number;
  powerDraw: number;
  tags: readonly string[];
  exposed: boolean;
  battery?: { capacity: number; maxOutput: number; rechargeRate: number };
  ammo?: Readonly<Record<string, number>>;
  fuelCapacity?: number;
  seat?: "driver" | "passenger" | "mechanic";
  engine?: EngineDefinition;
  gearbox?: GearboxDefinition;
  tire?: { grip: number; stiffness: number; loose: number };
  boost?: { force: number; duration: number; cooldown: number; energy: number };
  weaponId?: string;
}
export interface InstalledPart extends Cell {
  instanceId: string;
  partId: string;
  layer: Layer;
  rotation: Rotation;
  facing: Facing;
}
export interface Loadout {
  version: typeof LOADOUT_VERSION;
  chassisId: string;
  parts: readonly InstalledPart[];
}
export type LoadoutErrorCode =
  | "FORMAT" | "VERSION" | "UNKNOWN_CHASSIS" | "UNKNOWN_PART"
  | "DUPLICATE_INSTANCE" | "LAYER" | "ROTATION" | "FACING" | "COUNT"
  | "OUT_OF_BOUNDS" | "UNAVAILABLE" | "SLOT" | "OVERLAP" | "NOT_FOUND";
export interface LoadoutError {
  code: LoadoutErrorCode;
  message: string;
  instanceId?: string;
  partId?: string;
  cell?: Cell;
}
export type Result<T> = { ok: true; value: T } | { ok: false; errors: LoadoutError[] };
export interface Catalog {
  chassis: Readonly<Record<string, ChassisDefinition>>;
  parts: Readonly<Record<string, PartDefinition>>;
}
