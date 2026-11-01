import { describe, expect, it } from "vitest";
import { CHASSIS } from "../../src/loadout/chassis";
import { CELL_SIZE } from "../../src/loadout/types";
import { PROFILES } from "../../src/vehicle/physics/profiles";
import { PARTS } from "../../src/loadout/parts";
import { CATALOG, emptyLoadout, facePart, mounts, movePart, occupiedCells, placePart, removePart, rotatePart, validateLoadout } from "../../src/loadout/model";
import { LOADOUT_VERSION } from "../../src/loadout/types";
import type { InstalledPart, Loadout } from "../../src/loadout/types";
import { stockLoadout } from "../../src/loadout/presets";
import { resourceBudget } from "../../src/loadout/resources";
import { deserializeLoadout, serializeLoadout } from "../../src/loadout/serialization";

const part = (partId: string, instanceId = "a", x = 0, y = 0): InstalledPart => ({
  partId, instanceId, x, y, layer: PARTS[partId].layer, rotation: 0, facing: 0,
});
const withParts = (...parts: InstalledPart[]): Loadout => ({ ...emptyLoadout("sports-car"), parts });

describe("双层装配底盘", () => {
  it("十车型对齐物理车型，外层四边各扩展一格", () => {
    expect(Object.keys(CHASSIS).sort()).toEqual(PROFILES.map(p => p.profileId).sort());
    for (const chassis of Object.values(CHASSIS)) {
      expect(chassis.cellSize).toBe(CELL_SIZE);
      for (const axis of ["x", "y"] as const) {
        const inner = chassis.layers.inner.map(c => c[axis]);
        const outer = chassis.layers.outer.map(c => c[axis]);
        expect(Math.max(...outer)).toBe(Math.max(...inner) + 1);
        expect(Math.min(...outer)).toBe(Math.min(...inner) - 1);
        expect(Math.min(...inner)).toBe(-Math.max(...inner));
      }
      expect(chassis.layers.inner.every(c => c.slot === "internal")).toBe(true);
      expect(chassis.layers.outer.filter(c => c.slot === "edge").every(c => c.exposedDirections.length > 0)).toBe(true);
      expect(chassis.layers.outer.find(c => c.x === 0 && c.y === 0)?.slot).toBe("roof");
    }
  });
});

describe("摆放校验与不可变操作", () => {
  it("两层同格可独立占用，跨层和同层重叠被拒绝", () => {
    const value = withParts(part("battery"), part("machine-gun", "b"));
    expect(validateLoadout(value)).toEqual([]);
    expect(validateLoadout(withParts({ ...part("battery"), layer: "outer" })).map(e => e.code)).toContain("LAYER");
    const conflict = validateLoadout(withParts(part("battery"), part("fuel-tank", "b")));
    expect(conflict.find(e => e.code === "OVERLAP")?.cell).toEqual({ x: 0, y: 0 });
  });
  it("返回范围、槽、不可用格、数量和重复实例原因", () => {
    expect(validateLoadout(withParts(part("battery", "a", 100))).map(e => e.code)).toContain("OUT_OF_BOUNDS");
    expect(validateLoadout(withParts(part("armor"))).map(e => e.code)).toContain("SLOT");
    expect(validateLoadout(withParts(part("driver-seat"), part("driver-seat", "b", 1))).map(e => e.code)).toContain("COUNT");
    expect(validateLoadout(withParts(part("battery"), part("fuel-tank", "a", 1))).map(e => e.code)).toContain("DUPLICATE_INSTANCE");
    const catalog = structuredClone(CATALOG);
    const cell = catalog.chassis["sports-car"].layers.inner.find(c => c.x === 0 && c.y === 0)!;
    cell.available = false;
    expect(validateLoadout(withParts(part("battery")), catalog).map(e => e.code)).toContain("UNAVAILABLE");
  });
  it("多格旋转绕锚点，成功不修改原装配，失败返回原对象", () => {
    const original = withParts(part("gearbox"));
    const result = rotatePart(original, "a", 90);
    expect(result.ok).toBe(true);
    expect(occupiedCells(result.loadout.parts[0])).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1 }]);
    expect(original.parts[0].rotation).toBe(0);
    const edge = movePart(result.loadout, "a", { x: 0, y: 1 });
    expect(edge.ok).toBe(false);
    expect(edge.loadout).toBe(result.loadout);
    const placed = placePart(original, part("battery", "b", -1));
    expect(placed.ok).toBe(true);
    expect(placed.loadout.parts).toHaveLength(2);
    expect(removePart(placed.loadout, "b").loadout).toEqual(original);
    expect(removePart(original, "missing").ok).toBe(false);
    expect(placePart(original, part("battery", "b")).loadout).toBe(original);
  });
  it("八向挂点与形状旋转独立，输出外露和局部位置", () => {
    const original = withParts(part("machine-gun"));
    for (const angle of [0, 45, 90, 135, 180, 225, 270, 315] as const) {
      const result = facePart(original, "a", angle);
      expect(result.ok).toBe(true);
      expect(occupiedCells(result.loadout.parts[0])).toEqual([{ x: 0, y: 0 }]);
      expect(mounts(result.loadout)[0]).toMatchObject({ angle: angle * Math.PI / 180, exposed: true, position: { x: 0, y: 0 } });
    }
    const shifted = movePart(original, "a", { x: 2, y: 1 });
    expect(mounts(shifted.loadout)[0].position).toEqual({ x: 2 * CELL_SIZE, y: CELL_SIZE });
  });
});

describe("预设、全局预算与序列化", () => {
  it("十车型预设全部合法，覆盖驾驶/动力链/武器，恢复不会污染", () => {
    for (const chassis of Object.values(CHASSIS)) {
      const preset = stockLoadout(chassis.id);
      expect(validateLoadout(preset)).toEqual([]);
      expect(preset.parts.some(p => PARTS[p.partId].engine)).toBe(true);
      expect(preset.parts.some(p => PARTS[p.partId].gearbox)).toBe(true);
      expect(preset.parts.some(p => PARTS[p.partId].seat === "driver")).toBe(true);
      expect(mounts(preset).some(p => p.weaponId)).toBe(true);
      const serialized = serializeLoadout(preset);
      preset.parts[0].x = 1000;
      expect(serializeLoadout(stockLoadout(chassis.id))).toBe(serialized);
    }
  });
  it("不相邻电池与武器使用同一预算，按类型汇总弹药和油量", () => {
    const preset = stockLoadout("sports-car");
    const budget = resourceBudget(preset);
    expect(budget).toMatchObject({ capacity: 120, maxOutput: 60, powerDraw: 8, powerSufficient: true,
      fuelCapacity: 40, ammo: { ballistic: 400, rocket: 12 } });
    expect(resourceBudget(withParts(part("machine-gun"))).powerSufficient).toBe(false);
  });
  it("顺序无关稳定序列化与往返，不复制定义", () => {
    const preset = stockLoadout("sports-car");
    const text = serializeLoadout(preset);
    expect(serializeLoadout({ ...preset, parts: [...preset.parts].reverse() })).toBe(text);
    const result = deserializeLoadout(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(serializeLoadout(result.value)).toBe(text);
    expect(text).not.toContain("massKg");
  });
  it("拒绝未知版本/定义和恶意字段，不返回部分装配", () => {
    const empty = emptyLoadout("sports-car");
    const cases: [unknown, string][] = [
      [{ ...empty, version: "future" }, "VERSION"],
      [{ ...empty, chassisId: "missing" }, "UNKNOWN_CHASSIS"],
      [{ ...empty, chassisId: "__proto__" }, "UNKNOWN_CHASSIS"],
      [{ ...empty, parts: [{ ...part("battery"), partId: "missing" }] }, "UNKNOWN_PART"],
      [withParts({ ...part("battery"), x: 0.5 }), "FORMAT"],
      [withParts({ ...part("battery"), x: Infinity }), "FORMAT"],
      [withParts({ ...part("battery"), rotation: 45 as 0 }), "ROTATION"],
      [withParts({ ...part("battery"), facing: 12 as 0 }), "FACING"],
      [{ ...empty, extra: true }, "FORMAT"],
      [{ ...empty, parts: [{ ...part("battery"), hp: 10000 }] }, "FORMAT"],
      [withParts(part("battery"), part("battery", "a", 2)), "DUPLICATE_INSTANCE"],
    ];
    for (const [value, code] of cases) {
      const result = deserializeLoadout(JSON.stringify(value));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.map(e => e.code)).toContain(code);
    }
    expect(deserializeLoadout("{" ).ok).toBe(false);
    expect(() => serializeLoadout(withParts(part("battery"), part("battery", "b")))).toThrow("OVERLAP");
  });
});

describe("装配数据合同", () => {
  it("目录定义正质量、耐久、唯一形状和合法层槽", () => {
    expect(Object.values(PARTS).length).toBeGreaterThan(20);
    for (const part of Object.values(PARTS)) {
      expect(part.massKg).toBeGreaterThan(0);
      expect(part.hp).toBeGreaterThan(0);
      expect(new Set(part.shape.map(c => `${c.x},${c.y}`)).size).toBe(part.shape.length);
      expect(part.rotations.length).toBeGreaterThan(0);
      expect(part.slots.every(s => part.layer === "inner" ? s === "internal" : s !== "internal")).toBe(true);
      if (part.weaponId) expect(part.exposed).toBe(true);
      if (part.engine) expect(part.engine.redlineRpm).toBeGreaterThan(part.engine.idleRpm);
      if (part.gearbox) expect(part.gearbox.ratios.length).toBeGreaterThanOrEqual(4);
    }
  });
  it("十车型空装配版本稳定且拒绝未知车型", () => {
    for (const chassis of Object.values(CHASSIS)) {
      const value = emptyLoadout(chassis.id);
      expect(value).toEqual({ version: LOADOUT_VERSION, chassisId: chassis.id, parts: [] });
      expect(validateLoadout(value)).toEqual([]);
    }
    expect(() => emptyLoadout("unknown")).toThrow("未知底盘");
  });
});
