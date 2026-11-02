import { Joystick } from "../../input/joystick";
import { FixedClock, TimedInput } from "../../simulation/clock";
import { CanvasRenderer } from "../../render/canvas";
import { WORLD } from "../../scene/world";
import { sweepVehicle } from "../../scene/contacts";
import { createAssemblyDrive, advanceAssemblyDrive, migrateAssemblyDrive, relocateAssemblyDrive, type AssemblyDriveState } from "../../vehicle/assembly-drive";
import { IDLE, stateFrom } from "../../vehicle/physics/state";
import { geometry } from "../../vehicle/physics/geometry";
import type { Intent } from "../../vehicle/physics/state";
import type { Loadout } from "../../loadout/types";
import { createModules, moduleComposition } from "../../combat/modules";
import type { ProfileRepository } from "../../persistence/repository";
import { instanceModifiers, resolveLoadout, type Profile } from "../../persistence/profile";
import { openWorkbench } from "../../ui/loadout/workbench";
import { openShop } from "../../ui/loadout/shop";
import { advanceParking, emptyParking, HUB_SPAWN, STATIONS, type Station } from "./stations";
import { drawHub } from "./ground";
import { openGm } from "../../ui/gm/panel";
import { renderWeaponBody } from "../../render/combat";

export function mountHub(initial: Loadout, repository: ProfileRepository, getProfile: () => Profile, setProfile: (profile: Profile) => void, notice?: string) {
  document.title = "MadMax · 废土营地";
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = `<section id="game-view" aria-label="营地主界面"><canvas id="world" aria-label="营地车辆、商店、装备和出击停车区"></canvas>
    <header class="topbar"><div class="brand">MADMAX <small>废土营地 / 自由驾驶</small></div><div class="hub-tools"><button id="hub-gm">GM</button><a class="button-link" href="?mode=practice">驾驶练习</a></div></header>
    <nav class="hub-directory" aria-label="前方功能区"><span>01 商店</span><span>02 装备</span><span>03 出击</span></nav>
    <div class="hud"><div><strong id="speed">0.0</strong><span>世界单位 / 秒</span></div><div id="hub-wallet"></div></div>
    <div id="hub-notice" role="status"></div></section><section id="controls" aria-label="驾驶操控区">
    <div class="control-heading"><span id="input-state">开到前方停车区，松手停稳进入</span><button id="hub-tow">拖车到装备区</button></div>
    <div id="joystick-area" role="slider" aria-label="驾驶摇杆" aria-valuemin="0" aria-valuemax="100"><div class="ring drift-ring"><span>外拉漂移</span></div><div class="ring exit-ring"></div><div class="ring normal-ring"></div><div class="stick-cross horizontal"></div><div class="stick-cross vertical"></div><div class="stick-center"></div><div class="thumb"></div></div>
    <div class="control-footer">前方左：商店 · 中：装备 · 右：出击 / 停稳 0.7 秒</div></section>`;
  let loadout: Loadout = resolveLoadout(getProfile(), initial).loadout;
  function composeSaved() {
    const p = getProfile(), modules = createModules(loadout);
    for (const part of loadout.parts) modules.hp[part.instanceId] = p.inventory[part.instanceId]?.hp ?? 0;
    return moduleComposition(modules, instanceModifiers(p, loadout));
  }
  let composition = composeSaved(), drive = createAssemblyDrive(composition, HUB_SPAWN), previous = drive.vehicle;
  let parking = emptyParking(), modal: HTMLDialogElement | null = null;
  const clock = new FixedClock(), inputs = new TimedInput<Intent>(IDLE);
  const renderer = new CanvasRenderer(app.querySelector("#world")!, { practiceLabels: false, lookAheadY: -3.8, viewHeight: 20, miniMapBottom: 90, landmarks: STATIONS });
  const stick = new Joystick(app.querySelector("#joystick-area")!, () => composition.profile, (value, timestamp) => inputs.push(timestamp, { targetSpeed: value.targetSpeed, angle: value.angle, drift: value.drift }));
  function clearInput() { stick.clear(); inputs.clear(IDLE); }
  function refresh(next = loadout) {
    loadout = resolveLoadout(getProfile(), next).loadout;
    const nextComposition = composeSaved();
    drive = composition.loadout.chassisId === nextComposition.loadout.chassisId
      ? migrateAssemblyDrive(drive, composition, nextComposition)
      : relocateAssemblyDrive(drive, nextComposition, drive.vehicle.position, drive.vehicle.theta);
    composition = nextComposition; previous = drive.vehicle;
    renderer.reset(drive.vehicle);
  }
  function openModal(open: () => HTMLDialogElement) {
    if (modal) return;
    clearInput(); clock.pause(); refresh();
    modal = open();
    modal.addEventListener("close", () => {
      modal = null; refresh(); clearInput(); stick.resize(); if (!document.hidden) clock.resume(performance.now() / 1000);
    }, { once: true });
  }
  function enter(station: Station) {
    if (station.id === "deploy") { clearInput(); clock.pause(); location.assign("?mode=pve"); return; }
    openModal(() => station.id === "shop" ? openShop(repository, getProfile, setProfile)
      : openWorkbench(loadout, repository, getProfile, setProfile, next => refresh(next)));
  }
  app.querySelector("#hub-gm")!.addEventListener("click", () => openModal(() => openGm(repository, getProfile, setProfile)));
  const tow = app.querySelector<HTMLButtonElement>("#hub-tow")!;
  tow.onclick = () => {
    if (modal) return;
    const station = STATIONS.find(s => s.id === "equipment")!;
    clearInput(); refresh(); drive = relocateAssemblyDrive(drive, composition, { x: station.x, y: station.y }, HUB_SPAWN.theta); previous = drive.vehicle;
    parking = emptyParking(); renderer.reset(drive.vehicle);
  };
  document.addEventListener("visibilitychange", () => {
    clearInput(); parking = { ...parking, candidate: null, elapsed: 0 };
    if (document.hidden || modal) clock.pause(); else { previous = drive.vehicle; clock.resume(performance.now() / 1000); }
  });
  function frame(timestamp: number) {
    clock.advance(timestamp / 1000, (dt, stepTimestamp) => {
      if (modal) return;
      previous = drive.vehicle; const input = inputs.sample(stepTimestamp);
      drive = advanceAssemblyDrive(drive, input, composition, WORLD.surface);
      const swept = sweepVehicle(previous, drive.vehicle, composition.profile, dt, WORLD);
      drive.vehicle = stateFrom({ ...swept, assist: drive.vehicle.assist });
      const next = advanceParking(parking, drive.vehicle.position, drive.vehicle.speed, input, dt, drive.vehicle.r); parking = next.state;
      if (next.entered) enter(next.entered);
    });
    renderer.render(previous, drive.vehicle, clock.alpha, composition.profile, [], clock.time, false, undefined, ctx => drawHub(ctx, parking), (ctx, car) => {
      ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.theta);
      for (const mount of composition.mounts) if (mount.weaponId && composition.components.some(c => c.part.instanceId === mount.instanceId && c.performance > 0)) {
        renderWeaponBody(ctx, mount.weaponId, mount.position, mount.angle, mount.angle);
      }
      ctx.restore();
    });
    app.querySelector("#speed")!.textContent = drive.vehicle.speed.toFixed(1);
    const profile = getProfile(); app.querySelector("#hub-wallet")!.textContent = `货币 ${profile.currency} · 废料 ${profile.materials.scrap ?? 0}`;
    tow.textContent = composition.summary.canDrive && drive.drivetrain.fuel > 0 ? "拖车到装备区" : "车辆无法驾驶 · 拖车维修";
    app.querySelector("#hub-notice")!.textContent = !composition.summary.canDrive ? composition.summary.issues.join(" / ") + " · 可使用拖车前往装备区"
      : parking.candidate ? `正在进入${STATIONS.find(s => s.id === parking.candidate)!.name}…` : clock.time < 6 && notice ? notice : "驶入彩色停车区 · 松手停稳进入";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (import.meta.env.DEV && new URLSearchParams(location.search).get("test") === "1") Object.assign(window, { __hub: {
    snapshot: () => ({ position: { ...drive.vehicle.position }, speed: drive.vehicle.speed, theta: drive.vehicle.theta, time: clock.time, parking: { ...parking }, modal: modal?.id ?? null,
      geometry: { ...stick.geometry }, input: { ...stick.value }, mass: composition.summary.massKg, canDrive: composition.summary.canDrive, loadout: structuredClone(loadout), currency: getProfile().currency, inventory: Object.keys(getProfile().inventory).length,
      vehicle: structuredClone(drive.vehicle), drivetrain: { ...drive.drivetrain }, energy: drive.energy, boost: { ...drive.boost }, footprint: geometry(drive.vehicle, composition.profile).footprint }),
    restorePaused: (state: AssemblyDriveState) => { if (!modal) throw new Error("仅限暂停测试"); drive = structuredClone(state); previous = drive.vehicle; },
    place: (x: number, y: number) => { clearInput(); drive = createAssemblyDrive(composition, { position: { x, y }, theta: HUB_SPAWN.theta }); previous = drive.vehicle; },
  } });
}
