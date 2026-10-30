# MadMax

MadMax 是一款面向移动端竖屏的网页版 2D 俯视角车辆冒险游戏，核心操控为单摇杆速度与方向输入、受限转向和主动触发的侧滑漂移。

当前正在实施第一阶段驾驶验证场。项目使用 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 管理需求、设计与实施任务，采用 `spec-driven` 工作流；真实手机驾驶验收单独记录。

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

## 项目文档

- [项目总览：大纲、技术路线与阶段规划](docs/PROJECT_OVERVIEW.md)
- [第一阶段驾驶验证 Proposal](openspec/changes/validate-driving-prototype/proposal.md)
- [第一阶段详细设计与验收矩阵](openspec/changes/validate-driving-prototype/design.md)
- [第一阶段实施任务](openspec/changes/validate-driving-prototype/tasks.md)
- [驾驶操作与练习区域](docs/DRIVING.md)
- [默认参数、单位与范围](docs/PARAMETERS.md)
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

当前进行中的 `validate-driving-prototype` 变更已提供可运行客户端，真实手机人工驾驶待验收。`openspec/specs/` 暂无生效规范，能力规范会在变更完成并归档后进入该目录。

更新 CLI 版本后，在项目根目录执行 `openspec update` 同步技能文件，并相应更新本文中的版本号。
