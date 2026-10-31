# Proposal

## Why

需要把驾驶、改装、战斗和肉鸽串成可玩的闭环：副本战斗（主线剧情）模式，并带有搜打撤玩法——进入、搜刮、战斗、撤离，带出战利品并承担失败损失。这给改装和 build 提供意义与风险。

## What Changes

- 新增副本（run）生命周期：准备（选择装配）→ 进入 → 局内（战斗、搜刮、加成选择）→ 撤离/失败 → 结算。
- 新增关卡结构：区域、敌人波次/刷新、搜刮点、撤离点（可有激活条件与倒计时）、Boss 与主线剧情节点。
- 新增搜打撤规则：局内拾取战利品（部件、材料、货币）占用有限携带空间；成功撤离才带出，失败按规则损失（装配部件掉落/损毁比例）。
- 新增失败与重试规则。
- 新增主线剧情节点与副本的关联（关卡解锁、叙事触发点；叙事内容不在本期）。
- PVP 不在本期，仅在架构上不阻碍：战斗核心保持确定性与固定步长。

## Capabilities

### New Capabilities

- `pve-extraction-mode`：副本生命周期、关卡/波次/搜刮/撤离、战利品与损失规则、结算。

### Modified Capabilities

无。

## Impact

新增 `src/modes/pve/`、关卡数据与 UI 流程；依赖 loadout、assembly-physics、auto-weapons、combat-damage、roguelike-modifiers，结算结果由 `add-progression-persistence` 保存。需新增场景/镜头与现有练习场整合。
