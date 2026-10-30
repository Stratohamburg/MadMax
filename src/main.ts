import './style.css';
import { Joystick } from './input/joystick';
import { FixedClock, TimedInput } from './simulation/clock';
import { DEFAULT_PROFILE, createPhysicsVehicle, observePhysicsVehicle, IDLE, MODEL_VERSION, PROFILE_SCHEMA_VERSION, createVehicleSnapshot } from './vehicle/model';
import type { VehicleProfile } from './vehicle/physics/config';
import { SURFACE_VERSION } from './vehicle/physics/surfaces';
import { stepInWorld } from './scene/collision';
import { WORLD } from './scene/world';
import { Trails } from './scene/trails';
import { CanvasRenderer } from './render/canvas';
import { ValidationPanel } from './debug/panel';
import type { Intent, PhysicsState } from './vehicle/model';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <section id="game-view" aria-label="驾驶验证场">
    <canvas id="world" aria-label="车辆与练习场地"></canvas>
    <header class="topbar"><div class="brand">MADMAX <small>驾驶验证场 · 01</small></div>
    <div class="actions"><button id="help-button" aria-label="操作说明">?</button><button id="reset">重置 ↺</button></div></header>
    <div class="hud"><div><strong id="speed">0.0</strong><span>世界单位 / 秒</span></div><div id="mode">普通驾驶</div></div>
    <div class="scene-caption">自由练习 / 固定方向跟随</div>
  </section>
  <section id="controls" aria-label="驾驶操控区">
    <div class="control-heading"><span id="input-state">推向你想去的方向</span><button id="validate-toggle">验证模式</button></div>
    <div id="joystick-area" role="slider" aria-label="驾驶摇杆" aria-valuemin="0" aria-valuemax="100">
      <div class="ring drift-ring"><span>外拉漂移</span></div><div class="ring exit-ring"></div><div class="ring normal-ring"></div>
      <div class="stick-cross horizontal"></div><div class="stick-cross vertical"></div><div class="stick-center"></div><div class="thumb"></div>
    </div>
    <div class="control-footer"><span>距离控制速度</span><span class="legend"><i></i>满油门 <i></i>漂移</span></div>
  </section>
  <dialog id="help"><button class="close-dialog">关闭</button><h2>一个摇杆，掌握路线</h2>
    <p>推向想去的屏幕方向，车辆逐渐转向。距离越远，目标速度越高；推到内环一半，目标为半速。</p>
    <p>实线内环是普通满油门。继续向外还有缓冲行程，到外侧虚线环才进入漂移。略微回收会保持漂移；收回点线退出环以内，恢复普通驾驶。</p>
    <p>松手会逐渐停车。小幅转向保速，大角度和漂移转向损失更多速度。碰到障碍会按车身占地停车，可沿接触面转向离开；死角用重置恢复。</p>
    <p>直道练起步与半速；缓弯练保速；急弯练减速与侧滑；连续弯练主动进出漂移和自动反打。场地标出固定前轮圆、普通对齐、持续漂移／反打及干硬路、松散地、湿滑地区域。</p>
    <p>验证模式可以选择十类车型并从相同出生状态重置。车型改变轴距、轮胎和响应窗口，摇杆方向仍表示路线方向；普通页面只显示当前车型，不引入解锁流程。</p>
  </dialog>`;

let profile: VehicleProfile = structuredClone(DEFAULT_PROFILE);
let state = createPhysicsVehicle({ x: -11, y: 19 }, -Math.PI / 2, profile);
let previous = state;
const clock = new FixedClock();
const input = new TimedInput<Intent>(IDLE);
const joystick = new Joystick(document.querySelector('#joystick-area')!, () => profile, (value, timestamp) => {
  input.push(timestamp, { targetSpeed: value.targetSpeed, angle: value.angle, drift: value.drift });
  document.querySelector('#input-state')!.textContent = value.drift ? '漂移 · 收回点线环退出' : value.throttle === 1 ? '普通满油门 · 继续外拉漂移' : '推向你想去的方向';
});

const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const renderer = new CanvasRenderer(canvas);
const trails = new Trails();
const panel = new ValidationPanel(document.querySelector('#game-view')!, () => profile, next => {
  profile = next; joystick.resize(); reset();
});
const validation = new URLSearchParams(location.search).get('validate') === '1';
panel.toggle(validation);
document.querySelector('#validate-toggle')!.addEventListener('click', () => { joystick.clear(); input.clear(IDLE); panel.toggle(); });

function step(dt: number, timestamp: number): void {
  previous = state;
  const intent = input.sample(timestamp);
  state = stepInWorld(state, intent, profile, dt, WORLD) as PhysicsState;
  trails.sample(previous, state, profile, clock.time, observePhysicsVehicle(state, profile, intent, { surface: WORLD.surface }));
}
function reset(): void {
  joystick.clear(); input.clear(IDLE);
  state = previous = createPhysicsVehicle({ x: -11, y: 19 }, -Math.PI / 2, profile);
  trails.clear(); renderer.reset(state);
  clock.reset(performance.now() / 1000);
}
document.querySelector('#reset')!.addEventListener('click', reset);
const help = document.querySelector<HTMLDialogElement>('#help')!;
document.querySelector('#help-button')!.addEventListener('click', () => { joystick.clear(); input.clear(IDLE); help.showModal(); });
document.querySelector('.close-dialog')!.addEventListener('click', () => help.close());
document.addEventListener('visibilitychange', () => {
  joystick.clear(); input.clear(IDLE);
  if (document.hidden) clock.pause(); else { previous = state; clock.resume(performance.now() / 1000); }
});

function render(): void {
  const observation = observePhysicsVehicle(state, profile, joystick.value, { surface: WORLD.surface });
  renderer.render(previous, state, clock.alpha, profile, trails.segments, clock.time, panel.enabled, observation);
  panel.update(state, observation);
  document.querySelector('#speed')!.textContent = state.speed.toFixed(1);
  document.querySelector('#mode')!.textContent = joystick.value.drift ? '侧滑漂移' : '普通驾驶';
  document.querySelector('#mode')!.classList.toggle('drifting', joystick.value.drift);
}
function frame(timestamp: number): void { clock.advance(timestamp / 1000, step); render(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
if (import.meta.env.DEV || validation) {
  const debugSnapshot = () => {
    const observation = observePhysicsVehicle(state, profile, joystick.value, { surface: WORLD.surface });
    const stateSnapshot = { ...structuredClone(state), x: state.position.x, y: state.position.y, heading: state.theta,
      motion: state.motion, turnSign: state.speed === 0 ? 0 : state.assist.turnSign,
      observation: { ...observation, targetSpeed: observation.targetSpeed, targetAngle: observation.input.angle, drift: observation.input.drift,
        intentAngle: Math.abs(observation.route.routeError), lossStrength: observation.game.deceleration / Math.max(state.speed, 1e-6),
        driveDelta: observation.power.request / Math.max(profile.mass, 1e-6) / 120, turnLoss: observation.game.deceleration / 120 } };
    return { state: stateSnapshot, input: { ...joystick.value }, activeId: joystick.activeId, geometry: { ...joystick.geometry },
      config: { ...structuredClone(profile), maxSpeed: profile.power.maxSpeed }, time: clock.time,
      camera: { ...renderer.camera }, trails: trails.segments.length,
      version: { modelVersion: MODEL_VERSION, profileSchemaVersion: PROFILE_SCHEMA_VERSION, profileId: profile.profileId, profileRevision: profile.profileRevision, surfaceVersion: SURFACE_VERSION, sceneVersion: WORLD.sceneVersion },
      snapshot: createVehicleSnapshot(state, profile, WORLD.sceneVersion ?? 'driving-playground-2', observation.front.surface.surfaceId) };
  };
  Object.assign(window, { __driving: { snapshot: debugSnapshot,
    ...(import.meta.env.DEV && new URLSearchParams(location.search).get('test') === '1' ? {
      test: { place: (patch: Partial<PhysicsState> & { x?: number; y?: number; heading?: number; speed?: number; motion?: number }) => {
        reset();
        const theta = patch.theta ?? patch.heading ?? state.theta;
        const speed = patch.speed ?? 0;
        const motion = patch.motion ?? theta;
        state = previous = createPhysicsVehicle(
          { x: patch.position?.x ?? patch.x ?? state.position.x, y: patch.position?.y ?? patch.y ?? state.position.y },
          theta, profile, { worldVelocity: { x: Math.cos(motion) * speed, y: Math.sin(motion) * speed } });
        renderer.reset(state);
      } },
    } : {}) } });
}
export type DrivingSnapshot = { state: PhysicsState; input: Intent; activeId: number | null };
