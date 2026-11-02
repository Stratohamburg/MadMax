import { CATALOG } from "../../loadout/model";
import { grantParts, grantResource, repairAllParts, GM_PART_LIMIT, GM_RESOURCE_LIMIT } from "../../persistence/gm";
import type { Profile } from "../../persistence/profile";
import type { ProfileRepository } from "../../persistence/repository";

export function openGm(repository: ProfileRepository, getProfile: () => Profile, setProfile: (profile: Profile) => void): HTMLDialogElement {
  const dialog = document.createElement("dialog"); dialog.id = "gm-panel";
  dialog.innerHTML = `<header class="garage-header"><div><p class="eyebrow">MADMAX / GM</p><h2>GM 调试工具</h2></div><button id="gm-close">关闭</button></header>
    <p id="gm-wallet"></p><section><h3>发放物资</h3>
    <label for="gm-resource-amount">货币 / 废料数量（1～${GM_RESOURCE_LIMIT}）</label><input id="gm-resource-amount" type="number" min="1" max="${GM_RESOURCE_LIMIT}" step="1" value="1000" inputmode="numeric">
    <div class="dialog-actions"><button id="gm-grant-currency">发放货币</button><button id="gm-grant-scrap">发放废料</button></div>
    <label for="gm-part">零件类型</label><select id="gm-part"></select>
    <label for="gm-part-amount">零件数量（1～${GM_PART_LIMIT}）</label><input id="gm-part-amount" type="number" min="1" max="${GM_PART_LIMIT}" step="1" value="1" inputmode="numeric">
    <div class="dialog-actions"><button id="gm-grant-parts">发放零件到仓库</button><button id="gm-repair-all">一键修复全部装备</button></div><p class="gm-hint">零件以满耐久进入仓库，需在装备区安装。修复不扣资源，保留等级与布局。</p></section>
    <p id="gm-message" role="status" aria-live="polite"></p>
    <section class="gm-reset-section"><h3>重置本地数据</h3><p>清空库存、资源、装配方案、解锁、主线和统计，重建满耐久、带机枪的初始跑车。初始资源：250 货币、100 废料。</p>
    <label class="gm-confirm"><input id="gm-reset-confirm" type="checkbox">确认清空全部本地进度并重建初始车辆</label>
    <button id="gm-reset" disabled>重置数据并返回营地</button></section>`;
  const query = <T extends Element = HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const select = query<HTMLSelectElement>("#gm-part");
  select.replaceChildren(...Object.values(CATALOG.parts).map(part => {
    const option = document.createElement("option"); option.value = part.id; option.textContent = part.name; return option;
  }));
  select.value = "machine-gun";
  let busy = false;
  function render() {
    const p = getProfile();
    query("#gm-wallet").textContent = `货币 ${p.currency} · 废料 ${p.materials.scrap ?? 0} · 仓库 ${Object.keys(p.inventory).length} 件`;
    dialog.querySelectorAll<HTMLButtonElement>("button").forEach(button => { button.disabled = busy; });
    query<HTMLButtonElement>("#gm-reset").disabled = busy || !query<HTMLInputElement>("#gm-reset-confirm").checked;
    dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select").forEach(input => { input.disabled = busy; });
  }
  async function transact(operation: () => Promise<Profile>, success: string, reset = false) {
    if (busy) return;
    busy = true; query("#gm-message").textContent = "正在保存…"; render();
    try {
      const saved = await operation(); setProfile(saved);
      query("#gm-message").textContent = success;
      if (reset) { location.assign("?"); return; }
    } catch (error) { query("#gm-message").textContent = `操作失败：${String(error)}`; }
    finally { busy = false; render(); }
  }
  const resource = (kind: "currency" | "scrap") => {
    const amount = query<HTMLInputElement>("#gm-resource-amount").valueAsNumber;
    void transact(() => repository.update(p => grantResource(p, kind, amount)), `已发放 ${amount} ${kind === "currency" ? "货币" : "废料"}，已保存`);
  };
  query("#gm-grant-currency").onclick = () => resource("currency");
  query("#gm-grant-scrap").onclick = () => resource("scrap");
  query("#gm-grant-parts").onclick = () => {
    const id = select.value, amount = query<HTMLInputElement>("#gm-part-amount").valueAsNumber;
    void transact(() => repository.update(p => grantParts(p, id, amount)), `已发放 ${amount} 件${CATALOG.parts[id].name}到仓库，已保存`);
  };
  query("#gm-repair-all").onclick = () => { void transact(() => repository.update(repairAllParts), "全部装备已恢复满耐久，已保存"); };
  query("#gm-reset-confirm").addEventListener("change", render);
  query("#gm-reset").onclick = () => {
    if (!query<HTMLInputElement>("#gm-reset-confirm").checked) return;
    void transact(() => repository.reset(), "已重置为初始档案", true);
  };
  query("#gm-close").onclick = () => { if (!busy) dialog.close(); };
  dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog); render(); dialog.showModal(); return dialog;
}
