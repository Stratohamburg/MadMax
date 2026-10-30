import { expect, it } from 'vitest';
import { moveCircle, stepInWorld } from '../../src/scene/collision';
import type { World } from '../../src/scene/world';
import { Trails, TRAIL_CAPACITY, TRAIL_LIFETIME } from '../../src/scene/trails';
import { DEFAULT_CONFIG as config } from '../../src/vehicle/config';
import { createVehicle, stepVehicle } from '../../src/vehicle/model';

const world: World = { bounds: { x: -10, y: -10, width: 20, height: 20 }, obstacles: [{ x: 0, y: -4, width: 0.05, height: 8 }] };
it('扫掠防止最高速跨越薄障碍和边界，停在圆形接触处且不反弹', () => {
  const state = { ...createVehicle({ x: -0.5, y: 0 }, 0), speed: 12 };
  const next = stepInWorld(state, { targetSpeed: 12, angle: 0, drift: false }, config, 1 / 120, world);
  expect(next.x).toBeCloseTo(-config.radius, 10);
  expect(next.speed).toBe(0);
  const fast = moveCircle({ x: -8, y: 0 }, { x: 18, y: 0 }, config.radius, world);
  expect(fast.x).toBeCloseTo(-config.radius, 10);
  const edge = moveCircle({ x: -8, y: 5 }, { x: -10, y: 30 }, config.radius, world);
  expect(edge.x).toBeGreaterThanOrEqual(-10 + config.radius - 1e-9);
  expect(edge.y).toBeLessThanOrEqual(10 - config.radius + 1e-9);
});

it('精确圆角允许在膨胀方形空角内通过，碰到圆角则不穿透', () => {
  const cornerWorld: World = { ...world, obstacles: [{ x: 0, y: 0, width: 2, height: 2 }] };
  const result = moveCircle({ x: -0.44, y: -1 }, { x: 0, y: 0.6 }, 0.45, cornerWorld);
  expect(result.collided).toBe(false);
  const hit = moveCircle({ x: -1, y: -1 }, { x: 2, y: 2 }, 0.45, cornerWorld);
  expect(hit.collided).toBe(true);
  expect(Math.hypot(hit.x, hit.y)).toBeGreaterThanOrEqual(0.45 - 1e-9);
});

it('接触允许切向位移，新的侧向输入可起步并转向驶离', () => {
  const slide = moveCircle({ x: -config.radius, y: 0 }, { x: 0.1, y: -0.1 }, config.radius, world);
  expect(slide.collided).toBe(true);
  expect(slide.x).toBeCloseTo(-config.radius, 10);
  expect(slide.y).toBeCloseTo(-0.1, 10);
  let state = createVehicle({ x: -config.radius, y: 0 }, 0);
  for (let i = 0; i < 2400; i++) state = stepInWorld(state, { targetSpeed: 6, angle: -Math.PI / 2, drift: false }, config, 1 / 120, world);
  expect(state.y).toBeLessThan(-4);
  expect(Math.abs(state.heading + Math.PI / 2)).toBeLessThan(0.1);
});

it('死角完全阻挡时撤回车头、运动方向和转向历史', () => {
  const cornerWorld: World = { bounds: { x: -10, y: -10, width: 20, height: 20 }, obstacles: [] };
  const state = createVehicle({ x: 10 - config.radius, y: 10 - config.radius }, Math.PI / 4);
  const next = stepInWorld(state, { targetSpeed: 12, angle: 0, drift: false }, config, 1 / 120, cornerWorld);
  expect(next.x).toBe(state.x); expect(next.y).toBe(state.y);
  expect(next.speed).toBe(0); expect(next.heading).toBe(state.heading);
  expect(next.motion).toBe(state.motion); expect(next.turnSign).toBe(state.turnSign);
});

it('胎痕来自实际轮胎侧滑；直线入漂无痕，退出后残余侧滑仍留痕', () => {
  const trails = new Trails();
  let state = { ...createVehicle({ x: 0, y: 0 }, 0), speed: 10 };
  let next = stepVehicle(state, { targetSpeed: 12, angle: 0, drift: true }, config, 1 / 120);
  trails.sample(state, next, config, 0);
  expect(trails.segments).toHaveLength(0);
  for (let i = 0; i < 60; i++) {
    state = next; next = stepVehicle(state, { targetSpeed: 12, angle: Math.PI / 2, drift: true }, config, 1 / 120);
    trails.sample(state, next, config, i / 120);
  }
  expect(trails.segments.length).toBeGreaterThan(0);
  const count = trails.segments.length;
  state = next; next = stepVehicle(state, { targetSpeed: 12, angle: state.heading, drift: false }, config, 1 / 120);
  trails.sample(state, next, config, 0.51);
  expect(trails.segments.length).toBe(count + 2);
  const tire = trails.segments.at(-1)!.to;
  expect(Math.hypot(tire.x - next.x, tire.y - next.y)).toBeGreaterThan(config.radius * 0.7);
});

it('长时间生成有寿命和容量上限，清空后无历史', () => {
  const trails = new Trails();
  for (let i = 0; i < 12000; i++) {
    const state = { ...createVehicle({ x: i * 0.01, y: 0 }, 0.5), speed: 10, motion: 0 };
    trails.sample({ ...state, x: state.x - 0.01 }, state, config, i / 1000);
    expect(trails.segments.length).toBeLessThanOrEqual(TRAIL_CAPACITY);
  }
  const stopped = createVehicle();
  trails.sample(stopped, stopped, config, 12 + TRAIL_LIFETIME);
  expect(trails.segments).toHaveLength(0);
  trails.clear(); expect(trails.segments).toHaveLength(0);
});
