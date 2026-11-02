# 车辆参数与版本

当前模型为 `vehicle-physics-5`，车型格式 `vehicle-profile-5`，控制器 `route-assist-4`，路面 `vehicle-surface-1`，场景 `driving-playground-3`，快照 `vehicle-snapshot-5`。十车型的完整数值来自 `src/vehicle/physics/profiles.ts`，字段范围来自 `config.ts` 的 `PARAMETER_UNITS` 和 `validateProfile`。所有数值使用游戏长度 L、质量 M、秒 s；世界向右为 +x、向下为 +y，正角顺时针。

摇杆角度表示世界路线期望，距离表示目标速度；R、Rexit、Renter 属于输入布局。`power.maxSpeed` 是输入最大目标和动力曲线的特征速度，物理速度可以超过它。普通模式的转向包络属于控制器，机械执行器只限制真实行程、响应时间与变化速率。

| 参数组 | 主要字段与单位 | 含义 |
| --- | --- | --- |
| 几何 | wheelbase、width、track、frontOverhang、rearOverhang、heightCG、cgLateral：L；cgFromRear：1 | 统一生成车身、接地点、碰撞足迹与相对二维质心的力臂 |
| 质量惯量 | mass：M；kYaw：1 | 横摆惯量唯一派生为 mass × wheelbase² × kYaw |
| 轮速 | wheels.radius：L；wheels.inertia：ML² | 前后等效轮各自轮速，驱动/制动扭矩和轮胎反作用共同积分 |
| 动力 | driveForce、brakeForce、handbrakeForce：ML/s²；driveFront、brakeFront：1 | 有限动力、脚刹/手刹能力及前后分配；独立 handbrake 请求使用 handbrakeForce，漂移 rearBrake 仍使用 brakeForce |
| 阻力 | rolling：1；aero：M/L | 作用在真实世界速度上的阻力，不使用摇杆与车头夹角 |
| 控制响应 | speedResponse：s；stopSpeed、lowSpeed：L/s；stopYawGain：s；shiftUpFraction、shiftDownFraction、downshiftLimit、boostSpeedFraction：1；boostAlignment：rad | 速度闭环、低速控制、自动换挡滞回和助推触发条件；只生成有限请求 |
| 接触材质 | friction、restitution：1；bounceThreshold：L/s | 场景/实体接触的摩擦、恢复和反弹阈值；接触冲量由物理核心统一求解 |
| 轮胎 | stiffness：ML/s²/rad；muX、muY、slide：1 | 接触柔顺性、组合抓地椭圆及滑动抓地比例 |
| 载荷规律 | nominalLoad：ML/s²；loadSensitivity、stiffnessExponent：1 | 实际轴载荷改变抓地和刚度；准静态转移保持非负总载荷 |
| 路面 | adaptation.hard/loose/wet：1 | 每轴接地点独立采样的路面适应性 |
| 机械转向 | maxAngle：rad；response：s；rate：rad/s | 不按驾驶模式和车速缩小机械行程 |
| 普通辅助 | routeGain、betaGain：1/s；yawGain：s；maxRouteRate：rad/s；gripReserve：1；referenceTime：s | 只约束路线参考、前轮和牵引请求，实际失控状态不受截断 |
| 漂移辅助 | maxBeta：rad；minSpeed/fullSpeed：L/s；demandRate：rad/s | 放宽请求与目标；这些字段不进入物理内核 |
| 漂移控制 | brakeBase：1；brakeGain：1/rad；enterTime/exitTime：s；betaRate：rad/s | 后轴制动反馈与控制参考变化，不切换轮胎材质 |

固定外步为 1/120 秒，默认子步 1/240 秒，复核子步 1/480 秒；接触正则速度 0.35 L/s，12 次耦合迭代。不存在侧滑角上限、强制前进分量、实际速度上限或零质心速度清横摆规则。低速停车和纯旋转由接地点摩擦逐步耗散，不回写运动学参考。后坐力、爆炸等外部瞬时作用使用带 `tick/source/sequence` 的冲量事件，不乘 `dt` 且重复事件只生效一次。真实接触冲量由物理接触求解器直接施加，玩法消费结果，不再次提交同一碰撞冲量。

网页验证模式可成组编辑目标速度上限、机械前轮角、漂移侧滑目标、前后轴抓地及辅助增益。非法字段、旧版本、不完整参数和非法几何组合整组拒绝，保留当前配置；合法应用从相同出生状态重置。快照保存完整有效参数和模拟时间，不能仅凭同名 profile 找回默认参数。

`baseline-1`、`axle-dynamics-1`、`vehicle-physics-1` 与旧快照均不静默兼容。旧模型及证据保留供追溯，旧参数不再解释当前行为。当前模型是平面刚体加前后等效轮的游戏近似，未包含悬挂、侧倾、挂车、四轮独立差速器或实车标定。


## v5 架构与物理边界

输入器只产生世界运动方向、目标速度和漂移/助推请求；`src/vehicle/control/` 负责路线、速度、自动挡和助推策略。物理核心只接收有限执行器、有效 profile、路面和外部作用，统一计算传动、轮胎、刚体、场景接触与能量。场景只提供接触几何，战斗只提交带 tick/source/sequence 的外部冲量，重复事件由核心入口去重。

装配使用核心质量属性函数派生三维重心、二维质心、部件自身惯量和逐实例喷射挂点；电池、常驻设备、喷射和武器共享输出预算。敌方车辆的 AI 只生成 `Intent`，通过同一控制、传动和轮胎核心推进。

当前仍采用平面刚体与等效前后轴；完整悬挂、翻车、倒挡、动态燃油/弹药质量及附加外挂碰撞轮廓留作后续能力。
