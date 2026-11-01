import { describe, expect, it } from "vitest";
import { stockLoadout } from "../../src/loadout/presets";
import { SCRAPYARD, generateLevel } from "../../src/modes/pve/level";
import { advanceRun, endRun, pickup, prepareRun, selectLoadout, transition } from "../../src/modes/pve/run";
import { PveSession } from "../../src/modes/pve/session";
import { IDLE, stateFrom } from "../../src/vehicle/physics/state";
import { FixedClock, TimedInput } from "../../src/simulation/clock";
import type { Intent } from "../../src/vehicle/physics/state";
const loadout = stockLoadout("sports-car");
const running = () => transition(transition(prepareRun("test-run", 35, loadout), "enter"), "running");
describe("搜打撤规则", () => {
  it("只允许单向阶段转移，局内拒绝手动编辑", () => {
    const state = running();
    expect(() => selectLoadout(state, loadout)).toThrow("局内");
    expect(() => transition(state, "enter")).toThrow();
    expect(selectLoadout(prepareRun("x", 1, loadout), stockLoadout("truck")).initialLoadout.chassisId).toBe("truck");
  });
  it("种子控制刷新和搜刮，runId 隔离物品实例", () => {
    expect(generateLevel(SCRAPYARD, 9, "a")).toEqual(generateLevel(SCRAPYARD, 9, "a"));
    expect(generateLevel(SCRAPYARD, 8, "a")).not.toEqual(generateLevel(SCRAPYARD, 9, "a"));
    expect(generateLevel(SCRAPYARD, 9, "b").loot[0].id).not.toEqual(generateLevel(SCRAPYARD, 9, "a").loot[0].id);
  });
  it("容量满明确拒绝、重复拾取不复制", () => {
    const loot = generateLevel(SCRAPYARD, 9, "a").loot[0];
    const first = pickup(running(), loot, loot.cells);
    expect(pickup(first.state, { ...loot, id: "another" }, loot.cells).reason).toContain("携带已满");
    expect(pickup(first.state, loot, 100).state.carry).toHaveLength(1);
  });
  it("撤离需要激活、离开清零、Boss 出口另有条件", () => {
    const south = SCRAPYARD.exits[0].position, north = SCRAPYARD.exits[1].position;
    let state = advanceRun(running(), SCRAPYARD, south, 1);
    expect(state.exitProgress).toBe(0);
    state = advanceRun({ ...state, time: 20 }, SCRAPYARD, south, 3);
    expect(state.exitProgress).toBe(3);
    state = advanceRun(state, SCRAPYARD, { x: 0, y: 0 }, 1);
    expect(state.exitProgress).toBe(0);
    expect(advanceRun(state, SCRAPYARD, north, 5).outcome).toBeNull();
    expect(advanceRun(state, SCRAPYARD, north, 5, true).outcome).toBe("extracted");
  });
  it("死亡和超时清空战利品，损失可复现且冻结终局", () => {
    const loot = generateLevel(SCRAPYARD, 9, "a").loot[0];
    const state = pickup(running(), loot, 8).state;
    const finish = () => endRun(state, SCRAPYARD, "destroyed", { kills: 3, damage: 42 }, {}, [loadout.parts[0].instanceId]);
    const ended = finish();
    expect(ended).toEqual(finish()); expect(ended.settlement?.loot).toEqual([]);
    expect(ended.settlement?.lost).toContain(loadout.parts[0].instanceId);
    expect(Object.isFrozen(ended.settlement?.initialLoadout.parts)).toBe(true);
    expect(advanceRun(ended, SCRAPYARD, SCRAPYARD.exits[0].position, 99)).toBe(ended);
    expect(advanceRun({ ...state, time: 179 }, SCRAPYARD, { x: 0, y: 0 }, 1).outcome).toBe("timeout");
  });
  it("成功撤离带出战利品与完整统计，Boss 主线仅在撤离时发出", () => {
    const state = pickup({ ...running(), bossDead: true }, generateLevel(SCRAPYARD, 9, "a").loot[0], 8).state;
    const result = endRun(state, SCRAPYARD, "extracted", { kills: 4, damage: 90 }, {}, []).settlement!;
    expect(result.loot).toHaveLength(1); expect(result.xp).toBe(40);
    expect(result.story).toEqual([SCRAPYARD.story]); expect(result.unlocks).toEqual([SCRAPYARD.unlock]);
  });
});
describe("系统整合回放", () => {
  it("30/60/120 FPS 用带时间戳的同一输入得到完全相同的局内状态", () => {
    const replay = (fps: number) => {
      const s = new PveSession("fps", 17, loadout), clock = new FixedClock(), input = new TimedInput<Intent>(IDLE); s.start();
      input.push(0, { angle: -Math.PI / 2, targetSpeed: 2, drift: false });
      input.push(0.75, { angle: -Math.PI / 3, targetSpeed: 3, drift: false }); input.push(1.5, IDLE);
      clock.advance(0, () => {});
      for (let frame = 1; frame <= fps * 3; frame++) clock.advance(frame / fps, (_dt, timestamp) => s.step(input.sample(timestamp)));
      return s.snapshot();
    };
    expect(replay(30)).toEqual(replay(60)); expect(replay(60)).toEqual(replay(120));
  });
  it("网页 session 的真实自动武器可命中并消耗全局弹药", () => {
    const level = { ...SCRAPYARD, regions: [], caches: [], exits: [], waves: [{ at: 0, count: 1, position: { x: -11, y: 15 }, spread: 0, enemy: { hp: 1000, speed: 0, attack: 0 } }] };
    const s = new PveSession("fire", 7, loadout, level); s.start();
    for (let i = 0; i < 360; i++) s.step(IDLE);
    expect(Object.values(s.weapons.weapons).reduce((n, w) => n + w.shots, 0)).toBeGreaterThan(0);
    expect(s.weapons.ammo.ballistic).toBeLessThan(s.composition.resources.ammo.ballistic); expect(s.damage).toBeGreaterThan(0);
  });
  it("相同输入回放一致且自动开火、全局资源有消耗", () => {
    const run = () => { const s = new PveSession("replay", 7, loadout); s.start();
      for (let i = 0; i < 360; i++) { s.step({ targetSpeed: i < 180 ? 1 : 0, angle: -Math.PI / 2, drift: false }); if (s.upgrades.offered.length) s.choose(s.upgrades.offered[0]); }
      return s;
    };
    const a = run(), b = run(); expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.spawned).toBe(SCRAPYARD.waves.filter(w => w.at === 0).reduce((sum, w) => sum + w.count, 0)); expect(a.drive.drivetrain.fuel).toBeLessThan(a.composition.resources.fuelCapacity);
  });
  it("区域触发三选一期间暂停，新局没有旧升级，终局不会继续模拟", () => {
    const s = new PveSession("upgrade", 7, loadout); s.start();
    s.drive.vehicle = stateFrom({ ...s.drive.vehicle, position: SCRAPYARD.regions[1].position }); s.step(IDLE);
    expect(s.upgrades.offered).toHaveLength(3); const time = s.run.time; s.step(IDLE); expect(s.run.time).toBe(time);
    s.choose(s.upgrades.offered[0]); expect(s.upgrades.owned).toHaveLength(1);
    s.finish("timeout"); const frozen = structuredClone(s.snapshot()); s.step(IDLE); expect(s.snapshot()).toEqual(frozen);
    expect(new PveSession("new", 7, loadout).upgrades.owned).toEqual([]);
  });
  it("受击先损伤模块，归零车体进入失败结算", () => {
    const s = new PveSession("damage", 7, loadout); s.start();
    const hp = { ...s.modules.hp }; s.world.hurt(0, 20, "physical", 1);
    expect(s.modules.hp).not.toEqual(hp);
    s.world.hurt(0, 1e6, "physical", 1); s.step(IDLE);
    expect(s.run.settlement?.outcome).toBe("destroyed");
  });
});
