# 装配物理与动力链

当前核心版本为 `vehicle-physics-3` / `vehicle-profile-3`，快照为 `vehicle-snapshot-3`。v2 的驾驶数据与证据保留；v2 profile 和 snapshot 不能直接加载到 v3。

## 质量与质心

`compose(loadout, options)` 是无 DOM 的确定性派生入口，返回物理 profile、质心、惯量、挂点、能源预算和性能摘要。部件 kg 按 1000 kg = 1 game-M 换算；每格 0.12 game-L，位置取旋转占格中心。

底盘质量加上所有安装部件的质量得到总质量，质心按质量加权，惯量包含底盘原惯量和全部平行轴项。部件仍在车上时，即使内部件毁坏也有质量；外挂脱落后应从装配清单移除，再调用 compose。`options.health` 按实例 ID 接受 0～1 的耐久比例。

profile 中 `cgFromRear` 控制纵向轴距比，`cgLateral` 控制横向质心。状态位置代表质心，车身、车轮、轮胎接地点速度、力矩和碰撞使用同一几何。物理校验范围截断保存在 `summary.clamped`，每项含字段、请求值和实际值。

空装配只用于底盘基线和性能比较，其 profile 与基础车型一致。可出击的装配须包含可用驾驶座、发动机、变速箱和油箱；`summary.canDrive` 与 `issues` 给出判断。非前置驾驶座没有潜望镜时 `limitedVision=true`，供玩法/界面限制视野。

## 属性分层

`src/stats/modifiers.ts` 是装配、武器与伤害共享的求值器：

```text
(base + flat总和) × (1 + increased总和) × more倍率积
```

`more.value` 直接表示倍率，如 1.5。按来源和 ID 固定排序，支持 allTags / anyTags，返回每层贡献和乘算分组。物理参数由 compose 做最终范围校验。当前车辆属性入口为 `power`、`maxSpeed`、`grip`、`stiffness`、`massLimit`。

## 动力链与单指驾驶

`createAssemblyDrive` 和 `advanceAssemblyDrive` 在 1/120 秒外步上管理刚体、RPM、挡位、换挡剩余时间、油量、电量和喷射状态。发动机扭矩曲线线性插值，受额定功率、红线和变速箱承载上限限制。内容 Nm 按 2500 Nm = 1 game-M·game-L²/s² 标定，是游戏数值而非实车标定。

自动升挡阈值为红线的 86%，降挡为 35%；换挡期间驱动力为零，接合后 RPM 根据新齿比下降。低挡总减速比使卡车保有较高起步推力储备。发动机受损时功率/扭矩减半，变速箱受损时换挡时间加倍，毁坏件不提供功能。

喷射在目标速度达到极速的 95%、车头与路线夹角小于 60° 时自动请求，不增加按钮。喷射有有限推力、持续时间、冷却与持续耗电；耗尽后进入冷却。没有可用驾驶/动力依赖时不输出驱动和助推。

## 外力与回放

`StepOptions` / `Actuation` 接受 `driveForce`、`boostForce`、世界 `externalForce` 与 `externalTorque`。`applyExternalImpulse` 接受世界冲量和世界挂点，按质量与惯量产生平移/横摆。

能量账本新增 `externalWork` 和 `boostWork`；原动力、轮胎、制动、滚阻和碰撞项继续独立记录。快照载入须使用权威字段恢复，不能注入 `speed` / `beta` 等派生值。装配驾驶的动力链、油量、能源和喷射状态也必须一并保存。

## 验证入口

```powershell
npx vitest run tests/unit/assembly-physics.test.ts
npm run physics:benchmark
npm run physics:audit
npm run validation:replay
npm run test:e2e
```

`tests/fixtures/vehicle-physics-2-baseline.json` 在升级前由 v2 核心采集，覆盖十车型各三场景。v3 空装配与该 fixture 比较，不能通过更新 fixture 来掩盖回归。新增核心证据位于 `openspec/changes/add-assembly-physics/evidence/vehicle-physics-3/core/`，网页截图/回放位于同版本的 `web/`。
