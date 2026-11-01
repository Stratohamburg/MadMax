import { CATALOG } from "../../loadout/model";
import { buyPart, unlockContent, type Profile } from "../../persistence/profile";
import type { ProfileRepository } from "../../persistence/repository";
import { uniqueId } from "../../simulation/identity";

export function openShop(repository: ProfileRepository, getProfile: () => Profile, setProfile: (profile: Profile) => void): HTMLDialogElement {
  const dialog = document.createElement("dialog"); dialog.id = "shop";
  dialog.innerHTML = `<header class="garage-header"><div><p class="eyebrow">MADMAX / TRADING POST</p><h2>营地商店</h2></div><button id="shop-close">关闭</button></header>
    <p id="shop-wallet"></p><p>购入的部件进入仓库，在装备区安装。</p><label>零件 <select id="shop-definition"></select></label><p><button id="shop-buy" class="primary">购买 · 50 货币 / 10 废料</button></p>
    <label>底盘 <select id="shop-chassis"></select></label><p><button id="shop-unlock">解锁 · 100 货币 / 20 废料</button></p><p id="shop-message" role="status"></p>`;
  document.body.append(dialog); dialog.showModal(); let busy = false;
  const query = <T extends Element = HTMLElement>(s: string) => dialog.querySelector<T>(s)!;
  function render() {
    const p = getProfile(); query("#shop-wallet").textContent = `货币 ${p.currency} · 废料 ${p.materials.scrap ?? 0} · 仓库 ${Object.keys(p.inventory).length} 件`;
    const options = (selector: string, entries: { id: string; name: string }[]) => {
      const select = query<HTMLSelectElement>(selector), previous = select.value;
      select.replaceChildren(...entries.map(e => { const option = document.createElement("option"); option.value = e.id; option.textContent = e.name; return option; }));
      if (entries.some(e => e.id === previous)) select.value = previous;
    };
    options("#shop-definition", Object.values(CATALOG.parts).filter(part => p.unlocks.parts.includes(part.id)));
    options("#shop-chassis", Object.values(CATALOG.chassis).filter(c => !p.unlocks.chassis.includes(c.id)));
    query<HTMLButtonElement>("#shop-unlock").disabled = !query<HTMLSelectElement>("#shop-chassis").value;
  }
  async function transact(operation: (p: Profile) => Profile) {
    if (busy) return; busy = true;
    try { setProfile(await repository.update(operation)); render(); query("#shop-message").textContent = "交易完成，已保存到本地档案"; }
    catch (error) { query("#shop-message").textContent = String(error); }
    finally { busy = false; }
  }
  query("#shop-buy").onclick = () => { const id = query<HTMLSelectElement>("#shop-definition").value; void transact(p => buyPart(p, id, `purchase:${uniqueId()}`)); };
  query("#shop-unlock").onclick = () => { const id = query<HTMLSelectElement>("#shop-chassis").value; void transact(p => unlockContent(p, "chassis", id)); };
  query("#shop-close").onclick = () => dialog.close(); dialog.addEventListener("close", () => dialog.remove()); render(); return dialog;
}
