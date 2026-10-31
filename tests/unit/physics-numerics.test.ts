import { describe, it, expect } from "vitest";
import {
  getProfile,
  createState,
  step,
  observe,
  validateProfile,
  mechanicalEnergy,
  rad,
} from "../../src/vehicle/physics";
import {
  replay,
  numericalReport,
  energyReport,
} from "../../src/vehicle/physics/benchmarks";
describe("完整数值域和因果状态", () => {
  it("30/60/120调度精确一致，双倍子步收敛", () => {
    const p = getProfile("sports-car");
    expect(replay(p, 30)).toEqual(replay(p, 120));
    expect(replay(p, 60)).toEqual(replay(p, 120));
    expect(numericalReport(p).passed).toBe(true);
  });
  it("大侧滑、倒滑和纯旋转逐步耗散，能量收支独立核对", () => {
    expect(energyReport(getProfile("sports-car")).passed).toBe(true);
  });
  it("同比质量/力/轮惯量缩放不改变轨迹", () => {
    const p = getProfile("sports-car"),
      q = structuredClone(p),
      scale = 0.2;
    q.mass *= scale;
    q.wheels.inertia *= scale;
    q.power.driveForce *= scale;
    q.power.brakeForce *= scale;
    for (const t of Object.values(q.tires)) {
      t.stiffness *= scale;
      t.nominalLoad *= scale;
    }
    expect(validateProfile(q)).toEqual([]);
    const a = replay(p, 120, 3),
      b = replay(q, 120, 3);
    expect(a.position.x).toBeCloseTo(b.position.x, 8);
    expect(a.position.y).toBeCloseTo(b.position.y, 8);
    expect(a.r).toBeCloseTo(b.r, 8);
  });
  it("载荷来自实际加速度；切换模式不瞬间改变轮胎物性或实际轮速", () => {
    const p = getProfile("sports-car");
    let s = createState(p);
    for (let i = 0; i < 30; i++)
      s = step(s, { targetSpeed: 6, angle: 0, drift: false }, p);
    const a = observe(s, p, { targetSpeed: 6, angle: 1, drift: false }),
      b = observe(s, p, { targetSpeed: 6, angle: 1, drift: true });
    expect(a.loads.transfer).toBeGreaterThan(0);
    expect(a.front).toEqual(b.front);
    expect(a.rear).toEqual(b.rear);
    expect(a.energy).toEqual(b.energy);
  });
  it("边界参数、低抓地与换向保持有限，允许超目标速度及负纵速", () => {
    const p = getProfile("sports-car");
    p.geometry.cgFromRear = 0.2;
    p.geometry.heightCG = p.geometry.wheelbase * 0.5;
    p.power.driveFront = 1;
    p.power.brakeFront = 0;
    expect(validateProfile(p)).toEqual([]);
    let s = createState(p, { worldVelocity: { x: -15, y: 4 }, r: 4 });
    expect(s.u).toBeLessThan(0);
    const initial = mechanicalEnergy(s, p);
    for (let i = 0; i < 600; i++)
      s = step(s, { targetSpeed: 0, angle: null, drift: false }, p, 1 / 120, {
        coast: true,
        fixedSteering: i < 300 ? rad(30) : -rad(30),
      });
    expect(Number.isFinite(s.speed + s.theta + s.r)).toBe(true);
    expect(mechanicalEnergy(s, p)).toBeLessThan(initial);
  });
});
