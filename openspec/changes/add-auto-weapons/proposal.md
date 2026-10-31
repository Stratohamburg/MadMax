# Proposal

## Why

武器是 build 的核心，且单摇杆已占用驾驶输入，因此所有武器必须自动开火。不同武器有不同的触发逻辑，这些触发逻辑构成 build 的策略深度，需要统一、可扩展、可测试的武器模型。

## What Changes

- 新增武器通用模型：伤害载荷、射速、弹道类型、弹药/过热、挂点朝向、标签。
- 新增四类自动触发模式：
  - **炮台类**：有效范围内存在敌人即开火，炮塔自动转向并锁定目标。
  - **固定朝向类**：挂点朝向的射界扇形内有敌人才开火，不转向。
  - **制导类**：需在指定区域内保持一段时间（锁定/充能）后才开火。
  - **被动触发类**：由事件触发（受击、碰撞、击杀、漂移、速度阈值、喷射等），无需目标。
- 新增目标选择规则（最近/最高威胁/血量最低等，可按武器配置）。
- 新增后坐力对车体的外力输入（使用 `add-assembly-physics` 预留的外力接口）。
- 不含伤害结算、敌人 AI 与倍率（由 `add-combat-damage` 与 `add-roguelike-modifiers` 负责）。

## Capabilities

### New Capabilities

- `auto-weapons`：武器模型、四类触发模式、目标选择、冷却/过热、后坐力。

### Modified Capabilities

无。

## Impact

新增无 DOM 的武器模块（如 `src/combat/weapons/`）与单测，依赖 `add-vehicle-loadout-grid` 的挂点与朝向、`add-assembly-physics` 的外力接口。战斗在固定步长内与物理同步推进，以保证 PVP 时的可复现性。
