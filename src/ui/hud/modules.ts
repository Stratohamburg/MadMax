import { CATALOG, occupiedCells } from "../../loadout/model";
import type { Loadout } from "../../loadout/types";
import type { VehicleModules } from "../../combat/modules";
import { moduleCondition } from "../../combat/modules";
export function paperDoll(initial: Loadout, modules: VehicleModules) {
  return initial.parts.map(part => {
    const definition = CATALOG.parts[part.partId], detached = modules.detached.includes(part.instanceId);
    const condition = detached ? "Detached" : moduleCondition(modules.hp[part.instanceId] ?? 0, definition.hp);
    const status = { Normal: "正常", Damaged: "受损，性能衰减", Destroyed: "毁坏，功能丧失", Detached: "脱落" }[condition];
    return { id: part.instanceId, name: definition.name, cells: occupiedCells(part), condition, description: `${definition.name}：${status}` };
  });
}
export class ModuleHud {
  private signature = "";
  constructor(private container: HTMLElement) { container.setAttribute("aria-label", "车辆模块状态"); }
  update(initial: Loadout, modules: VehicleModules): void {
    const data = paperDoll(initial, modules), signature = JSON.stringify(data);
    if (signature === this.signature) return; this.signature = signature;
    this.container.replaceChildren();
    const title = document.createElement("span"); title.className = "doll-title"; title.textContent = "车辆状态 ↑";
    const grid = document.createElement("div"); grid.className = "paper-doll";
    const chassis = CATALOG.chassis[initial.chassisId], cells = chassis.layers.outer;
    const maxX = Math.max(...cells.map(c => c.x)), minY = Math.min(...cells.map(c => c.y));
    grid.style.gridTemplateColumns = `repeat(${Math.max(...cells.map(c => c.y)) - minY + 1}, 1fr)`;
    for (const part of data) for (const cell of part.cells) {
      const block = document.createElement("span"); block.className = `doll-cell ${part.condition.toLowerCase()}`;
      block.style.gridRow = String(maxX - cell.x + 1); block.style.gridColumn = String(cell.y - minY + 1);
      block.title = part.description; block.setAttribute("aria-label", part.description);
      block.textContent = ["Destroyed", "Detached"].includes(part.condition) ? "×" : ""; grid.append(block);
    }
    const explanation = document.createElement("span"); explanation.className = "doll-description";
    explanation.textContent = data.filter(p => p.condition !== "Normal").map(p => p.description).join("；") || "所有模块正常";
    this.container.append(title, grid, explanation);
  }
}
