import { IndexedDbStore } from "./store";
import { ProfileRepository } from "./repository";
import { instanceModifiers, ownedStock, resolveLoadout } from "./profile";
import { mountPve } from "../modes/pve/page";
import { openWorkbench } from "../ui/loadout/workbench";
import { mountHub } from "../modes/hub/page";
import type { Profile } from "./profile";
import type { Loadout } from "../loadout/types";
export async function startGame(mode: "pve" | "hub" = "pve"): Promise<void> {
  const repository = new ProfileRepository(new IndexedDbStore());
  let recovery: { profile: Profile; loadout: Loadout } | undefined;
  try {
    const loaded = await repository.load(); let profile = loaded.profile;
    const initial = (profile.blueprints.find(b => b.id === "active") ?? profile.blueprints[0])?.loadout ?? ownedStock(profile, profile.unlocks.chassis[0]).loadout;
    recovery = { profile, loadout: resolveLoadout(profile, initial).loadout };
    if (mode === "hub") { mountHub(initial, repository, () => profile, p => { profile = p; }, loaded.notice); return; }
    mountPve({ initialLoadout: resolveLoadout(profile, initial).loadout, get availableChassis() { return profile.unlocks.chassis; }, notice: loaded.notice,
      garage: (loadout, onUse) => openWorkbench(loadout, repository, () => profile, p => { profile = p; }, onUse),
      stock: id => ownedStock(profile, id).loadout, sanitize: loadout => resolveLoadout(profile, loadout).loadout,
      configuration: loadout => ({ hp: Object.fromEntries(Object.values(profile.inventory).map(p => [p.id, p.hp])), modifiers: instanceModifiers(profile, loadout) }),
      settle: async result => { const saved = await repository.settle(result); profile = saved.profile;
        return `结算已保存 · 仓库 ${Object.keys(profile.inventory).length} 件 · 货币 ${profile.currency} · 废料 ${profile.materials.scrap ?? 0}`; },
    });
  } catch (error) {
    const app = document.querySelector("#app")!; app.replaceChildren();
    const message = document.createElement("p"); message.className = "save-error"; message.textContent = `${recovery ? "无法载入车辆" : "无法载入档案"}：${String(error)}。原数据已保留。`;
    const retry = document.createElement("button"); retry.textContent = "重新加载"; retry.onclick = () => location.reload(); app.append(message, retry);
    if (recovery) {
      const data = recovery, repair = document.createElement("button"); repair.textContent = "打开装配工作台";
      repair.onclick = () => openWorkbench(data.loadout, repository, () => data.profile, p => { data.profile = p; }, () => location.reload());
      app.append(repair);
    }
  }
}
