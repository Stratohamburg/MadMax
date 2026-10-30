# MadMax

MadMax 是一款面向移动端竖屏的网页版 2D 俯视角车辆冒险游戏，核心操控为单摇杆速度与方向输入、受限转向和主动触发的侧滑漂移。

当前处于规划阶段，已形成第一阶段驾驶验证场提案，尚未开始游戏功能实现。项目使用 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 管理需求、设计与实施任务，采用 `spec-driven` 工作流。

## 项目文档

- [项目总览：大纲、技术路线与阶段规划](docs/PROJECT_OVERVIEW.md)
- [第一阶段驾驶验证 Proposal](openspec/changes/validate-driving-prototype/proposal.md)
- [第一阶段详细设计与验收矩阵](openspec/changes/validate-driving-prototype/design.md)
- [第一阶段实施任务](openspec/changes/validate-driving-prototype/tasks.md)

## 环境准备

需要 Node.js 20.19.0 或更高版本。当前使用 OpenSpec **1.15.0**：

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

当前已有进行中的 `validate-driving-prototype` 变更，规划文档已齐备，实施任务待完成。`openspec/specs/` 暂无生效规范，能力规范会在变更完成并归档后进入该目录。

更新 CLI 版本后，在项目根目录执行 `openspec update` 同步技能文件，并相应更新本文中的版本号。
