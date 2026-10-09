# CHANGELOG — burn-my-windows@local

Personal maintenance fork of [Burn My Windows](https://github.com/Schneegans/Burn-My-Windows) by
Simon Schneegans, frozen at upstream **v48** and imported at `16ab10a`. This file records only
deviations I introduced after that import.

Coverage: 16ab10a..HEAD
Check with `npm run check:log`. Entries are `D-###`, monotonic, never reused.
An entry states what was true **as of its commit**, not current state: old entries are not
re-verified, and aggregate counts live in the checker's output, never in this file.

> **How these were written.** `Symptom` / `Change` are compressed from the commit subject plus the
> state of the touched file at HEAD; diffs were not re-read one by one. `Evidence` names a test only
> where that suite was re-run in the session that wrote the entry (`npm test`, 29 pass at adoption);
> everything else is `L?`. Commit subjects carry audit numbers (P1-1, A3 …) — those are the
> maintenance ledger's ids, kept here verbatim so the two can be cross-read.

`kind` uses six values: `fix` / `perf` / `taste` / `guard` / `revert` / `chore`. `perf` is kept
apart from `fix` because throughput work is not correctness work; `chore` exists for cleanups that
carry **neither** obligation — see `MAINTENANCE.md` §13 for issues that are known and deliberately
not fixed, which are not recorded here at all.

---

### D-001 · 2026-09-22 · fix · v48
Symptom  `changed::active-profile` 处理器在 disable 后仍挂在 settings 上，重复 enable 会累积
Change   disable 时断开该处理器
Evidence L0 本轮重跑 `npm test`（patch-symmetry：`enable() then disable() leaves the shell exactly as it found it`）
Cost     与 D-008 是同一类"处理器累积"，两处都要守住
Commit   37eb5f8

### D-002 · 2026-09-22 · fix · v48
Symptom  `_doEnable()` 中途抛错时留下半启用状态，之后既不能正常用也不能干净退出
Change   抛错路径上回收已建立的部分状态
Evidence L?
Cost     与 D-001、D-003 同一条 enable/disable 契约
Commit   3d2a107

### D-003 · 2026-09-22 · fix · v48
Symptom  迁移回调是异步的，`disable()` 之后仍会落地并写回已被释放的对象
Change   回调执行前守卫"是否已被 disable"
Evidence L?
Cost     与 D-007 的 profile 迁移去重要一起看；异步续体未守卫是本仓反复出现的缺陷类
Commit   3223773

### D-004 · 2026-09-22 · perf · v48
Symptom  延迟启用等 4000ms，登录后长时间没有动画效果
Change   缩短到 1000ms
Evidence L?
Cost     这是在"启动期别被拖慢"与"早一点可用"之间取值；改回大值会让 P0 一类的启动问题重新出现
Commit   2830ac4

### D-005 · 2026-09-22 · fix · v48
Symptom  UPower 不可用时直接抛错，整扩展进入失败状态
Change   改为容忍缺失（无守护就走无约束档）
Evidence L?
Cost     与 D-013 / D-022 是同一条电源档位判定链，三处必须一致
Commit   7323459

### D-006 · 2026-09-22 · chore · v48
Symptom  `getUIDir`、`Shader._time`、`mushroom-8bit` 已无引用仍在树里
Change   删除死代码与已停用的特效
Evidence L0 本轮重跑 `npm test`（effect-registry：`all eight registration points hold the same 26 effects`、`enable switches and shaders are a bijection`）
Cost     无行为变化；但注册点数量是 effect-registry 的判据，删特效必须八处同批
Commit   26dfe07

### D-007 · 2026-09-22 · fix · v48
Symptom  特效里有两处潜在崩溃（当时未复现，代码可读出来）
Change   加固这两处
Evidence L?
Cost     潜在崩溃没有测试能证，只能靠读；别把它当成"已被用例覆盖"
Commit   3169475

### D-008 · 2026-09-22 · fix · v48
Symptom  重复加载 profile 时信号处理器不断累积，一次动画触发多个回调
Change   停止累积
Evidence L0 本轮重跑 `npm test`（patch-symmetry / sentinel-drift 的收支对称断言）
Cost     与 D-001 同一类；累积的特征是"第一次没问题"，所以必须走重复路径才测得出
Commit   0691b34

### D-009 · 2026-09-23 · fix · v48
Symptom  纹理绑定回调里 pipeline 可能为 null，直接访问会抛
Change   加 null 守卫
Evidence L?
Cost     只在特定帧/特定特效下触发，L2 未验证
Commit   5b1fd8d

### D-010 · 2026-09-23 · guard · v48
Symptom  扩展全部生存能力压在 shell 私有接口上，一旦上游改名，失效是静默的
Change   引入私有 API 哨兵（probing，只告警不拦截）
Evidence L0 本轮重跑 `npm test`（sentinel-drift：`every patched method is also watched by the sentinel`、`the three probe families still hold what they hold today`）
Cost     哨兵的判据是"能被人为触发一次"，不是"跑绿"；删哨兵等于把升级期的盲区请回来
Commit   f4cba97

### D-011 · 2026-09-23 · perf · v48
Symptom  每次判定电源档位都重新向 UPower 取值
Change   缓存 UPower 结果
Evidence L?
Cost     缓存要有失效边界，否则档位变化后不会响应（与 D-005 / D-022 的守护缺失语义联动）
Commit   f4cba97

### D-012 · 2026-09-23 · perf · v48
Symptom  着色器首次使用时才编译，第一次动画明显卡
Change   空闲期预热着色器
Evidence L?
Cost     预热的代价与收益本仓有实测记录（`docs/maintenance/measurement.md` §12，与 D-031）；它是否在启动期编译 GLSL 曾待确认
Commit   f4cba97

### D-013 · 2026-09-23 · fix · v48
Symptom  UPower 守护缺失时，受约束的电源档仍然匹配上，等于档位形同虚设
Change   守护缺失时不再匹配受约束档
Evidence L?
Cost     与 D-005、D-022 同一条链，D-022 是它的 P1-1 复审版本
Commit   2b33e53

### D-014 · 2026-09-23 · perf · v48
Symptom  已启用特效的枚举每次动画都重算
Change   改为按 profile 缓存而非按动画
Evidence L0 本轮重跑 `npm test`（effect-registry 的双射与八注册点断言保证缓存没把集合改小）
Cost     缓存失效点必须与 profile 变更同步
Commit   21de887

### D-015 · 2026-09-23 · perf · v48
Symptom  特效预设每次 widget realize 都重建
Change   每次 realize 只构建一次
Evidence L?
Cost     若日后允许运行时改预设，这条缓存要加失效路径
Commit   a8d952f

### D-016 · 2026-09-23 · fix · v48
Symptom  概览清理 clone 字段时不看归属，会把别的 clone 正在用的字段清掉
Change   只清属于自己 clone 的字段
Evidence L?
Cost     跨 clone 互相踩状态是典型的"绿了还看不见"，回归要靠多窗口并行才暴露
Commit   ba17312

### D-017 · 2026-09-23 · fix · v48
Symptom  迁移被重试时 profile 会被重复追加
Change   重试不再产生重复 profile
Evidence L?
Cost     与 D-003 同一条异步迁移路径
Commit   bd1d45d

### D-018 · 2026-09-23 · perf · v48
Symptom  启用走延迟路径，登录到可用之间有一段无动画窗口
Change   改为同步启用，失败时退回延迟重试
Evidence L?
Cost     **P0 类改动的风险方向**：主线程同步工作一旦变重就会拖坏启动。这条必须配合 MAINTENANCE §0 的速查判据复核，不能只看效果对不对
Commit   c9bf43b

### D-019 · 2026-09-23 · fix · v48
Symptom  `meta_window` 可能为 null，访问即抛
Change   加 null 守卫
Evidence L?
Cost     与 D-009 同一类"取窗口对象前先判空"
Commit   038c903

### D-020 · 2026-09-23 · guard · v48
Symptom  电源档位取样的时机与来源没有记录，读数无法解释自己
Change   在代码里写明 power-state 采样方式（同笔提交的行为半边见 D-019）
Evidence L?
Cost     纯文档面；删掉它不会坏，只会让下一次误读变得可能
Commit   038c903

### D-021 · 2026-09-23 · chore · v48
Symptom  注释与别名书写不一致
Change   统一注释与别名
Evidence 不适用（无行为变化）
Cost     无义务也无损失；升级时不构成任何判断依据
Commit   ec656c7

### D-022 · 2026-09-24 · fix · v48
Symptom  P1-1：电源档位守护缺失时受约束档仍误匹配（D-013 的复审收口）
Change   修正匹配条件，使守护缺失时只走无约束档
Evidence L?
Cost     判据来自审计编号 P1-1；改这条要重跑档位矩阵（`docs/maintenance/compat-matrix.md` §6 的 8 处兼容分支）
Commit   c15a7a1

### D-023 · 2026-09-24 · chore · v48
Symptom  P3-1：三处注释描述与 GNOME 50 的实际行为不符
Change   按实测纠正注释
Evidence L?
Cost     错误注释比没有注释更贵——它是下一次误判的来源
Commit   52dbe48

### D-024 · 2026-09-24 · perf · v48
Symptom  `common.glsl` 每个特效实例都解码一次，预热一轮 1977µs
Change   每进程只解码一次，降到 448µs（省 77%）
Evidence L?
Cost     实测数字来自该次测量；换 GNOME 版本后要重量，不要沿用这里的值
Commit   3ae5a8e

### D-025 · 2026-09-24 · perf · v48
Symptom  `_warmShaders` 重复做 26 次同步读
Change   复用 `enabledEffects`，N=20 时省 1.36ms
Evidence L0 本轮重跑 `npm test`（effect-registry 保证复用集合仍完整）
Cost     同上：数字是当时测的
Commit   47170d0

### D-026 · 2026-09-24 · guard · v48
Symptom  P1-2A：哨兵漏掉运行期私有 API 中"静态就能查出来"的那部分
Change   补齐静态可查部分
Evidence L0 本轮重跑 `npm test`（sentinel-drift：`the patch list matches the originals enable() captures`、`sentinel holders agree with the patch targets`）
Cost     哨兵清单与补丁清单必须同步增删，单边改会立刻被 sentinel-drift 弄红
Commit   d396d31

### D-027 · 2026-09-24 · guard · v48
Symptom  P1-2B：`WindowPreview` / `Workspace` 的实例字段没有被哨兵看着
Change   补齐实例字段哨兵
Evidence L0 本轮重跑 `npm test`（sentinel-drift：`the instance-field probe cannot touch the object it inspects`）
Cost     同 D-026；实例字段是运行期才有，静态测试只能证明"探针写对了"，不能证明"上游没改"
Commit   a58f3d6

### D-028 · 2026-09-24 · fix · v48
Symptom  P3-2：`_doDisable()` 不释放 `_shellSettings`，每轮 enable/disable 泄漏一个对象
Change   一并释放
Evidence L0 本轮重跑 `npm test`（patch-symmetry 的 enable/disable 收支对称）
Cost     泄漏属正确性问题，不按 perf 记
Commit   a83df30

### D-029 · 2026-09-24 · perf · v48
Symptom  profile 匹配的约束在每次动画里重复求值，N=20 时每次动画 454µs（占一帧 2.72%）
Change   约束预编译，降到 1µs
Evidence L?
Cost     这是热路径；数字是当时实测，升级后重量
Commit   b8369df

### D-030 · 2026-09-24 · fix · v48
Symptom  P1-3（审计外新发现）：end-animation 触碰已 dispose 的窗口 actor
Change   结束动画路径不再访问已销毁 actor
Evidence L?
Cost     访问已 dispose 对象在 GJS 里是运行时错误而非静默无效；这条只在动画被打断时触发
Commit   fdb2fcb

### D-031 · 2026-09-25 · chore · v48
Symptom  A3：「预热是否编译 GLSL」长期挂在待确认，结论只存在于对话里
Change   用实测数据收敛该条并写进文档（动了 src/ 的注释）
Evidence L?
Cost     这条的价值在"下次不必重测"；数据过期后要重新量，不要直接引用
Commit   d581b3d

### D-032 · 2026-09-29 · guard · v48
Symptom  8 处 shell 补丁里，install 侧与 restore 侧的守卫不对称：一边有、一边没有
Change   install 与 restore 全部加守卫
Evidence L0 本轮重跑 `npm test`（sentinel-drift：`both sides of every patch are guarded`；patch-symmetry：`enable() never invents a method that upstream no longer has`、`disable() never leaves a stub behind for a dropped method`）
Cost     **半边守卫等于没有守卫**：不对称时恢复路径会把补丁永久留下
Commit   1cc6722

### D-033 · 2026-09-29 · guard · v48
Symptom  `prefs.js` 与 AuraGlow 的 `Gtk` / `Gdk` 导入未钉版本
Change   钉 `?version=4.0`
Evidence L0 本轮重跑 `npm test`（effect-registry：`both processes enumerate the same nicks`）
Cost     钉版本让 GNOME 大版本变化在加载期就炸，而不是静默走错分支
Commit   d9f22a7

### D-034 · 2026-10-09 · fix · v48
Symptom  issue 335 的 resize 分支只调用原始 `ease()` 而不摘掉覆写（上游刻意让它继续待命），于是下一次接管从 `actor.ease` 读到的"原始方法"其实是上一个闭包：每次接管多链一层闭包，各留住一个特效对象与其 profile 的 `Gio.Settings`；残留闭包还会在补丁主动让路的那次动画上凭空创建特效；`disable()` 之后它若再被触发，就在 `this._settings` 已为 null 时抛 TypeError，令 `_destroyWindowDone` 不再执行
Change   原始 `ease()` 记在 `actor._bmwEaseOriginal` 上复用，不再读回自身；`_doDisable()` 遍历 window actors 回收待命覆写（只读自己的 expando，不碰已 dispose 的 GObject）；resize 分支透传 `ease()` 返回值并计数
Evidence L0 本轮重跑 `npm test`（patch-symmetry 新增 `a resize fallthrough keeps the override pending but does not grow a chain`、`a delegated animation is not retroactively burned by an old closure`、`disable() takes back an ease() override that is still pending`；三条分别用「改回读 `actor.ease`」「删掉 `return`」「不遍历 actor」注入缺陷验出红）
Cost     这三条路径此前没有任何门走过（`else` 分支与 disable 之后的闭包都是）。`_easeFallthroughs` 计数是为回答"GNOME 50 / Wayland 上这条到底走不走"，量完可撤
Commit   b174f69

### D-035 · 2026-10-09 · fix · v48
Symptom  首个动画若撞上 logind / UPower 的启动竞态，`_upowerProxyChecked = true` 已在尝试之前置位且失败不再重试：`_upowerProxy` 整段会话为 null，`powerMode` 恒为 2，约束为"仅电池"的 profile 静默永不匹配，只有重新登录能恢复
Change   构造拆成 `_tryUpowerProxy()` / `_tryPowerProfilesProxy()`；失败安排 30 s、最多三次的低优先级重试，且只在扩展仍启用时构造；动画热路径在失败之后不再有任何同步总线调用（重试调用幂等）；`_doDisable()` 取消定时器并清掉尝试锁，使 re-enable 能自己重头尝试
Evidence L0 本轮重跑 `npm test`（`test/proxy-retry.test.mjs` 6 条：切出 5 个方法跑在 mock Gio / GLib 上，未修代码 / 不安排重试 / 去掉上界 / 删掉取消 / 热路径重建 / 去掉 `_settings` 守卫 六种注入各自验出红）；L1 探针 04 与 06 重跑 17 + 20 checks 全 PASS，CRITICAL 0
Cost     缺席服务（台式机）上多至三次低优先级构造；90 s 窗口后放弃。测试用 `sliceMethod()` 按花括号配对切方法体，跳过字符串与注释 —— 这条工具顺带服务于后续门
Commit   b38a1d0

### D-036 · 2026-10-09 · fix · v48
Symptom  `disable()` 只把 `_ALL_EFFECTS` 置空：每个 profile 条目都持有一份该列表的**过滤副本**加自己的 `Gio.Settings`，26 个特效对象连同 shader 池与已解码纹理在整段禁用期间仍可达；`_resources` 留着已注销 bundle 的 2.5 MB 映射，两个 D-Bus 代理与 `_windowPicker` 照旧挂着；`PickWindow()` 每次 D-Bus 调用新建一个 `LookingGlass.Inspector` 且两个 handler 永不解除 —— 点 N 次"选择窗口"就有 N 个 inspector 存活，每个都回答下一次拾取
Change   `_doDisable()` 释放 `_profiles`（空数组而非 null，让迟到读取降级为"不匹配"而不是抛异常）、`_resources`、两个代理、`_windowPicker`，`_killEffectsSignal` 断开后置零；`WindowPicker` 改成一个导出周期一个 inspector，`unexport()` 断开两个 handler 并交还对象
Evidence L1 探针 04 本轮重跑 25/25（原 19，新增五条释放断言 + 一条 inspector 复用；沙箱里 LookingGlass 可用，未走 skip）。注入缺陷各自验红：删掉全部释放语句 → 20/25，改回每次新建 inspector → 24/25
Cost     `_windowPicker` 置 null 后 re-enable 会重建 picker 并重新 `export()` 同一条对象路径 —— 上游这条路径曾因为重复导出而抛 "An object is already exported"（探针 04 的注释记着），本轮 `reenabled` 仍然 PASS，说明重建顺序是对的
Commit   cb06fa8

### D-037 · 2026-10-09 · fix · v48
Symptom  `_warmedNicks.add(nick)` 在 `try` 之前、`catch (_e) {}` 不写日志：一次着色器被驱动拒绝就把该特效永久登记为"已预热"，从此不再重试，日志里查不到任何痕迹，而池子会在真正的动画路径上现建该着色器（正是预热要避免的 ~1.1 ms 卡顿）
Change   只有成功才登记 `_warmedNicks`；失败按 `[burn-my-windows@local]` 前缀 + nick 警告一次，下一次 profile 重载重试；本次运行内的跨 profile 去重改用局部 `queued` 集合
Evidence L0 本轮重跑 `npm test` 46/46（新增 `test/shader-warmup.test.mjs` 5 条：成功不重复 / 一个失败不结束队列 / 失败不登记且重试且有日志 / 同特效两 profile 只建一次 / 禁用后的源自退；「失败也登记」「仍然静默」「失败即结束」「去掉去重」四种注入各自验出红）；L1 探针 02 重跑 10/10，CRITICAL 0
Cost     同一条提交把 `sentinel-drift` 的"恰好 5 处 warn"改成"任何 warn 都带前缀"的无边界不变式 —— 计数门在面对正当的新日志行时只会逼人删门。失败重试的代价是每次 profile 重载再试一次，不在动画路径上
Commit   78e5c47

### D-038 · 2026-10-09 · chore · v48
Symptom  `extension.js` 的电源采样注释宣称"轮询是故意的，为避免常驻 D-Bus 订阅"，`docs/maintenance/measurement.md` §12 记着"动画路径总线｜无约束 profile：0 次" —— 两条都是写下的而不是量出的
Change   注释改成实测结论并注明条件；探针 05 增加 `easeFallthroughsNatural` 观测（本条不改行为）
Evidence gjs 1.88 直接实测（同一个 `makeProxyWrapper` 调用路径 + 仓库里那份接口 XML）：代理 `flags == 0`（`G_DBUS_PROXY_FLAGS_NONE` ⇒ GIO 自己保留 PropertiesChanged 订阅维持缓存），50 次 `OnBattery` 读共 **634 µs**（≈13 µs/次）；shell 内同结论：探针 06 `constrainedChooseUs 3299 / 70 / 28`。探针 05 本轮重跑 5/5，`easeFallthroughsNatural = 0`（26 个真窗口各开合一次）
Cost     `docs/maintenance/measurement.md` §12 那行在字面上不成立（首个非预览动画会构造代理，沙箱 135 µs），读取本身是本地缓存 —— 留给阶段 D 按本节改写。**据此不改代码**：13 µs 可忽略，把 `:909` 改成懒算只会在每次动画多扫一遍 profile。同时 D-034 那条分支的严重性由"当前故障"降为"潜在正确性"：GNOME 50 / Wayland 的 headless mutter 上普通窗口流量一次也没走到它
Commit   1bfb768

### D-039 · 2026-10-09 · fix · v48
Symptom  `Main.wm._waitForOverviewToHide` 只要扩展启用就被替换成"立刻返回"，与有没有特效无关 —— 把所有开关都关掉的用户拿不到原生行为，窗口会在概览还在退场时 map
Change   改为按调用判断：`_anyEffectEnabled()` 读 `_loadProfiles()` 已缓存的 `enabledEffects`（每次调用不碰设置）。判断放在调用时而非 `enable()` 时，因为启用集合是在偏好窗口里改的，扩展全程保持启用
Evidence L0 本轮重跑 `npm test` 49/49（`patch-symmetry` 新增 3 条：全关让路 / 有特效仍跳过（反向对照） / `_anyEffectEnabled` 的缓存语义；「恒不让路」「`some`→`every`」「恒返回 false」三种注入各掉 1 条）；L1 探针 01 13/13、03 **27**/27、04 25/25、07 3/3，CRITICAL 0，零写入三哈希不变
Cost     **这是一次可感知的行为变化**：全关时窗口 map 时机回到原生（等概览退场）。若用户偏好原来的"永远不等"，回退本条即可，判据与守卫都在测试里
Commit   16a67db

### D-040 · 2026-10-09 · guard · v48
Symptom  `MAINTENANCE.md` 一份 493 行的文件同时是 runbook（改之前跑什么、日志怎么读、怎么回滚）和三块长期资产（哨兵清单 / 兼容分支矩阵 / 观测判据与基线）。资产在 GNOME 大版本升级后被就地改写，"先跑什么"跟着一起漂。散文没有编译器：节号搬了家，`AGENTS.md`、本文件、探针注释里的 `§N` 引用照常存在、照常读起来像有依据，实际指向的只是一行路由
Change   三块资产拆为 `docs/maintenance/` 三页，`MAINTENANCE.md` 降为路由：§0–§4 / §9 / §11 / §13 留正文，其余六节各留一行指针（§5 / §7 / §10 → `docs/maintenance/shell-internal-api.md`，§6 → `docs/maintenance/compat-matrix.md`，§8 / §12 → `docs/maintenance/measurement.md`），§1 的 06–07 方法学小节一并跟去 —— **节号沿用原编号不重排**。新增 `test/docs-links.test.mjs`（8 条）：markdown 相对链接与 `#锚点` 可达、`§N` 解析到它声称的文件且那里的标题不是路由行、移动过的节不得再按旧家（`MAINTENANCE.md` + `§N`）引用、每节恰好一行指针、移动内容在新文件**且**不在旧文件
Evidence L0 `npm test` 57/57、`npm run check`、`npm run check:log` 全绿。搬运用逐行包含关系核对：新页与本文件共 51 行在旧文件里没有完全相同的形式，逐条确认为页首说明／路由行／`§N`→路径改写；旧文件有 9 行找不到孪生，同样逐条确认是这批改写，无一条是丢失的事实。变异在 `cp -a` 副本里做，工作树未受污染：整体移走 `docs/maintenance/` → 5 红（首条即"`compat-matrix.md` is missing"）；在 `AGENTS.md` 末尾追加一行旧家引用加一条断链 → 3 红（旧家引用、断链、两跳指针各掉一条）；每次还原后副本回到 57/57，`diff -q` 证明还原逐字节一致
Cost     路由把一次升级要读的三张表换成三次跳转，换来的是"引用能解析"成为机器判据。**门只保证解析，不保证语义**：把 `docs/maintenance/measurement.md` §12 的实测值改成假数字，门仍然绿 —— 数值真伪归 `docs/maintenance/measurement.md` §8 的判据纪律，那一条不在这里。节号不重排是这套结构的长期负债：任何"顺手重排"会让 `AGENTS.md`、本文件与探针注释里的引用一起错位，而门只会报"解析不到"，不会报"这个号原本指的是别的"
Commit   0ea8a29

### D-041 · 2026-10-09 · guard · v48
Symptom  文档路由门在自己新加的句子上误报：一句"§5 / §7 / §10 → `docs/maintenance/shell-internal-api.md`，§6 → `docs/maintenance/compat-matrix.md`"被判成后半句那一节不存在。原因是解析顺序与字符集两处：链式继承（"同一行的上一个引用"）被放在显式文件名之前，先抢走判据；`ATTACHED_BEFORE` 的粘连字符集里带着逗号与顿号，于是**前一句**的文件名能跨过逗号给下一个节号盖章 —— 后者更坏：一个属于上一句的路径可以给下一句的节号当依据，歧义写法被当成精确引用放行，而门存在的意义正是判据
Change   把单条引用的解析抽成 `targetOfReference()`：粘连的文件名（写在号前或号后）优先于链式继承，逗号与顿号不再是粘连字符 —— 跨着逗号的名字不再给后面的节号盖章，那个节号按裸引用处理，于是落到路由并被"那是路由行"拒掉。新增第 9 条单元判据，用两个可判别 fixture 分别钉住这两条规则，并保留三条控制断言（纯连接词仍然继承、裸节号仍然回落路由、粘连的路径不是文件时必须失败并报出那个 token）
Evidence L0 `npm test` 58/58。变异在 `cp -a` 副本里做，工作树未受影响：把继承分支挪回显式名字之前 → 1 红（新单元判据）；把逗号放回粘连字符集 → 2 红（新单元判据 + 真实 `CHANGELOG.md:300` 那条）；每次还原后 `node --test test/docs-links.test.mjs` 回到 9/9
Cost     收紧粘连让一种过去静默通过的歧义写法变成红，**改的是引用写法而不是门**：`§N` 必须紧挨它自己的文件名（`docs/maintenance/measurement.md` §12），不能被逗号隔开。嫌太严就回退本条，代价是"名字属于上一句"的引用重新变成不可判定
Commit   00906e9

### D-042 · 2026-10-09 · chore · v48
Symptom  `docs/maintenance/measurement.md` §12 的"最近一次完整认证"停在 2026-10-07 的 89 checks，`enable()` 那行还写着 5 ms / 30 ms，总线那行写"第一次 4.4 ms（沙箱内 3299 µs）"—— 括号里的微秒与毫秒本来就不自洽（3299 µs 是 3.3 ms）。这些数字是抄来的，不是这一轮量出来的
Change   把 `docs/maintenance/measurement.md` §12 换成 2026-10-09 那次认证的命令产出：7 探针 103 checks（01/02/03/04/05/06/07 = 13/10/27/25/5/20/3）、CRITICAL 0、零写入三哈希不变；`enable()` 6 ms / 35 ms；有电源约束的 `_chooseEffect()` 3191 / 89 / 29 µs；探针 07 begin/end 36/36 且 `outstanding` 1 → 0（原先写"首尾 outstanding 0"，现在把"收窄"这层判据说明白，因为判据是 `outstandingAtEnd <= outstandingAtStart`，不是相等）；全套耗时 3 分 24 秒，按 `$OUT` 产物时间戳跨度量得并注明量法
Evidence L1 `./test/headless/run.sh all` 在提交 `95cb463` 的干净树上跑完，`RESULT: PASS`、退出码 0；逐探针计数取自 `$OUT/*.json` 的 `checks` 对象而不是终端回显（本轮第一次因为把输出接了 `tail -60` 而丢了前三道门，只能从产物回读）。工作树在运行期间零改动，运行结束后才开始编辑
Cost     基线表里的绝对值只能在同一台机器上纵向比（判据见 `docs/maintenance/measurement.md` §8）。**本轮只换有出处的行**：没有重测的行留在原样，那不是它们错了，是它们还没被这一轮量过
Commit   e817c55

### D-043 · 2026-10-09 · guard · v48
Symptom  C1–C6 在 `extension.js` 里增删了行，于是仓库里每一处 `extension.js:` 行号引用一起错位：文档表格、探针注释和一条 `H.rec` 文本里的行号现在指向无关代码，而它们读起来仍然像证据。`src/WindowPicker.js` 因 C3 的改动同样失效。没有任何门看得见这件事 —— 文档路由门只判链接与节号能否解析
Change   机械重走每个锚点（脚本打印每条引用的目标行原文，逐条判定）：`src/Shader.js`、`src/utils.js`、`src/ShaderFactory.js`、`src/effects/Glide.js`、`src/migrate.js`、`prefs.js` 与各特效文件的引用本轮没有被改动过，核对为仍然正确；错位的是 `extension.js` 的四处（真位置 1006 / 1039 / 1105 / 1164 / 1264）、`src/WindowPicker.js`（真位置 56 / 65，另加 92 的 `closed` 处理器）和 `_preamble.js` 引的 `Shader.js:145`（读 `.width` / `.height` 的其实是 150 与 164）。**探针注释一律改成按符号定位**，行号只留在文档表格里；`docs/maintenance/shell-internal-api.md` §7 的 WindowPicker 行随之从"没有任何层覆盖"纠正为"半边覆盖"。AGENTS.md 收下这条规则与重走命令
Evidence 改动全部落在注释与一条 `H.rec` 文本上：**探针 diff 里没有任何一行含 `H.chk` 或 `H.metric`**（对 `git diff -U0 test/headless/probes/` 的输出做正则检查，零命中），检查点一个没动，因此不为此重跑 L1。四个被改的探针各过 `node --check`；L0 `npm test` 58/58、`npm run check`、`npm run check:log` 全绿；剩余的 `extension.js:` 引用只有两条，`grep` 回读确认它们指向 1164 与 1264
Cost     这条规则**没有门能守**：行号到符号的映射要靠人（或者一个本轮没写的解析器），判据就是那条 grep 加"打印目标行原文"的核对动作。写错的行号不会报错，只会伪装成证据 —— 这正是把它从注释里清出去的理由。回退本条不需要重跑任何测试，但注释会重新变成一次性用品
Commit   ff84a86

### D-044 · 2026-10-09 · guard · v48
Symptom  用户手册开始按编号引用私有 API 清单与回滚配方，但文档路由门对覆盖范围只有一条整体要求（"至少 20 条节号引用"）。README 被 walk 跳过时它照样绿，于是这两处新引用处于无人看管状态
Change   在节号解析那条门里加正向存在断言：README.md 与 README.zh-CN.md 必须在 markdown walk 里，且各自至少有一条节号引用被解析过
Evidence `npm test` 58/58。两条断言都是"必须存在"的正向形式，所以 walk 一旦退化（目录被排除、正则失配）就变红，而不是安静地少扫一个文件。README 里现在被扫到的引用是 [`docs/maintenance/shell-internal-api.md`](docs/maintenance/shell-internal-api.md) §5 与 [MAINTENANCE.md](MAINTENANCE.md) §9
Cost     这是**覆盖范围**的断言，不是内容正确的断言：它保证 README 被扫，不保证手册写的界面语义与 GNOME 一致。后者本轮是靠逐条回读代码得到的，见 D-045
Commit   c8fb37f

### D-045 · 2026-10-09 · chore · v48
Symptom  README 的偏好设置一节只列控件名，没有说明配置档是**怎么被挑中**的。用户看得见六个下拉项，却看不出四条会直接改变观感的行为：应用名要整串相等、电源配置档在守护进程缺失时**不会**命中而电源模式会读成"外接电源"、预览只在窗口打开时播、测试模式把动画钉在 8000 ms。故障排查同样无处可查：改了 `.js` 没反应、动画完全不播、电源规则像是被无视、日志分两个进程
Change   双语 README 补两件事。偏好设置一节写明挑选机制：约束全 AND，优先级算出来（高优先级开关 +100、写了应用 +10、其余每个非"任意"的约束 +1），命中后从**已启用**特效里随机取一个，没有命中或一个都没启用就走原生动画，且只有普通窗口与对话框会有特效；再逐项列出每个下拉在比什么。新增故障排查一节：模块缓存与注销重登、动画不播的四步排查、两条电源降级是写好的行为、两条 journald identifier 与三类告警各意味着什么、重置顺序是先复制 `~/.config/burn-my-windows` 再 `dconf reset -f`。偏好设置整节移到"使用"之后，中英章节数与顺序保持镜像
Evidence 每条说法都回读实现：`_chooseEffect()` 的约束链与两处电源降级、`ProfileManager.getProfilePriority()` 的加分、`_setupEffect()` 的 `duration = testMode ? 8000 : …`、schema 里 26 个 `-enable-effect` 只有 `fire-enable-effect` 默认 `true`（脚本数过）、预览由**下一次**窗口关闭清除（探针 03 的既有断言）。dconf 路径与 profile 文件名在本机回读确认（`dconf dump /org/gnome/shell/extensions/burn-my-windows/` 有 `active-profile`，profile 是 `~/.config/burn-my-windows/profiles/<微秒>.conf`）。L0 `npm test` 58/58，双语章节数一致由 `test/repo.test.mjs` 判
Cost     文档写的是**当前实现的语义**，其中"约束全 AND""优先级算法"来自上游设计，本 fork 只改了电源分支的降级判定。**没有承诺任何还没做的东西**：单档重置按钮与一键恢复默认都不存在，所以文中明说"目前没有"。若阶段 B 加了重置入口，这一节必须同步改写
Commit   a6d792f

### D-046 · 2026-10-09 · fix · v48
Symptom  `fillPreferencesWindow()` 里那段"在偏好窗口内部动手"的控件树手术逐条解引用查找结果：`header.pack_start(...)`、`clamp.get_parent()`、`viewport.get_parent().set_policy(...)`。那棵树不是 API，libadwaita 插一层容器就返回 null —— 而抛异常发生在对话框构建期间，后果是用户打不开**唯一能关掉这个扩展的窗口**。它跑在 prefs 进程里，shell 侧的 L1 探针结构上看不见
Change   先证明搬运不改行为，再谈守卫：原语句**逐字**搬进 `_installWindowChrome(window)`，标题栏与配置档编辑器两半各自判空、互不牵连，失败各写一条带 `[burn-my-windows@local]` 前缀的 warn 并继续装另一半
Evidence 新增 `test/prefs-window-chrome.test.mjs`（5 条）：跑**真的** `_findWidgetByType` 递归遍历与一棵可迭代的 mock 控件树。第一条"健康树两半都装上"在逐字搬运之后就已经绿，那正是它存在的理由（证明重构没改行为）；其余三条各缺一样东西（无 HeaderBar / 无 Clamp / viewport 没有上层 scroller），要求只掉对应那一半、不抛、且另一半仍然装上；第五条要求 prefs.js 的每条 `console.warn` 都带前缀。先红后绿：搬运完、尚未加守卫时 4 条红（TypeError 与"0 条 warn"）
Cost     守卫把"崩溃"换成"降级 + 一条 warn"，不是修复：控件树真的换了形状时装饰会丢、对话框仍然开得住，warn 说得出是哪一半丢的。重做手术需要人工按 warn 定位，本轮没有承诺自动适配
Commit   cabdcd3

### D-047 · 2026-10-09 · taste · v48
Symptom  偏好窗口已有 119 个逐选项重置按钮（`grep -o 'id="reset-' resources/ui/adw/*.ui` 数得），缺的是"这个特效被我调乱了"的一次撤销：用户要记得自己动过哪几项，逐条点回去
Change   每个特效行加一枚 `edit-clear-symbolic` 圆按钮，调用 `_resetEffect(nick)`。键集合**不**靠"按 `<nick>-` 前缀扫 schema"得到：真实 profile schema 里 `tv-` 同时是 6 个 `tv-glitch-*` 键的前缀（9 个 `tv-*` 键里只有 3 个属于 tv），前缀扫会把另一个特效的选项一起清掉。改成在 `_loadActiveProfile()` 接线时用 `_bindingEffect` 标记当前特效，由唯一的汇聚点收下键，存成 per-effect 的 `Set`（每次切换 profile 都会重新接线，一次点击不能重置两遍）。文案复用 `.mo` 里已有的 msgid "Reset to Default Value"（zh_Hans / de 目录实测存在）：Q3 不批准 gettext 工具链，新串进来就是 36 语言里的一处空白
Evidence 新增 `test/prefs-reset-effect.test.mjs`（6 条，切出汇聚点与 `_resetEffect` 用 mock settings 跑）：键集合恰好等于该特效声明的、tv 与 tv-glitch 不互串、只写当前 profile（切换后不写旧 profile）、重复接线不重复重置、行上没有逐选项按钮的键仍被覆盖、以及一条源码形状门。先红后绿：在 /tmp 副本里换回提交前的 prefs.js → 红（`_resetEffect() is not a two-space-indented method of the source being sliced`）
Cost     重置范围由"这个特效接线时经过哪些键"定义，不由声明表定义 —— 好处是新增选项自动被覆盖，代价是新绑定路径**必须**走到汇聚点，否则静默逃出重置集合；形状门守的就是这一条。README 里"目前没有单档重置"那句从此失真，收尾时必须改写（双语两处）
Commit   8c43373

### D-048 · 2026-10-09 · taste · v48
Symptom  选项行只有标题，看不出这一项在调什么。手写解释句会把同一个意思在 36 份 `.mo` 里各欠一遍（仓库只有 `.mo`，没有 `.po` / `.pot`，Q3 又不批准 gettext 工具链）；而 GNOME 本来就为每个键存了一句话说明，运行时没人去取
Change   `_describeRow()` 在绑定时从 `getProfileSettings().settings_schema` 反射该键的 `description` 填进 `subtitle`，新增 0 条可翻译串。三类行不动：`*-enable-effect`（那是特效自己的标题行，"Use the tv effect." 压在 "TV" 下面是噪声不是解释，26 个）、description 与 summary 逐字相同的（11 个，全是 mushroom / team-rocket 的占位）、已有手写 subtitle 的（`.ui` 里 8 条，8/8 带 `translatable="yes"`，已经过了 36 语言，而 schema 说明一句都没有）。profile schema 163 键 → 152 条可用说明、0 条为空，即 126 行获得解释句。`get_key()` 对未知键会抛，所以先 `has_key()`；取不到行则什么都不做。原先把它塞进 `_bindResetButton` 是错的：全套从绿退成 73/78，五条 `this._describeRow is not a function` —— 重置门用不着解释句。改成 `_finishBinding(settingsKey)` 汇聚点分别调用，六个 bind 入口的收尾都走它
Evidence 用到的六个 GI 接口逐个对着本机 typelib 确认存在（`Adw.ActionRow` / `Adw.ExpanderRow` 的 `set_subtitle` / `get_subtitle`、`Gio.SettingsSchema.has_key` / `get_key`、`Gio.SettingsSchemaKey.get_summary` / `get_description`），没有凭记忆写。覆盖度用两种独立方法量过（gjs 反射 bundled `schemas/gschemas.compiled` + 直接解析 schema XML），结论一致；`settings_schema` 确认就是 `src/ProfileManager.js` 里 `lookup('…-profile')` 建出的那份，而不是主 schema 的 7 键。新增 `test/prefs-describe-row.test.mjs`（9 条）+ 两次变异：从汇聚点删掉 `_describeRow` 调用 → 9 条里精确 1 红；从 `_bind` 删掉转发 → 重置门里精确 1 红且失败的是新增的链断言，逐入口循环仍绿（那条断言存在的理由）。L0 全套 78/78
Cost     schema XML 没有 `gettext-domain` 属性（`metadata.json` 里那份只作用于 UI 串），所以**解释句在任何界面语言下都是英文**。写代码这一侧无法让它变成中文，除非批准 gettext 工具链或把说明复制进 `.ui`（后者正是本条要避免的债）。本机 LANG 为 en_US.UTF-8，看不出违和；中文界面下会混排 —— 待你在真实会话目视判断可否接受，需要注销重登（prefs 进程同样吃 GJS 模块缓存，L1 探针覆盖不到 prefs.js）
Commit   9f1a6d6

### D-049 · 2026-10-09 · chore · v48
Symptom  资源清单里 4 个图标（copy-effects / paste-effects / window-open / window-close 的 `-symbolic.svg`）没有任何 shipped 文本指名：它们是给上游有、本 fork 没有的动作加的，却被编进 bundle 一起发出去
Change   从 `resources/burn-my-windows.gresource.xml` 删这四行、删四个 `.svg`、`make` 重编译。中间态也被既有的 bundle 门抓住一次（只改清单、还没 `make` 时精确报出 "4 member(s) the manifest no longer lists … They are still shipped to users"）。5 个 PNG 与余下 5 个图标各自被特效 JS / shader / `prefs.ui` 指名，逐个查过，所以死资源只有这四个，没有连带清理
Evidence 判"死"用了两条互相独立的依据：`grep -rIl` 全仓（排除 `.git` / `node_modules` / bundle 本体）只在清单里找到它们，`.mo` 二进制目录里 `grep -a` 也无命中；D-050 的门第一次跑列出**的正是这四个**。改后 `gresource list` 从 74 个成员变 70，`grep -c img/scalable/actions` 清单剩 5 行且 5 个都有人指名
Cost     图标名是运行时按字符串查的（`prefs.js` 把 `/img` 注册进 IconTheme），所以"本仓文本里没有"不等于"没有任何东西查得到"—— 用户自己的 CSS 或第三方扩展理论上可以指名这几个图标。solo-use fork 接受这个前提；若上游日后重新用到它们，`git revert` 这一条即可
Commit   c7bbb49

### D-050 · 2026-10-09 · guard · v48
Symptom  bundle 的两条既有门都只把 bundle 与**清单**对齐，没有一条把清单与"有没有人用"对齐。于是一个没人指名的图标照样编译、照样发货，而且删掉 `.ui` 里的引用也不会让任何检查变红 —— 上游升级带来新图标时，这一类债会重新积回来
Change   `test/build-freshness.test.mjs` 新增一条：取清单里 `img/scalable/actions/` 的全部条目，剥掉目录与 `.svg` 得到图标名，在**我们会发出去的文本**里找一遍 —— `allJsSources()` 的字面量加上清单里每个 `.ui` 的正文。图标进控件只有这两条路（`.ui` 的 `icon-name` 属性，或 JS 传给 `new_from_icon_name()` 的串），所以能机械化，不像 shader 那样是拼串
Evidence 该门第一次跑就红，并逐个列出四个名字（即 D-049 的结论被独立复现），而同一文件其余 6 条全绿。两次注入（各在一个全新的 /tmp 副本里，做完即弃）：往清单加一个谁也不指名的图标 → 该门红且把名字列出来；把 filter 前缀改成匹配不到任何东西 → 该门仍然红，走的是"空集不能算通过"那条控制
Cost     只覆盖 `img/scalable/actions/`。PNG / shader / `.ui` 三类不在范围内：它们的引用是运行时路径与拼串（`/shaders/${nick}.frag`），按字面量查名字会一片假红。扩大范围需要另找依据，不在本轮
Commit   c7bbb49

### D-051 · 2026-10-09 · taste · v48
Symptom  偏好窗口的四处归属位（菜单 `homepage` / `bugs`，About 的 `set_website` / `set_issue_url`）都指向上游仓库，而 `metadata.json` 的 `url` 早在导入时就是本 fork —— 用户按界面提示报障，issue 落在没有这份代码的 tracker 里
Change   四处指回 fork。分界线写进注释：**代码在哪维护**归本 fork，**特效谁写的、钱与翻译队列在哪**归上游。`set_developer_name` / `set_copyright('© 2023 Simon Schneegans')` / license / 四个 donate-* / `show-sponsors` / `translate`（Weblate）/ `new-effect` / `wallpapers` 全部不动，`metadata.json` 的 donations 段也不动（Q5 捐赠保留原样）
Evidence 新增的门（D-052）先写、代码未改时 5 条里 2 红，且失败消息把期望地址与实际地址都打出来；三条控制当场绿
Cost     这是一次**归属**改动，不是修复：上游 issue 页对 upstream v48 原样安装的用户仍然是对的。若本 fork 哪天不再维护，这四处要一起改回去，门会指着 README 的那一行说为什么
Commit   b64beb7

### D-052 · 2026-10-09 · guard · v48
Symptom  D-051 这种"两个答案容易写成一个"的改动，最容易的回归是把上游仓库名整串替换掉 —— 于是捐赠页也变成 fork、署名也换成本仓库，而这两种错在界面上都看不出来。要一条门同时守住"指回来"和"不许顺手多指"两个方向
Change   新增 `test/prefs-attribution.test.mjs`（5 条）。**期望地址不在测试里重复一遍**：fork 取自 README 的 `git clone https://github.com/<owner>/<repo>.git` 行，上游 owner 取自 `**Upstream:** [..](https://github.com/<owner>/<repo>)` 行 —— README 是用户读的那份，测试里再抄一份 URL 就是等着漂移的一处。署名比对 owner 段而不是某个人的名字，换人不必改门
Evidence 三次注入各命中该守的一半（每个副本只放一种变异；第一版脚本想用 `cp` 恢复，撞上这里 `cp` 是交互别名、提示没答上就没恢复，导致后两次跑在上一次的污染状态上 —— 换成每次新建干净副本后结论才干净）：整串替换 → 只红"钱与翻译队列留在上游"与"归属编辑只在这四处"；只改 `set_copyright` / `set_developer_name` → 只红署名那条；只把 `set_website` 留回上游 → 红"报障去处"与"四处"两条。另有一条防自证的控制：fork 地址必须与上游地址不同，否则其余各条会"构造上成立"
Cost     门读 README 的两行格式，改写 README 那一节时必须保住 `git clone …\.git` 与 `**Upstream:** [..](https://github.com/…)` 的形状，否则门红在"取不到地址"上而不是红在归属上。本轮刻意**没有**把 `changelog` 动作纳入断言：它仍打开上游的 changelog，是否改成本仓库 `CHANGELOG.md` 尚未拍板（见 MAINTENANCE.md 的「已知不修 / 待确认」），加门等于替这个决定做掉
Commit   b64beb7

### D-053 · 2026-10-09 · chore · v48
Symptom  `docs/maintenance/measurement.md` §12 的"值"列里有三处把**单次采样**当基线存着：enable() 6 ms / 35 ms、`_chooseEffect()` 首帧 3.2 ms、begin_work / end_work "36 / 36"。它们的骗人方式不是数字错，而是让读者以为每个量只有一个点——下一次有人拿 35 去比实测 46，就会得出"退化了 31%"这种不存在的事实
Change   本轮两次完整认证 + 三次补采（共 5 个 enable() 样本、5 个 constrained 首帧样本）后改成区间并标出采样次数与来源；begin_work 一行改述判据（进程级计数器，gnome-shell 自己也在计数，所以**起止差额没变宽**才是判据）；跨次稳定性一行改述成"五轮判定一致、数字不一致"。同一轮把 `docs/maintenance/measurement.md` §12 里 bundle 成员 74 → 70、AGENTS 的 L0 门清单补上四条偏好窗口门与图标门、README 双语里"恢复 74 个源文件"改成"那时是 74 个"
Evidence 2026-10-09 23:07–23:10 完整认证 `RESULT: PASS`：7 探针 103 checks（13/10/27/25/5/20/3），`CRITICAL/JS ERROR lines across all sessions: 0`，零写入三哈希（dconf / profiles / 工作树）byte-identical，墙钟 3 分 24 秒（命令前后 `date` 量法，与原先的产物时间戳量法并列标注）。被认证的工作树是 `d7fdbf1`；其后差值可机械回读 —— `git diff --stat d7fdbf1..HEAD` 只含 `docs/maintenance/measurement.md`。L0 84/84
Cost     **本轮收回一条我自己上一提交写下的归因**：`d7fdbf1` 里我写"46 ms 那次来自连跑，单跑三次都在 29–35"，暗示连跑更慢；这次认证同为连跑却打出 31 ms，该因果说法当场被自己的样本否掉，改写成"连跑与单跑没有稳定高低关系，46 是唯一高值但我说不出为什么"。同类一处更正："之后 28–89 µs" 被本轮的 127 µs 撑开。区间会变宽，不是一次写定的数
Commit   2bbd164
