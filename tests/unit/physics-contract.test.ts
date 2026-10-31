import { describe, expect, it } from "vitest";
import {
  applyProfile,
  derived,
  PARAMETER_UNITS,
  REFERENCE_PROFILE as p,
  RULES,
  validateProfile,
  validateRules,
} from "../../src/vehicle/physics/config";
import {
  collisionStop,
  createState,
  resetState,
} from "../../src/vehicle/physics/state";
import {
  ackermann,
  advanceKinematic,
  geometry,
  kinematic,
} from "../../src/vehicle/physics/geometry";
import { axleLoads } from "../../src/vehicle/physics/loads";
import { advanceSteering } from "../../src/vehicle/physics/steering";
import { steeringEnvelope } from "../../src/vehicle/physics/assist";
import { rad } from "../../src/vehicle/physics/math";
import { createPhysics } from "../../src/vehicle/physics/dynamics";

describe("独立核心合同与参数", () => {
  it("无DOM创建完整一致状态，派生值只读且拒绝独立注入", () => {
    expect(typeof document).toBe("undefined");
    const s = createState(p, { worldVelocity: { x: 3, y: 4 }, theta: 0.2 });
    expect(s.speed).toBe(5);
    expect(s.motion).toBe(Math.atan2(4, 3));
    expect(() => Object.assign(s, { speed: 10 })).toThrow();
    expect(() => createState(p, { speed: 9 } as never)).toThrow("非权威字段");
    expect(createState(p, { r: 1 }).r).toBe(1);
    expect(() => createState(p, { theta: NaN })).toThrow("非有限");
    expect(
      createState(
        Object.assign({}, p, {
          label: "另一名称",
          category: "任意",
          profileId: "another",
        }),
        { worldVelocity: { x: 3, y: 4 }, theta: 0.2 },
      ),
    ).toEqual(s);
  });
  it("完整参考格式合法，拒绝旧版、缺字段、重复派生源和部分应用", () => {
    expect(validateProfile(p)).toEqual([]);
    expect(validateRules(RULES)).toEqual([]);
    for (const candidate of [
      { ...p, modelVersion: "baseline-1" },
      { ...p, modelVersion: "axle-dynamics-1" },
      { profileId: "partial" },
      { ...p, lf: 1 },
      null,
    ]) {
      const result = applyProfile(p, candidate);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.profile).toBe(p);
    }
    const result = applyProfile(p, p);
    expect(result.profile).toEqual(p);
    expect(result.profile).not.toBe(p);
    expect(PARAMETER_UNITS.stiffness.unit).toBe("ML/T²/rad");
  });
  it("关联错误可定位，固定步下不支持的组合被拒绝", () => {
    const cases = [
      { ...p, mass: 0 },
      { ...p, kYaw: Infinity },
      { ...p, geometry: { ...p.geometry, track: 2 } },
      { ...p, geometry: { ...p.geometry, heightCG: 1 } },
      { ...p, power: { ...p.power, driveFront: 1.01 } },
      { ...p, tires: { ...p.tires, front: { ...p.tires.front, slide: 1.1 } } },
      { ...p, wheels: { ...p.wheels, inertia: 0 } },
      { ...p, drift: { ...p.drift, minSpeed: 5, fullSpeed: 4 } },
    ];
    for (const c of cases)
      expect(validateProfile(c).every((e) => e.startsWith("profile."))).toBe(
        true,
      );
    for (const c of cases) expect(validateProfile(c).length).toBeGreaterThan(0);
    expect(validateRules({ ...RULES, gravity: -1 }).length).toBeGreaterThan(0);
    expect(validateRules({ ...RULES, substep: 1 / 60 }).length).toBeGreaterThan(
      0,
    );
    const boundary = structuredClone(p);
    boundary.geometry.heightCG = 0;
    boundary.power.driveFront = 1;
    boundary.power.brakeFront = 0;
    boundary.tires.front.slide = 1;
    expect(validateProfile(boundary)).toEqual([]);
  });
  it("横摆惯量和归一化量只有一个来源", () => {
    const d = derived(p);
    expect(d.inertia).toBe(p.mass * p.geometry.wheelbase ** 2 * p.kYaw);
    expect(d.driveAcceleration).toBe(p.power.driveForce / p.mass);
    expect(d.lf + d.lr).toBe(p.geometry.wheelbase);
  });
  it("拒绝不完整初态、极端横摆和绕过原子校验修改已绑定配置", () => {
    expect(() =>
      createState(p, { worldVelocity: { x: 1 } } as never),
    ).toThrow();
    expect(() =>
      createState(p, { worldVelocity: { x: 1, y: 0 }, r: 1e100 }),
    ).toThrow();
    const physics = createPhysics(p);
    expect(() => {
      physics.profile.power.maxSpeed = 100;
    }).toThrow();
    expect(physics.profile.power.maxSpeed).toBe(p.power.maxSpeed);
    expect(
      validateRules({
        ...RULES,
        units: { time: "s", mass: "game-M", length: "game-L" },
      }),
    ).toEqual([]);
    expect(
      validateRules({ ...RULES, solverIterations: 0 }).length,
    ).toBeGreaterThan(0);
  });
});

describe("几何／载荷／前轮", () => {
  it("轴与四轮都在保守车身内，占地随长车同步", () => {
    const s = createState(p),
      g = geometry(s, p);
    expect(g.frontBoundary.x).toBeGreaterThan(g.frontAxle.x);
    expect(g.rearBoundary.x).toBeLessThan(g.rearAxle.x);
    expect(g.wheels.frontLeft.y).toBeLessThan(0);
    expect(g.wheels.frontRight.y).toBeGreaterThan(0);
    const long = structuredClone(p);
    long.geometry.wheelbase *= 2.3;
    long.geometry.frontOverhang *= 2;
    long.geometry.rearOverhang *= 2;
    const h = geometry(s, long);
    expect(h.bodyLength).toBeGreaterThan(2 * g.bodyLength);
    expect(h.frontAxle.x).toBeGreaterThan(2 * g.frontAxle.x);
    for (const wheel of Object.values(h.wheels))
      expect(Math.hypot(wheel.x, wheel.y)).toBeLessThan(h.conservativeRadius);
  });
  it("L=0.4/0.8，0.3速度，左右20/30°的后轴半径、前后轴轨迹与比例", () => {
    for (const L of [0.4, 0.8])
      for (const angle of [20, 30, -20, -30]) {
        const q = structuredClone(p);
        q.geometry.wheelbase = L;
        q.geometry.track = 0.2;
        q.geometry.width = 0.3;
        expect(validateProfile(q)).toEqual([]);
        const delta = rad(angle),
          k = kinematic(0.3, delta, q),
          s = createState(q, { delta });
        const start = geometry(s, q),
          center = { x: start.rearAxle.x, y: k.rearRadius };
        let position = s.position,
          theta = 0;
        for (let i = 0; i < 1000; i++) {
          const next = advanceKinematic(
            position,
            theta,
            0.3,
            delta,
            q,
            1 / 120,
          );
          position = next.position;
          theta = next.theta;
          const g = geometry({ position, theta, delta }, q);
          expect(
            Math.hypot(g.rearAxle.x - center.x, g.rearAxle.y - center.y) /
              Math.abs(k.rearRadius),
          ).toBeCloseTo(1, 8);
          expect(
            Math.hypot(g.frontAxle.x - center.x, g.frontAxle.y - center.y) /
              Math.abs(k.frontRadius),
          ).toBeCloseTo(1, 8);
        }
        const double = { ...q, geometry: { ...q.geometry, wheelbase: 2 * L } };
        expect(
          kinematic(0.3, delta, double).rearRadius / k.rearRadius,
        ).toBeCloseTo(2);
        expect(kinematic(0.3, delta, double).r / k.r).toBeCloseTo(0.5);
      }
  });
  it("阿克曼内轮更大、左右镜像、直行与最大角无奇异", () => {
    const a = ackermann(rad(20), p),
      b = ackermann(-rad(20), p);
    expect(a.right).toBeGreaterThan(a.left);
    expect(a.right).toBe(-b.left);
    expect(a.left).toBe(-b.right);
    expect(ackermann(0, p)).toEqual({ left: 0, right: 0 });
    expect(Number.isFinite(ackermann(p.steering.maxAngle, p).right)).toBe(true);
  });
  it("物理纵向作用的载荷守恒和边界，零高度/零作用无转移", () => {
    const steady = axleLoads(p, 0),
      accel = axleLoads(p, 3),
      brake = axleLoads(p, -3);
    expect(accel.rear).toBeGreaterThan(steady.rear);
    expect(brake.front).toBeGreaterThan(steady.front);
    for (const a of [-1000, -3, 0, 3, 1000]) {
      const load = axleLoads(p, a);
      expect(load.front).toBeGreaterThanOrEqual(0);
      expect(load.rear).toBeGreaterThanOrEqual(0);
      expect(load.front + load.rear).toBeCloseTo(p.mass * RULES.gravity);
    }
    expect(
      axleLoads({ ...p, geometry: { ...p.geometry, heightCG: 0 } }, 10)
        .transfer,
    ).toBe(0);
  });
  it("执行器受响应/速度限制，反向经过零位，机械行程不按速度更改", () => {
    let delta = rad(15);
    const values: number[] = [];
    for (let i = 0; i < 120; i++) {
      const next = advanceSteering(delta, -rad(20), 5, p, 1 / 240);
      expect(Math.abs(next - delta)).toBeLessThanOrEqual(
        p.steering.rate / 240 + 1e-12,
      );
      values.push(next);
      delta = next;
    }
    expect(values.some((x) => Math.abs(x) < rad(1))).toBe(true);
    expect(delta).toBeLessThan(-rad(19));
    expect(steeringEnvelope(12, p, 1)).toBeLessThan(steeringEnvelope(0, p, 1));
    const moving = createState(p, {
      worldVelocity: { x: 5, y: -1 },
      r: 0.3,
      delta: 0.2,
      h: 0.7,
      tires: { front: 1, rear: -1 },
      previousLongAcceleration: 2,
    });
    expect(collisionStop(p, moving)).toEqual(resetState(p));
  });
});
