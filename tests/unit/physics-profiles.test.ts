import { describe, it, expect } from "vitest";
import {
  PROFILES,
  getProfile,
  validateProfile,
} from "../../src/vehicle/physics";
import {
  normalMatrix,
  recoveryMatrix,
  numericalReport,
  energyReport,
} from "../../src/vehicle/physics/benchmarks";
describe("十车型 v2 矩阵", () => {
  it("完整配置独立、同核与修订标识", () => {
    expect(PROFILES).toHaveLength(10);
    expect(new Set(PROFILES.map((p) => p.profileId)).size).toBe(10);
    for (const p of PROFILES) {
      expect(validateProfile(p)).toEqual([]);
      expect(p.profileRevision).toBe("2");
    }
    const q = getProfile("heavy-truck");
    q.mass = 1;
    expect(getProfile("heavy-truck").mass).toBe(8);
  });
  for (const p of PROFILES)
    it(`${p.label} 三路面×三速度×90/180/换向，不spin；外部失控惯性、能量、帧率与收敛`, () => {
      const matrix = normalMatrix(p);
      expect(matrix).toHaveLength(27);
      expect(
        matrix.filter((x) => !x.passed).map(({ trace, ...x }) => x),
      ).toEqual([]);
      expect(recoveryMatrix(p).every((x) => x.passed)).toBe(true);
      expect(energyReport(p).passed).toBe(true);
      expect(numericalReport(p).passed).toBe(true);
    }, 30000);
});
