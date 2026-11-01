import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runCombatBenchmark } from "../src/combat/benchmark.ts";
const report = runCombatBenchmark();
const folder = resolve("openspec/changes/add-combat-damage/evidence");
mkdirSync(folder, { recursive: true });
writeFileSync(resolve(folder, "desktop-benchmark.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
