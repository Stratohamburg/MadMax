# 车辆物理模型与验证方法

## 运行状态与边界

网页当前通过 `src/vehicle/model.ts` 消费 `vehicle-physics-1`，原 `baseline-1` 验收和回放保留为历史。新核心位于 `src/vehicle/physics/`，配置格式为 `vehicle-profile-1`，路面格式为 `vehicle-surface-1`（干硬路、松散地、湿滑地），通过独立、无 DOM 的公共入口消费；网页、长车碰撞、绘制、输入与手机接入由 `validate-driving-prototype` 跟踪。此前未实施的 `axle-dynamics-1` 规划已归并到本版本，不能作为另一个升级目标或可迁移配置。

新核心是统一游戏尺度的平面单轨模型，不是实车标定。卡车/重卡为刚性单车身、前后等效轴；不包含挂车、多后桥独立受力、轮速/纵向滑移率、差速器、悬挂侧倾、横向载荷转移、外倾或自然回正力矩。

## 公共接入

```ts
import { createPhysics, REFERENCE_PROFILE, collisionStop, geometry } from '../src/vehicle/physics';

const physics = createPhysics(REFERENCE_PROFILE); // 完整校验、复制配置
let state = physics.create({ position: { x: 0, y: 0 }, theta: 0 });
state = physics.step(state, { targetSpeed: 6, angle: 0.3, drift: false }); // 1/120秒
const observation = physics.observe(state);
const wheelsAndFootprint = geometry(state, physics.profile);
state = collisionStop(physics.profile, state); // 求交和姿态回退由场景执行
```

核心只接收配置、完整状态、Intent、路面采样与固定 dt。`step` 返回新状态，不修改旧状态；`dt=0` 冻结，其他 dt 为1/120秒整数倍。帧率调度、后台积压与输入时间戳由消费者时钟管理，不能按渲染帧改变物理步。

权威状态包含位置、世界速度向量、车头 theta、横摆 r、实际前轮 delta、漂移 h、前后轮胎力记忆、上一物理纵向作用、辅助历史、保护与能量账本。`speed/motion/beta/u/v` 只读派生，初态工厂拒绝独立注入。`resetState`、换车后重新 `create`、`collisionStop` 清除整组历史。允许通过一致初态构造非零漂移/反打状态；不允许静止时注入非零横摆。

`observe` 在当前状态和当前路面计算下一子步受力/参考预览，包含权威速度/方向、共用几何、实际/目标前轮、轴载荷、侧偏、力、预算、路面、路线/侧滑参考、动力与阻力、游戏代价、能量和保护。轴力是采样点的力，不是上一步平均碰撞冲量。观察不推进状态。

## 几何、载荷与积分

屏幕+x向右、+y向下、正角顺时针；车身前向为 `(cos(theta),sin(theta))`，右向为 `(-sin(theta),cos(theta))`。位置参考为质心；lf/lr 只从轴距和质心比例派生。`geometry` 提供四轮、轴位、前后边界、四角占地、保守圆和 AABB。消费者不得另算轮位或只用质心小圆代表重卡占地。

纯低速验证入口 `advanceKinematic` 解析推进圆弧，后轴半径 `L/tan(delta)`，前轴半径 `L/sin(delta)`。`ackermann` 提供低速内外轮显示角，单轨力仍使用等效前轮角；大侧滑不宣称四轮轨迹同心。

中高速由前后接地点侧偏、轴力与力矩积分世界速度和 r，不直接追赶车头/运动角。外层1/120秒，每步两次1/240秒中点 RK2；`substep=1/480` 仅为数值验证。动力请求在子步起点计算、两个阶段共用，防止中点重复截断导致稳态误差。

在0.45～1.2 L/T之间 smoothstep 混合导数。低速前轮变化包含几何侧偏导数，有限响应收敛到运动学 beta/r，不在跨区重置方向；增加横摆动能时由平移动能支付。正常低速几何 beta 不计作硬保护。

质心高度与上一子步物理纵向作用形成因果前后载荷转移。总轴载荷守恒为 mg；超出非负载荷界时限制纵向请求并记录。游戏扣速不进入载荷历史；不模拟左右载荷转移和侧翻。

## 轮胎、路面和瞬态

侧向曲线以刚度、峰值、形状派生峰位，小侧偏为线性起点、峰值一阶连续、峰后降到滑动比例；slide=1 关闭下降。各轴纵横抓地椭圆由驱动/制动先占预算，侧向能力按剩余比例下降。载荷敏感度围绕固定标称载荷改变 μ，刚度按载荷幂律变化；敏感系数零时回到常 μ。

路面格式 `vehicle-surface-1` 含标识、修订、hard/loose/wet族、抓地与滚阻比例，从实际前后轴位置分别采样。默认采样显式返回干硬路。名称和 ID 只作元数据，同参数换名不改变受力；不做左右 split-μ。

前后独立 relaxation=0 为准静态；非零使用 `tau=clamp(sigma/max(transport,vReg),tauMin,tauMax)` 闭式松弛，再投影到当前预算和 `Fy*vSlip<=0` 半空间。非零松弛的作用上限在接地点侧滑过零前连续缩小为零，避免旧力在反向时跳变；准静态保持原曲线。该近似只存力记忆，**不表达可回馈的弹性储能**，tireStored 恒零。被动性依据是各轴侧滑功率逐点非正；反向时清除会做正功的旧力，抓地下降后不沿用超额历史。幅值建立延迟与前轮执行器、漂移 h 分别观察。

RK2中点采样作用，记忆以同一中点目标完成整子步闭式更新。低速过渡连续衰减记忆。memoryProjection 记录力记忆修正量，不能解释为弹性能；projectionDissipation 不虚构储能。能量验证用机械能（平移+横摆）及零储能，核对轮胎、滚阻、游戏耗散和动力功。

## 动力、路线辅助和游戏代价

`Fdrive(V)=F0/(1+ka*(V/Vmax)²)`，`Fbrake(V)=B0*(1+kb*(V/Vmax)²)`；目标差限制请求，前后份额分配后再受轮胎预算限制。滚阻/可选风阻独立作用，稳态补偿一次。零目标有限停车，任意正目标不被阈值吞掉。见[配置与单位说明](VEHICLE_PROFILES.md)。

Intent.angle 始终为世界期望路线。chi/theta/beta 分别观察；精确180°沿最近有效路线参考方向，无历史取顺时针。预测误差形成受速度/抓地限制的路线参考；正常 beta 与前馈包含中高速刚度修正，不全速外推低速公式。侧滑/横摆反馈只输出有限前轮请求，不直接写 r。

漂移 h 连续改变后轴刚度/包络。额外 beta 参考由改变后的稳态刚度差、速度与转弯需求包络生成并限幅；直线无需求为零，退出保留动态恢复。软侧滑边界收紧路线需求；极端候选违反前进或 Vmax 边界时，收缩旧态到候选增量。保护次数/强度和载荷限制次数可查，正常验收要求零。

游戏项使用路线输入与车头最短夹角绝对值，免损角内零、90°以上封顶，同强度漂移 lambda 更大。沿当前速度耗散，不改方向；无目标为零。持续漂移车头偏角仍承担代价，辅助不豁免。动力、轮胎、滚阻和游戏项分别观察。

## 验证与研究边界

运行 `npm run typecheck`、`npx vitest run` 和 `npm run build`；完整独立基准及证据复核为 `npm run physics:benchmark`、`npm run physics:audit`。先核对无辅助几何/受力/能量，再验证辅助与车型；未执行门槛不能从基础测试推断通过。旧 baseline 证据保留，新证据写本变更独立目录；核心通过不能代替网页、长车碰撞和真实手机验收。量化结果见 `openspec/changes/build-vehicle-physics/acceptance.md`，消费者迁移见 [接入清单](VEHICLE_PHYSICS_INTEGRATION.md)。

| 研究方向 | 本次采用 | 延后 |
| --- | --- | --- |
| 单轨/阿克曼 | 轴距、质心、前轮与显示角 | 四轮独立受力 |
| 纵向载荷 | 准静态前后转移 | 俯仰/悬挂与左右转移 |
| 非线性轮胎 | 峰值/滑动曲线、组合预算 | 轮速、κ、差速器 |
| 瞬态/载荷敏感 | 可关闭耗散松弛、标称载荷规律 | 弹性胎体、温度/胎压/磨损 |
| 路线/漂移控制 | chi/beta参考、预测与反打 | 非线性反演、轮速闭环 |
| 重型车 | 刚性单车身与等效轴 | 多轴、挂车、侧翻 |
| 回正 | 有限执行器与辅助请求 | caster/pneumatic trail/方向机自由度 |

参考：[阿克曼与自行车模型](https://thomasfermi.github.io/Algorithms-for-Automated-Driving/Control/BicycleModel.html)、[CommonRoad 3.0.2](https://pypi.org/project/commonroad-vehicle-models/3.0.2/)、[Chrono轮胎](https://api.projectchrono.org/wheeled_tire.html)、[Stanford漂移控制](https://ddl.stanford.edu/publications/journal/towards-automated-vehicle-control-beyond-stability-limits-drifting-along)。本实现不复制完整库或论文控制器。

