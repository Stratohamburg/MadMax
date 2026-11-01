import { describe, expect, it } from "vitest";
import { getProfile } from "../../src/vehicle/physics/profiles";
import { createState } from "../../src/vehicle/physics/state";
import { resolveBodyContact } from "../../src/vehicle/physics/body-contact";
import { mechanicalEnergy } from "../../src/vehicle/physics/physical";

describe("有限质量实体接触", () => {
  it("固定建筑逆质量为零，位置不动且碰撞能量闭合", () => {
    const p = getProfile("sports-car"), s = createState(p, { worldVelocity: { x: 4, y: 0 } });
    const body = { position: { x: 0.88, y: 0.2 }, velocity: { x: 0, y: 0 }, mass: 0, radius: 0.3 };
    const result = resolveBodyContact(s, p, body);
    expect(result.other).toEqual(body); expect(result.contact!.impulse).toBeGreaterThan(0);
    expect(result.vehicle.r).toBeGreaterThan(0); expect(result.vehicle.energy.externalWork).toBe(0);
    expect(mechanicalEnergy(s, p) - mechanicalEnergy(result.vehicle, p)).toBeCloseTo(result.contact!.dissipation, 12);
    expect(() => resolveBodyContact(s, p, { ...body, velocity: { x: 1, y: 0 } })).toThrow("速度须为零");
  });
  it("偏心碰撞交换双方动量和横摆，能量收支闭合", () => {
    const p = getProfile("sports-car"), s = createState(p, { worldVelocity: { x: 4, y: 0 } });
    const other = { position: { x: 0.88, y: 0.2 }, velocity: { x: -1, y: 0 }, mass: 0.2, radius: 0.3 };
    const result = resolveBodyContact(s, p, other), next = result.vehicle;
    expect(result.contact!.impulse).toBeGreaterThan(0); expect(next.r).toBeGreaterThan(0);
    expect(result.other.velocity.x).toBeGreaterThan(other.velocity.x);
    expect(p.mass * next.worldVelocity.x + other.mass * result.other.velocity.x).toBeCloseTo(p.mass * 4 - 0.2, 12);
    const energy = (v: { x: number; y: number }) => 0.5 * other.mass * (v.x ** 2 + v.y ** 2);
    expect(mechanicalEnergy(s, p) + energy(other.velocity) - mechanicalEnergy(next, p) - energy(result.other.velocity))
      .toBeCloseTo(result.contact!.dissipation, 12);
    expect(mechanicalEnergy(next, p) - mechanicalEnergy(s, p) - next.energy.externalWork + next.energy.collisionDissipation).toBeCloseTo(0, 12);
  });
  it("普通与漂移历史不改变冲量结果，左右偏心撞击镜像", () => {
    const p = getProfile("sports-car");
    const body = (sign: number) => ({ position: { x: 0.88, y: sign * 0.2 }, velocity: { x: 0, y: 0 }, mass: 0.2, radius: 0.3 });
    const a = resolveBodyContact(createState(p, { worldVelocity: { x: 4, y: 0 } }), p, body(1));
    const b = resolveBodyContact(createState(p, { worldVelocity: { x: 4, y: 0 }, h: 1 }), p, body(1));
    expect(a).toEqual(b);
    const mirror = resolveBodyContact(createState(p, { worldVelocity: { x: 4, y: 0 } }), p, body(-1));
    expect(a.vehicle.r).toBeCloseTo(-mirror.vehicle.r, 12);
  });
  it("静态重叠只几何分离，分离运动不产生拉回冲量", () => {
    const p = getProfile("sports-car"), s = createState(p);
    const body = { position: { x: 0.88, y: 0.1 }, velocity: { x: 0, y: 0 }, mass: 0.2, radius: 0.3 };
    const stationary = resolveBodyContact(s, p, body);
    expect(stationary.contact!.impulse).toBe(0); expect(stationary.vehicle.speed).toBe(0);
    expect(stationary.vehicle.r).toBe(0); expect(mechanicalEnergy(stationary.vehicle, p)).toBe(0);
    expect(resolveBodyContact(s, p, { ...body, velocity: { x: 2, y: 0 } }).contact!.impulse).toBe(0);
  });
  it("保守圆重叠但真实轮廓未接触时保持原样", () => {
    const p = getProfile("sports-car"), s = createState(p, { worldVelocity: { x: 4, y: 0 } });
    const other = { position: { x: 0.5, y: 0.35 }, velocity: { x: 0, y: 0 }, mass: 0.2, radius: 0.05 };
    const result = resolveBodyContact(s, p, other);
    expect(result.vehicle).toBe(s); expect(result.other).toBe(other); expect(result.contact).toBeNull();
  });
});
