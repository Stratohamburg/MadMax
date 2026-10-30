import { describe, expect, it } from 'vitest';
import { FixedClock, TimedInput, PHYSICS_STEP } from '../../src/simulation/clock';

describe('固定物理时钟', () => {
  it.each([30, 60, 120])('%i FPS 正常十秒恰好推进 1200 步', fps => {
    const clock = new FixedClock();
    const inputs = new TimedInput(0);
    inputs.push(0.5, 1);
    inputs.push(1, 2);
    const samples: number[] = [];
    clock.advance(0, () => {});
    for (let frame = 1; frame <= fps * 10; frame++) {
      clock.advance(frame / fps, (_, time) => samples.push(inputs.sample(time)));
    }
    expect(clock.steps).toBe(1200);
    expect(clock.time).toBeCloseTo(10, 9);
    expect(samples.filter(value => value === 0)).toHaveLength(60);
    expect(samples.filter(value => value === 1)).toHaveLength(60);
    expect(clock.alpha).toBeLessThan(1);
  });

  it('隐藏五秒不补算，恢复后只处理新时间', () => {
    const clock = new FixedClock();
    clock.advance(0, () => {});
    clock.advance(1 / 60, () => {});
    clock.pause();
    clock.advance(5, () => { throw new Error('后台不应推进'); });
    clock.resume(5);
    clock.advance(5 + PHYSICS_STEP, () => {});
    expect(clock.steps).toBe(3);
  });

  it('前台异常长帧最多补算 100ms，并丢弃陈旧输入', () => {
    const clock = new FixedClock();
    const input = new TimedInput(0);
    input.push(1, 1);
    input.push(4, 2);
    clock.advance(0, () => {});
    clock.advance(5, (_, time) => expect(input.sample(time)).toBe(2));
    expect(clock.steps).toBe(12);
    clock.advance(5 + PHYSICS_STEP, () => {});
    expect(clock.steps).toBe(13);
    input.push(6, 3);
    input.clear(0);
    expect(input.sample(10)).toBe(0);
  });
});
