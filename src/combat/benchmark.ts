import { CombatWorld } from "./world";
import { nextRandom } from "../simulation/random";
import { DAMAGE_KINDS } from "./pools";
export function runCombatBenchmark(iterations = 600, bulletCapacity = 2048, enemyCount = 128) {
  const world = new CombatWorld(123, bulletCapacity, enemyCount);
  for (let i = 0; i < enemyCount; i++) world.entities.spawn({ position: { x: i % 16 - 8, y: Math.floor(i / 16) - 4 }, hp: 1e12, radius: 0.2 });
  const fill = () => {
    for (let i = 0; i < bulletCapacity; i++) if (!world.projectiles.active[i]) {
      const a = nextRandom(world.random); world.random = a.state;
      const b = nextRandom(world.random); world.random = b.state;
      world.projectiles.spawn({ x: a.value * 20 - 10, y: b.value * 12 - 6 }, {
        angle: a.value * Math.PI * 2, speed: 12, damage: 0.1, kind: DAMAGE_KINDS[i % 3], aoe: i % 17 === 0 ? 0.6 : 0,
        penetration: i % 3, lifetime: 3 }, i % 2 as 0 | 1, 0);
    }
  };
  const samples: number[] = [];
  let peakBullets = 0;
  for (let i = 0; i < iterations + 120; i++) {
    fill(); peakBullets = Math.max(peakBullets, world.projectiles.activeCount);
    const start = performance.now(); world.step(); const elapsed = performance.now() - start;
    if (i >= 120) samples.push(elapsed);
  }
  samples.sort((a, b) => a - b);
  const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
  return { benchmarkVersion: "combat-benchmark-1", seed: 123, iterations, enemyCount, bulletCapacity,
    peakBullets, p50Ms: samples[Math.floor(samples.length / 2)], p95Ms: p95, maxMs: samples.at(-1),
    targetP95Ms: 4, withinEngineeringTarget: p95 <= 4, mobileVerified: false,
    aggregated: world.projectiles.aggregated, environment: typeof navigator === "undefined" ? "Node.js desktop" : navigator.userAgent };
}
