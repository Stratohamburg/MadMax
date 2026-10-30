# Acceptance

## Status

日期：2026-10-31（Asia/Shanghai）。本文保留 `baseline-1` 历史证据，并单独记录当前 `vehicle-physics-1` 网页接入证据；版本化新版证据位于 `evidence/vehicle-physics-1/<profileId>/<profileRevision>/`。

**历史 baseline-1：原记录保留；当前 vehicle-physics-1：27/29；整体验收：未完成。** 6.3 真机人工驾驶和依赖它的 6.4 尚待设备记录。自动化、桌面浏览器和真实手机分别记载，不将历史视口仿真当作实机证据。

状态约定：通过＝已有可复查证据；失败＝当前仍有违反行为合同的结果；未执行＝尚无对应执行证据。

## Environment

| 项目 | 本轮环境 |
| --- | --- |
| 系统 | Windows 10 x64（10.0.19045） |
| Node.js / npm | 25.9.0 / 11.18.0 |
| TypeScript / Vite | 7.0.2 / 8.3.5 |
| Vitest / Playwright | 4.1.12 / 1.64.1 |
| 浏览器 | 本机 Microsoft Edge 155.0.4283.62（Chromium 内核、无头运行），完整版本与 UA 见 `evidence/browser.json` |
| 浏览器视口 | 320×568、360×640、390×844 CSS 像素；390 输入布局检查另用 DPR=3 |
| 安全区检查 | CSS `--safe-bottom` 注入 34px；属于仿真，未验证具体手机的浏览器安全区实现 |
| 输入检查 | Playwright 鼠标指针与 CDP 实际触点；取消/捕获丢失用浏览器事件注入；隐藏恢复用受控 visibilitychange 注入并结合独立五秒暂停测试 |
| 开发入口 | `npm run dev -- --port 5173 --strictPort` → `http://localhost:5173/`；实际局域网入口 `http://192.168.7.54:5173/` |
| 静态入口 | `npm run build` → `dist/`；`npm run preview -- --port 4173 --strictPort` → `http://localhost:4173/` |
| 真实手机 | 未执行：没有已连接、可供人工驾驶并记录型号版本的手机 |

初始依赖安装、开发页和静态预览均已执行，两个入口 HTTP 200。锁文件安装无已报告漏洞。Chromium 下载未完成，改用本机已安装 Edge 完成自动化；下载进程已结束。Playwright 配置会优先使用已下载 Chromium，其次使用 Windows 的 Edge，也支持 `PLAYWRIGHT_CHANNEL` 指定通道。

## Design Matrix

| 设计验证项 | 状态 | 方法与结果 |
| --- | --- | --- |
| 任意非零输入 | 通过 | `input.test.ts`、`input.spec.ts`：精确中心零、1e-12 位移为正、R/2 半速、R 满速、远端和斜向输入 |
| 非线性速度控制 | 通过 | `vehicle.test.ts`：低速提速更快、高速减速更强、目标夹断、正目标稳定、有限时间停车 |
| 静止不转头 | 通过 | `vehicle.test.ts`、`scene.test.ts`：静止保持、侧向起步伴随位移、完全阻挡时方向与历史回滚 |
| 漂移分区与滞回 | 通过 | 单元测试八个方向，三视口浏览器检查内外拉：1.3R 普通缓冲、1.42R 入漂、回到 1.3R 保持、1.1R 退出，无速度加成 |
| 实际侧滑与退出 | 通过 | 普通/漂移同初态路径不同；退出保留残余侧滑并平滑收敛；浏览器观测与胎痕检查 |
| 转向损失 | 通过 | 原始状态固定比较 4°、45°、90°、120°、180°及两模式；免损、封顶、漂移损失更大、满油门掉速 |
| 方向边界 | 通过 | 微小角、179°→-179°短弧、精确后方历史符号与默认顺时针选择 |
| 帧率一致性 | 通过 | `replay.test.ts` 完整链路十秒回放；见下表与 `evidence/replay.json` |
| 触控与布局 | 通过 | 三视口比例 ≥60%、全方向入漂、34px 模拟安全区、尺寸变化清理、越界捕获、双触点不移交、取消/捕获丢失/隐藏恢复 |
| 碰撞、胎痕与重置 | 通过 | 扫掠面与圆角、薄障碍、边界、切向位移、可脱离、死角不转头；胎痕寿命 6 秒/容量 1600；三视口漂移中重置、旧触点不接管 |
| 手机驾驶手感 | 未执行 | 至少一台手机人工驾驶尚无证据；任务 6.3 与整体验收保持未完成 |

## Requirement Coverage

以下按能力规范逐项映射，编号仅供本记录引用。所有“通过”表示自动化或本机浏览器层面的验证；手机体验结论仍待下节实测。

| 能力 | Requirement（与规范同名） | 状态 | 检查入口 |
| --- | --- | --- | --- |
| mobile-driving-interface | 竖屏游戏主视图保留至少五分之三高度 | 通过 | `input.spec.ts` 三视口、安全区与 resize |
| mobile-driving-interface | 任意非零摇杆位移同时产生速度与方向输入 | 通过 | `input.test.ts` 精确中心/微小位移/半速；浏览器半速行驶 |
| mobile-driving-interface | 摇杆角度表示屏幕中的全向驾驶意图 | 通过 | 八方向映射、右向/上向、后方掉头和固定镜头 |
| mobile-driving-interface | 普通满油门与漂移之间保留独立外拉行程 | 通过 | 1.3R 缓冲、1.42R 入漂与八方向测试 |
| mobile-driving-interface | 漂移输入采用分离的进入与退出阈值 | 通过 | 入漂后回收保持、主动退出普通满油门 |
| mobile-driving-interface | 连续拖动与触控中断具有明确生命周期 | 通过 | 越界捕获、双触点、抬起、取消、捕获丢失、受控隐藏与恢复 |
| mobile-driving-interface | 操控反馈与实际输入状态一致 | 通过 | `data-mode` 与视觉环状态、斜向无滚动、缩放比例不变 |
| vehicle-handling | 车辆仅以前进速度行驶且静止时不原地旋转 | 通过 | 侧向起步、非负速度、侧滑角始终小于 90°、死角回滚 |
| vehicle-handling | 实际车速逐步追赶目标速度 | 通过 | 半速、降低到正速度、目标夹断 |
| vehicle-handling | 加速度与减速度由当前速度决定 | 通过 | 高低速短时间对比与低速有限时间停车 |
| vehicle-handling | 普通和漂移转向能力分别随速度变化 | 通过 | 两模式两速度、零速、微小角不超调 |
| vehicle-handling | 方向角跨界与正后方输入具有稳定转向选择 | 通过 | 179°跨界、重复精确后方、相邻非精确角 |
| vehicle-handling | 漂移产生真实侧滑而非仅改变视觉效果 | 通过 | 普通/漂移路径差、车头与运动分离、直线入漂无侧滑 |
| vehicle-handling | 退出漂移平滑恢复抓地 | 通过 | 退出一物理步保留夹角、连续位移、低速收敛与松手停稳 |
| vehicle-handling | 转向减速由意图夹角决定并在九十度封顶 | 通过 | 免损角、45°、90°/120°/180°同强度、无输入不用旧目标 |
| vehicle-handling | 漂移转向损失大于普通转向损失 | 通过 | 相同原始状态固定比较；满油门急转掉速 |
| vehicle-handling | 驾驶结果不依赖渲染帧率或后台累计时间 | 通过 | 30/60/120 FPS 十秒回放、暂停五秒不补算、100ms 长帧上限 |
| driving-playground | 提供一辆测试车与覆盖核心操作的验证场 | 通过 | `playground.spec.ts` 五区域实际指针行驶；对应区域截图 |
| driving-playground | 镜头固定方向跟随车辆 | 通过 | 浏览器转向与掉头时 camera.rotation=0，位置跟随和截图检查 |
| driving-playground | 静态障碍提供最小碰撞反馈 | 通过 | 最高速撞箱归零、不穿透、不反弹、沿面连续转向后脱离 |
| driving-playground | 拖尾反映实际漂移侧滑 | 通过 | 轮胎坐标、直线无痕、残余侧滑留痕、寿命和容量 |
| driving-playground | 重置恢复一致的初始驾驶状态 | 通过 | 三视口漂移中重置、方向/历史/输入/胎痕清除、旧触点失效并可重新起步 |
| driving-playground | 验证模式支持观测与受控调参 | 通过 | 默认隐藏、显式打开、真实状态观测、非法拒绝、合法应用重置、恢复默认 |
| driving-playground | 第一阶段验收保留可复查结果 | 未执行 | 自动化和浏览器记录已建立；规范要求的真实手机人工驾驶尚未执行 |

## Replay Results

场景：无障碍的大边界场地，使用实际 `stepInWorld`、固定时钟、时间戳输入和胎痕链路。输入时间轴覆盖半速直行、满速直行、普通转向、两段漂移、退出恢复和松手，完整数据见 [replay.json](evidence/replay.json)。

| 渲染 FPS | 物理步数 | 相对 120 FPS 位置差 | 速度差 | 车头角差 | 运动角差 |
| --- | --- | --- | --- | --- | --- |
| 30 | 1200 | 0 | 0 | 0° | 0° |
| 60 | 1200 | 0 | 0 | 0° | 0° |
| 120 | 1200 | 0 | 0 | 0° | 0° |

容差为位置 ≤0.012 世界单位（车长 1%）、速度 ≤0.06 世界单位/秒（Vmax 的 0.5%）、两种角度各 ≤0.5°。三个回放最终位置均为 (61.84231487476949, 20.015942448446953)，松手后速度 0，车头与运动方向均为 -0.5 弧度；差异均为零。

### vehicle-physics-1 网页接入回放

`npm run validation:replay` 使用实际 `stepInWorld`、核心固定 `1/120` 外步和三类输入阶段（直行、普通转向、持续漂移、退出、松手），为十个 profile 分别运行 10 秒，并以 30/60/120 FPS 驱动同一固定时钟。每个车型的报告位于 `evidence/vehicle-physics-1/<profileId>/<profileRevision>/replay.json`，汇总见 [replay-summary.json](evidence/vehicle-physics-1/replay-summary.json)。三种渲染帧率的最终位置、速度、车头、运动方向、路线率、前轮滑速和横摆差异均为 0，报告使用 `vehicle-physics-1`、`vehicle-profile-1`、`vehicle-surface-1` 和 `driving-playground-2` 元数据。

## Command Results

| 命令 | 状态 | 本轮结果 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | 最终客户端和测试 TypeScript 检查成功 |
| `npm run test -- --run` | 通过 | 14 个文件、88 项测试通过；包括核心接入、长车碰撞、四轮胎痕、快照和十车型合同 |
| `npm run test:e2e` | 通过 | 21 项通过；覆盖三个视口的驾驶、输入中断、碰撞、重置、十车型切换、三路面快照和验证面板 |
| `npm run build` | 通过 | Vite 静态构建成功；JS 54.86 kB（gzip 20.65 kB）、CSS 5.98 kB（gzip 2.15 kB） |
| `npm run validation:replay` | 通过 | 十车型各执行 10 秒 30/60/120 FPS 链路回放，位置、速度、车头、路线、前轮和横摆差异均在容差内 |
| `openspec validate validate-driving-prototype --strict --no-interactive` | 通过 | `Change 'validate-driving-prototype' is valid` |

最终命令回归执行时间约为 2026-10-30 22:44～22:46（Asia/Shanghai）。修复或调整测试过程中发现的情况均已回归，当前无尚未解决的自动化失败。`git diff --check` 无空白错误。

## Browser Evidence

- 三视口交互截图：[320×568](evidence/320x568.png)、[360×640](evidence/360x640.png)、[390×844](evidence/390x844.png)。
- 区域实际行驶截图：[直道](evidence/region-straight.png)、[缓弯](evidence/region-gentle.png)、[急弯](evidence/region-hairpin.png)、[连续弯](evidence/region-slalom.png)、[开放区](evidence/region-open.png)。
- 截图由交互测试在驾驶之后生成；测试还断言位移、侧滑、输入、碰撞、重置和镜头状态，截图单独不作为交互验收。
- 浏览器碰撞回归从木箱左侧以最高速度进入接触面，再持续向上推杆，确认车体离开箱体上沿（y<9.5）；完全阻挡的边界角落不提交原地旋转。

## vehicle-physics-1 Integration Evidence

当前网页消费者使用同一核心状态和 profile，入口快照带有 `modelVersion=vehicle-physics-1`、`profileSchemaVersion=vehicle-profile-1`、`surfaceVersion=vehicle-surface-1`、`sceneVersion=driving-playground-2`。十个车型的验证模式切换会从 (-11,19)、车头 -90° 的一致出生状态重置；每个 profile/修订目录保留 `snapshot.json` 和 `browser.png`，旧 `evidence/` 根目录的 baseline 文件未覆盖。

| 接入项 | 状态 | 证据 |
| --- | --- | --- |
| 核心状态与无碰撞场景结果一致 | 通过 | `tests/unit/vehicle-integration.test.ts`，同一 Intent 的位置、世界速度、车头、横摆、前轮、漂移和能量完全相同 |
| 十车型输入映射与选择 | 通过 | `tests/unit/vehicle-web-adapter.test.ts`、`tests/e2e/vehicle-upgrade.spec.ts`；R/2、R、外拉漂移、后向和十个 profile 均验证 |
| 自动反打、连续漂移和退出 | 通过 | 核心状态的 `delta`、`h`、`beta`、`r` 与验证面板观测；接入不清除物理过渡 |
| 长车碰撞与切向脱离 | 通过 | `tests/unit/vehicle-scene-upgrade.test.ts`、三视口 Playwright；使用核心几何保守半径，碰撞停车清动态历史，切向输入可起步 |
| 四轮、阿克曼角和接地点胎痕 | 通过 | `src/render/canvas.ts`、`src/scene/trails.ts` 及场景单元测试；低速几何转弯不留痕、历史有 6 秒/1600 段上限 |
| 三路面和固定方向场景 | 通过 | `WORLD.surface`、`PRACTICE_AREAS`、`driving-playground-2`；干硬路/松散地/湿滑地均通过采样测试 |
| 完整重置与快照 | 通过 | `vehicle-snapshot.test.ts`、隐藏恢复和重置 Playwright；拒绝旧版本与派生字段注入 |
| 真机人工驾驶 | 未执行 | 见下一节，未收到设备与体验结果前保持 6.3/6.4 未完成 |

## Phone Evaluation

设备型号：待用户填写；系统版本：待用户填写；浏览器及版本：待用户填写；参数：默认 `sports-car`、`vehicle-physics-1`、`vehicle-profile-1`、`vehicle-surface-1`；驾驶人员与日期：待用户填写。

| 手机人工检查项 | 状态 | 待记录内容 |
| --- | --- | --- |
| 普通满油门保持 | 未执行 | 缓冲行程是否足够、是否误入漂移 |
| 主动进出漂移 | 未执行 | 全方向可触达性、收回退出是否可控 |
| 侧滑可控性 | 未执行 | 车头与路线是否易理解、恢复抓地是否突兀 |
| 小幅修正保速 | 未执行 | 零死区抖动、免损角内操控、精细低速是否舒适 |
| 连续弯 | 未执行 | 进漂与退出衔接、路线可读性、是否失控 |
| 碰撞后脱离 | 未执行 | 正面贴墙后连续侧向转弯耗时是否可接受 |
| 浏览器体验 | 未执行 | 工具栏伸缩、真实安全区、中断恢复、性能和不适 |

同一局域网手机打开 `http://192.168.7.54:5173/`，按 [驾驶说明](../../../docs/DRIVING.md) 驾驶默认跑车、重卡和拉力车，并填写设备、版本、车型结果、误触与不适。调参后记录新版本，并重跑受影响的单元/浏览器检查；完成前不勾选当前任务 6.3，不声称整体验收通过。

## vehicle-physics-1 Documentation Status

本节对应当前网页接入，不能把前文 baseline-1 历史结论当作新版证据。

| 文档要求 | 状态 | 证据/限制 |
| --- | --- | --- |
| 驾驶说明加入前轮带动、侧滑、自动反打、回正、碰撞和完整重置 | 已实现并核对 | [DRIVING.md](../../../docs/DRIVING.md) 与网页帮助说明路线意图、前轮、自动反打、三路面、十车型和重置 |
| 几何圆、普通对齐、反打初态入口 | 已实现参考区 | `PRACTICE_AREAS` 绘制固定参考区；固定转角仍只在核心验证入口使用，不进入普通玩家流程 |
| README、项目总览、技术路线同步 | 已完成文档同步 | [README](../../../README.md)、[项目总览](../../../docs/PROJECT_OVERVIEW.md)、[DRIVING](../../../docs/DRIVING.md)、[VEHICLE_PHYSICS](../../../docs/VEHICLE_PHYSICS.md)、[VEHICLE_PROFILES](../../../docs/VEHICLE_PROFILES.md) 和 [接入清单](../../../docs/VEHICLE_PHYSICS_INTEGRATION.md) 已写明模型选择、模块、入口、兼容和局限 |
| 参数版本与兼容规则 | 已实现并核对 | [PARAMETERS.md](../../../docs/PARAMETERS.md) 记录 baseline-1、vehicle-physics-1、vehicle-profile-1、vehicle-surface-1 的边界；网页面板使用 `validateProfile/applyProfile` 原子应用 |
| 研究来源与游戏近似边界 | 已记录 | 文档链接 Bicycle Model、CommonRoad、Stanford 漂移控制和 Project Chrono，并明确不做实车标定 |
| 新版回放、轨迹、观测和截图 | 已执行 | `evidence/vehicle-physics-1/<profileId>/<profileRevision>/` 保留十车型快照、截图和回放；旧 `evidence/` 和 `replay.json` 保持历史不覆盖 |
| 新版手机实测 | 未执行 | 无设备型号、系统和浏览器版本；任务 6.3 保持未完成 |

新版完成条件是：先实现并测试权威速度向量/横摆/前轮状态，再生成带 `modelVersion` 和 `parameterVersion` 的新版证据；不能用当前 `baseline-1` 截图、回放或速度观测替代轴几何、轮胎力和反打证据。

## Documentation Synchronization

文档任务 5.6 的入口核对已执行。使用临时输出目录运行 `npm run physics:benchmark -- physics-doc-check-20261031` 和 `npm run physics:audit -- physics-doc-check-20261031`，结果为：`modelVersion=vehicle-physics-1`、`benchmarkVersion=vehicle-benchmark-1`、`profileSchemaVersion=vehicle-profile-1`、`surfaceVersion=vehicle-surface-1`、`runId=f89663035784`、`passed=true`；审计确认 10 个车型、7 对差异和 18,420 个轨迹采样点，且 baseline 历史证据未修改。临时目录不作为本变更的新版场景证据；新版网页截图、接入回放和手机证据仍按任务 5.5/6.1/6.3 的版本化路径生成。

文档交叉检查覆盖 README、项目总览、驾驶说明、参数说明、车辆物理说明、车型说明和接入清单。所有入口都区分 `baseline-1` 历史网页记录与 `vehicle-physics-1` 当前网页/独立核心，明确十车型、干硬路/松散地/湿滑地三路面、两变更职责以及长车碰撞、前轮、自动反打和真实手机验收仍属于接入任务。

## Open Issues

- 无真实手机驾驶证据，整体验收未完成。
- 默认规则在正面贴住障碍时每步碰撞归零，侧向转弯脱离较慢；浏览器中可脱离，手感是否可接受需实机评估。任何调校均需保留“碰撞归零”和“完全阻挡不原地旋转”的规则。
- 本轮为 Windows Edge 自动化，无 iOS Safari、Android Chrome 真机兼容性或流畅度结论；真实手机结果待 6.3。
