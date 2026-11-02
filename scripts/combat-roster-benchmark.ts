import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CombatWorld } from "../src/combat/world.ts";
import { ENEMIES, enemySpawn } from "../src/combat/enemies.ts";
import { DAMAGE_KINDS } from "../src/combat/pools.ts";
import { CombatEffects } from "../src/render/combat.ts";
import { nextRandom } from "../src/simulation/random.ts";
import { MODEL_VERSION } from "../src/vehicle/physics/config.ts";

const enemyCount = 128, bulletCapacity = 2048, iterations = 600, warmup = 120;
const world = new CombatWorld(123, bulletCapacity, enemyCount), effects = new CombatEffects(), ids = Object.keys(ENEMIES);
world.playerId = world.entities.spawn({ position: { x: 0, y: 0 }, hp: 1e12, faction: 0, attack: 0 })!;
for (let i = 0; i < enemyCount; i++) {
  const angle = i * Math.PI * 2 / enemyCount, radius = 3 + i % 4;
  world.entities.spawn(enemySpawn(ids[i % ids.length], { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }, { hp: 1e12, theta: angle + Math.PI }));
}
const samples: number[] = []; let peakBullets = 0, peakEffects = 0, peakPresentation = 0;
for (let step = 0; step < warmup + iterations; step++) {
  for (let i = 0; i < bulletCapacity; i++) if (!world.projectiles.active[i]) {
    const a = nextRandom(world.random), b = nextRandom(a.state); world.random = b.state;
    world.projectiles.spawn({ x: a.value * 20 - 10, y: b.value * 12 - 6 }, {
      angle: a.value * Math.PI * 2, speed: 12, damage: .1, kind: DAMAGE_KINDS[i % 3], aoe: i % 17 === 0 ? .6 : 0,
      penetration: i % 3, lifetime: 3, weaponId: i % 17 === 0 ? "rocket" : "machine-gun",
    }, i % 2 as 0 | 1, 0);
  }
  peakBullets = Math.max(peakBullets, world.projectiles.activeCount);
  const start = performance.now(); world.step(); effects.ingest(world.presentation, world.time);
  const elapsed = performance.now() - start; if (step >= warmup) samples.push(elapsed);
  peakEffects = Math.max(peakEffects, effects.active.length); peakPresentation = Math.max(peakPresentation, world.presentation.length);
}
samples.sort((a, b) => a - b);
const p95Ms = samples[Math.floor(samples.length * .95)];
const report = { benchmarkVersion: "combat-roster-benchmark-2", modelVersion: MODEL_VERSION, seed: 123, iterations, warmup, enemyCount, bulletCapacity,
  physicsVehicleCount: world.enemyVehicles.size,
  archetypes: ids, peakBullets, peakEffects, peakPresentation, p50Ms: samples[Math.floor(samples.length / 2)], p95Ms, maxMs: samples.at(-1),
  enemyShots: [...world.enemyWeapons.values()].reduce((sum, state) => sum + Object.values(state.weapons).reduce((n, w) => n + w.shots, 0), 0),
  aggregated: world.projectiles.aggregated, targetP95Ms: 4, withinEngineeringTarget: p95Ms <= 4, mobileVerified: false,
  environment: `Node.js ${process.version} / ${process.platform} / ${process.arch}`,
  measured: "固定步模拟、共用车辆物理与碰撞、128个真实敌方武器状态及展示事件消费；不含Canvas绘制和预填弹丸开销", };
const folder = resolve(process.argv[2] ?? "openspec/changes/add-combat-damage/evidence"); mkdirSync(folder, { recursive: true });
writeFileSync(resolve(folder, "desktop-roster-benchmark.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
