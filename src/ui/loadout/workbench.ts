import { CATALOG, movePart, occupiedCells, placePart, removePart, updatePart } from "../../loadout/model";
import type { InstalledPart, Layer, Loadout } from "../../loadout/types";
import { createModules, moduleComposition, moduleCondition } from "../../combat/modules";
import { buyPart, deleteBlueprint, instanceModifiers, ownedStock, repairPart, resolveLoadout, saveBlueprint, unlockContent, upgradePart } from "../../persistence/profile";
import type { Profile } from "../../persistence/profile";
import type { ProfileRepository } from "../../persistence/repository";
import { uniqueId } from "../../simulation/identity";
import { boardGeometry, equipmentView, vehicleTopView } from "./vehicle-view";

const conditionText = (hp: number, maxHp: number) => ({ Normal: "正常", Damaged: "受损，性能降低", Destroyed: "已毁坏，需维修" })[moduleCondition(hp, maxHp)];
const durabilityText = (hp: number, maxHp: number) => `耐久 ${Math.ceil(hp)}/${maxHp} · ${conditionText(hp, maxHp)}`;

export function openWorkbench(initial: Loadout, repository: ProfileRepository, getProfile: () => Profile, setProfile: (p: Profile) => void, use: (loadout: Loadout) => void): HTMLDialogElement {
  const dialog = document.createElement("dialog"); dialog.id = "workbench";
  dialog.innerHTML = `<header class="garage-header"><div><p class="eyebrow">MADMAX / MOTOR WORKS</p><h2>装配工作台</h2></div><button id="garage-close">关闭</button></header>
    <p id="garage-wallet"></p><div class="garage-toolbar"><button data-layer="inner">底盘俯视</button><button data-layer="outer">外观俯视</button><label><input id="ghost-toggle" type="checkbox" checked>透视另一层</label></div>
    <div class="garage-layout"><section><div class="grid-heading">↑ 车头 <span id="layer-name"></span></div><div class="board-scroll"><div id="loadout-board" aria-label="装配网格"></div></div>
    <div class="garage-toolbar"><button id="rotate-part">旋转 90°</button><button id="face-part">朝向 +45°</button><button id="remove-part">卸下</button><button id="restore-stock">还原出厂布局</button></div>
    <p id="selected-part">选择部件后点格摆放，或直接拖拽</p><output id="garage-summary"></output></section>
    <section><h3>部件仓库</h3><div id="inventory-list"></div><div class="garage-toolbar"><button id="upgrade-part">升级</button><button id="repair-part">维修 20 / 5</button></div>
    <label>购买零件 <select id="buy-definition"></select></label><button id="buy-part">购买 50 / 10</button>
    <label>解锁底盘 <select id="unlock-chassis"></select></label><button id="unlock">解锁 100 / 20</button></section></div>
    <div id="garage-message" role="status"></div><section class="blueprint-controls"><label>装配方案 <select id="blueprint-select"></select></label><input id="blueprint-name" aria-label="方案名称" maxlength="40" placeholder="为这辆车命名"><div class="garage-toolbar"><button id="blueprint-save">保存方案</button><button id="blueprint-load">加载</button><button id="blueprint-delete">删除</button><button id="garage-use" class="primary">保存并使用</button></div></section>`;
  document.body.append(dialog); dialog.showModal();
  let loadout = structuredClone(initial), layer: Layer = "inner", selected: string | null = null, ghost = true, busy = false;
  let blueprintId = getProfile().blueprints.find(b => b.loadout.chassisId === initial.chassisId)?.id ?? "active";
  const query = <T extends Element = HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const message = (text: string) => { query("#garage-message").textContent = text; };
  const installed = () => loadout.parts.find(p => p.instanceId === selected);
  const edit = (result: ReturnType<typeof movePart>) => {
    if (result.ok) {
      try { composition(result.value); loadout = result.value; message("装配已更新"); }
      catch (error) { message(`无法使用此装配：${String(error)}`); }
    } else message(result.errors.map(e => e.message).join("；"));
    render();
  };
  const transact = async (operation: (p: Profile) => Profile) => {
    if (busy) return; busy = true;
    try { const p = await repository.update(operation); setProfile(p); message("已保存到本地档案"); render(); }
    catch (error) { message(String(error)); }
    finally { busy = false; }
  };
  function composition(candidate = loadout) {
    const modules = createModules(candidate), profile = getProfile();
    for (const part of candidate.parts) modules.hp[part.instanceId] = profile.inventory[part.instanceId]?.hp ?? 0;
    return moduleComposition(modules, instanceModifiers(profile, candidate));
  }
  function place(x: number, y: number) {
    if (!selected) { message("先从仓库选择一个部件"); return; }
    const part = installed(), instance = getProfile().inventory[selected]; if (!instance) return;
    const definition = CATALOG.parts[instance.definitionId];
    layer = definition.layer;
    edit(part ? movePart(loadout, selected, { x, y }) : placePart(loadout, { instanceId: selected, partId: definition.id, layer: definition.layer, x, y, rotation: 0, facing: 0 }));
  }
  function render() {
    const profile = getProfile(), chassis = CATALOG.chassis[loadout.chassisId], cells = chassis.layers[layer];
    query("#garage-wallet").textContent = `${chassis.name} · 货币 ${profile.currency} · 废料 ${profile.materials.scrap ?? 0} · ${Object.keys(profile.inventory).length} 件`;
    query("#layer-name").textContent = layer === "inner" ? "车辆底盘 · 内层" : "车辆外观 · 外层";
    dialog.querySelectorAll<HTMLButtonElement>("[data-layer]").forEach(button => { button.setAttribute("aria-pressed", String(button.dataset.layer === layer)); });
    const { minY, maxX, columns, rows } = boardGeometry(loadout.chassisId);
    const board = query("#loadout-board"); board.innerHTML = vehicleTopView(loadout.chassisId, layer);
    board.style.setProperty("--columns", String(columns)); board.style.setProperty("--rows", String(rows));
    const position = (element: HTMLElement, x: number, y: number, width = 1, height = 1) => {
      Object.assign(element.style, { left: `${x / columns * 100}%`, top: `${y / rows * 100}%`, width: `${width / columns * 100}%`, height: `${height / rows * 100}%` });
    };
    const occupied = new Map(loadout.parts.filter(p => p.layer === layer).flatMap(p => occupiedCells(p).map(c => [`${c.x},${c.y}`, p] as const)));
    for (const cell of cells) {
      const part = occupied.get(`${cell.x},${cell.y}`);
      const button = document.createElement("button"); button.className = `grid-cell ${cell.available ? "" : "unavailable"} ${part ? "occupied" : ""} ${cell.slot === "edge" ? "edge-slot" : ""} ${part?.instanceId === selected ? "selected" : ""}`;
      position(button, cell.y - minY, maxX - cell.x);
      button.dataset.x = String(cell.x); button.dataset.y = String(cell.y);
      button.setAttribute("aria-label", `${layer === "inner" ? "内" : "外"}层 ${cell.x},${cell.y}${part ? " " + CATALOG.parts[part.partId].name : " 空格"}`);
      button.title = `${cell.x},${cell.y} · ${cell.slot}${part ? " · " + CATALOG.parts[part.partId].name : ""}`;
      if (part) button.tabIndex = -1;
      board.append(button);
    }
    for (const part of loadout.parts) {
      const other = part.layer !== layer; if (other && !ghost) continue;
      const view = equipmentView(part, other), element = document.createElement(other ? "div" : "button");
      element.className = other ? "ghost-equipment" : `installed-part ${part.instanceId === selected ? "selected" : ""}`;
      position(element, view.minY - minY, maxX - view.maxX, view.width, view.height);
      element.innerHTML = view.svg;
      const definition = CATALOG.parts[part.partId], hp = profile.inventory[part.instanceId]?.hp ?? 0;
      const condition = moduleCondition(hp, definition.hp);
      element.dataset.condition = condition;
      if (!other) {
        element.dataset.instance = part.instanceId; element.setAttribute("aria-label", `${definition.name} · ${durabilityText(hp, definition.hp)}`);
        element.title = `${definition.name} · ${occupiedCells(part).length} 格 · ${durabilityText(hp, definition.hp)}`;
        const label = document.createElement("span"); label.className = "equipment-label";
        label.textContent = CATALOG.parts[part.partId].name.replace(/^.*? /, ""); element.append(label);
        if (condition !== "Normal") {
          const badge = document.createElement("span"); badge.className = "equipment-condition"; badge.setAttribute("aria-hidden", "true");
          badge.textContent = condition === "Destroyed" ? "×" : "!"; element.append(badge);
        }
      } else element.setAttribute("aria-hidden", "true");
      board.append(element);
    }
    const list = query("#inventory-list"); list.replaceChildren();
    for (const instance of Object.values(profile.inventory)) {
      const definition = CATALOG.parts[instance.definitionId], button = document.createElement("button");
      button.className = `inventory-part ${instance.id === selected ? "selected" : ""}`; button.dataset.instance = instance.id;
      button.dataset.condition = moduleCondition(instance.hp, definition.hp);
      button.textContent = `${definition.name} L${instance.level} · ${durabilityText(instance.hp, definition.hp)}${loadout.parts.some(p => p.instanceId === instance.id) ? " · 已装" : ""}`;
      button.title = `${definition.massKg} kg · ${definition.layer === "inner" ? "内层" : "外层"}`; list.append(button);
    }
    const part = installed(), instance = selected ? profile.inventory[selected] : null;
    query("#selected-part").textContent = instance ? `${CATALOG.parts[instance.definitionId].name} · ${durabilityText(instance.hp, CATALOG.parts[instance.definitionId].hp)}${part ? ` · 旋转 ${part.rotation}° / 朝向 ${part.facing}°` : " · 点击格子摆放"}` : "选择部件后点格摆放，或直接拖拽";
    for (const id of ["rotate-part", "face-part", "remove-part"]) query<HTMLButtonElement>(`#${id}`).disabled = !part;
    query<HTMLButtonElement>("#upgrade-part").disabled = !instance || instance.level >= 5;
    query("#upgrade-part").textContent = instance && instance.level < 5 ? `升级 L${instance.level + 1} · ${50 * (instance.level + 1)} / ${10 * (instance.level + 1)}` : "升级";
    query<HTMLButtonElement>("#repair-part").disabled = !instance || instance.hp >= CATALOG.parts[instance.definitionId].hp;
    try {
    const c = composition();
    query("#garage-summary").textContent = `总质量 ${Math.round(c.summary.massKg)} kg / 上限 ${Math.round(c.summary.massLimitKg)} kg${c.summary.overloaded ? " · 超重" : ""}\n质心 ${c.centerOfMass.x.toFixed(3)}, ${c.centerOfMass.y.toFixed(3)} · 前轴 ${Math.round(c.summary.frontLoadRatio * 100)}%\n动力 ${c.engine?.maxPower.toFixed(0) ?? 0} kW · 最高目标速度 ${c.profile.power.maxSpeed.toFixed(1)} · 抓地 ${c.summary.gripRating.toFixed(2)}\n供电 ${c.resources.powerDraw}/${c.resources.maxOutput} · 电量 ${c.resources.capacity} · 燃料 ${c.resources.fuelCapacity}\n弹药 ${Object.entries(c.resources.ammo).map(([type, n]) => `${type} ${n}`).join(" / ")}\n${c.summary.canDrive ? "装配可驾驶" : c.summary.issues.join("；")}${c.components.some(p => p.performance < 1) ? " · 受损部件降效/失效" : ""}`;
    query<HTMLButtonElement>("#garage-use").disabled = !c.summary.canDrive;
    } catch (error) {
      query("#garage-summary").textContent = `此装配超出当前车辆支持范围：${String(error)}`;
      query<HTMLButtonElement>("#garage-use").disabled = true;
    }
    const options = (select: HTMLSelectElement, entries: { id: string; name: string }[]) => { select.replaceChildren(...entries.map(entry => { const option = document.createElement("option"); option.value = entry.id; option.textContent = entry.name; return option; })); };
    options(query("#buy-definition"), Object.values(CATALOG.parts).filter(p => profile.unlocks.parts.includes(p.id)));
    options(query("#unlock-chassis"), Object.values(CATALOG.chassis).filter(c => !profile.unlocks.chassis.includes(c.id)));
    options(query("#blueprint-select"), profile.blueprints); query<HTMLSelectElement>("#blueprint-select").value = blueprintId;
  }
  function boardCellAt(clientX: number, clientY: number) {
    const board = query("#loadout-board"), rect = board.getBoundingClientRect();
    if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) return null;
    const { columns, rows, maxX, minY } = boardGeometry(loadout.chassisId);
    return { x: maxX - Math.floor((clientY - rect.top) / rect.height * rows), y: minY + Math.floor((clientX - rect.left) / rect.width * columns) };
  }
  let drag: { id: number; x: number; y: number; offsetX: number; offsetY: number; moved: boolean; instanceId: string; source: HTMLElement } | null = null, skipClick = false;
  dialog.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const source = (event.target as Element).closest<HTMLElement>("[data-instance]"); if (!source?.dataset.instance) return;
    skipClick = false;
    const part = loadout.parts.find(p => p.instanceId === source.dataset.instance), cell = source.matches(".installed-part") ? boardCellAt(event.clientX, event.clientY) : null;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, offsetX: cell && part ? cell.x - part.x : 0, offsetY: cell && part ? cell.y - part.y : 0, moved: false, instanceId: source.dataset.instance, source }; source.setPointerCapture(event.pointerId);
  });
  dialog.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) drag.moved = true;
    dialog.querySelectorAll(".drop-target").forEach(e => e.classList.remove("drop-target"));
    const cell = boardCellAt(event.clientX, event.clientY);
    if (drag.moved && cell) dialog.querySelector(`.grid-cell[data-x="${cell.x}"][data-y="${cell.y}"]`)?.classList.add("drop-target");
  });
  dialog.addEventListener("pointerup", event => {
    if (!drag || drag.id !== event.pointerId) return;
    const previousDrag = drag; drag = null; previousDrag.source.releasePointerCapture(event.pointerId);
    if (previousDrag.moved) { skipClick = true; selected = previousDrag.instanceId; const target = boardCellAt(event.clientX, event.clientY); if (target) place(target.x - previousDrag.offsetX, target.y - previousDrag.offsetY); else { message("已取消拖拽"); render(); } }
  });
  dialog.addEventListener("pointercancel", () => { drag = null; skipClick = true; render(); message("已取消拖拽"); });
  dialog.addEventListener("click", event => {
    if (skipClick) { skipClick = false; return; }
    const target = (event.target as Element).closest<HTMLElement>("button"); if (!target) return;
    if (target.matches(".inventory-part")) {
      selected = target.dataset.instance!; layer = CATALOG.parts[getProfile().inventory[selected].definitionId].layer; render();
    } else if (target.matches(".installed-part")) {
      if (!selected || selected === target.dataset.instance) { selected = target.dataset.instance!; render(); }
      else { const cell = boardCellAt(event.clientX, event.clientY); if (cell) place(cell.x, cell.y); }
    } else if (target.matches(".grid-cell")) {
      if (target.dataset.instance && (!selected || selected === target.dataset.instance)) { selected = target.dataset.instance; render(); }
      else place(Number(target.dataset.x), Number(target.dataset.y));
    } else if (target.dataset.layer) { layer = target.dataset.layer as Layer; selected = null; render(); }
  });
  query("#ghost-toggle").addEventListener("change", () => { ghost = query<HTMLInputElement>("#ghost-toggle").checked; render(); });
  query("#garage-close").addEventListener("click", () => { dialog.close(); dialog.remove(); });
  dialog.addEventListener("close", () => dialog.remove());
  query("#rotate-part").addEventListener("click", () => { const part = installed(); if (part) edit(updatePart(loadout, part.instanceId, { rotation: ((part.rotation + 90) % 360) as InstalledPart["rotation"] })); });
  query("#face-part").addEventListener("click", () => { const part = installed(); if (part) edit(updatePart(loadout, part.instanceId, { facing: ((part.facing + 45) % 360) as InstalledPart["facing"] })); });
  query("#remove-part").addEventListener("click", () => { if (selected) edit(removePart(loadout, selected)); });
  query("#restore-stock").addEventListener("click", () => { const stock = ownedStock(getProfile(), loadout.chassisId); loadout = stock.loadout; selected = null; render(); message(stock.missing.length ? `缺少：${stock.missing.map(id => CATALOG.parts[id].name).join("、")}，未生成替代部件` : "已用库存还原出厂布局"); });
  query("#upgrade-part").addEventListener("click", () => { if (selected) void transact(p => upgradePart(p, selected!)); });
  query("#repair-part").addEventListener("click", () => { if (selected) void transact(p => repairPart(p, selected!)); });
  query("#buy-part").addEventListener("click", () => { const id = query<HTMLSelectElement>("#buy-definition").value; void transact(p => buyPart(p, id, `purchase:${uniqueId()}`)); });
  query("#unlock").addEventListener("click", () => { const id = query<HTMLSelectElement>("#unlock-chassis").value; void transact(p => unlockContent(p, "chassis", id)); });
  query("#blueprint-select").addEventListener("change", () => { blueprintId = query<HTMLSelectElement>("#blueprint-select").value; query<HTMLInputElement>("#blueprint-name").value = getProfile().blueprints.find(b => b.id === blueprintId)?.name ?? ""; });
  const save = (id = blueprintId) => transact(p => saveBlueprint(p, id, query<HTMLInputElement>("#blueprint-name").value || "我的装配", loadout));
  query("#blueprint-save").addEventListener("click", () => { blueprintId = `blueprint:${uniqueId()}`; void save(); });
  query("#blueprint-load").addEventListener("click", () => {
    const b = getProfile().blueprints.find(b => b.id === blueprintId); if (!b) return;
    const resolved = resolveLoadout(getProfile(), b.loadout); loadout = resolved.loadout; selected = null; render(); message(resolved.missing.length ? `缺失 ${resolved.missing.length} 个实例：${resolved.missing.join("、")}` : "方案已加载");
  });
  query("#blueprint-delete").addEventListener("click", () => { void transact(p => deleteBlueprint(p, blueprintId)); });
  query("#garage-use").addEventListener("click", async () => {
    if (busy || !composition().summary.canDrive) return; busy = true;
    try { const p = await repository.update(p => saveBlueprint(p, "active", query<HTMLInputElement>("#blueprint-name").value || "当前出击", loadout)); setProfile(p); use(loadout); dialog.close(); }
    catch (error) { message(String(error)); } finally { busy = false; }
  });
  render();
  return dialog;
}
