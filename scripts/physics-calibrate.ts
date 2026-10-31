import { PROFILES } from "../src/vehicle/physics/profiles.ts";
import {
  normalMatrix,
  recoveryMatrix,
  driftBenchmark,
} from "../src/vehicle/physics/benchmarks.ts";
for (const p of PROFILES) {
  const normal = normalMatrix(p),
    recovery = recoveryMatrix(p),
    drift = driftBenchmark(p);
  console.log(
    JSON.stringify({
      id: p.profileId,
      normalFailures: normal
        .filter((x) => !x.passed)
        .map(({ trace, ...x }) => x),
      maxOrdinaryBeta: Math.max(...normal.map((x) => x.peakSlip)),
      recovery: recovery.map(({ trace, ...x }) => x),
      drift: { ...drift, trace: undefined },
    }),
  );
}
