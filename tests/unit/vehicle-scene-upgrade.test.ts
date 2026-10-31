import { describe, it, expect } from "vitest";
import {
  getProfile,
  createState,
  physicalFrom,
  mechanicalEnergy,
  geometry,
  step,
} from "../../src/vehicle/physics";
import { sweepVehicle } from "../../src/scene/contacts";
import { stepInWorld } from "../../src/scene/collision";
import { Trails } from "../../src/scene/trails";
import { PRACTICE_AREAS, WORLD } from "../../src/scene/world";
const emptyWorld = {
  bounds: { x: -30, y: -30, width: 60, height: 60 },
  obstacles: [],
};
describe("v2 车身接触和实际滑移", () => {
  it("高速平移跨越薄墙不会穿透，完整车身接触不注入能量", () => {
    for (const id of ["sports-car", "heavy-truck"]) {
      const p = getProfile(id),
        a = createState(p, {
          position: { x: -4, y: 0 },
          worldVelocity: { x: 20, y: 0 },
        }),
        b = physicalFrom({ ...a, position: { x: 4, y: 0 } });
      const world = {
          ...emptyWorld,
          obstacles: [{ x: 0, y: -5, width: 0.02, height: 10 }],
        },
        c = sweepVehicle(a, b, p, 0.4, world);
      expect(geometry(c, p).aabb.maxX).toBeLessThanOrEqual(1e-6);
      expect(c.worldVelocity.x).toBeCloseTo(0, 7);
      expect(c.r).toBeCloseTo(0, 7);
      expect(mechanicalEnergy(c, p)).toBeLessThanOrEqual(
        mechanicalEnergy(a, p),
      );
      expect(c.energy.collisionDissipation).toBeGreaterThan(0);
    }
  });
  it("偏心撞击保留切向动量并产生横摆，左右镜像，碰撞能量单独闭合", () => {
    const p = getProfile("sports-car");
    const run = (sign: number) => {
      const a = createState(p, {
          position: { x: -2, y: sign * 0.25 },
          worldVelocity: { x: 12, y: 0 },
        }),
        b = physicalFrom({ ...a, position: { x: 1, y: sign * 0.25 } }),
        world = {
          ...emptyWorld,
          obstacles: [{ x: 0, y: -0.2, width: 0.1, height: 0.4 }],
        };
      return { a, c: sweepVehicle(a, b, p, 0.25, world) };
    };
    const { a, c } = run(1),
      mirror = run(-1).c;
    expect(Math.abs(c.r)).toBeGreaterThan(0.1);
    expect(c.r).toBeCloseTo(-mirror.r, 7);
    expect(c.speed).toBeGreaterThan(0.1);
    expect(c.energy.collisionDissipation).toBeCloseTo(
      mechanicalEnergy(a, p) - mechanicalEnergy(c, p),
      7,
    );
  });
  it("擦墙没有意图相关逃离速度，普通控制碰撞后保留旋转", () => {
    const p = getProfile("sports-car"),
      world = {
        ...emptyWorld,
        obstacles: [{ x: 0, y: -10, width: 1, height: 20 }],
      };
    const s = createState(p, {
      position: { x: -0.61, y: 0 },
      worldVelocity: { x: 4, y: 3 },
      r: 1,
    });
    const c = stepInWorld(
      s,
      { targetSpeed: 0, angle: null, drift: false },
      p,
      1 / 120,
      world,
    );
    expect(Math.abs(c.r) + c.speed).toBeGreaterThan(0.1);
    expect(c.energy.collisionDissipation).toBeGreaterThan(0);
    let coast = c;
    for (let i = 0; i < 180; i++)
      coast = stepInWorld(
        coast,
        { targetSpeed: 0, angle: null, drift: false },
        p,
        1 / 120,
        world,
      );
    expect(mechanicalEnergy(coast, p)).toBeLessThan(mechanicalEnergy(c, p));
    expect(coast.speed).toBeLessThan(0.1);
  });
  it("长车旋转扫掠会击中中途障碍；平行窄通道不按外接圆误撞", () => {
    const p = getProfile("heavy-truck"),
      a = createState(p, { r: 20 }),
      b = physicalFrom({ ...a, theta: Math.PI });
    const world = {
        ...emptyWorld,
        obstacles: [{ x: -0.2, y: 1.1, width: 0.4, height: 0.03 }],
      },
      c = sweepVehicle(a, b, p, 0.15, world);
    expect(c.energy.collisionDissipation).toBeGreaterThan(0);
    expect(mechanicalEnergy(c, p)).toBeLessThan(mechanicalEnergy(a, p));
    const start = createState(p, {
        position: { x: -5, y: 0 },
        worldVelocity: { x: 5, y: 0 },
      }),
      end = physicalFrom({ ...start, position: { x: 5, y: 0 } });
    expect(
      sweepVehicle(start, end, p, 2, {
        ...emptyWorld,
        obstacles: [{ x: -10, y: 0.6, width: 20, height: 0.1 }],
      }),
    ).toBe(end);
  });
  it("纯旋转和动力空转按各轴接地点留痕，低速直线不误留痕", () => {
    const p = getProfile("sports-car"),
      trails = new Trails();
    let s = createState(p, { r: 4 });
    let next = step(
      s,
      { targetSpeed: 0, angle: null, drift: false },
      p,
      1 / 120,
      { coast: true },
    );
    trails.sample(s, next, p, 0);
    expect(trails.segments.length).toBeGreaterThan(0);
    trails.clear();
    s = createState(p, { wheelSpeeds: { front: 0, rear: 100 } });
    next = step(s, { targetSpeed: 0, angle: null, drift: false }, p, 1 / 120, {
      coast: true,
    });
    trails.sample(s, next, p, 0);
    expect(trails.segments).toHaveLength(2);
    trails.clear();
    s = createState(p, { worldVelocity: { x: 0.2, y: 0 } });
    next = step(s, { targetSpeed: 0.2, angle: 0, drift: false }, p);
    trails.sample(s, next, p, 0);
    expect(trails.segments).toHaveLength(0);
  });
  it("三路面和几何参考区版本明确", () => {
    expect(WORLD.sceneVersion).toBe("driving-playground-3");
    expect(PRACTICE_AREAS).toHaveLength(3);
    expect(WORLD.surface!({ x: -10, y: -25 }, "front", 0).surfaceId).toBe(
      "loose",
    );
    expect(WORLD.surface!({ x: 15, y: -25 }, "rear", 0).surfaceId).toBe("wet");
  });
});
