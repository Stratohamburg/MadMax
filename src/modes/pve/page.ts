import { Joystick } from "../../input/joystick";
import { FixedClock, TimedInput } from "../../simulation/clock";
import { CanvasRenderer } from "../../render/canvas";
import { stockLoadout } from "../../loadout/presets";
import type { Loadout } from "../../loadout/types";
import { PROFILES } from "../../vehicle/physics/profiles";
import { UPGRADES } from "../../progression/modifiers/catalog";
import { IDLE, stateFrom, type Intent } from "../../vehicle/physics/state";
import { PveSession, type SessionOptions } from "./session";
import { preparationRules, type Settlement } from "./run";
import { SCRAPYARD } from "./level";
import { ModuleHud } from "../../ui/hud/modules";
import { renderWeapons } from "../../render/weapons";
import { DamageLabels } from "../../render/damage";
import { uniqueId } from "../../simulation/identity";
import { CombatEffects, renderEnemies, renderMountedWeapons, renderProjectiles } from "../../render/combat";
import { enemySpawn } from "../../combat/enemies";

export interface PveHooks {
  initialLoadout?: Loadout;
  settle?: (result: Settlement) => Promise<string>;
  garage?: (loadout: Loadout, onUse: (next: Loadout) => void) => void;
  configuration?: (loadout: Loadout) => SessionOptions;
  stock?: (chassisId: string) => Loadout;
  sanitize?: (loadout: Loadout) => Loadout;
  availableChassis?: string[];
  notice?: string;
}
export function mountPve(hooks: PveHooks = {}): void {
  document.title = "MadMax · 废土搜打撤";
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = `<section id="game-view" aria-label="搜打撤战场"><canvas id="world"></canvas>
    <header class="topbar"><div class="brand">MADMAX <small>废弃货场</small></div><a class="button-link" href="?">返回营地</a></header>
    <div id="run-hud" aria-live="polite"></div><div id="module-hud"></div><div id="run-notice" role="status"></div>
    </section><section id="controls" aria-label="驾驶操控区"><div class="control-heading"><span id="input-state">单指驾驶 · 自动开火</span><button id="abandon">撤退结算</button></div>
    <div id="joystick-area" role="slider" aria-label="驾驶摇杆" aria-valuemin="0" aria-valuemax="100"><div class="ring drift-ring"><span>外拉漂移</span></div><div class="ring exit-ring"></div><div class="ring normal-ring"></div><div class="stick-cross horizontal"></div><div class="stick-cross vertical"></div><div class="stick-center"></div><div class="thumb"></div></div>
    <div class="control-footer">靠近物资自动搜刮 · 绿色圆圈为撤离点</div></section>
    <dialog id="prepare"><p class="eyebrow">废土行动 / 01</p><h2>废弃货场</h2><p>沿北向公路搜刮，选择撤离时机。车头与走位决定自动武器的机会。</p>
    <label>选择车型 <select id="chassis">${PROFILES.filter(p => !hooks.availableChassis || hooks.availableChassis.includes(p.profileId)).map(p => `<option value="${p.profileId}">${p.label}</option>`).join("")}</select></label>
    <p id="prep-summary"></p><p class="risk-rules">${preparationRules(SCRAPYARD)}</p><p>黄色物资占用携带格；蓝色营地修复与补给。击败 Boss 并撤离后推进主线。</p>
    <div class="dialog-actions"><button id="garage">装配工作台</button><button id="deploy" class="primary">确认出击</button><a class="button-link" href="?">返回营地</a></div></dialog>
    <dialog id="upgrade"><h2>选择局内强化</h2><p>驾驶已暂停，强化只持续本局。</p><div id="upgrade-options"></div><button id="reroll">刷新候选</button></dialog>
    <dialog id="settlement"><h2 id="settlement-title"></h2><div id="settlement-data"></div><p id="save-result" role="status"></p><button id="save-retry" hidden>重试保存</button><button id="retry">返回营地</button></dialog>`;
  let loadout = structuredClone(hooks.initialLoadout ?? stockLoadout("sports-car"));
  const newSession = (next: Loadout) => new PveSession(uniqueId(), Date.now() >>> 0, next, SCRAPYARD, hooks.configuration?.(next));
  let session = newSession(loadout);
  const prepare = app.querySelector<HTMLDialogElement>("#prepare")!, upgrade = app.querySelector<HTMLDialogElement>("#upgrade")!, ended = app.querySelector<HTMLDialogElement>("#settlement")!;
  for (const dialog of [prepare, upgrade, ended]) dialog.addEventListener("cancel", event => event.preventDefault());
  const clock = new FixedClock(), renderer = new CanvasRenderer(app.querySelector("#world")!, { practiceLabels: false });
  const moduleHud = new ModuleHud(app.querySelector("#module-hud")!), labels = new DamageLabels(), effects = new CombatEffects();
  const inputs = new TimedInput<Intent>(IDLE);
  const stick = new Joystick(app.querySelector("#joystick-area")!, () => session.composition.profile, (value, timestamp) => inputs.push(timestamp, { targetSpeed: value.targetSpeed, angle: value.angle, drift: value.drift }));
  let previous = session.drive.vehicle, finished = "";
  const select = app.querySelector<HTMLSelectElement>("#chassis")!;
  const summarize = () => {
    select.value = loadout.chassisId;
    const c = session.composition;
    app.querySelector("#prep-summary")!.textContent = `${Math.round(c.summary.massKg)} kg · ${c.engine?.maxPower ?? 0} kW · 极速 ${c.profile.power.maxSpeed.toFixed(1)} · ${c.summary.canDrive ? "可出击" : c.summary.issues.join(" / ")}`;
    app.querySelector<HTMLButtonElement>("#deploy")!.disabled = !c.summary.canDrive;
  };
  const setLoadout = (next: Loadout) => {
    loadout = hooks.sanitize?.(next) ?? next; session = newSession(loadout); previous = session.drive.vehicle;
    select.replaceChildren(...PROFILES.filter(p => !hooks.availableChassis || hooks.availableChassis.includes(p.profileId)).map(p => {
      const option = document.createElement("option"); option.value = p.profileId; option.textContent = p.label; return option;
    })); summarize(); labels.labels.length = 0; effects.clear();
  };
  select.addEventListener("change", () => setLoadout(hooks.stock?.(select.value) ?? stockLoadout(select.value)));
  app.querySelector<HTMLButtonElement>("#garage")!.disabled = !hooks.garage;
  app.querySelector("#garage")!.addEventListener("click", () => hooks.garage?.(loadout, setLoadout));
  summarize(); prepare.showModal();
  if (hooks.notice) { const notice = document.createElement("p"); notice.setAttribute("role", "status"); notice.textContent = hooks.notice; prepare.prepend(notice); }
  app.querySelector("#deploy")!.addEventListener("click", () => {
    session.start(); prepare.close(); stick.clear(); stick.resize(); clock.reset(performance.now() / 1000); renderer.reset(session.drive.vehicle);
  });
  app.querySelector("#abandon")!.addEventListener("click", () => session.finish("abandoned"));
  app.querySelector("#retry")!.addEventListener("click", () => location.assign("?"));
  app.querySelector("#reroll")!.addEventListener("click", () => { session.reroll(); renderChoices(); });
  let saving = false;
  async function saveResult() {
    if (saving || !session.run.settlement || !hooks.settle) return;
    saving = true; app.querySelector<HTMLButtonElement>("#retry")!.disabled = true;
    app.querySelector<HTMLButtonElement>("#save-retry")!.hidden = true;
    try {
      app.querySelector("#save-result")!.textContent = await hooks.settle(session.run.settlement);
      loadout = hooks.sanitize?.(loadout) ?? loadout;
      app.querySelector<HTMLButtonElement>("#retry")!.disabled = false;
    } catch (error) {
      app.querySelector("#save-result")!.textContent = `保存失败：${String(error)}。请重试保存。`;
      app.querySelector<HTMLButtonElement>("#save-retry")!.hidden = false;
    } finally { saving = false; }
  }
  app.querySelector("#save-retry")!.addEventListener("click", () => { void saveResult(); });
  function renderChoices() {
    const options = app.querySelector("#upgrade-options")!; options.replaceChildren();
    for (const id of session.upgrades.offered) {
      const button = document.createElement("button"), def = UPGRADES[id];
      button.className = "upgrade-card"; button.textContent = `${def.name} · ${def.modifier.layer === "more" ? "×" + def.modifier.value : "+" + Math.round(def.modifier.value * (def.modifier.layer === "flat" ? 1 : 100)) + (def.modifier.layer === "flat" ? "" : "%")} · 上限 ${def.maxStacks}`;
      button.onclick = () => { session.choose(id); stick.clear(); if (!session.upgrades.offered.length) upgrade.close(); else renderChoices(); };
      options.append(button);
    }
    app.querySelector<HTMLButtonElement>("#reroll")!.disabled = session.upgrades.rerolls <= 0;
    app.querySelector("#reroll")!.textContent = `刷新候选 · 剩余 ${session.upgrades.rerolls}`;
  }
  document.addEventListener("visibilitychange", () => { stick.clear(); if (document.hidden) clock.pause(); else { previous = session.drive.vehicle; clock.resume(performance.now() / 1000); } });
  function drawGround(ctx: CanvasRenderingContext2D, car: { x: number; y: number }) {
    const clearRadius = Math.max(0, ...session.visuals.map(v => v.clearRadius));
    renderWeapons(ctx, session.visuals, car, session.drive.vehicle.speed / 120);
    ctx.font = '0.32px "Microsoft YaHei",sans-serif'; ctx.textAlign = "center";
    for (const exit of session.level.exits) {
      const active = session.run.time >= exit.after && (!exit.boss || session.run.bossDead);
      ctx.strokeStyle = active ? "#82edab" : "#7a8b83"; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.arc(exit.position.x, exit.position.y, exit.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.fillText(`${exit.name} · ${active ? "停留 5 秒" : exit.boss ? "击败 Boss" : "20 秒开放"}`, exit.position.x, exit.position.y - 2.3);
    }
    for (const region of session.level.regions) {
      ctx.strokeStyle = region.repair ? "#6bd9ef" : "#b9a1f2"; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(region.position.x, region.position.y, region.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.fillText(region.id, region.position.x, region.position.y - region.radius - 0.2);
    }
    ctx.fillStyle = "#f9d57c";
    for (const loot of session.ground) ctx.fillRect(loot.position.x - 0.16, loot.position.y - 0.16, 0.32, 0.32);
    renderEnemies(ctx, session.world);
    labels.render(ctx, session.run.time, car, clearRadius);
  }
  function frame(timestamp: number) {
    clock.advance(timestamp / 1000, (_dt, stepTimestamp) => {
      previous = session.drive.vehicle; const oldTime = session.world.time; session.step(inputs.sample(stepTimestamp));
      if (session.world.time !== oldTime) { labels.ingest(session.world.events, session.run.time); effects.ingest(session.world.presentation, session.world.time); }
    });
    if (session.upgrades.offered.length && !upgrade.open && session.run.phase === "running") { stick.clear(); renderChoices(); upgrade.showModal(); }
    if (session.run.settlement && finished !== session.runId) {
      finished = session.runId; stick.clear(); upgrade.close();
      const result = session.run.settlement;
      app.querySelector("#settlement-title")!.textContent = result.outcome === "extracted" ? "撤离成功" : "行动失败";
      app.querySelector("#settlement-data")!.textContent = `用时 ${result.time.toFixed(1)} 秒 · 击杀 ${result.kills} · 伤害 ${Math.round(result.damage)} · 经验 ${result.xp} · 带出 ${result.loot.length} 件 · 货币 ${result.currency} · 装配损失 ${result.lost.length} 件`;
      app.querySelector("#save-result")!.textContent = hooks.settle ? "正在保存结算…" : "本次为未存档演练";
      ended.showModal();
      if (hooks.settle) void saveResult();
    }
    const vehicle = session.drive.vehicle;
    renderer.render(previous, vehicle, clock.alpha, session.composition.profile, [], clock.time, false, undefined, drawGround, (ctx, car) => {
      renderMountedWeapons(ctx, session.visuals, { x: car.x - vehicle.position.x, y: car.y - vehicle.position.y });
      renderProjectiles(ctx, session.world); effects.render(ctx, session.world.time);
    });
    moduleHud.update(session.run.initialLoadout, session.modules);
    const player = session.world.entities.slot(session.world.playerId), hp = player < 0 ? 0 : session.world.entities.hp[player];
    app.querySelector("#run-hud")!.textContent = `耐久 ${Math.ceil(hp)} · ${Math.max(0, Math.ceil(session.level.duration - session.run.time))} 秒 · 击杀 ${session.world.kills} · ${session.run.carry.reduce((sum, l) => sum + l.cells, 0)}/${session.level.capacity} 格`;
    app.querySelector("#run-notice")!.textContent = session.run.exitId ? `撤离中 ${Math.max(0, 5 - session.run.exitProgress).toFixed(1)} 秒 · 离开将重置` : session.notice;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (import.meta.env.DEV && new URLSearchParams(location.search).get("test") === "1") Object.assign(window, { __pve: {
    snapshot: () => structuredClone(session.snapshot()),
    combat: () => ({ weapons: structuredClone(session.visuals), enemies: structuredClone(session.world.enemyVisuals), effects: effects.snapshot() }),
    spawnEnemy: (id: string, x: number, y: number) => session.world.entities.spawn(enemySpawn(id, { x, y })),
    pause: () => clock.pause(),
    place: (x: number, y: number) => { session.drive.vehicle = stateFrom({ ...session.drive.vehicle, position: { x, y } }); previous = session.drive.vehicle; },
    finish: (outcome: "extracted" | "destroyed" | "timeout") => session.finish(outcome),
  } });
}
