import { getProfile } from "../src/vehicle/physics/profiles.ts";
import { diagnostic } from "../src/vehicle/physics/benchmarks.ts";
console.log(
  JSON.stringify(
    diagnostic(getProfile(process.argv[2] ?? "sports-car")),
    null,
    2,
  ),
);
