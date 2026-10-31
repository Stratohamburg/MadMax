# Proposal

## Why

网页需要接入模式无关的vehicle-physics-2和有限控制器，消除碰撞注入速度、旧状态边界及意图扣速造成的假行为。

## What Changes

- 保留单指期望速度/世界方向、零输入死区及外拉漂移滞回；普通模式按控制能力防失稳，漂移放宽控制限制。
- 接入v2车型、状态、完整参数快照、执行器与控制包络观测。
- 车身矩形接触及平移/旋转扫掠以冲量影响运动，去除最低逃离速度及碰撞清全状态。
- 胎痕依据接地点实际滑移，界面用最高目标速度而非满油门描述输入。
- 保留v1证据，v2重新执行网页、回放、浏览器和手机验收。

## Capabilities

### New Capabilities

- `vehicle-handling`：期望到v2控制器及物理接入。
- `mobile-driving-interface`：竖屏单指期望输入及生命周期。
- `driving-playground`：十车型、接触、真实反馈、参数快照及验收。

### Modified Capabilities

主规范尚未归档，沿用原能力路径。

## Impact

main、input、scene、render、debug、snapshot、tests及文档迁移。核心由build-vehicle-physics维护，真机人工驾驶独立验收。
