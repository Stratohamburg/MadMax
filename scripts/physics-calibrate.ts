import { PROFILES } from '../src/vehicle/physics/profiles.ts';
import { normalMatrix, recoveryMatrix, driftBenchmark } from '../src/vehicle/physics/benchmarks.ts';
for (const p of PROFILES) {
  const normal = normalMatrix(p), recovery = recoveryMatrix(p), drift = driftBenchmark(p);
  console.log(JSON.stringify({ id: p.profileId, normal: normal.filter(x => !x.passed).map(x => ({ fraction: x.fraction, angle: x.angle, settled: x.settledAt, protection: x.protection })),
    normalMax: Math.max(...normal.map(x => x.settledAt ?? Infinity)), recovery: recovery.map(x => ({ passed: x.passed, settled: x.settledAt, counter: x.counterAt, protection: x.protection })),
    drift: { pass: drift.passed, duration: drift.duration, peakBeta: drift.peakBeta * 180 / Math.PI, routeError: drift.maxRouteError * 180 / Math.PI } }));
}
