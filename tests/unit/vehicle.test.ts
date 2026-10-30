import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as config, validateConfig } from '../../src/vehicle/config';
import { createVehicle, driveSpeed, stepVehicle, radians, shortestAngle, turnRate, IDLE } from '../../src/vehicle/model';
import type { VehicleState, Intent } from '../../src/vehicle/model';

const dt = 1 / 120;
function run(state: VehicleState, input: Intent, seconds: number): VehicleState {
  for (let i = 0; i < seconds * 120; i++) state = stepVehicle(state, input, config, dt);
  return state;
}

describe('速度控制', () => {
  it('半速从静止逐渐追赶，不超调；较低正目标稳定', () => {
    let state = createVehicle({ x: 0, y: 0 }, 0);
    state = stepVehicle(state, { targetSpeed: 6, angle: 0, drift: false }, config, dt);
    expect(state.speed).toBeGreaterThan(0);
    expect(state.speed).toBeLessThan(6);
    state = run(state, { targetSpeed: 6, angle: 0, drift: false }, 5);
    expect(state.speed).toBe(6);
    expect(run(state, { targetSpeed: 2, angle: 0, drift: false }, 2).speed).toBe(2);
    expect(driveSpeed(5.99, 6, config, 1)).toBe(6);
    expect(driveSpeed(6.01, 6, config, 1)).toBe(6);
  });
  it('低速提速更快、高速减速更强', () => {
    expect(driveSpeed(1, 12, config, dt) - 1).toBeGreaterThan(driveSpeed(10, 12, config, dt) - 10);
    expect(10 - driveSpeed(10, 0, config, dt)).toBeGreaterThan(1 - driveSpeed(1, 0, config, dt));
  });
  it('有限时间停车并保留合法微小正速度', () => {
    const state = { ...createVehicle(), speed: 0.1 };
    expect(run(state, IDLE, 1).speed).toBe(0);
    expect(driveSpeed(0, 1e-12, config, dt)).toBe(1e-12);
    expect(driveSpeed(1e-12, 1e-12, config, dt)).toBe(1e-12);
  });
});

describe('转向与方向边界', () => {
  it('静止不转，侧向起步时产生前进位移且转角有限', () => {
    const start = createVehicle({ x: 0, y: 0 }, 0);
    expect(stepVehicle(start, IDLE, config, dt).heading).toBe(0);
    const next = stepVehicle(start, { targetSpeed: 12, angle: Math.PI / 2, drift: false }, config, dt);
    expect(next.x).toBeGreaterThan(0);
    expect(next.heading).toBeGreaterThan(0);
    expect(next.heading).toBeLessThan(0.01);
    for (const drift of [false, true]) {
      expect(turnRate(0, drift, config)).toBe(0);
      expect(turnRate(2, drift, config)).not.toBe(turnRate(10, drift, config));
    }
    expect(turnRate(6, false, config)).not.toBe(turnRate(6, true, config));
  });
  it('微小目标不跨过，179°跨界走 2°短弧', () => {
    const state = { ...createVehicle({ x: 0, y: 0 }, 0), speed: 6 };
    const next = stepVehicle(state, { targetSpeed: 6, angle: 1e-10, drift: false }, config, dt);
    expect(next.heading).toBeCloseTo(1e-10, 15);
    const edge = { ...state, heading: radians(179), motion: radians(179) };
    const result = stepVehicle(edge, { targetSpeed: 6, angle: radians(-179), drift: false }, config, dt);
    expect(shortestAngle(result.heading - edge.heading)).toBeGreaterThan(0);
    expect(shortestAngle(result.heading - edge.heading)).toBeLessThanOrEqual(radians(2));
  });
  it('精确后方沿上次有效符号，无历史时顺时针；相邻角不吞掉', () => {
    for (const sign of [0, 1, -1]) {
      let state = { ...createVehicle({ x: 0, y: 0 }, 0), speed: 6, turnSign: sign };
      for (let i = 0; i < 30; i++) {
        const next = stepVehicle(state, { targetSpeed: 6, angle: state.heading + Math.PI, drift: false }, config, dt);
        expect(Math.sign(shortestAngle(next.heading - state.heading))).toBe(sign || 1);
        state = next;
      }
    }
    const state = { ...createVehicle({ x: 0, y: 0 }, 0), speed: 6, turnSign: -1 };
    expect(stepVehicle(state, { targetSpeed: 6, angle: Math.PI - 1e-8, drift: false }, config, dt).heading).toBeGreaterThan(0);
  });
});

describe('侧滑与转向代价', () => {
  it('漂移具有不同路径与较大侧滑，直线入漂无凭空侧滑', () => {
    const state = { ...createVehicle({ x: 0, y: 0 }, 0), speed: 10 };
    const normal = run(state, { targetSpeed: 12, angle: Math.PI / 2, drift: false }, 0.5);
    const drift = run(state, { targetSpeed: 12, angle: Math.PI / 2, drift: true }, 0.5);
    expect(Math.hypot(drift.x - normal.x, drift.y - normal.y)).toBeGreaterThan(0.05);
    expect(Math.abs(drift.heading - drift.motion)).toBeGreaterThan(Math.abs(normal.heading - normal.motion));
    const straight = run(state, { targetSpeed: 12, angle: 0, drift: true }, 1);
    expect(straight.y).toBe(0);
    expect(straight.motion).toBe(0);
    expect(straight.speed).toBeLessThanOrEqual(12);
  });
  it('退出不瞬间贴合车头，残余侧滑逐渐消退，低速收敛且不倒行', () => {
    let state = { ...createVehicle({ x: 0, y: 0 }, 1), speed: 8, motion: 0.5 };
    const next = stepVehicle(state, { targetSpeed: 8, angle: 1, drift: false }, config, dt);
    expect(next.motion).toBeGreaterThan(state.motion);
    expect(next.motion).toBeLessThan(next.heading);
    expect(Math.hypot(next.x - state.x, next.y - state.y)).toBeLessThan(0.1);
    expect(Math.abs(run(state, IDLE, 3).heading - run(state, IDLE, 3).motion)).toBe(0);
    for (let i = 0; i < 6000; i++) {
      state = stepVehicle(state, { targetSpeed: 12, angle: state.heading + 2.9, drift: i % 300 < 150 }, config, dt);
      expect(Math.abs(shortestAngle(state.heading - state.motion))).toBeLessThan(Math.PI / 2);
      expect(state.speed).toBeGreaterThanOrEqual(0);
    }
    const slow = stepVehicle({ ...state, speed: 0.01, heading: 1, motion: 0.5 }, { targetSpeed: 0.01, angle: 1, drift: true }, config, dt);
    const fast = stepVehicle({ ...state, speed: 8, heading: 1, motion: 0.5 }, { targetSpeed: 8, angle: 1, drift: true }, config, dt);
    expect(slow.motion).toBeGreaterThan(fast.motion);
  });
  it('免损、夹角单调、90°封顶、漂移损失更大且满油门掉速', () => {
    const state = { ...createVehicle({ x: 0, y: 0 }, 0), speed: 12 };
    const result = (angle: number, drift = false) => stepVehicle(state, { targetSpeed: 12, angle: radians(angle), drift }, config, dt);
    expect(result(4).observation.turnLoss).toBe(0);
    expect(result(4).speed).toBe(12);
    expect(result(45).observation.turnLoss).toBeLessThan(result(90).observation.turnLoss);
    expect(result(90).observation.turnLoss).toBe(result(120).observation.turnLoss);
    expect(result(90).observation.turnLoss).toBe(result(180).observation.turnLoss);
    expect(result(45, true).observation.turnLoss).toBeGreaterThan(result(45).observation.turnLoss);
    expect(result(90).speed).toBeLessThan(12);
    expect(stepVehicle(state, IDLE, config, dt).observation.turnLoss).toBe(0);
  });
});

describe('参数合同', () => {
  it('默认合法，拒绝非有限数与违反模式/半径约束的参数', () => {
    expect(validateConfig(config)).toEqual([]);
    for (const patch of [{ maxSpeed: 0 }, { maxSpeed: NaN }, { acceleration: -1 }, { driftGrip: 15 }, { driftLoss: 0.1 }, { exitRatio: 1.5 }]) {
      expect(validateConfig({ ...config, ...patch }).length).toBeGreaterThan(0);
    }
  });
  it('同一组新参数可重复产生速度和转向差异', () => {
    const input = { targetSpeed: 12, angle: 1, drift: false };
    const start = createVehicle({ x: 0, y: 0 }, 0);
    const tuned = { ...config, acceleration: 12, normalTurn: 6 };
    const baseline = stepVehicle(start, input, config, dt);
    const changed = stepVehicle(start, input, tuned, dt);
    expect(changed.speed).toBeGreaterThan(baseline.speed);
    expect(changed.heading).toBeGreaterThan(baseline.heading);
    expect(stepVehicle(start, input, tuned, dt)).toEqual(changed);
  });
});
