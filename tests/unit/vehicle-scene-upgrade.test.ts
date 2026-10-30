import { describe, expect, it } from 'vitest';
import { getProfile, createPhysicsVehicle, stepPhysicsVehicle, observePhysicsVehicle } from '../../src/vehicle/model';
import { stepInWorld } from '../../src/scene/collision';
import { geometry } from '../../src/vehicle/physics/geometry';
import { Trails } from '../../src/scene/trails';
import { PRACTICE_AREAS, WORLD } from '../../src/scene/world';

const profile = getProfile('heavy-truck');
const emptyWorld = { bounds: { x: -30, y: -30, width: 60, height: 60 }, obstacles: [] };

describe('vehicle-physics-1 场景接入', () => {
  it('重卡最高速度撞薄障碍时按长车保守占地停车并清理动态历史', () => {
    const obstacleWorld = { ...emptyWorld, obstacles: [{ x: 0, y: -0.2, width: 0.1, height: 0.4 }] };
    const start = createPhysicsVehicle({ x: -1.5, y: 0 }, 0, profile, { worldVelocity: { x: profile.power.maxSpeed, y: 0 }, r: 0.4 });
    const next = stepInWorld(start, { targetSpeed: profile.power.maxSpeed, angle: 0, drift: false }, profile, 1 / 120, obstacleWorld);
    const footprint = geometry(next, profile);
    expect(next.speed).toBe(0);
    expect(next.r).toBe(0);
    expect(next.tires).toEqual({ front: 0, rear: 0 });
    expect(next.position.x + footprint.conservativeRadius).toBeLessThanOrEqual(0 + footprint.conservativeRadius + 1e-9);
    expect(next.protection.count).toBe(0);
  });

  it('完全阻挡时不允许质心原地旋转，切向空间仍可重新起步', () => {
    const world = { ...emptyWorld, obstacles: [{ x: -0.5, y: -0.5, width: 1, height: 1 }] };
    const blocked = createPhysicsVehicle({ x: 0, y: 0 }, Math.PI / 4, profile);
    const stopped = stepInWorld(blocked, { targetSpeed: profile.power.maxSpeed, angle: Math.PI / 2, drift: false }, profile, 1 / 120, world);
    expect(stopped.speed).toBe(0);
    expect(stopped.theta).toBe(blocked.theta);
    const clearWorld = { ...emptyWorld, obstacles: [{ x: -0.5, y: 1.5, width: 1, height: 1 }] };
    const contact = createPhysicsVehicle({ x: -1.45, y: 0 }, 0, profile);
    const first = stepInWorld(contact, { targetSpeed: profile.power.maxSpeed, angle: Math.PI / 2, drift: false }, profile, 1 / 120, clearWorld);
    const second = stepInWorld(first, { targetSpeed: profile.power.maxSpeed, angle: -Math.PI / 2, drift: false }, profile, 1 / 120, clearWorld);
    expect(second.position.y).not.toBe(first.position.y);
  });

  it('四个实际接地点产生有上限的侧滑胎痕，直线低速几何不误留痕', () => {
    const trails = new Trails();
    let state = createPhysicsVehicle({ x: 0, y: 0 }, 0, getProfile('sports-car'), { worldVelocity: { x: 8, y: 0 } });
    const car = getProfile('sports-car');
    for (let i = 0; i < 180; i++) {
      const next = stepPhysicsVehicle(state, { targetSpeed: car.power.maxSpeed, angle: Math.PI / 2, drift: true }, car);
      const observation = observePhysicsVehicle(next, car, { targetSpeed: car.power.maxSpeed, angle: Math.PI / 2, drift: true });
      trails.sample(state, next, car, i / 120, observation);
      state = next;
    }
    expect(trails.segments.length).toBeGreaterThan(0);
    expect(trails.segments.length).toBeLessThanOrEqual(1600);
    const straight = createPhysicsVehicle({ x: 0, y: 0 }, 0, car, { worldVelocity: { x: 0.2, y: 0 } });
    const next = stepPhysicsVehicle(straight, { targetSpeed: 0.2, angle: 0, drift: true }, car);
    trails.clear(); trails.sample(straight, next, car, 0, observePhysicsVehicle(next, car, { targetSpeed: 0.2, angle: 0, drift: true }));
    expect(trails.segments).toHaveLength(0);
  });

  it('练习场保留固定方向镜头、验证参考区和三路面采样', () => {
    expect(WORLD.sceneVersion).toBe('driving-playground-2');
    expect(PRACTICE_AREAS.map(area => area.id)).toEqual(['geometry-circle', 'ordinary-align', 'drift-countersteer']);
    expect(WORLD.surface).toBeTypeOf('function');
    expect(WORLD.surface!({ x: -10, y: -25 }, 'front', 0).surfaceId).toBe('loose');
    expect(WORLD.surface!({ x: 15, y: -25 }, 'front', 0).surfaceId).toBe('wet');
    expect(WORLD.surface!({ x: 15, y: -5 }, 'front', 0).surfaceId).toBe('dry-hard');
  });
});
