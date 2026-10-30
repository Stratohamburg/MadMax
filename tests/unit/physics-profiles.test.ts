import { describe, expect, it } from 'vitest';
import { PROFILES, getProfile } from '../../src/vehicle/physics/profiles';
import { createState, derived, step, validateProfile } from '../../src/vehicle/physics';
import { energyReport, normalMatrix, numericalReport, recoveryMatrix } from '../../src/vehicle/physics/benchmarks';

describe('十车型核心验收', () => {
  it('十份完整独立数据、稳定标识、修订与合法窗口', () => {
    expect(PROFILES).toHaveLength(10); expect(new Set(PROFILES.map(p => p.profileId)).size).toBe(10);
    const snapshots = PROFILES.map(p => { expect(validateProfile(p)).toEqual([]); expect(p.acceptance.recoveryWindow).toBeLessThanOrEqual(7); return JSON.stringify({ geometry: p.geometry, power: p.power, tires: p.tires }); });
    expect(new Set(snapshots).size).toBe(10);
    const q = getProfile('heavy-truck'); q.mass = 1; expect(getProfile('heavy-truck').mass).toBe(8);
  });
  for (const p of PROFILES) {
    it(`${p.label} 普通/恢复、非零瞬态、能量、帧率与收敛`, () => {
      for (const q of [p, { ...p, tires: { front: { ...p.tires.front, relaxation: 0.12 }, rear: { ...p.tires.rear, relaxation: 0.18 } } }]) {
        expect(normalMatrix(q).filter(x => !x.passed).map(x => ({ speed: x.fraction, angle: x.angle }))).toEqual([]);
        expect(recoveryMatrix(q).every(x => x.passed)).toBe(true);
      }
      expect(energyReport(p).passed).toBe(true); expect(numericalReport(p).passed).toBe(true);
    }, 30000);
    it(`${p.label} 后向/左右/漂移/停车边界压测`, () => {
      let s = createState(p);
      for (let i = 0; i < 900; i++) {
        s = step(s, { targetSpeed: i < 700 ? p.power.maxSpeed * 0.7 : 0, angle: i < 100 ? Math.PI : Math.floor(i / 80) % 2 ? 1.6 : -1.6, drift: i % 160 < 80 }, p);
        expect(s.u).toBeGreaterThanOrEqual(-1e-9); expect(Number.isFinite(s.theta)).toBe(true); expect(s.speed).toBeLessThanOrEqual(p.power.maxSpeed + 1e-8);
        expect(derived(p).bodyLength).toBeGreaterThan(p.geometry.wheelbase);
      }
    }, 10000);
  }
});
