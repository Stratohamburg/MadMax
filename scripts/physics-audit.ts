import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PROFILES } from '../src/vehicle/physics/profiles.ts';
import { RULES } from '../src/vehicle/physics/config.ts';

const folder = resolve(process.argv[2] ?? 'openspec/changes/build-vehicle-physics/evidence/vehicle-physics-1');
const hash = createHash('sha256');
for (const file of readdirSync(resolve('src/vehicle/physics')).sort()) hash.update(file).update(readFileSync(resolve('src/vehicle/physics', file)));
hash.update(readFileSync(resolve('scripts/physics-benchmark.ts')));
const implementationHash = hash.digest('hex'), runId = implementationHash.slice(0, 12);
const summary = JSON.parse(readFileSync(resolve(folder, `summary-${runId}.json`), 'utf8'));
assert.equal(summary.implementationHash, implementationHash); assert.equal(summary.passed, true);
assert.equal(summary.profiles.length, 10); assert.equal(summary.pairs.length, 7);
let checkedTracePoints = 0;
const files: { path: string; sha256: string }[] = [];
for (const p of PROFILES) {
  const path = `${p.profileId}/${p.profileRevision}/core-${runId}.json`;
  const data = readFileSync(resolve(folder, path)), r = JSON.parse(data.toString('utf8'));
  assert.equal(r.implementationHash, implementationHash); assert.equal(r.passed, true);
  assert.deepEqual(r.parameters, p); assert.deepEqual(r.rules, RULES);
  assert.equal(r.normal.length, 12); assert.equal(r.transientNormal.length, 12); assert.equal(r.recovery.length, 2); assert.equal(r.transientRecovery.length, 2);
  const cases = [...r.normal, ...r.transientNormal, ...r.recovery, ...r.transientRecovery];
  assert(cases.every(x => x.passed && x.protection === 0));
  if (r.drift.required) assert(r.drift.cases.every((x: { passed: boolean; duration: number }) => x.passed && x.duration >= 1));
  assert(r.numerical.passed && r.energy.passed);
  for (const c of [...cases, ...r.drift.cases]) for (const point of c.trace) {
    assert.equal(point.hardProtection, 0);
    assert(Math.abs(point.axles.front.load + point.axles.rear.load - p.mass * RULES.gravity) < 1e-8);
    for (const axle of [point.axles.front, point.axles.rear]) {
      assert(axle.load >= 0 && axle.utilization <= 1 + 1e-9);
      assert(Math.abs(axle.fx) <= axle.capX + 1e-8 && Math.abs(axle.fy) <= axle.capY + 1e-8);
    }
    assert(point.energy.mechanical >= 0 && point.energy.tireStored === 0);
    checkedTracePoints++;
  }
  const finalMetrics = r.benchmarkMetrics.find((x: { mode: string }) => x.mode === 'final');
  assert(finalMetrics.accelerationReached && finalMetrics.stoppingCompleted);
  assert(finalMetrics.surfaceResults.every((x: { protection: number }) => x.protection === 0));
  assert.equal(finalMetrics.drift.protection, 0); assert.equal(r.circle.finalAssistance.protection, 0);
  files.push({ path, sha256: createHash('sha256').update(data).digest('hex') });
}
for (const pair of summary.pairs) {
  assert(pair.passed); assert.equal(pair.results.length, 3);
  for (const mode of pair.results) {
    assert.equal(mode.speed, 0.35 * Math.min(PROFILES.find(p => p.profileId === pair.left)!.power.maxSpeed, PROFILES.find(p => p.profileId === pair.right)!.power.maxSpeed));
    assert(mode.passed && new Set(mode.qualifyingFamilies).size >= 2);
    assert(mode.left.accelerationReached && mode.left.stoppingCompleted && mode.right.accelerationReached && mode.right.stoppingCompleted);
  }
}
// 旧证据目录只读核对，不运行会直接覆盖它的旧e2e证据写入器。
const baselinePath = 'openspec/changes/validate-driving-prototype/evidence';
execFileSync('git', ['diff', '--quiet', 'HEAD', '--', baselinePath]);
const baselineTree = execFileSync('git', ['ls-tree', '-r', 'HEAD', '--', baselinePath], { encoding: 'utf8' });
const result = { auditVersion: 'vehicle-core-audit-1', runId, implementationHash, passed: true, profiles: files.length,
  pairs: summary.pairs.length, assistanceModes: ['none', 'common', 'final'], checkedTracePoints, files,
  baselineEvidenceUnchanged: true, baselineTree,
  notExecuted: summary.notExecuted };
writeFileSync(resolve(folder, `audit-${runId}.json`), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ runId, passed: true, profiles: files.length, pairs: summary.pairs.length, checkedTracePoints, baselineEvidenceUnchanged: true }));
