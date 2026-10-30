import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PROFILES, getProfile, SIMILAR_PAIRS } from '../src/vehicle/physics/profiles.ts';
import { assistedCircleCalibration, circleCalibration, driftBenchmark, energyReport, METRIC_FLOORS, metrics, normalMatrix, numericalReport, profileSnapshot, publicSpeed, qualifyingFamilies, recoveryMatrix, relativeDifference } from '../src/vehicle/physics/benchmarks.ts';
import type { AssistanceMode } from '../src/vehicle/physics/benchmarks.ts';
import { observe } from '../src/vehicle/physics/dynamics.ts';
import { createState } from '../src/vehicle/physics/state.ts';

const output = resolve(process.argv[2] ?? 'openspec/changes/build-vehicle-physics/evidence/vehicle-physics-1');
const modes: AssistanceMode[] = ['none', 'common', 'final'];
const common = getProfile('sports-car');
const sourceHash = createHash('sha256');
for (const file of readdirSync(resolve('src/vehicle/physics')).sort()) sourceHash.update(file).update(readFileSync(resolve('src/vehicle/physics', file)));
sourceHash.update(readFileSync(new URL(import.meta.url)));
const implementationHash = sourceHash.digest('hex');
const runId = implementationHash.slice(0, 12);
const profileReports = [];
for (const p of PROFILES) {
  const normal = normalMatrix(p), recovery = recoveryMatrix(p);
  const transient = structuredClone(p); transient.tires.front.relaxation = 0.12; transient.tires.rear.relaxation = 0.18;
  const transientNormal = normalMatrix(transient), transientRecovery = recoveryMatrix(transient);
  const requiredDrift = ['sports-car', 'rally-car'].includes(p.profileId);
  const drift = [p, transient].flatMap((q, i) => [1, -1].map(sign => ({ transient: i === 1, sign, ...driftBenchmark(q, sign) })));
  const numerical = numericalReport(p), energy = energyReport(p);
  const benchmarkMetrics = modes.map(mode => metrics(p, p.power.maxSpeed * 0.35, mode, common));
  const circle = { withoutAssistance: circleCalibration(p, p.power.maxSpeed * 0.35), commonAssistance: assistedCircleCalibration({ ...p, assist: { ...common.assist } }, p.power.maxSpeed * 0.35), finalAssistance: assistedCircleCalibration(p, p.power.maxSpeed * 0.35) };
  const passed = [...normal, ...recovery, ...transientNormal, ...transientRecovery].every(x => x.passed) && numerical.passed && energy.passed && (!requiredDrift || drift.every(x => x.passed));
  const report = { ...profileSnapshot(p), runId, implementationHash, passed, normal, recovery, transientNormal, transientRecovery,
    drift: { required: requiredDrift, cases: drift }, numerical, energy, benchmarkMetrics, circle,
    initialObservation: observe(createState(p), p),
    notExecuted: ['验证场消费者迁移', '长车碰撞求交/扫掠', '浏览器新版回归', '真实手机体验'] };
  const folder = resolve(output, p.profileId, p.profileRevision); mkdirSync(folder, { recursive: true });
  writeFileSync(resolve(folder, `core-${runId}.json`), JSON.stringify(report, null, 2) + '\n');
  profileReports.push({ profileId: p.profileId, profileRevision: p.profileRevision, passed, path: `${p.profileId}/${p.profileRevision}/core-${runId}.json`,
    normalMax: Math.max(...normal.map(x => x.settledAt ?? Infinity)), recoveryMax: Math.max(...recovery.map(x => x.settledAt ?? Infinity)),
    failed: { normal: normal.filter(x => !x.passed).length, recovery: recovery.filter(x => !x.passed).length,
      transientNormal: transientNormal.filter(x => !x.passed).length, transientRecovery: transientRecovery.filter(x => !x.passed).length,
      numerical: !numerical.passed, energy: !energy.passed, drift: requiredDrift && drift.some(x => !x.passed) } });
  console.log(JSON.stringify(profileReports.at(-1)));
}
const pairs = SIMILAR_PAIRS.map(([left, right]) => {
  const a = getProfile(left), b = getProfile(right), speed = publicSpeed(a, b);
  const results = modes.map(mode => {
    const x = metrics(a, speed, mode, common), y = metrics(b, speed, mode, common);
    const families = qualifyingFamilies(x.values, y.values);
    return { mode, speed, left: x, right: y, qualifyingFamilies: families, passed: families.length >= 2,
      differences: x.values.map(m => { const n = y.values.find(n => n.name === m.name)!; return { family: m.family, name: m.name, left: m.value, right: n.value, direction: m.value > n.value ? left : right, floor: METRIC_FLOORS[m.name], relative: relativeDifference(m.value, n.value, METRIC_FLOORS[m.name]) }; }) };
  });
  const result = { left, right, speed, results, passed: results.every(x => x.passed) };
  console.log(JSON.stringify({ pair: [left, right], passed: result.passed, families: results.map(x => ({ mode: x.mode, families: x.qualifyingFamilies })) }));
  return result;
});
const summary = { modelVersion: 'vehicle-physics-1', benchmarkVersion: 'vehicle-benchmark-1', runId, implementationHash, passed: profileReports.every(x => x.passed) && pairs.every(x => x.passed), profiles: profileReports, pairs,
  notExecuted: ['网页集成', '长车碰撞', '真实手机验收'], historicalEvidence: 'baseline-1原目录只读保留' };
mkdirSync(output, { recursive: true }); writeFileSync(resolve(output, `summary-${runId}.json`), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ runId, passed: summary.passed, output }));
if (!summary.passed) process.exitCode = 1;
