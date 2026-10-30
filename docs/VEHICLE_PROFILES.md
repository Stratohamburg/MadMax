# 车辆配置格式与调校

新核心位于 `src/vehicle/physics/`，模型版本为 `vehicle-physics-1`，配置格式为 `vehicle-profile-1`。当前网页已通过 `src/vehicle/model.ts` 消费该核心；场景接入由 `validate-driving-prototype` 完成。`baseline-1` 仅作为历史证据和拒绝兼容边界保留。

`config.ts` 的 `REFERENCE_PROFILE` 是完整参考快照。每份配置包含 `profileId`、`profileRevision`、名称、类别、几何、质量、归一化横摆惯量、动力、前后轮胎、转向、漂移、辅助、游戏代价和验收元数据。全部十车型使用 `vehicle-profile-1`；路面使用 `vehicle-surface-1`，包括 `dry-hard`（干硬路）、`loose`（松散地）和 `wet`（湿滑地）。`RULES` 独立管理全局规则；路面独立采样。名称与类别不参与物理分支，验收窗口不参与运动计算。

`validateProfile(candidate)` 返回带完整字段路径的错误。`applyProfile(current, candidate)` 只在全部校验成功时复制新对象；失败返回原配置。旧 `baseline-1`、未实施的 `axle-dynamics-1`、未知字段、缺失字段、非有限值及非法组合一律拒绝。`PARAMETER_UNITS` 给出每个数值字段的单位和范围，关联校验覆盖阿克曼分母、轮距/车宽、质心高度、动力/制动份额、峰位、滑动比例、低速区间、松弛时间与固定步长稳定界。

全部车共用游戏长度 L、质量 M、时间秒；重力为同一 `RULES.gravity=9.81 L/T²`。质量一不是每车重新归一，而是同一质量单位下参考车的值。轴距与质心比例派生 `lf/lr`；只设置 `kYaw`，实际 `Iz=mL²kYaw`；车长由轴距和前后悬派生。加速度由力除以质量，不额外乘车型“笨重系数”。

同比放大质量、惯量、驱动/制动力、轮胎刚度、标称载荷和风阻质量系数时，归一化响应应不变。只增加质量且不增加动力，未受牵引限制时加速下降。重型车差异须同时检查动力重量比、轴距、惯量分布与转向节奏。

几何以质心为位置参考，屏幕+x右、+y下、正角顺时针；左右是驾驶员视角。轮位、轴位、前后边界与四角占地来自 `geometry()`。首版卡车/重卡为刚性单车身及前后等效轴，不包含挂车或独立多轴。`ackermann()` 只提供低速显示角，动力学使用等效单轨前轮。

载荷由上一子步物理纵向加速度形成因果准静态转移；游戏扣速不进入该历史。`limitLongAcceleration` 限制超出非负轴载荷的物理请求，介入须观测。前轮使用速度相关行程、时间响应与每秒转角上限，缩小行程也要经过执行器，不能瞬间截断旧角度。

## 参数字典

全部角度输入/输出为弧度。下表说明可写量；精确允许范围由 `PARAMETER_UNITS` 和 `validateProfile` 共同决定，不能仅按单字段范围绕过关联约束。

| 路径 | 单位 | 含义与唯一来源 |
| --- | --- | --- |
| modelVersion/profileSchemaVersion/profileId/profileRevision | 字符串 | 模型/格式/稳定标识/配置修订；旧格式整组拒绝 |
| label/category | 字符串 | 显示/组织信息，不进入算法 |
| geometry.wheelbase/cgFromRear | L / 1 | 轴距及质心距后轴比例；派生lf/lr，轴一定在车身内 |
| geometry.width/track/frontOverhang/rearOverhang/heightCG | L | 车宽/轮距/前后悬/质心高；车长只派生，不另设bodyLength |
| mass/kYaw | M / 1 | 统一质量与Iz/(mL²)，不同时编辑Iz |
| power.driveForce/brakeForce | ML/T² | 基础驱动/制动力，除m后才成为加速度 |
| power.accelerationCurve/brakingCurve | 1 | 随速度平方的非线性曲线 |
| power.maxSpeed | L/T | 实际速度上界和输入目标夹断上界 |
| power.driveFront/brakeFront | 1 | 前轴份额，后轴为1减该份额 |
| power.rolling/aero | 1 / M/L | mg比例滚阻及速度平方风阻，补偿一次、分开观测 |
| tires.front/rear.stiffness | ML/T²/rad | 标称轴载荷下的小侧偏刚度 |
| tires.*.muX/muY/slide/shape | 1 | 纵横峰值、滑动/峰值比、峰区形状；峰位由shape*muY*Fz/C派生 |
| tires.*.falloff | rad | 峰后下降宽度；slide=1为无下降平台 |
| tires.*.nominalLoad | ML/T² | 固定标称载荷，质量相关同比缩放测试必须同步改 |
| tires.*.loadSensitivity/stiffnessExponent | 1 | 可关闭μ载荷敏感度/刚度载荷幂指数；不代表左右载荷转移 |
| tires.*.relaxation | L | 前后独立松弛长度；零关闭，非零为被动耗散近似 |
| tires.*.adaptation.hard/loose/wet | 1 | 路面族适应系数，与独立路面抓地相乘 |
| steering.maxAngle/highSpeedRatio/speedCurve | rad / 1 / 1 | 低速行程与高速收窄曲线；阿克曼内轮分母须为正 |
| steering.response/rate | s / rad/T | 实际执行响应时间与最大转角速度 |
| drift.rearGrip/rearStiffness | 1 | h=1的后轴包络/刚度比例，不是轮速或精确动力空转 |
| drift.maxBeta/minSpeed/fullSpeed/demandRate | rad / L/T / L/T / rad/T | 额外侧滑上限与速度/转弯需求包络 |
| drift.enterTime/exitTime/betaRate | s / s / rad/T | h进入/退出及侧滑参考限速 |
| assist.routeGain/prediction | 1/T / s | 路线误差增益与预测时间；输入历史估计有界目标角速度 |
| assist.betaGain/yawGain | 1 / s | 侧滑角反馈增益与横摆反馈增益；按速度/抓地调度 |
| assist.maxRouteRate/gripReserve/referenceTime | rad/T / 1 / s | 路线参考上限、抓地保留比例与参考响应 |
| game.normalLambda/driftLambda/freeAngle/exponent | 1/T / 1/T / rad / 1 | 意图损失，漂移lambda须更大；无目标零、90°封顶 |
| acceptance.* | s / 速度比例 / rad / rad/T / 字符串 | 冻结窗口、恢复初态与调校目标，只由基准读取 |

全局 `RULES` 固定1/120外步、1/240子步；低速区间、响应、正则速度、松弛时间和侧滑边界须一起满足验证。当前版本不接受独立车型重力或逐车单位尺度。只允许1/480作为精度验证子步，不能依渲染帧自适应。

## 十车型配方与冻结窗口

全部预设修订为 `1`。表中轴距和质量是同一世界单位；Fdrive/m为低速未受牵引限制的能力。完整快照通过 `getProfile(id)` 或本变更证据中的 `parameters` 读取，未省略任一参数组。

| 标识 | m | L | Fdrive/m | Vmax | 前驱份额 | 执行器响应s | 普通/恢复窗口s | 方向 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| light-pickup | 1.35 | 0.924 | 5.10 | 11 | 0 | 0.075 | 3.5/4.5 | 中等灵活、后轴可感知 |
| heavy-pickup | 2.10 | 0.9912 | 3.90 | 10 | 0.4 | 0.120 | 4/5 | 较慢、牵引稳定、窄漂移 |
| van | 1.60 | 0.9828 | 4.08 | 10 | 1 | 0.110 | 4/5 | 前驱温和、偏欠转 |
| box-truck | 3.10 | 1.302 | 2.70 | 9 | 0 | 0.150 | 4.5/5.5 | 长轴距、提前制动 |
| truck | 4.80 | 1.554 | 2.04 | 8 | 0 | 0.190 | 5/6 | 大半径、慢横摆 |
| heavy-truck | 8.00 | 1.932 | 1.44 | 7 | 0 | 0.240 | 6/7 | 最大占地、最慢转向 |
| sports-car | 1.00 | 0.840 | 6.00 | 12 | 0 | 0.055 | 3/4 | 干路快速回正 |
| rally-car | 1.05 | 0.798 | 5.70 | 11.5 | 0.5 | 0.035 | 3/4 | 四驱、松散地与持续侧滑 |
| muscle-car | 1.45 | 0.9072 | 6.48 | 12 | 0 | 0.105 | 3.5/4.5 | 强动力、较慢恢复、后轴易失抓 |
| off-road | 1.55 | 0.840 | 4.20 | 8.5 | 0.5 | 0.095 | 4/5 | 较高质心、松散地牵引、制动更早 |

所有车质心比例0.5，前后悬按轴距比缩放；车宽独立按质量平方根有限增大。重型车实际车长/占地随几何输出变化，未伪造多轴/挂车。轮胎刚度、抓地、路面适应、后轴漂移刚度与执行器均有独立配方；并非只更换名称。

标准跑车恢复初态冻结为0.65Vmax、世界运动方向0°、车头±25°、r=±0.6rad/s、delta=±15°、h=1。其他预设的初态也已冻结在 `acceptance`；较重车采用更窄初态并使用各自声明窗口。共同残余角/横摆/前轮和持续1秒正速度门槛不变，窗口未因测试失败放宽。重卡的较低路线/侧滑反馈与较高横摆阻尼来自低速摆振调校。

所有预设默认sigma为零；机制用前轴0.12L、后轴0.18L的单轴/双轴矩阵独立验证，包含预算、能量、普通/反打、持续漂移、帧率与收敛，并非以默认值零冒充验证。

## 基准命令与读法

在仓库根目录执行 `npm run physics:benchmark`，无需浏览器。可用 `npm run physics:benchmark -- <输出目录>` 指定证据目录；默认写 `openspec/changes/build-vehicle-physics/evidence/vehicle-physics-1/`。Node使用项目已声明版本范围，通过现有Vite的转换器读取TypeScript，不另加运行依赖。

生成后执行 `npm run physics:audit`，复核证据对应当前实现哈希、十车型完整参数、七对差异、逐采样载荷/预算和旧基线保留情况；输出独立audit JSON与各报告的SHA-256。使用自定义目录时可同样把目录作为参数传入。

报告包含模型/配置/车型修订、路面/控制器/输入/基准版本、完整参数与全局规则、实现哈希、方向/实际前轮/参考、侧偏/轴载荷/力/预算、能量与保护。文件名含实现哈希；相同源码和配置重跑产生相同数值。旧baseline目录不写入。最终通过批次以 `acceptance.md` 的引用为准，工作区交付最终通过证据，调校中的失败不能冒充通过。

调校顺序为：统一尺度和几何 → 无辅助受力/能量 → 动力制动 → 固定轮角稳态与欠转 → 公共辅助 → 各车辅助 → 漂移/反打 → 非零瞬态 → 数值与七对差异。纯物理使用固定实际前轮请求，辅助仍通过真实执行器；公共辅助仅共用控制参数，不替换各车的质量、轮胎、动力或几何。

公共速度是成对较小Vmax的35%，同一绝对速度段比较提速和制动；另有各车25/50/75% Vmax矩阵。相对差为 `abs(a-b)/max(abs(a),abs(b),epsilon)`，按指标族去重；制动距离/时间不重复计族。对侧滑、超调、路面误差设置有物理意义的近零门槛，近零不计差异。最高速度和外观不用于通过七对差异门槛。

车型都是游戏原型配方。松散地系数表达选定轮胎原型，不代表现实类别必然排名；重车笨重来自实际动力重量比、轴距、惯量与前轮节奏。持续5°漂移硬门槛只对跑车和拉力适用；其余车仍记录漂移指标并验证退出、稳定和能量，窄包络不是失败项豁免。
