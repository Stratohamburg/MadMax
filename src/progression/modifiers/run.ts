import { nextRandom, seedState } from "../../simulation/random";
import type { AttributeModifier } from "../../stats/modifiers";
import { UPGRADES } from "./catalog";
import type { Upgrade } from "./catalog";
export interface OwnedUpgrade { id: string; stacks: number; expiresAt: number | null }
export interface ModifierRunState { random: number; time: number; owned: OwnedUpgrade[]; offered: string[]; rerolls: number; pity: number; choices: number; exhausted: boolean }
export function createModifierRun(seed: number): ModifierRunState { return { random: seedState(seed), time: 0, owned: [], offered: [], rerolls: 3, pity: 0, choices: 0, exhausted: false }; }
export function grantUpgrade(current: ModifierRunState, id: string, catalog = UPGRADES): ModifierRunState {
  const definition = catalog[id]; if (!definition) throw new Error(`未知升级: ${id}`);
  const next = structuredClone(current), owned = next.owned.find(u => u.id === id);
  const expiresAt = definition.duration === null ? null : current.time + definition.duration;
  if (owned) {
    owned.stacks = Math.min(definition.maxStacks, owned.stacks + 1);
    if (definition.duration !== null) owned.expiresAt = definition.refresh === "extend" ? Math.max(current.time, owned.expiresAt ?? current.time) + definition.duration : expiresAt;
  } else next.owned.push({ id, stacks: 1, expiresAt });
  return next;
}
export function activeModifiers(state: ModifierRunState, catalog = UPGRADES): AttributeModifier[] {
  return state.owned.flatMap(owned => Array.from({ length: owned.stacks }, (_, i) => ({ ...catalog[owned.id].modifier,
    id: `${owned.id}:${i}`, source: `upgrade:${owned.id}`, group: `upgrade:${owned.id}` })));
}
export function advanceModifiers(state: ModifierRunState, dt: number): ModifierRunState {
  if (!Number.isFinite(dt) || dt < 0) throw new Error("modifier time");
  const time = state.time + dt;
  return { ...state, time, owned: state.owned.filter(u => u.expiresAt === null || u.expiresAt > time + 1e-10) };
}
export function offerChoices(current: ModifierRunState, tags: readonly string[], reroll = false, catalog: Readonly<Record<string, Upgrade>> = UPGRADES): ModifierRunState {
  if (current.offered.length && !reroll) return current;
  if (reroll && (current.rerolls <= 0 || !current.offered.length)) throw new Error("无法刷新候选");
  const next = structuredClone(current); if (reroll) next.rerolls--;
  const candidates = Object.values(catalog).filter(u => (current.owned.find(o => o.id === u.id)?.stacks ?? 0) < u.maxStacks).sort((a, b) => a.id < b.id ? -1 : 1);
  const relevant = (u: Upgrade) => u.tags.length > 0 && u.tags.some(tag => tags.includes(tag));
  const selected: Upgrade[] = [];
  const draw = (pool: Upgrade[]): Upgrade => {
    const weights = pool.map(u => u.weight * ({ common: 1, rare: 0.35, epic: 0.08 }[u.rarity]) * (relevant(u) ? 3 : 1));
    const random = nextRandom(next.random); next.random = random.state;
    let point = random.value * weights.reduce((sum, w) => sum + w, 0), selected = pool.at(-1)!;
    for (let i = 0; i < pool.length; i++) { point -= weights[i]; if (point <= 0) { selected = pool[i]; break; } }
    return selected;
  };
  if (next.pity >= 3 && candidates.some(relevant)) selected.push(draw(candidates.filter(relevant)));
  while (selected.length < Math.min(3, candidates.length)) selected.push(draw(candidates.filter(c => !selected.includes(c))));
  next.offered = selected.map(u => u.id); next.exhausted = next.offered.length === 0;
  next.pity = selected.some(relevant) ? 0 : next.pity + 1;
  return next;
}
export function chooseUpgrade(current: ModifierRunState, id: string): ModifierRunState {
  if (!current.offered.includes(id)) throw new Error("升级不在待选项中");
  const next = grantUpgrade(current, id); next.offered = []; next.choices++; return next;
}
