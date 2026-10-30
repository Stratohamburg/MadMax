import { REFERENCE_PROFILE } from '../src/vehicle/physics/config.ts';
import { diagnostic, driftBenchmark } from '../src/vehicle/physics/benchmarks.ts';
const p = structuredClone(REFERENCE_PROFILE);
if (process.argv[2]) p.drift.rearStiffness = Number(process.argv[2]);
const d = driftBenchmark(p); console.log(JSON.stringify({ diagnostic: diagnostic(p), drift: { ...d, trace: undefined } }, null, 2));
