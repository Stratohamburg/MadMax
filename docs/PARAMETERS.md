# 测试车参数

参数版本：`baseline-1`。唯一数值来源为 `src/vehicle/config.ts` 的 `PARAMETER_RULES`；初始值与设计表一致。世界坐标向右为 +x、向下为 +y，0 弧度向右，正角顺时针。物理时间为秒，步长 1/120 秒。屏幕摇杆尺寸使用 CSS 像素，不随设备像素比改变输入。

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

调校比较：在 `?validate=1` 验证模式将 acceleration 从 6 调至 12、normalTurn 从 3 调至 6，应用后从相同出生状态起步，速度爬升和转向会更快；再次重置可重复比较。`tests/unit/vehicle.test.ts` 自动验证这一组参数的可重复差异。正式手机手感仍需实测。
