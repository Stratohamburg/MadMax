import { CATALOG, occupiedCells } from "../../loadout/model";
import type { Cell, InstalledPart, Layer } from "../../loadout/types";
import { weaponSvg } from "../../combat/weapons/presentation";

export function boardGeometry(chassisId: string) {
  const cells = CATALOG.chassis[chassisId].layers.outer;
  const maxX = Math.max(...cells.map(c => c.x)), minX = Math.min(...cells.map(c => c.x));
  const minY = Math.min(...cells.map(c => c.y)), maxY = Math.max(...cells.map(c => c.y));
  return { maxX, minY, columns: maxY - minY + 1, rows: maxX - minX + 1 };
}
/** 顺时针暴露边连接成联合轮廓，装备内部没有格线。 */
export function cellOutline(cells: readonly Cell[]): string {
  const occupied = new Set(cells.map(c => `${c.x},${c.y}`)), edges = new Map<string, [number, number][]>();
  const edge = (x: number, y: number, tx: number, ty: number) => {
    const key = `${x},${y}`, list = edges.get(key) ?? []; list.push([tx, ty]); edges.set(key, list);
  };
  for (const { x, y } of cells) {
    if (!occupied.has(`${x},${y - 1}`)) edge(x, y, x + 1, y);
    if (!occupied.has(`${x + 1},${y}`)) edge(x + 1, y, x + 1, y + 1);
    if (!occupied.has(`${x},${y + 1}`)) edge(x + 1, y + 1, x, y + 1);
    if (!occupied.has(`${x - 1},${y}`)) edge(x, y + 1, x, y);
  }
  let path = "";
  while (edges.size) {
    const first = edges.keys().next().value!; let at = first; path += `M${first} `;
    do {
      const list = edges.get(at)!; const end = list.shift()!; if (!list.length) edges.delete(at);
      path += `L${end[0]},${end[1]} `; at = end.join(",");
    } while (at !== first && edges.has(at));
    path += "Z ";
  }
  return path.trim();
}
export function vehicleTopView(chassisId: string, layer: Layer): string {
  const { columns: w, rows: h } = boardGeometry(chassisId), c = w / 2, left = 0.72, right = w - left, top = 0.65, bottom = h - 0.65;
  const truck = /truck|van|pickup/.test(chassisId), front = top + (truck ? 1.2 : 1.7), rear = bottom - 1.55;
  const body = `M${c - 0.8},${top} Q${left + 0.15},${top + 0.1} ${left},${front} L${left},${rear} Q${left},${bottom} ${c - 0.8},${bottom} L${c + 0.8},${bottom} Q${right},${bottom} ${right},${rear} L${right},${front} Q${right - 0.15},${top + 0.1} ${c + 0.8},${top}Z`;
  const wheels = [front + 0.3, rear - 0.2].flatMap(y => [left - 0.35, right - 0.1].map(x => `<g><rect x="${x}" y="${y}" width=".45" height="1.3" rx=".14" fill="#101714" stroke="#738174" stroke-width=".06"/><path d="M${x + 0.08},${y + 0.3}h.29m-.29,.3h.29m-.29,.3h.29" stroke="#424c43" stroke-width=".07"/></g>`)).join("");
  const frame = `<path d="M${left + 0.55},${top + 0.65}V${bottom - 0.5}M${right - 0.55},${top + 0.65}V${bottom - 0.5}" stroke="#a7afa0" stroke-width=".22"/>${[front + 0.95, h / 2, rear + 0.3].map(y => `<path d="M${left + 0.4},${y}H${right - 0.4}" stroke="#717e72" stroke-width=".2"/>`).join("")}<path d="M${c},${top + 1.5}V${bottom - 1}" stroke="#b5a174" stroke-width=".16"/><ellipse cx="${c}" cy="${rear + 0.4}" rx=".47" ry=".25" fill="#9b927b"/>`;
  const exterior = `<path d="${body}" fill="#a08a55" stroke="#e0c78b" stroke-width=".08"/>
    <path d="M${left + 0.18},${front}L${left + 0.65},${top + 0.4}H${right - 0.65}L${right - 0.18},${front}Z" fill="#c4ad70"/>
    <path d="M${left + 0.35},${front + 0.3}L${left + 0.62},${front + 1.25}H${right - 0.62}L${right - 0.35},${front + 0.3}Z" fill="#203b3a" stroke="#b8bb9b" stroke-width=".07"/>
    <rect x="${left + 0.45}" y="${front + 1.4}" width="${right - left - 0.9}" height="${truck ? h * 0.18 : h * 0.25}" rx=".3" fill="#877a51" stroke="#c8b376" stroke-width=".06"/>
    <path d="M${left + 0.2},${bottom - 1.4}H${right - 0.2}L${right - 0.38},${bottom - 0.6}H${left + 0.38}Z" fill="#31413a"/>
    <path d="M${left + 0.5},${top + 0.25}h.5m${right - left - 1.5},0h.5" stroke="#f9e4a6" stroke-width=".15"/>
    <path d="M${left + 0.1},${front + 1.3}V${rear}M${right - 0.1},${front + 1.3}V${rear}" stroke="#e2ce9b55" stroke-width=".09"/>`;
  return `<svg class="vehicle-blueprint" viewBox="0 0 ${w} ${h}" role="img" aria-label="${CATALOG.chassis[chassisId].name}${layer === "inner" ? "底盘俯视图" : "外观俯视图"}">
    <ellipse cx="${c}" cy="${h / 2 + 0.15}" rx="${w * 0.48}" ry="${h * 0.49}" fill="#0004"/>${wheels}
    ${layer === "inner" ? `<path d="${body}" fill="#26372e" fill-opacity=".8" stroke="#8ba28d" stroke-width=".07"/>${frame}` : exterior}
    <path d="M${c - 0.25},.25L${c},.04L${c + 0.25},.25" fill="none" stroke="#f0d38c" stroke-width=".06"/></svg>`;
}
export function equipmentView(part: InstalledPart, ghost = false) {
  const cells = occupiedCells(part), minX = Math.min(...cells.map(c => c.x)), maxX = Math.max(...cells.map(c => c.x));
  const minY = Math.min(...cells.map(c => c.y)), maxY = Math.max(...cells.map(c => c.y));
  const width = maxY - minY + 1, height = maxX - minX + 1;
  const display = cells.map(cell => ({ x: cell.y - minY, y: maxX - cell.x }));
  const path = cellOutline(display), definition = CATALOG.parts[part.partId];
  const id = `equipment-${part.instanceId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${ghost ? "ghost" : "active"}`;
  const cx = width / 2, cy = height / 2;
  let art: string, color = "#597366";
  if (definition.engine) {
    color = "#687c73";
    art = `<rect x=".16" y=".2" width="${width - 0.32}" height="${height - 0.4}" rx=".18" fill="#283e35" stroke="#b6c4ac" stroke-width=".05"/>${Array.from({ length: 5 }, (_, i) => `<path d="M.28,${0.4 + i * (height - 0.8) / 4}H${width - 0.28}" stroke="#a0a98e" stroke-width=".08"/>`).join("")}<circle cx="${cx}" cy="${cy}" r=".22" fill="#aa8251" stroke="#dec38e" stroke-width=".05"/>`;
  } else if (definition.gearbox) {
    color = "#6a7277";
    const shaft = height >= width ? `M${cx},.1V${height - 0.1}` : `M.1,${cy}H${width - 0.1}`;
    art = `<ellipse cx="${cx}" cy="${cy}" rx="${width * 0.33}" ry="${height * 0.36}" fill="#37484b" stroke="#bcc3b1" stroke-width=".06"/><path d="${shaft}" stroke="#b4ad8a" stroke-width=".14"/><circle cx="${cx}" cy="${cy}" r=".22" fill="#8d9389" stroke="#d2d2ba" stroke-width=".05"/>`;
  } else if (definition.battery) {
    color = "#486978"; art = `<rect x=".16" y=".22" width="${width - 0.32}" height="${height - 0.38}" rx=".08" fill="#223e47"/><path d="M.25,.12h.17m.16,0h.17M.26,.43h.17m-.085,-.085v.17" stroke="#e2c18b" stroke-width=".07"/>`;
  } else if (definition.fuelCapacity) {
    color = "#94764a"; art = `<rect x=".17" y=".15" width="${width - 0.34}" height="${height - 0.3}" rx=".14" fill="#614f35" stroke="#cfb87c" stroke-width=".04"/><path d="M.3,.3L${width - 0.3},${height - 0.3}M${width - 0.3},.3L.3,${height - 0.3}" stroke="#b39a66" stroke-width=".05"/>`;
  } else if (definition.seat) {
    color = "#547c80"; art = `<rect x=".23" y=".14" width="${width - 0.46}" height="${height * 0.33}" rx=".11" fill="#203e42"/><rect x=".18" y="${height * 0.5}" width="${width - 0.36}" height="${height * 0.32}" rx=".14" fill="#2a4546" stroke="#98b2a1" stroke-width=".035"/>`;
  } else if (definition.weaponId) {
    color = "#77654d";
    art = `<g transform="translate(${cx},${cy})">${weaponSvg(definition.weaponId, part.facing)}</g>`;
  } else {
    color = definition.ammo ? "#8a7e4f" : "#6b7c61";
    art = `<path d="M.2,.2H${width - 0.2}V${height - 0.2}H.2Z" fill="#253b2e" stroke="#b6bb92" stroke-width=".045"/><path d="M.3,.3L${width - 0.3},${height - 0.3}M${width - 0.3},.3L.3,${height - 0.3}" stroke="#9aa37c" stroke-width=".06"/>`;
  }
  return { minY, maxX, width, height, svg: `<svg class="equipment-art" viewBox="0 0 ${width} ${height}" aria-hidden="true"><defs><clipPath id="${id}"><path d="${path}"/></clipPath></defs><g clip-path="url(#${id})"><path class="equipment-body" d="${path}" fill="${color}"/>${art}</g><path class="equipment-outline" d="${path}" fill="none" stroke="#d5d3a0" stroke-width=".055" stroke-linejoin="round"/></svg>` };
}
