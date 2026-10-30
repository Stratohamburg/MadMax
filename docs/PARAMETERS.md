# 测试车参数与版本兼容

当前网页运行时模型版本：`vehicle-physics-1`，车型格式：`vehicle-profile-1`，路面格式：`vehicle-surface-1`。十个 profile 的完整数值来源为 `src/vehicle/physics/profiles.ts`，统一规则在 `src/vehicle/physics/config.ts`；输入布局的 R/Rexit/Renter 属于摇杆接入配置，不属于车型物理参数。世界坐标向右为 +x、向下为 +y，0 弧度向右，正角顺时针。物理时间为秒，外层步长 1/120 秒、核心子步 1/240 秒。屏幕摇杆尺寸使用 CSS 像素，不随设备像素比改变输入。

下面的 `baseline-1` 表格仅用于解释历史证据和兼容边界；网页验证面板编辑的是新版 profile 的成组字段。所有数值都是游戏单位，不是实车标定结果。

| 配置键 | 默认值 | 单位 | 合法范围（包含端点） |
| --- | --- | --- | --- |
| maxSpeed | 12 | 世界单位/秒 | 0.01～100 |
| bodyLength | 1.2 | 世界单位 | 0.1～5 |
| radius | 0.45 | 世界单位 | 0.05～2 |
| acceleration / braking | 6 / 8 | 世界单位/秒² | 各 0.01～100 |
| accelerationCurve / brakingCurve | 2 / 1 | 无量纲 | 各 0.001～20 |
| steeringSpeed | 0.8 | 世界单位/秒 | 0.01～20 |
| normalTurn / driftTurn | 3 / 5 | 弧度/秒 | 各 0.01～20 |
| normalTurnCurve / driftTurnCurve | 1.4 / 0.8 | 无量纲 | 各 0.001～20 |
| normalGrip / driftGrip | 12 / 4 | 1/秒 | 各 0.01～100 |
| lowSpeedBlend | 0.3 | Vmax 比例 | 0.01～1 |
| normalLoss / driftLoss | 0.18 / 0.45 | 1/秒 | 各 0.001～10 |
| freeAngle | 5 | 度 | 0～89 |
| lossExponent | 2 | 无量纲 | 1～8 |
| maxSlipAngle | 65 | 度 | 1～89 |
| exitRatio / enterRatio | 1.2 / 1.4 | 正常满油门半径 R 的倍数 | 1.001～3 / 1.002～4 |

所有值必须为有限数，且必须同时满足 `driftGrip < normalGrip`、`driftLoss > normalLoss`、`1 < exitRatio < enterRatio`。验证面板按上述同一份元数据生成单位和范围，非法参数整组拒绝，保留旧参数。合法参数应用与恢复默认均重置车辆、镜头、时钟、输入和拖尾。

速度使用 `A0/(1+ka·u²)` 加速、`B0·(1+kb·u²)` 减速（`u=v/Vmax`），在目标处夹断。两套转向率为 `Omega0·v/(v+Vs)/(1+k·u²)`，静止不转头。运动方向按指数抓地响应追赶车头，漂移低速时抓地向普通值收敛。所有模式共享小于 90° 的侧滑上限。

转向代价在动力更新后扣除，用旧车头与本步目标的夹角计算；免损角内零损失，90°封顶。不存在摇杆中心死区、反向速度或漂移速度加成。精确 180°沿最近有效转向方向，无历史时顺时针；其他角度均沿最短弧。

调校比较：在 `?validate=1` 验证模式选择车型并成组调整最高速度、最大前轮角、前后轴抓地或路线/侧滑辅助增益，应用后从相同出生状态起步；非法组合会保留当前 profile。`tests/unit/vehicle-web-adapter.test.ts` 和 `tests/e2e/vehicle-upgrade.spec.ts` 验证原子应用与十车型切换。正式手机手感仍需实测。

## `vehicle-physics-1` 运行时参数

升级参数按职责分组，避免把旧的转向率或抓地响应误解成前轮、轮胎或惯量：

| 参数组 | 字段示例 | 初始方向 | 当前状态 |
| --- | --- | --- | --- |
| 几何 | `wheelbase`、`cgFromRear`、`track`、`frontOverhang`、`rearOverhang` | profile 按车型长度和宽度缩放 | 已实现 |
| 质量与惯量 | `mass`、`kYaw`、`gravity` | 质量和归一化横摆惯量随 profile 变化；重力规则为 9.81 | 已实现 |
| 动力与制动 | `power.maxSpeed`、`driveForce`、`brakeForce`、前后分配 | 目标速度转为有界纵向力请求 | 已实现 |
| 轮胎与路面 | 前/后轴刚度、`muX/muY`、`vehicle-surface-1` | 干硬路、松散地、湿滑地由核心采样 | 已实现 |
| 转向 | `maxAngle`、`highSpeedRatio`、`rate`、辅助预测 | 低速最大角约 34°，高速按 profile 收窄 | 已实现 |
| 低速与漂移 | `lowSpeedStart`、`lowSpeedEnd`、`drift.enterTime`、`drift.exitTime` | 低速运动学与中高速动力学连续混合 | 已实现 |
| 辅助与保护 | `assist.*`、`game.*`、保护计数 | 路线、侧滑、横摆辅助和前进/侧滑保护均可观测 | 已实现 |

升级后的权威状态是位置、世界速度向量、车头 `theta`、横摆角速度 `r`、实际前轮转角 `delta`、漂移混合量 `h` 和控制历史。`speed`、`motion` 和侧滑角由状态派生，只读显示。参数应用必须从同一出生状态重置，并记录 `modelVersion` 与 `parameterVersion`。

## 兼容矩阵

| 配置/模型 | 当前运行时 | 升级目标 | 处理方式 |
| --- | --- | --- | --- |
| `baseline-1` 参数 | 历史证据 | 不兼容 | 网页新版明确拒绝，不能把 `normalTurn` 当作前轮角或把 `normalGrip` 当作轮胎刚度 |
| 缺少轴几何/轮胎字段的配置 | 不适用 | 不兼容 | 拒绝并保留当前有效配置，显示缺失字段 |
| `axle-dynamics-1` 参数 | 拒绝 | 被取代格式 | 明确报错并保留当前有效配置 |
| `vehicle-physics-1` 配置 | 支持 | 当前网页格式 | 通过 `validateProfile/applyProfile` 原子校验和应用 |

## 近似与真实车辆规律

升级设计使用单轨/自行车模型、静态轴载荷、平滑饱和侧向力和游戏单位；它借用轴距、侧偏、轮胎合力上限和横摆力矩的关系来获得可解释的街机手感。它不模拟悬挂、侧倾、差速器、轮速、纵向滑移率、完整载荷转移、外倾角、自然回正力矩或真实车型标定。因此“物理”在本文中表示可观察、守恒趋势和单位一致的游戏近似，不代表道路车辆预测。

研究入口见 [车辆物理说明](VEHICLE_PHYSICS.md) 和变更设计的 [References](../openspec/changes/validate-driving-prototype/design.md#references)：自行车模型几何、CommonRoad 单轨/漂移模型、Stanford 漂移控制研究、Project Chrono 轮胎文档。实现时先验证无辅助的几何、受力方向和耗散，再调自动反打；辅助不得掩盖符号或能量错误。

核心配置、十车型和干硬路/松散地/湿滑地三类路面由 [VEHICLE_PROFILES.md](VEHICLE_PROFILES.md) 维护，消费者边界由 [VEHICLE_PHYSICS_INTEGRATION.md](VEHICLE_PHYSICS_INTEGRATION.md) 维护。文档入口对应命令为：

```powershell
npm run physics:benchmark
npm run physics:audit
```

本次实际核对结果为 `modelVersion=vehicle-physics-1`、`profileSchemaVersion=vehicle-profile-1`、`surfaceVersion=vehicle-surface-1`、十个 `profileId`、七对车型差异和 `runId=f89663035784`；网页接入回放和三视口回归另见 [验收记录](../openspec/changes/validate-driving-prototype/acceptance.md)。
