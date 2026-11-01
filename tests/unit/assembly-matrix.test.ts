import { describe, expect, it } from "vitest";
import { compose, stockLoadout } from "../../src/loadout";
import { PROFILES } from "../../src/vehicle/physics/profiles";
import { assemblyNormalMatrix } from "../../src/vehicle/assembly-benchmarks";

describe("真实装配普通控制稳定性矩阵", () => {
  for (const profile of PROFILES) it(`${profile.profileId}: 三路面×三速度×三方向`, () => {
    const results = assemblyNormalMatrix(compose(stockLoadout(profile.profileId)));
    expect(results).toHaveLength(27);
    expect(results.filter(r => !r.passed)).toEqual([]);
  }, 20000);
  for (const id of ["sports-car", "truck"]) for (const y of [-1, 1]) it(`${id}: 偏心重炮 y=${y}`, () => {
    const loadout = stockLoadout(id);
    const composition = compose({ ...loadout, parts: [...loadout.parts, { instanceId: "extra", partId: "cannon", layer: "outer", x: 4, y, rotation: 0, facing: 0 }] });
    expect(assemblyNormalMatrix(composition).filter(r => !r.passed)).toEqual([]);
  }, 20000);
});
