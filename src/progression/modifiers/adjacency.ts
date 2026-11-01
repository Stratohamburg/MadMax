import { CATALOG, compareId, occupiedCells } from "../../loadout/model";
import type { Loadout } from "../../loadout/types";
import type { AttributeModifier } from "../../stats/modifiers";
export function adjacencyGraph(loadout: Loadout): Record<string, string[]> {
  const occupied = new Map<string, string>(), graph: Record<string, Set<string>> = {};
  for (const part of loadout.parts) { graph[part.instanceId] = new Set(); for (const c of occupiedCells(part)) occupied.set(`${part.layer}:${c.x},${c.y}`, part.instanceId); }
  for (const part of loadout.parts) for (const cell of occupiedCells(part)) for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const other = occupied.get(`${part.layer}:${cell.x + x},${cell.y + y}`);
    if (other && other !== part.instanceId) graph[part.instanceId].add(other);
  }
  return Object.fromEntries(Object.entries(graph).map(([id, set]) => [id, [...set].sort(compareId)]));
}
export function adjacencyModifiers(loadout: Loadout): AttributeModifier[] {
  const graph = adjacencyGraph(loadout), parts = new Map(loadout.parts.map(p => [p.instanceId, CATALOG.parts[p.partId]]));
  const result: AttributeModifier[] = [];
  for (const id of Object.keys(graph).sort(compareId)) for (const neighbor of graph[id]) {
    const a = parts.get(id)!, b = parts.get(neighbor)!;
    if (!a.weaponId || !b.weaponId) continue;
    const tag = ["barrage", "explosive", "fire"].find(tag => a.tags.includes(tag) && b.tags.includes(tag));
    if (tag) result.push({ id: `adj:${id}:${neighbor}`, source: `adj:${neighbor}`, group: `adj:${tag}`, target: "weapon", attribute: "damage", layer: "increased", value: 0.1, instanceId: id });
  }
  return result;
}
