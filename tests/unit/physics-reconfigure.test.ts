import { describe, expect, it } from "vitest";
import { compose, emptyLoadout, stockLoadout, CATALOG, placePart } from "../../src/loadout";
import { createState } from "../../src/vehicle/physics/state";
import { geometry } from "../../src/vehicle/physics/geometry";
import { derived, validateProfile } from "../../src/vehicle/physics/config";
import { mechanicalEnergy } from "../../src/vehicle/physics/physical";
import { reconfigurePhysical } from "../../src/vehicle/physics/reconfigure";
import { worldMount } from "../../src/combat/weapons/system";
import { createAssemblyDrive, migrateAssemblyDrive } from "../../src/vehicle/assembly-drive";

describe("质量变化的刚体连续性", () => {
  it("旋转中偏心重炮脱落，轮廓、保留挂点及各接地点世界速度连续", () => {
    const stock = stockLoadout("sports-car");
    const before = compose({ ...stock, parts: [...stock.parts, { instanceId: "cannon", partId: "cannon", layer: "outer", x: 4, y: 1, rotation: 0, facing: 0 }] });
    const after = compose(stock);
    const drive = createAssemblyDrive(before, { position: { x: 2, y: -3 }, worldVelocity: { x: 5, y: -2 }, theta: 0.7, r: 3, delta: 0.1 });
    const next = migrateAssemblyDrive(drive, before, after);
    const a = geometry(drive.vehicle, before.profile), b = geometry(next.vehicle, after.profile);
    a.footprint.forEach((point, i) => {
      expect(point.x).toBeCloseTo(b.footprint[i].x, 12); expect(point.y).toBeCloseTo(b.footprint[i].y, 12);
    });
    for (const key of ["frontAxle", "rearAxle"] as const) {
      const velocity = (s: typeof next.vehicle, point: { x: number; y: number }) => ({
        x: s.worldVelocity.x - s.r * (point.y - s.position.y), y: s.worldVelocity.y + s.r * (point.x - s.position.x) });
      const va = velocity(drive.vehicle, a[key]), vb = velocity(next.vehicle, b[key]);
      expect(va.x).toBeCloseTo(vb.x, 12); expect(va.y).toBeCloseTo(vb.y, 12);
    }
    const gunA = before.mounts.find(m => m.weaponId === "machine-gun")!, gunB = after.mounts.find(m => m.weaponId === "machine-gun")!;
    const wa = worldMount(drive.vehicle.position, drive.vehicle.theta, gunA.position, gunA.angle);
    const wb = worldMount(next.vehicle.position, next.vehicle.theta, gunB.position, gunB.angle);
    expect(wa.origin.x).toBeCloseTo(wb.origin.x, 12); expect(wa.origin.y).toBeCloseTo(wb.origin.y, 12);
    expect(next.vehicle.r).toBe(drive.vehicle.r); expect(next.vehicle.wheelSpeeds).toEqual(drive.vehicle.wheelSpeeds);
    expect(next.vehicle.assist).toEqual(drive.vehicle.assist);
    const exchange = mechanicalEnergy(next.vehicle, after.profile) - mechanicalEnergy(drive.vehicle, before.profile);
    expect(exchange).toBeLessThan(0); expect(next.vehicle.energy.configurationWork).toBeCloseTo(exchange, 12);
    expect(next.vehicle.energy.tireDissipation).toBe(0); expect(next.vehicle.energy.numericalResidual).toBe(0);
  });
  it("装卸往返不引入额外状态或能量，零速变化不凭空运动", () => {
    const a = compose(emptyLoadout("sports-car"));
    const b = compose({ ...a.loadout, parts: [{ instanceId: "cannon", partId: "cannon", layer: "outer", x: -4, y: -1, rotation: 0, facing: 0 }] });
    const s = createState(a.profile, { worldVelocity: { x: 2, y: 1 }, r: -2 });
    const restored = reconfigurePhysical(reconfigurePhysical(s, a.profile, b.profile), b.profile, a.profile);
    expect(restored.worldVelocity.x).toBeCloseTo(s.worldVelocity.x, 12);
    expect(restored.worldVelocity.y).toBeCloseTo(s.worldVelocity.y, 12);
    expect(restored.position.x).toBeCloseTo(s.position.x, 12); expect(restored.position.y).toBeCloseTo(s.position.y, 12);
    expect(restored.energy.configurationWork).toBeCloseTo(0, 12);
    expect(reconfigurePhysical(createState(a.profile), a.profile, b.profile).speed).toBe(0);
  });
  it("支持域外的合法网格装配明确拒绝，不截断质心后输出错误挂点", () => {
    let loadout = stockLoadout("sports-car"), count = 0;
    for (const cell of [...CATALOG.chassis[loadout.chassisId].layers.outer].sort((a, b) => b.x - a.x || Math.abs(a.y) - Math.abs(b.y))) {
      const result = placePart(loadout, { instanceId: `cannon:${count}`, partId: "cannon", layer: "outer", x: cell.x, y: cell.y, rotation: 0, facing: 0 });
      if (result.ok) { loadout = result.value; if (++count === 8) break; }
    }
    expect(count).toBe(8); expect(() => compose(loadout)).toThrow("cgFromRear");
  });
  it("支持域内的惯量、轴距比和挂点与同一个真实质心一致", () => {
    const c = compose({ ...emptyLoadout("sports-car"), parts: [{ instanceId: "cannon", partId: "cannon", layer: "outer", x: 4, y: 1, rotation: 0, facing: 0 }] });
    const base = compose(emptyLoadout("sports-car"));
    expect(validateProfile(c.profile)).toEqual([]);
    expect((c.profile.geometry.cgFromRear - base.profile.geometry.cgFromRear) * c.profile.geometry.wheelbase).toBeCloseTo(c.centerOfMass.x, 12);
    expect(c.mounts[0].position.x + c.centerOfMass.x).toBeCloseTo(4 * 0.12, 12);
    expect(c.inertia).toBeCloseTo(derived(c.profile).inertia, 12); expect(c.summary.clamped).toEqual([]);
  });
});
