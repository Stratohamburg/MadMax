import { runCombatBenchmark } from "./benchmark";
const panel = document.createElement("dialog");
panel.innerHTML = '<h2>战斗压测</h2><p>请在目标设备上运行并记录设备型号、系统、浏览器和热机时长。报告不会自动判定为真机验收。</p><button type="button">运行 2048 弹丸 / 128 敌人压测</button><pre aria-live="polite"></pre><a href="/">返回</a>';
document.body.append(panel); panel.showModal();
panel.querySelector("button")!.addEventListener("click", () => {
  const output = panel.querySelector("pre")!;
  output.textContent = "运行中…";
  requestAnimationFrame(() => setTimeout(() => { output.textContent = JSON.stringify(runCombatBenchmark(), null, 2); }, 0));
});
