import { CATALOG, emptyLoadout, placePart } from "./model";
import type { Catalog, InstalledPart, Loadout } from "./types";

/** 固定遍历次序使 instanceId 与摆放可复现；每次重新创建以免编辑污染预设。 */
export function stockLoadout(chassisId: string, catalog: Catalog = CATALOG): Loadout {
  let loadout = emptyLoadout(chassisId, catalog);
  const heavy = /truck|heavy-pickup/.test(chassisId);
  const partIds = ["driver-seat", heavy ? "engine-diesel" : "engine-l4",
    heavy ? "gearbox-heavy" : "gearbox", "fuel-tank", "battery", "ammo-box", "machine-gun"];
  for (const [index, partId] of partIds.entries()) {
    const definition = catalog.parts[partId];
    const cells = [...catalog.chassis[chassisId].layers[definition.layer]];
    if (partId === "driver-seat") cells.sort((a, b) => b.x - a.x || Math.abs(a.y) - Math.abs(b.y) || a.y - b.y);
    let placed = false;
    for (const cell of cells) {
      const part: InstalledPart = { instanceId: `stock:${chassisId}:${index}`, partId,
        layer: definition.layer, x: cell.x, y: cell.y, rotation: 0, facing: 0 };
      const result = placePart(loadout, part, catalog);
      if (result.ok) { loadout = result.value; placed = true; break; }
    }
    if (!placed) throw new Error(`${chassisId}: 出厂预设无法放置 ${partId}`);
  }
  return loadout;
}
