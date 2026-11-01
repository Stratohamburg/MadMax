import { expect, it } from "vitest";
import { stockLoadout } from "../../src/loadout/presets";
import { CATALOG } from "../../src/loadout/model";
import { createModules, damageModule } from "../../src/combat/modules";
import { paperDoll } from "../../src/ui/hud/modules";
import { DamageLabels } from "../../src/render/damage";
it("纸娃娃按原装配定位，映射正常、半血、毁坏和脱落", () => {
  const loadout = stockLoadout("sports-car"); let modules = createModules(loadout);
  expect(paperDoll(loadout, modules).every(p => p.condition === "Normal")).toBe(true);
  const engine = loadout.parts.find(p => p.partId === "engine-l4")!, gun = loadout.parts.find(p => p.partId === "machine-gun")!;
  modules = damageModule(modules, engine.instanceId, CATALOG.parts[engine.partId].hp * 0.5);
  expect(paperDoll(loadout, modules).find(p => p.id === engine.instanceId)?.condition).toBe("Damaged");
  modules = damageModule(modules, engine.instanceId, 10000); modules = damageModule(modules, gun.instanceId, 10000);
  const doll = paperDoll(loadout, modules);
  expect(doll.find(p => p.id === engine.instanceId)?.condition).toBe("Destroyed");
  expect(doll.find(p => p.id === gun.instanceId)?.condition).toBe("Detached"); expect(doll).toHaveLength(loadout.parts.length);
});
it("伤害按目标/类型/时间窗聚合且容量和过期回收有效", () => {
  const labels = new DamageLabels(2), event = { type: "damage" as const, targetId: 2, sourceId: 1, amount: 12, kind: "physical", position: { x: 0, y: 0 } };
  labels.ingest([event, event], 0.01); expect(labels.labels[0].amount).toBe(24);
  labels.ingest([{ ...event, kind: "fire" }], 0.1); expect(labels.labels).toHaveLength(2);
  labels.ingest([{ ...event, targetId: 3 }], 0.12); expect(labels.labels).toHaveLength(2); expect(labels.labels[0].kind).toBe("fire");
  labels.expire(2); expect(labels.labels).toEqual([]);
});
