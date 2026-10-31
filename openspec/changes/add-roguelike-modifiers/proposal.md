# Proposal

## Why

局内肉鸽加成是"倍率逐步提高、后期弹幕与巨额伤害"爽感的来源，也是 build 成败的关键。加成主要提升车辆性能与武器，需要统一的修饰符、标签与协同体系，否则后期数值无法平衡。

## What Changes

- 新增统一修饰符模型：目标属性、层（flat / 加算 / 乘算）、标签条件、持续时间与堆叠规则。
- 新增标签体系（如弹幕、爆炸、火焰、碰撞、漂移、制导、炮台、固定、被动）；加成按标签作用于武器与部件。
- 新增相邻协同：格子相邻的同标签/指定部件可提供额外加成（读取装配清单）。
- 新增局内加成选择：三选一候选的生成（按权重、稀有度、已有 build 倾向）、刷新与保底。
- 新增加成对车辆性能（经 compose 的分层规则）与武器属性的作用范围。
- 新增数值守护：乘算层数量与上限的诊断，以及无头模拟评估 build 的工具。
- 不含具体剧情关卡与存档。

## Capabilities

### New Capabilities

- `roguelike-modifiers`：修饰符分层、标签与协同、候选生成、局内获取与生效、数值诊断。

### Modified Capabilities

无。

## Impact

新增 `src/progression/modifiers/`；与 `add-assembly-physics`、`add-auto-weapons`、`add-combat-damage` 共用倍率分层实现。被 PVE 模式驱动，局内加成不跨局保留（局外成长见 `add-progression-persistence`）。
