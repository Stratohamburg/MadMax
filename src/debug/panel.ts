import { DEFAULT_CONFIG, PARAMETER_RULES, PARAMETER_VERSION, validateConfig } from '../vehicle/config';
import type { VehicleConfig } from '../vehicle/config';
import { degrees, shortestAngle } from '../vehicle/model';
import type { VehicleState } from '../vehicle/model';

export class ValidationPanel {
  enabled = false;
  private element: HTMLElement;
  private output: HTMLOutputElement;
  private form: HTMLFormElement;
  private message: HTMLElement;
  constructor(parent: HTMLElement, private config: () => VehicleConfig, private apply: (config: VehicleConfig) => void) {
    this.element = document.createElement('aside');
    this.element.id = 'validation-panel';
    this.element.hidden = true;
    this.element.setAttribute('aria-label', '驾驶验证观测');
    this.element.innerHTML = `<div class="validation-title">驾驶观测 <span>${PARAMETER_VERSION}</span></div>
      <div class="vector-legend"><span>金：目标 α</span><span>白：车头 θ</span><span>绿：运动 ψ</span></div>
      <output id="telemetry"></output><details><summary>调整参数与重置</summary><form id="parameters" novalidate>
      ${Object.entries(PARAMETER_RULES).map(([key, rule]) => `<label>${rule.label} <small>${rule.unit} · ${rule.min}～${rule.max}</small><input name="${key}" aria-label="${rule.label}" type="number" step="any" min="${rule.min}" max="${rule.max}" value="${rule.value}" required></label>`).join('')}
      <button type="submit">应用并重置</button><button type="button" id="defaults">恢复默认</button></form></details>
      <p id="parameter-message" role="status" aria-live="polite">应用参数后从相同出生状态重新比较。</p>`;
    parent.append(this.element);
    this.output = this.element.querySelector('output')!;
    this.form = this.element.querySelector('form')!;
    this.message = this.element.querySelector('#parameter-message')!;
    this.form.addEventListener('submit', event => {
      event.preventDefault();
      const candidate = Object.fromEntries(Object.keys(PARAMETER_RULES).map(key => {
        const field = this.form.elements.namedItem(key) as HTMLInputElement;
        return [key, field.value.trim() === '' ? NaN : Number(field.value)];
      })) as VehicleConfig;
      const errors = validateConfig(candidate);
      if (errors.length) { this.message.textContent = errors.join('；'); this.message.dataset.error = 'true'; return; }
      this.apply({ ...candidate });
      this.message.textContent = '参数已应用，车辆与输入已重置。'; this.message.dataset.error = 'false';
    });
    this.element.querySelector('#defaults')!.addEventListener('click', () => {
      this.apply({ ...DEFAULT_CONFIG }); this.syncFields();
      this.message.textContent = '已恢复 baseline-1 默认参数并重置。'; this.message.dataset.error = 'false';
    });
  }
  toggle(enabled = !this.enabled): void {
    this.enabled = enabled; this.element.hidden = !enabled;
    document.querySelector('#validate-toggle')!.setAttribute('aria-pressed', String(enabled));
    if (enabled) this.syncFields();
  }
  private syncFields(): void {
    const config = this.config();
    for (const key of Object.keys(PARAMETER_RULES) as (keyof VehicleConfig)[]) (this.form.elements.namedItem(key) as HTMLInputElement).value = String(config[key]);
  }
  update(state: VehicleState): void {
    if (!this.enabled) return;
    const obs = state.observation;
    const angle = (value: number | null) => value === null ? '—' : `${degrees(value).toFixed(1)}°`;
    this.output.textContent = `实际 / 目标速度  ${state.speed.toFixed(3)} / ${obs.targetSpeed.toFixed(3)}\n目标 α  ${angle(obs.targetAngle)}\n车头 θ  ${angle(state.heading)}\n运动 ψ  ${angle(state.motion)}\n漂移输入  ${obs.drift ? '开启' : '关闭'}\n意图夹角  ${angle(obs.intentAngle)}\n实际侧滑  ${angle(Math.abs(shortestAngle(state.heading - state.motion)))}\n转向强度  ${obs.lossStrength.toFixed(3)}\n动力贡献  ${obs.driveDelta.toFixed(5)} / 步\n转向减速  ${obs.turnLoss.toFixed(5)} / 步`;
  }
}
