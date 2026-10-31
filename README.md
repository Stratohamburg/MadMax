# MadMax

MadMax 是一款面向移动端竖屏的网页版 2D 俯视角车辆冒险游戏，核心操控为单摇杆速度与方向输入、期望速度/路线、有限执行器和主动触发的侧滑漂移。

当前网页已接入 `vehicle-physics-2` 驾驶核心，验证模式提供十个 `vehicle-profile-2` 车型和 `vehicle-surface-1` 三类路面。`baseline-1` 与 `vehicle-physics-1` 证据作为历史保留，真实手机驾驶仍单独验收。项目使用 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 管理需求、设计与实施任务，采用 `spec-driven` 工作流。

## 运行客户端

在项目根目录执行（Node.js 20.19+，或 22.12+ 的较新版本）：

```powershell
npm install
npm run dev -- --port 5173 --strictPort
```

电脑打开 http://localhost:5173/。开发服务监听 `0.0.0.0`；手机连接相同 Wi-Fi/局域网后，打开终端打印的 Network 地址。本次实际入口为 `http://192.168.7.54:5173/`，IP 改变时以新输出为准。若连接不到，检查两端网络互通和 Windows 防火墙对 Node.js 的专用网络许可。不需要公网部署。

```powershell
npm run typecheck
npm run test -- --run
npm run test:e2e
npm run build
npm run preview -- --port 4173 --strictPort
```

`build` 输出到 `dist/`，预览入口为 http://localhost:4173/；开发与预览进程用 Ctrl+C 结束。Playwright 自动使用或启动 5173 开发服务，优先使用已下载的 Chromium，未下载时可使用此 Windows 机器已安装的 Edge。两者均无时先运行 `npx playwright install chromium`。可用 `PLAYWRIGHT_CHANNEL` 环境变量指定浏览器通道。依赖由 `package-lock.json` 锁定，干净环境也可用 `npm ci` 安装。命令执行证据及实际版本见本变更的 [验收记录](openspec/changes/validate-driving-prototype/acceptance.md)。

摇杆仅表达期望；普通/漂移差异属于控制器，物理层允许大侧滑、倒滑及spin。普通辅助会限制自身请求以预防失稳，撞击或已有失控仍可能继续spin。普通开发入口使用当前 `vehicle-physics-2` 运行模型，默认 profile 为 `sports-car`。`/?validate=1` 打开车型、分组参数和核心观测面板；`/?test=1` 仅在开发模式提供可重复测试初态注入，不属于玩家入口。旧 `baseline-1`、`axle-dynamics-1` 和 `vehicle-physics-1` 参数会被拒绝，不能静默转换成新版含义。

独立的 `vehicle-physics-2` 核心入口位于 `src/vehicle/physics/index.ts`，不依赖 DOM；`build-vehicle-physics` 维护核心，`validate-driving-prototype` 负责输入、网页场景、碰撞、绘制、触控和手机证据。核心基准、审计和网页固定时钟回放可分别运行：

```powershell
npm run physics:benchmark
npm run physics:audit
npm run validation:replay
```

这些命令使用 `vehicle-profile-2` 配置、`vehicle-surface-1` 路面和十个稳定车型 ID（十车型），覆盖干硬路、松散地和湿滑地，输出带 `modelVersion`、`profileRevision`、实现哈希和路面版本的证据。核心通过不等于网页接入或手机通过；迁移边界见 [接入清单](docs/VEHICLE_PHYSICS_INTEGRATION.md)，车型和三类路面见 [车型说明](docs/VEHICLE_PROFILES.md)。

## 项目文档

- [项目总览：大纲、技术路线与阶段规划](docs/PROJECT_OVERVIEW.md)
- [第一阶段驾驶验证 Proposal](openspec/changes/validate-driving-prototype/proposal.md)
- [第一阶段详细设计与验收矩阵](openspec/changes/validate-driving-prototype/design.md)
- [第一阶段实施任务](openspec/changes/validate-driving-prototype/tasks.md)
- [驾驶操作与练习区域](docs/DRIVING.md)
- [默认参数、单位与范围](docs/PARAMETERS.md)
- [车辆物理模型与验证方法](docs/VEHICLE_PHYSICS.md)
- [车型、路面与参数字典](docs/VEHICLE_PROFILES.md)
- [车辆物理接入清单](docs/VEHICLE_PHYSICS_INTEGRATION.md)
- [自动化证据与真实手机验收记录](openspec/changes/validate-driving-prototype/acceptance.md)

## 环境准备

客户端需要 Node.js `^20.19.0 || >=22.12.0`。当前使用 OpenSpec **1.15.0**：

```powershell
npm install --global @fission-ai/openspec@1.15.0
openspec --version
```

也可以免全局安装运行，例如：

```powershell
npx --yes @fission-ai/openspec@1.15.0 list
```

## 目录约定

- `docs/PROJECT_OVERVIEW.md`：项目定位、玩法与系统大纲、已确认规则、技术路线、架构和阶段规划。
- `openspec/config.yaml`：工作流配置与项目上下文。文档正文使用简体中文，保留 OpenSpec 的英文结构标题及 SHALL/MUST 关键字。
- `openspec/specs/`：项目当前生效的能力规范。
- `openspec/changes/`：进行中的变更，每个变更包含提案、规范增量、设计和任务清单。
- `openspec/changes/archive/`：已完成并归档的变更。
- `.agents/skills/openspec-*/`：Codex 的 OpenSpec 工作流技能。

## 日常使用

在 Codex 中选择对应技能，或用以下提示发起工作：

1. 探索需求：`$openspec-explore`，讨论目标与方案。
2. 创建提案：`$openspec-propose 添加某项功能`，生成 proposal、specs、design 和 tasks，供审阅。
3. 实施变更：审阅后使用 `$openspec-apply-change`，按任务清单完成实现。
4. 归档变更：验证完成后使用 `$openspec-archive-change`，将规范增量合并到正式规范并归档。

另外提供 `$openspec-update-change` 更新变更文档，以及 `$openspec-sync-specs` 单独同步规范。

在 Codex 桌面应用中，也可以从侧边栏 Skills 选择这些技能。

常用检查命令（在项目根目录执行）：

```powershell
openspec list
openspec list --specs
openspec validate --all --strict --no-interactive
```

当前进行中的 `validate-driving-prototype` 变更已完成网页接入、十车型场景、三路面、长车碰撞、版本化回放和桌面浏览器回归；真实手机人工驾驶与最终整体验收仍待完成。另有独立的 `build-vehicle-physics` 变更维护无 DOM 核心。`openspec/specs/` 暂无生效规范，能力规范会在变更完成并归档后进入该目录。

更新 CLI 版本后，在项目根目录执行 `openspec update` 同步技能文件，并相应更新本文中的版本号。
