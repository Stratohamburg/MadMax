import { describe, expect, it } from 'vitest';
import { getProfile } from '../../src/vehicle/physics/profiles';
import { normalMatrix, recoveryMatrix, driftBenchmark, publicSpeed, relativeDifference, qualifyingFamilies, circleCalibration, withAssistance } from '../../src/vehicle/physics/benchmarks';
import type { Metric } from '../../src/vehicle/physics/benchmarks';
import { REFERENCE_PROFILE, createState, rad, step } from '../../src/vehicle/physics';

describe('路线／漂移量化验收', () => {
  it('默认跑车普通3秒、反打0.8秒、恢复4秒以及左右镜像；准静态和双轴非零瞬态', () => {
    for (const transient of [false, true]) {
      const p = getProfile('sports-car'); if (transient) { p.tires.front.relaxation = 0.12; p.tires.rear.relaxation = 0.18; }
      const normal = normalMatrix(p); expect(normal.map(x => ({ speed: x.fraction, angle: x.angle, pass: x.passed, settled: x.settledAt, protection: x.protection }))).toEqual(expect.arrayContaining([expect.objectContaining({ pass: true })]));
      for (const result of normal) expect(result.passed, JSON.stringify({ ...result, trace: undefined })).toBe(true);
      const recovery = recoveryMatrix(p); for (const result of recovery) expect(result.passed, JSON.stringify({ ...result, trace: undefined })).toBe(true);
      expect(recovery[0].settledAt).toBe(recovery[1].settledAt); expect(recovery[0].counterAt).toBe(recovery[1].counterAt);
    }
  });
  it('跑车与拉力持续漂移至少1秒、正速度、路线/侧滑误差、镜像与出弯；瞬态开关', () => {
    for (const id of ['sports-car', 'rally-car']) for (const transient of [false, true]) {
      const p = getProfile(id); if (transient) { p.tires.front.relaxation = 0.12; p.tires.rear.relaxation = 0.18; }
      const a = driftBenchmark(p), b = driftBenchmark(p, -1);
      expect(a.passed, JSON.stringify({ ...a, trace: undefined })).toBe(true); expect(b.passed).toBe(true);
      expect(a.duration).toBe(b.duration); expect(a.peakBeta).toBeCloseTo(b.peakBeta, 8); expect(Math.abs(a.final.beta)).toBeLessThan(rad(1));
    }
  });
  it('公共速度、相对差与指标族去重；近零值不计差异', () => {
    expect(publicSpeed(getProfile('sports-car'), getProfile('heavy-truck'))).toBe(7 * 0.35);
    expect(relativeDifference(10, 8)).toBe(0.2); expect(relativeDifference(0, 1)).toBeNull();
    const metrics: Metric[] = [{ family: 'braking', name: 'distance', value: 10, unit: 'L' }, { family: 'braking', name: 'time', value: 10, unit: 's' }];
    expect(qualifyingFamilies(metrics, metrics.map(x => ({ ...x, value: 7 })))).toEqual(['braking']);
    const p = getProfile('heavy-truck'); expect(withAssistance(p, 'common', REFERENCE_PROFILE).assist).toEqual(REFERENCE_PROFILE.assist);
  });
  it('无辅助绕圆有可测欠转修正；中高速稳态侧偏不套用低速几何', () => {
    const p = getProfile('sports-car'), slow = circleCalibration(p, 2), fast = circleCalibration(p, 6);
    expect(fast.understeer).not.toBeCloseTo(slow.understeer, 4); expect(fast.beta).not.toBeCloseTo(slow.beta, 4); expect(fast.protection).toBe(0);
    const s = createState(p, { worldVelocity: { x: 6, y: 0 } }); expect(step(s, { targetSpeed: 6, angle: 0, drift: true }, p).worldVelocity.y).toBe(0);
  });
});
