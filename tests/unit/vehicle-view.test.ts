import { expect, it } from "vitest";
import { cellOutline, equipmentView } from "../../src/ui/loadout/vehicle-view";
import { stockLoadout } from "../../src/loadout/presets";
it("四格整体轮廓只保留外周边界", () => {
  const path = cellOutline([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
  expect(path.match(/M/g)).toHaveLength(1); expect(path.match(/L/g)).toHaveLength(8); expect(path).not.toContain("L1,1");
});
it("L 形部件保留凹角边界且没有内部格线", () => {
  const path = cellOutline([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]);
  expect(path.match(/M/g)).toHaveLength(1); expect(path.match(/L/g)).toHaveLength(8); expect(path).toContain("L1,1");
});
it("旋转后的多格部件整体尺寸与占格一致", () => {
  const part = stockLoadout("sports-car").parts.find(p => p.partId === "gearbox")!;
  expect(part).toBeDefined();
  const initial = equipmentView(part), rotated = equipmentView({ ...part, rotation: 90 });
  expect(rotated.width).toBe(initial.height); expect(rotated.height).toBe(initial.width);
  expect(initial.svg.match(/class="equipment-outline"/g)).toHaveLength(1);
});
