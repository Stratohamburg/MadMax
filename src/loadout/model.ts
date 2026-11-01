import { CHASSIS } from "./chassis";
import { PARTS } from "./parts";
import { LOADOUT_VERSION } from "./types";
import type { Catalog, Cell, InstalledPart, Loadout, LoadoutError, Result } from "./types";

export const CATALOG: Catalog = { chassis: CHASSIS, parts: PARTS };
export const cellKey = (cell: Cell): string => `${cell.x},${cell.y}`;
export const compareId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export function emptyLoadout(chassisId: string, catalog = CATALOG): Loadout {
  if (!Object.hasOwn(catalog.chassis, chassisId)) throw new Error(`未知底盘: ${chassisId}`);
  return { version: LOADOUT_VERSION, chassisId, parts: [] };
}
export function occupiedCells(part: InstalledPart, catalog = CATALOG): Cell[] {
  const definition = catalog.parts[part.partId];
  if (!definition) return [];
  return definition.shape.map(cell => {
    let { x, y } = cell;
    for (let i = 0; i < part.rotation / 90; i++) [x, y] = [-y, x];
    return { x: part.x + x, y: part.y + y };
  });
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const textId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value);
const own = (object: object, key: string): boolean => Object.hasOwn(object, key);

export function validateLoadout(value: unknown, catalog = CATALOG): LoadoutError[] {
  const errors: LoadoutError[] = [];
  const error = (code: LoadoutError["code"], message: string, extra: Partial<LoadoutError> = {}) => errors.push({ code, message, ...extra });
  if (!record(value)) return [{ code: "FORMAT", message: "装配必须为对象" }];
  if (value.version !== LOADOUT_VERSION) error("VERSION", "不支持的装配版本");
  if (Object.keys(value).some(k => !["version", "chassisId", "parts"].includes(k))) error("FORMAT", "装配含未知字段");
  const chassis = typeof value.chassisId === "string" && own(catalog.chassis, value.chassisId) ? catalog.chassis[value.chassisId] : undefined;
  if (!chassis) error("UNKNOWN_CHASSIS", `未知底盘: ${String(value.chassisId)}`);
  if (!Array.isArray(value.parts) || value.parts.length > 1024) return [...errors, { code: "FORMAT", message: "部件列表须为长度不超过1024的数组" }];
  const instances = new Set<string>(), counts = new Map<string, number>();
  const occupancy = new Map<string, string>();
  const grids = chassis ? {
    inner: new Map(chassis.layers.inner.map(c => [cellKey(c), c])),
    outer: new Map(chassis.layers.outer.map(c => [cellKey(c), c])),
  } : undefined;
  for (const raw of value.parts) {
    if (!record(raw)) { error("FORMAT", "部件必须为对象"); continue; }
    const instanceId = typeof raw.instanceId === "string" ? raw.instanceId : undefined;
    const partId = typeof raw.partId === "string" ? raw.partId : undefined;
    const extra = { instanceId, partId };
    if (Object.keys(raw).some(k => !["instanceId", "partId", "layer", "x", "y", "rotation", "facing"].includes(k)) ||
        !textId(instanceId) || !textId(partId) || !Number.isSafeInteger(raw.x) || !Number.isSafeInteger(raw.y)) {
      error("FORMAT", "部件含非法字段、ID或格坐标", extra); continue;
    }
    if (instances.has(instanceId!)) error("DUPLICATE_INSTANCE", "实例ID重复", extra);
    instances.add(instanceId!);
    const definition = own(catalog.parts, partId!) ? catalog.parts[partId!] : undefined;
    if (!definition) { error("UNKNOWN_PART", `未知部件: ${partId}`, extra); continue; }
    counts.set(partId!, (counts.get(partId!) ?? 0) + 1);
    if (counts.get(partId!)! > definition.maxCount) error("COUNT", "部件数量超限", extra);
    const layerValid = raw.layer === definition.layer;
    const rotationValid = definition.rotations.includes(raw.rotation as InstalledPart["rotation"]);
    if (!layerValid) error("LAYER", "部件层不匹配", extra);
    if (!rotationValid) error("ROTATION", "部件旋转不合法", extra);
    if (![0, 45, 90, 135, 180, 225, 270, 315].includes(raw.facing as number)) error("FACING", "武器朝向不合法", extra);
    if (!grids || !layerValid || !rotationValid) continue;
    const part = raw as unknown as InstalledPart;
    for (const cell of occupiedCells(part, catalog)) {
      const gridCell = grids[part.layer].get(cellKey(cell));
      const context = { ...extra, cell };
      if (!gridCell) error("OUT_OF_BOUNDS", "部件超出底盘", context);
      else if (!gridCell.available) error("UNAVAILABLE", "格子不可用", context);
      else if (!definition.slots.includes(gridCell.slot)) error("SLOT", "槽类型不匹配", context);
      const key = `${part.layer}:${cellKey(cell)}`;
      if (occupancy.has(key)) error("OVERLAP", `与 ${occupancy.get(key)} 重叠`, context);
      occupancy.set(key, part.instanceId);
    }
  }
  return errors;
}
export type EditResult = Result<Loadout> & { loadout: Loadout };
function accept(current: Loadout, candidate: Loadout, catalog: Catalog): EditResult {
  const errors = validateLoadout(candidate, catalog);
  if (errors.length) return { ok: false, errors, loadout: current };
  const value = structuredClone(candidate);
  return { ok: true, value, loadout: value };
}
export function placePart(current: Loadout, part: InstalledPart, catalog = CATALOG): EditResult {
  return accept(current, { ...current, parts: [...current.parts, part] }, catalog);
}
export function updatePart(current: Loadout, instanceId: string, patch: Partial<Pick<InstalledPart, "x" | "y" | "rotation" | "facing">>, catalog = CATALOG): EditResult {
  if (!current.parts.some(p => p.instanceId === instanceId)) return { ok: false, errors: [{ code: "NOT_FOUND", message: "实例不存在", instanceId }], loadout: current };
  return accept(current, { ...current, parts: current.parts.map(p => p.instanceId === instanceId ? { ...p, ...patch } : p) }, catalog);
}
export const movePart = (current: Loadout, instanceId: string, cell: Cell, catalog = CATALOG): EditResult => updatePart(current, instanceId, cell, catalog);
export const rotatePart = (current: Loadout, instanceId: string, rotation: InstalledPart["rotation"], catalog = CATALOG): EditResult => updatePart(current, instanceId, { rotation }, catalog);
export const facePart = (current: Loadout, instanceId: string, facing: InstalledPart["facing"], catalog = CATALOG): EditResult => updatePart(current, instanceId, { facing }, catalog);
export function removePart(current: Loadout, instanceId: string, catalog = CATALOG): EditResult {
  if (!current.parts.some(p => p.instanceId === instanceId)) return { ok: false, errors: [{ code: "NOT_FOUND", message: "实例不存在", instanceId }], loadout: current };
  return accept(current, { ...current, parts: current.parts.filter(p => p.instanceId !== instanceId) }, catalog);
}
export function mounts(loadout: Loadout, catalog = CATALOG) {
  return loadout.parts.filter(p => p.layer === "outer").map(part => {
    const cells = occupiedCells(part, catalog), definition = catalog.parts[part.partId];
    return { instanceId: part.instanceId, partId: part.partId, weaponId: definition.weaponId,
      position: { x: cells.reduce((s, c) => s + c.x, 0) / cells.length * catalog.chassis[loadout.chassisId].cellSize,
        y: cells.reduce((s, c) => s + c.y, 0) / cells.length * catalog.chassis[loadout.chassisId].cellSize },
      angle: part.facing * Math.PI / 180, exposed: definition.exposed };
  });
}
