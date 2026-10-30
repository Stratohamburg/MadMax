import { applyProfile } from '../vehicle/physics/config';
import { PROFILES } from '../vehicle/physics/profiles';
import type { VehicleProfile } from '../vehicle/physics/config';
import type { Observation } from '../vehicle/physics/dynamics';
import type { PhysicsState } from '../vehicle/model';
import { deg, rad } from '../vehicle/physics/math';

/** Validation-only controls. Normal driving exposes only the compact HUD. */
export class ValidationPanel {
  enabled = false;
  private element: HTMLElement;
  private output: HTMLOutputElement;
  private form: HTMLFormElement;
  private message: HTMLElement;
  constructor(parent: HTMLElement, private profile: () => VehicleProfile, private apply: (profile: VehicleProfile) => void) {
    this.element = document.createElement('aside');
    this.element.id = 'validation-panel';
    this.element.hidden = true;
    this.element.setAttribute('aria-label', '驾驶验证观测');
    this.element.innerHTML = `<div class="validation-title">驾驶观测 <span>vehicle-physics-1</span></div>
      <div class="vector-legend"><span>金：路线 α</span><span>白：车头 θ</span><span>绿：运动 ψ</span></div>
      <output id="telemetry"></output><details><summary>车型与参数</summary><form id="parameters" novalidate>
      <label>车型 <select name="profileId" aria-label="车型">${PROFILES.map(p => `<option value="${p.profileId}">${p.label} · ${p.profileId}</option>`).join('')}</select></label>
      <label>最高速度 <small>世界单位/秒 · vehicle-profile-1</small><input name="maxSpeed" aria-label="最高速度" type="number" step="any" min="0.1" max="40" required></label>
      <fieldset><legend>转向与漂移</legend><label>最大前轮角 <small>度</small><input name="maxAngleDeg" aria-label="最大前轮角" type="number" step="any" min="1" max="80" required></label><label>最大侧滑目标 <small>度</small><input name="maxBetaDeg" aria-label="最大侧滑目标" type="number" step="any" min="0" max="40" required></label></fieldset>
      <fieldset><legend>轮胎与辅助</legend><label>前轴抓地 μy <input name="frontGrip" aria-label="前轴抓地" type="number" step="any" min="0.05" max="2" required></label><label>后轴抓地 μy <input name="rearGrip" aria-label="后轴抓地" type="number" step="any" min="0.05" max="2" required></label><label>路线辅助增益 <input name="routeGain" aria-label="路线辅助增益" type="number" step="any" min="0.1" max="12" required></label><label>侧滑辅助增益 <input name="betaGain" aria-label="侧滑辅助增益" type="number" step="any" min="0.1" max="12" required></label></fieldset>
      <button type="submit">应用并重置</button><button type="button" id="defaults">恢复默认跑车</button></form></details>
      <p id="parameter-message" role="status" aria-live="polite">应用车型或参数后从相同出生状态重新比较。</p>`;
    parent.append(this.element);
    this.output = this.element.querySelector('output')!;
    this.form = this.element.querySelector('form')!;
    this.message = this.element.querySelector('#parameter-message')!;
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      const id = (this.form.elements.namedItem('profileId') as HTMLSelectElement).value;
      const base = PROFILES.find(item => item.profileId === id);
      const values = Object.fromEntries(['maxSpeed', 'maxAngleDeg', 'maxBetaDeg', 'frontGrip', 'rearGrip', 'routeGain', 'betaGain'].map(key => [key, Number((this.form.elements.namedItem(key) as HTMLInputElement).value)]));
      if (!base || Object.values(values).some(value => !Number.isFinite(value))) { this.message.textContent = '车型或分组参数无效；保留当前有效配置。'; this.message.dataset.error = 'true'; return; }
      const candidate = structuredClone(base);
      candidate.power.maxSpeed = values.maxSpeed;
      candidate.steering.maxAngle = rad(values.maxAngleDeg);
      candidate.drift.maxBeta = rad(values.maxBetaDeg);
      candidate.tires.front.muY = values.frontGrip; candidate.tires.rear.muY = values.rearGrip;
      candidate.assist.routeGain = values.routeGain; candidate.assist.betaGain = values.betaGain;
      const result = applyProfile(this.profile(), candidate);
      if (result.errors.length) { this.message.textContent = result.errors.join('；'); this.message.dataset.error = 'true'; return; }
      this.apply(result.profile); this.message.textContent = '车型与参数已应用，车辆与输入已重置。'; this.message.dataset.error = 'false';
    });
    this.element.querySelector('#defaults')!.addEventListener('click', () => {
      const defaultProfile = PROFILES.find(item => item.profileId === 'sports-car')!;
      this.apply(structuredClone(defaultProfile)); this.syncFields();
      this.message.textContent = '已恢复跑车默认参数并重置。'; this.message.dataset.error = 'false';
    });
  }
  toggle(enabled = !this.enabled): void {
    this.enabled = enabled; this.element.hidden = !enabled;
    document.querySelector('#validate-toggle')!.setAttribute('aria-pressed', String(enabled));
    if (enabled) this.syncFields();
  }
  private syncFields(): void {
    const profile = this.profile();
    (this.form.elements.namedItem('profileId') as HTMLSelectElement).value = profile.profileId;
    (this.form.elements.namedItem('maxSpeed') as HTMLInputElement).value = String(profile.power.maxSpeed);
    (this.form.elements.namedItem('maxAngleDeg') as HTMLInputElement).value = String(deg(profile.steering.maxAngle));
    (this.form.elements.namedItem('maxBetaDeg') as HTMLInputElement).value = String(deg(profile.drift.maxBeta));
    (this.form.elements.namedItem('frontGrip') as HTMLInputElement).value = String(profile.tires.front.muY);
    (this.form.elements.namedItem('rearGrip') as HTMLInputElement).value = String(profile.tires.rear.muY);
    (this.form.elements.namedItem('routeGain') as HTMLInputElement).value = String(profile.assist.routeGain);
    (this.form.elements.namedItem('betaGain') as HTMLInputElement).value = String(profile.assist.betaGain);
  }
  update(state: PhysicsState, observation?: Observation): void {
    if (!this.enabled) return;
    const obs = observation;
    const angle = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${deg(value).toFixed(1)}°`;
    this.output.textContent = `车型  ${this.profile().profileId} · ${this.profile().profileRevision}\n模型  vehicle-physics-1 · 车型格式 vehicle-profile-1\n实际 / 目标速度  ${state.speed.toFixed(3)} / ${(obs?.targetSpeed ?? state.speed).toFixed(3)}\n路线 α  ${angle(obs?.input.angle)}\n车头 θ  ${angle(state.theta)}\n运动 ψ  ${angle(state.motion)}\n实际 / 目标侧滑 β  ${angle(state.beta)} / ${angle(obs?.route.betaRef)}\n前轮实际 / 目标 δ  ${angle(state.delta)} / ${angle(obs?.deltaTarget)}\n横摆 r  ${state.r.toFixed(4)}\n漂移输入  ${obs?.input.drift ? '开启' : '关闭'} · 混合 h ${state.h.toFixed(3)}\n前轴 α / Fy / 利用率  ${angle(obs?.front.alpha)} / ${(obs?.front.fy ?? 0).toFixed(3)} / ${(obs?.front.utilization ?? 0).toFixed(3)}\n后轴 α / Fy / 利用率  ${angle(obs?.rear.alpha)} / ${(obs?.rear.fy ?? 0).toFixed(3)} / ${(obs?.rear.utilization ?? 0).toFixed(3)}\n路面  ${obs?.front.surface.surfaceId ?? 'dry-hard'} / ${obs?.rear.surface.surfaceId ?? 'dry-hard'}\n保护  ${state.protection.count} · ${state.protection.strength.toFixed(4)}\n轴载荷  ${obs ? `${obs.loads.front.toFixed(3)} / ${obs.loads.rear.toFixed(3)}` : '—'}\n转向减速 / 游戏代价  ${(obs?.game.deceleration ?? 0).toFixed(5)} / ${state.energy.gameDissipation.toFixed(5)}\n纵向物理加速度  ${(obs?.physicalLongAcceleration ?? 0).toFixed(5)}`;
  }
}
