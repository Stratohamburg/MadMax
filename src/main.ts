import './style.css';
import { Joystick } from './input/joystick';
import { FixedClock, TimedInput } from './simulation/clock';
import { DEFAULT_CONFIG } from './vehicle/config';
import { createVehicle, IDLE } from './vehicle/model';
import { stepInWorld } from './scene/collision';
import { WORLD } from './scene/world';
import { Trails } from './scene/trails';
import { CanvasRenderer } from './render/canvas';
import { ValidationPanel } from './debug/panel';
import type { Intent, VehicleState } from './vehicle/model';

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
    <p>松手会逐渐停车。小幅转向保速，大角度和漂移转向损失更多速度。碰到障碍会停车，可沿接触面转向离开；死角用重置恢复。</p>
    <p>直道练起步与半速；缓弯练保速；急弯练减速与侧滑；连续弯练主动进出漂移。沿路面标识寻找区域。</p>
  </dialog>`;

let config = { ...DEFAULT_CONFIG };
let state = createVehicle();
let previous = state;
const clock = new FixedClock();
const input = new TimedInput<Intent>(IDLE);
const joystick = new Joystick(document.querySelector('#joystick-area')!, () => config, (value, timestamp) => {
  input.push(timestamp, { targetSpeed: value.targetSpeed, angle: value.angle, drift: value.drift });
  document.querySelector('#input-state')!.textContent = value.drift ? '漂移 · 收回点线环退出' : value.throttle === 1 ? '普通满油门 · 继续外拉漂移' : '推向你想去的方向';
});

const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const renderer = new CanvasRenderer(canvas);
const trails = new Trails();
const panel = new ValidationPanel(document.querySelector('#game-view')!, () => config, next => {
  config = next; joystick.resize(); reset();
});
const validation = new URLSearchParams(location.search).get('validate') === '1';
panel.toggle(validation);
document.querySelector('#validate-toggle')!.addEventListener('click', () => { joystick.clear(); input.clear(IDLE); panel.toggle(); });
function step(dt: number, timestamp: number): void {
  previous = state;
  state = stepInWorld(state, input.sample(timestamp), config, dt, WORLD);
  trails.sample(previous, state, config, clock.time);
}
function reset(): void {
  joystick.clear(); input.clear(IDLE);
  state = previous = createVehicle();
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
  renderer.render(previous, state, clock.alpha, config, trails.segments, clock.time, panel.enabled);
  panel.update(state);
  document.querySelector('#speed')!.textContent = state.speed.toFixed(1);
  document.querySelector('#mode')!.textContent = joystick.value.drift ? '侧滑漂移' : '普通驾驶';
  document.querySelector('#mode')!.classList.toggle('drifting', joystick.value.drift);
}
function frame(timestamp: number): void { clock.advance(timestamp / 1000, step); render(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
if (import.meta.env.DEV || validation) {
  Object.assign(window, { __driving: { snapshot: () => ({ state: structuredClone(state), input: { ...joystick.value },
    activeId: joystick.activeId, geometry: { ...joystick.geometry }, config: { ...config }, time: clock.time,
    camera: { ...renderer.camera }, trails: trails.segments.length }),
    ...(import.meta.env.DEV && new URLSearchParams(location.search).get('test') === '1' ? {
      test: { place: (patch: Partial<VehicleState>) => { reset(); state = previous = { ...state, ...patch }; renderer.reset(state); } },
    } : {}) } });
}
export type DrivingSnapshot = { state: VehicleState; input: Intent; activeId: number | null };
