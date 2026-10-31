import { describe, it, expect } from "vitest";
import {
  createPhysicalState,
  advancePhysical,
  mechanicalEnergy,
  physicalProfile,
  getProfile,
  rad,
  physicalObservation,
} from "../../src/vehicle/physics";
const p = getProfile("sports-car"),
  physical = physicalProfile(p),
  coast = { steeringTarget: 0, drive: 0, brake: 0, rearBrake: 0 };
function run(
  initial: Parameters<typeof createPhysicalState>[1],
  command = coast,
  seconds = 2,
) {
  let s = createPhysicalState(p, initial);
  for (let i = 0; i < seconds * 240; i++)
    s = advancePhysical(s, command, physical, 1 / 240);
  return s;
}
describe("模式无关物理与能量", () => {
  it("核的状态/参数不含漂移、辅助和期望；同执行器精确复现", () => {
    const a = createPhysicalState(p);
    expect(a).not.toHaveProperty("assist");
    expect(a).not.toHaveProperty("h");
    expect(physical).not.toHaveProperty("drift");
    expect(physical).not.toHaveProperty("assist");
    expect(run({}, coast)).toEqual(run({}, coast));
  });
  it("84/95/170°侧滑不锁角并耗散；允许越过90°和倒滑", () => {
    for (const beta of [84, 95, 170, -84, -95, -170]) {
      const initial = {
        worldVelocity: {
          x: 8 * Math.cos(rad(beta)),
          y: 8 * Math.sin(rad(beta)),
        },
        r: beta > 0 ? -2 : 2,
      };
      const start = createPhysicalState(p, initial),
        end = run(initial);
      expect(mechanicalEnergy(end, p)).toBeLessThan(mechanicalEnergy(start, p));
      expect(end.theta).not.toBe(start.theta);
      expect(end.speed).toBeLessThan(start.speed);
      expect(Number.isFinite(end.r)).toBe(true);
    }
    const end = run({ worldVelocity: { x: 0.1, y: 8 }, r: -2 });
    expect(Math.abs(end.beta)).toBeGreaterThan(rad(90));
  });
  it("纯旋转不瞬间清零，逐步由接地点摩擦耗散", () => {
    const start = createPhysicalState(p, { r: 2 }),
      next = advancePhysical(start, coast, physical, 1 / 240);
    expect(next.r).toBeGreaterThan(0);
    expect(next.r).toBeLessThan(2);
    expect(next.theta).toBeGreaterThan(0);
    expect(mechanicalEnergy(run({ r: 2 }), p)).toBeLessThan(1e-10);
  });
  it("相同横滑初态动力/制动改变轨迹，横滑制动仍保留摩擦", () => {
    const initial = { worldVelocity: { x: 1, y: 8 }, r: -2 };
    const a = run(initial),
      b = run(initial, { ...coast, drive: 1 }),
      c = run(initial, { ...coast, brake: 1 });
    expect(
      Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y),
    ).toBeGreaterThan(0.1);
    expect(c.speed).toBeLessThan(a.speed);
    expect(mechanicalEnergy(c, p)).toBeLessThan(mechanicalEnergy(a, p));
  });
  it("机械速度不受目标上限截断，静止打轮不注入旋转", () => {
    const s = createPhysicalState(p, { worldVelocity: { x: 20, y: 0 } });
    expect(advancePhysical(s, coast, physical, 1 / 240).speed).toBeGreaterThan(
      p.power.maxSpeed,
    );
    const a = run({}, { ...coast, steeringTarget: rad(30) });
    expect(a.r).toBe(0);
    expect(a.speed).toBe(0);
    expect(a.delta).toBeGreaterThan(rad(29));
  });
  it("无动力逐步不增能，驱动/制动/轮胎/阻力账本闭合", () => {
    for (const drive of [0, 0.7]) {
      let s = createPhysicalState(p, { worldVelocity: { x: 5, y: 2 }, r: 1 });
      const e0 = mechanicalEnergy(s, p);
      let previous = e0;
      for (let i = 0; i < 720; i++) {
        s = advancePhysical(
          s,
          {
            ...coast,
            drive,
            brake: i > 400 ? 0.3 : 0,
            steeringTarget: i < 300 ? 0.2 : -0.15,
          },
          physical,
          1 / 240,
        );
        const e = mechanicalEnergy(s, p);
        if (!drive) expect(e).toBeLessThanOrEqual(previous + 1e-9);
        previous = e;
      }
      const e = s.energy;
      expect(
        Math.abs(
          mechanicalEnergy(s, p) -
            e0 -
            e.driveWork +
            e.tireDissipation +
            e.brakeDissipation +
            e.rollingDissipation,
        ),
      ).toBeLessThan(1e-7);
      expect(e.tireDissipation).toBeGreaterThan(0);
    }
  });
  it("路面参数按接地点采样，标签不影响物理", () => {
    const s = createPhysicalState(p, { worldVelocity: { x: 5, y: 1 } });
    const o = physicalObservation(s, p);
    expect(o.loads.front + o.loads.rear).toBeCloseTo(p.mass * 9.81);
    expect(o.front.surface.surfaceId).toBe("dry-hard");
  });
});
