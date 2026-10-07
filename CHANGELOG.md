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
Cost     预热的代价与收益本仓有实测记录（MAINTENANCE §7 与 D-031）；它是否在启动期编译 GLSL 曾待确认
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
Cost     判据来自审计编号 P1-1；改这条要重跑档位矩阵（MAINTENANCE §6 的 8 处兼容分支）
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
