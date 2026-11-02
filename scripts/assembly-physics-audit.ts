import { vehicleSources } from "./vehicle-sources.ts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compose } from "../src/loadout/compose.ts";
import { stockLoadout } from "../src/loadout/presets.ts";
import { PROFILES } from "../src/vehicle/physics/profiles.ts";
import { MODEL_VERSION, CONTROLLER_VERSION } from "../src/vehicle/physics/config.ts";
import { assemblyNormalMatrix } from "../src/vehicle/assembly-benchmarks.ts";

const output = resolve(process.argv[2] ?? "openspec/changes/add-assembly-physics/evidence/vehicle-physics-5");
const sources = ["src/vehicle/assembly-drive.ts", "src/vehicle/assembly-benchmarks.ts", "src/stats/modifiers.ts", "scripts/assembly-physics-audit.ts",
  ...vehicleSources, ...["src/loadout"].flatMap(dir => readdirSync(dir).filter(f => f.endsWith(".ts")).map(f => `${dir}/${f}`))].sort();
const hash = createHash("sha256");
for (const path of sources) hash.update(path).update(readFileSync(path));
const cases = PROFILES.map(p => ({ name: `${p.profileId}:stock`, loadout: stockLoadout(p.profileId) }));
for (const id of ["sports-car", "truck"]) for (const y of [-1, 1]) {
  const loadout = stockLoadout(id);
  loadout.parts = [...loadout.parts, { instanceId: "extra", partId: "cannon", layer: "outer", x: 4, y, rotation: 0, facing: 0 }];
  cases.push({ name: `${id}:cannon:${y}`, loadout });
}
const reports = cases.map(({ name, loadout }) => {
  const composition = compose(loadout), matrix = assemblyNormalMatrix(composition);
  const report = { name, loadout, parameters: composition.profile, engine: composition.engine, gearbox: composition.gearbox,
    centerOfMass: composition.centerOfMass, matrix, passed: matrix.every(r => r.passed) };
  console.log(JSON.stringify({ name, passed: report.passed, peakSlip: Math.max(...matrix.map(r => r.peakSlip)) }));
  return report;
});
const result = { modelVersion: MODEL_VERSION, controllerVersion: CONTROLLER_VERSION, implementationHash: hash.digest("hex"), sources,
  passed: reports.every(r => r.passed), configurations: reports.length, scenarios: reports.reduce((n, r) => n + r.matrix.length, 0), reports,
  limitations: ["固定步离散实体圆接触未覆盖高速连续扫掠", "普通控制验收仅覆盖所列稳定初态与装配，不保证碰撞或任意装配下可恢复", "未执行真实手机驾驶与性能验收"] };
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, "assembly-matrix.json"), JSON.stringify(result, null, 2) + "\n");
assert.equal(result.scenarios, 378);
assert.equal(result.passed, true);
console.log(JSON.stringify({ passed: result.passed, configurations: result.configurations, scenarios: result.scenarios }));
