# 车辆参数与版本

当前模型为 `vehicle-physics-2`，车型格式 `vehicle-profile-2`，控制器 `route-assist-2`，路面 `vehicle-surface-1`，场景 `driving-playground-3`，快照 `vehicle-snapshot-2`。十车型的完整数值来自 `src/vehicle/physics/profiles.ts`，字段范围来自 `config.ts` 的 `PARAMETER_UNITS` 和 `validateProfile`。所有数值使用游戏长度 L、质量 M、秒 s；世界向右为 +x、向下为 +y，正角顺时针。

摇杆角度表示世界路线期望，距离表示目标速度；R、Rexit、Renter 属于输入布局。`power.maxSpeed` 是输入最大目标和动力曲线的特征速度，物理速度可以超过它。普通模式的转向包络属于控制器，机械执行器只限制真实行程、响应时间与变化速率。

| 参数组 | 主要字段与单位 | 含义 |
| --- | --- | --- |
| 几何 | wheelbase、width、track、frontOverhang、rearOverhang、heightCG：L；cgFromRear：1 | 统一生成车身、接地点、碰撞足迹与力臂 |
| 质量惯量 | mass：M；kYaw：1 | 横摆惯量唯一派生为 mass × wheelbase² × kYaw |
| 轮速 | wheels.radius：L；wheels.inertia：ML² | 前后等效轮各自轮速，驱动/制动扭矩和轮胎反作用共同积分 |
| 动力 | driveForce、brakeForce：ML/s²；driveFront、brakeFront：1 | 有限动力及制动的前后分配；没有按目标夹断实际速度 |
| 阻力 | rolling：1；aero：M/L | 作用在真实世界速度上的阻力，不使用摇杆与车头夹角 |
| 轮胎 | stiffness：ML/s²/rad；muX、muY、slide：1 | 接触柔顺性、组合抓地椭圆及滑动抓地比例 |
| 载荷规律 | nominalLoad：ML/s²；loadSensitivity、stiffnessExponent：1 | 实际轴载荷改变抓地和刚度；准静态转移保持非负总载荷 |
| 路面 | adaptation.hard/loose/wet：1 | 每轴接地点独立采样的路面适应性 |
| 机械转向 | maxAngle：rad；response：s；rate：rad/s | 不按驾驶模式和车速缩小机械行程 |
| 普通辅助 | routeGain、betaGain：1/s；yawGain：s；maxRouteRate：rad/s；gripReserve：1；referenceTime：s | 只约束路线参考、前轮和牵引请求，实际失控状态不受截断 |
| 漂移辅助 | maxBeta：rad；minSpeed/fullSpeed：L/s；demandRate：rad/s | 放宽请求与目标；这些字段不进入物理内核 |
| 漂移控制 | brakeBase：1；brakeGain：1/rad；enterTime/exitTime：s；betaRate：rad/s | 后轴制动反馈与控制参考变化，不切换轮胎材质 |

固定外步为 1/120 秒，默认子步 1/240 秒，复核子步 1/480 秒；接触正则速度 0.35 L/s，12 次耦合迭代。不存在侧滑角上限、强制前进分量、实际速度上限或零质心速度清横摆规则。低速停车和纯旋转由接地点摩擦逐步耗散，不回写运动学参考。

网页验证模式可成组编辑目标速度上限、机械前轮角、漂移侧滑目标、前后轴抓地及辅助增益。非法字段、旧版本、不完整参数和非法几何组合整组拒绝，保留当前配置；合法应用从相同出生状态重置。快照保存完整有效参数和模拟时间，不能仅凭同名 profile 找回默认参数。

`baseline-1`、`axle-dynamics-1`、`vehicle-physics-1` 与旧快照均不静默兼容。旧模型及证据保留供追溯，旧参数不再解释当前行为。当前模型是平面刚体加前后等效轮的游戏近似，未包含悬挂、侧倾、挂车、四轮独立差速器或实车标定。
