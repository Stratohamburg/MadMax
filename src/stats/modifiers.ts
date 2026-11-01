export type ModifierLayer = "flat" | "increased" | "more";
export interface AttributeModifier {
  id: string;
  source: string;
  group: string;
  target: "vehicle" | "weapon" | "damage";
  attribute: string;
  layer: ModifierLayer;
  value: number;
  allTags?: readonly string[];
  anyTags?: readonly string[];
  instanceId?: string;
}
export function matchesTags(modifier: Pick<AttributeModifier, "allTags" | "anyTags">, tags: readonly string[]): boolean {
  const set = new Set(tags);
  return (modifier.allTags?.every(tag => set.has(tag)) ?? true) &&
    (!modifier.anyTags?.length || modifier.anyTags.some(tag => set.has(tag)));
}
/** 共享分层规则；调用方负责属性自身的合法范围。more.value 是倍率而不是增量。 */
export function evaluateAttribute(base: number, modifiers: readonly AttributeModifier[],
  target: AttributeModifier["target"], attribute: string, tags: readonly string[] = [], instanceId?: string) {
  if (!Number.isFinite(base)) throw new Error("attribute: 基础值非有限");
  const applied = modifiers.filter(m => m.target === target && m.attribute === attribute && matchesTags(m, tags) && (m.instanceId === undefined || m.instanceId === instanceId))
    .sort((a, b) => a.source < b.source ? -1 : a.source > b.source ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  let flat = 0, increased = 0, more = 1;
  const groups: Record<string, number> = Object.create(null);
  for (const modifier of applied) {
    if (!Number.isFinite(modifier.value) || (modifier.layer === "more" && modifier.value < 0)) throw new Error(`modifier.${modifier.id}: 非法值`);
    if (modifier.layer === "flat") flat += modifier.value;
    else if (modifier.layer === "increased") increased += modifier.value;
    else if (modifier.layer === "more") {
      more *= modifier.value;
      groups[modifier.group] = (groups[modifier.group] ?? 1) * modifier.value;
    } else throw new Error(`modifier.${modifier.id}: 未知层`);
  }
  const value = (base + flat) * (1 + increased) * more;
  if (![flat, increased, more, value].every(Number.isFinite)) throw new Error("attribute: 数值溢出");
  return { base, flat, increased, more, groups, value, applied: applied.map(m => ({ ...m })) };
}
