import { expect, it } from 'vitest';
import { DEFAULT_CONFIG as config } from '../../src/vehicle/config';
import { mapStick } from '../../src/input/joystick';

it('精确中心为零，所有非零位移均产生速度；半速、满速、越界与屏幕方向', () => {
  expect(mapStick(0, 0, 50, true, config)).toMatchObject({ targetSpeed: 0, angle: null, drift: false });
  for (const distance of [1e-12, 0.001, 25, 50, 500]) {
    const sample = mapStick(distance, 0, 50, false, config);
    expect(sample.targetSpeed).toBeGreaterThan(0);
    expect(sample.angle).toBe(0);
    expect(sample.targetSpeed).toBeCloseTo(12 * Math.min(distance / 50, 1), 14);
  }
  expect(mapStick(0, -25, 50, false, config).angle).toBe(-Math.PI / 2);
  expect(mapStick(25, 25, 50, false, config).angle).toBe(Math.PI / 4);
});

it('普通满油门缓冲和滞回适用于八个方向，漂移不增加速度', () => {
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const sample = (ratio: number, drift: boolean) => mapStick(Math.cos(angle) * ratio * 50, Math.sin(angle) * ratio * 50, 50, drift, config);
    expect(sample(1.3, false)).toMatchObject({ targetSpeed: 12, drift: false });
    expect(sample(1.401, false)).toMatchObject({ targetSpeed: 12, drift: true });
    expect(sample(1.3, true)).toMatchObject({ targetSpeed: 12, drift: true });
    expect(sample(1.199, true)).toMatchObject({ targetSpeed: 12, drift: false });
    expect(sample(1.3, false).drift).toBe(false);
  }
  expect(mapStick(70, 0, 50, false, config).drift).toBe(true);
  expect(mapStick(60, 0, 50, true, config).drift).toBe(false);
});
