import type { Loadout } from "../../loadout/types";
import { validateLoadout, compareId } from "../../loadout/model";
import { nextRandom, seedState } from "../../simulation/random";
import type { Vec2 } from "../../vehicle/physics/math";
import type { Level, Loot } from "./level";
export type Phase = "prepare" | "enter" | "running" | "ended" | "settlement";
export type Outcome = "extracted" | "destroyed" | "timeout" | "abandoned";
export interface Settlement {
  version: 1; runId: string; levelId: string; outcome: Outcome; initialLoadout: Loadout;
  loot: Loot[]; lost: string[]; durability: Record<string, number>; xp: number; currency: number;
  kills: number; damage: number; time: number; story: string[]; unlocks: string[];
}
export interface RunState {
  phase: Phase; runId: string; seed: number; initialLoadout: Loadout; time: number; carry: Loot[];
  exitId: string | null; exitProgress: number; bossDead: boolean; outcome: Outcome | null; settlement: Settlement | null;
}
export function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
export function prepareRun(runId: string, seed: number, loadout: Loadout): RunState {
  if (!runId || !Number.isInteger(seed) || validateLoadout(loadout).length) throw new Error("非法出击参数");
  return { phase: "prepare", runId, seed, initialLoadout: structuredClone(loadout), time: 0, carry: [], exitId: null, exitProgress: 0, bossDead: false, outcome: null, settlement: null };
}
export function selectLoadout(state: RunState, loadout: Loadout): RunState {
  if (state.phase !== "prepare") throw new Error("局内不能手动改装");
  if (validateLoadout(loadout).length) throw new Error("装配无效");
  return { ...state, initialLoadout: structuredClone(loadout) };
}
export function transition(state: RunState, phase: "enter" | "running" | "settlement"): RunState {
  const allowed = { prepare: "enter", enter: "running", ended: "settlement" };
  if (allowed[state.phase as keyof typeof allowed] !== phase) throw new Error("非法阶段转移");
  return phase === "settlement" ? freeze({ ...state, phase }) : { ...state, phase };
}
export function pickup(state: RunState, loot: Loot, capacity: number): { state: RunState; reason: string | null } {
  if (state.phase !== "running") return { state, reason: "副本已结束" };
  if (state.carry.some(item => item.id === loot.id)) return { state, reason: "已经拾取" };
  if (state.carry.reduce((sum, item) => sum + item.cells, 0) + loot.cells > capacity) return { state, reason: "携带已满，物品留在原地" };
  return { state: { ...state, carry: [...state.carry, structuredClone(loot)] }, reason: null };
}
export function advanceRun(state: RunState, level: Level, position: Vec2, dt: number, bossDead = state.bossDead): RunState {
  if (state.phase !== "running") return state;
  const time = state.time + dt;
  const exit = level.exits.find(exit => time >= exit.after && (!exit.boss || bossDead) && Math.hypot(position.x - exit.position.x, position.y - exit.position.y) <= exit.radius);
  const exitProgress = exit ? (state.exitId === exit.id ? state.exitProgress : 0) + dt : 0;
  return { ...state, time, exitId: exit?.id ?? null, exitProgress, bossDead,
    outcome: time >= level.duration - 1e-9 ? "timeout" : exit && exitProgress >= exit.duration - 1e-9 ? "extracted" : null };
}
export function endRun(state: RunState, level: Level, outcome: Outcome, stats: { kills: number; damage: number }, durability: Record<string, number>, detached: readonly string[]): RunState {
  if (state.phase !== "running") return state;
  let random = seedState(state.seed ^ 0x2e519), lost = new Set(detached);
  for (const part of [...state.initialLoadout.parts].sort((a, b) => compareId(a.instanceId, b.instanceId))) {
    const next = nextRandom(random); random = next.state;
    if (outcome !== "extracted" && next.value < level.lossRate) lost.add(part.instanceId);
  }
  const loot = outcome === "extracted" ? structuredClone(state.carry) : [];
  const completed = outcome === "extracted" && state.bossDead;
  const settlement: Settlement = { version: 1, runId: state.runId, levelId: level.id, outcome, initialLoadout: structuredClone(state.initialLoadout),
    loot, lost: [...lost].sort(compareId), durability: { ...durability }, xp: stats.kills * 10,
    currency: loot.filter(l => l.kind === "currency").reduce((sum, l) => sum + l.amount, 0), ...stats, time: state.time,
    story: completed ? [level.story] : [], unlocks: completed ? [level.unlock] : [] };
  return freeze({ ...state, phase: "ended", outcome, settlement });
}
export const preparationRules = (level: Level) => `限时 ${level.duration} 秒 · 携带 ${level.capacity} 格 · 南出口 20 秒开放 / 北出口击败 Boss 开放 · 停留 5 秒撤离；离开范围重置。失败丢失战利品，装配逐件 ${level.lossRate * 100}% 损失；脱落件必定损失。`;
