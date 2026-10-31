import { describe, it, expect } from "vitest";
import {
  getProfile,
  createState,
  step,
  observe,
  rad,
  physicalProfile,
  createPhysicalState,
  advancePhysical,
  SURFACES,
} from "../../src/vehicle/physics";
import { steeringEnvelope } from "../../src/vehicle/physics/assist";
import {
  driftBenchmark,
  recoveryMatrix,
} from "../../src/vehicle/physics/benchmarks";
describe("控制器表达期望", () => {
  it("普通模式后轴突然失抓仍可spin，控制器没有状态稳定特权", () => {
    const p = getProfile("sports-car");
    let s = createState(p, {
      worldVelocity: { x: 8, y: 0 },
      r: 1,
      delta: 0.15,
    });
    let peakSlip = 0;
    for (let i = 0; i < 240; i++) {
      s = step(s, { targetSpeed: 8, angle: 1, drift: false }, p, 1 / 120, {
        surface: (_point, axle) =>
          axle === "rear" ? { ...SURFACES.hard, grip: 0 } : SURFACES.hard,
      });
      peakSlip = Math.max(peakSlip, Math.abs(s.beta));
    }
    expect(peakSlip).toBeGreaterThan(rad(170));
    expect(s.theta).toBeGreaterThan(Math.PI);
  });
  it("普通包络随车型、速度、抓地变化，漂移只放宽请求", () => {
    const p = getProfile("sports-car"),
      truck = getProfile("heavy-truck");
    expect(steeringEnvelope(10, p, 1)).toBeLessThan(steeringEnvelope(2, p, 1));
    expect(steeringEnvelope(10, p, 0.4)).toBeLessThan(
      steeringEnvelope(10, p, 1),
    );
    expect(steeringEnvelope(10, truck, 1)).not.toBe(steeringEnvelope(10, p, 1));
    expect(steeringEnvelope(10, p, 1, 1)).toBeGreaterThan(
      steeringEnvelope(10, p, 1),
    );
    const s = createState(p, { worldVelocity: { x: 10, y: 0 } }),
      next = step(s, { targetSpeed: 10, angle: Math.PI, drift: false }, p);
    const o = observe(next, p, {
      targetSpeed: 10,
      angle: Math.PI,
      drift: false,
    });
    expect(Math.abs(o.command.steeringTarget)).toBeLessThanOrEqual(
      o.route.steeringLimit,
    );
    expect(Math.abs(next.motion - Math.PI)).toBeGreaterThan(rad(170));
  });
  it("切回普通控制保留已失控惯性，左右恢复镜像", () => {
    const a = recoveryMatrix(getProfile("sports-car"));
    expect(a.every((x) => x.passed)).toBe(true);
    expect(a[0].first.r).toBeCloseTo(-a[1].first.r, 9);
    expect(a[0].first.beta).toBeCloseTo(-a[1].first.beta, 9);
  });
  for (const id of ["sports-car", "rally-car"])
    it(`${id} 漂移来自真实侧滑、持续至少1秒、明显损耗、平滑退出并左右镜像`, () => {
      const p = getProfile(id),
        a = driftBenchmark(p),
        b = driftBenchmark(p, -1);
      expect(a.passed, JSON.stringify({ ...a, trace: undefined })).toBe(true);
      expect(b.passed).toBe(true);
      expect(a.duration).toBeCloseTo(b.duration, 7);
      expect(a.peakBeta).toBeCloseTo(b.peakBeta, 7);
      expect(a.minSpeedRatio).toBeLessThan(0.8);
      expect(a.trace.some((x) => x.delta < 0 && x.beta < -rad(5))).toBe(true);
    });
  it("相同执行器下模式请求和目标不改变物理；普通策略不能阻止原始物理spin", () => {
    const p = getProfile("sports-car"),
      s = createState(p, { worldVelocity: { x: 1, y: 8 }, r: -3 }),
      command = { steeringTarget: 0.2, drive: 0.7, brake: 0, rearBrake: 0 };
    const a = step(s, { targetSpeed: 0, angle: 0, drift: false }, p, 1 / 120, {
        actuation: command,
      }),
      b = step(
        s,
        { targetSpeed: 12, angle: Math.PI, drift: true },
        p,
        1 / 120,
        { actuation: command },
      );
    expect(a.worldVelocity).toEqual(b.worldVelocity);
    expect(a.r).toBe(b.r);
    expect(a.wheelSpeeds).toEqual(b.wheelSpeeds);
    let q = createPhysicalState(p, { worldVelocity: { x: 1, y: 8 }, r: -3 });
    for (let i = 0; i < 240; i++)
      q = advancePhysical(
        q,
        { ...command, drive: 0 },
        physicalProfile(p),
        1 / 240,
      );
    expect(Math.abs(q.theta)).toBeGreaterThan(Math.PI / 2);
  });
});
