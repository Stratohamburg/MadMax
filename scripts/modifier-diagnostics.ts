import { readFileSync } from "node:fs";
import { deserializeLoadout, stockLoadout } from "../src/loadout/index.ts";
import { createModifierRun, diagnoseBuild, grantUpgrade } from "../src/progression/modifiers/index.ts";
let loadout = stockLoadout("sports-car"), state = createModifierRun(123);
if (process.argv[2]) {
  const result = deserializeLoadout(readFileSync(process.argv[2], "utf8"));
  if (!result.ok) throw new Error(JSON.stringify(result.errors)); loadout = result.value;
}
for (const id of process.argv.slice(3)) state = grantUpgrade(state, id);
console.log(JSON.stringify(diagnoseBuild(loadout, state), null, 2));
