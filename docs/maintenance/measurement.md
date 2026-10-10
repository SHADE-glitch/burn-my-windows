# 观测判据与当前基线

本页是 burn-my-windows@local 三张长期资产页之一，从 `MAINTENANCE.md` 拆出，收着原先的 §8
（哪些观测能当判据，哪些不能）与 §12（当前基线），以及原先属于 `MAINTENANCE.md` §1 的
"探针 06 / 07 这两道门为什么单独存在"方法学小节。`MAINTENANCE.md` 里只留路由行，正文只在
这里维护。三块合起来管的是同一件事：**哪些数字可以当证据用、哪些只会伪装成证据，以及
"现在的水平线"长什么样**。**动手之前先读 [MAINTENANCE.md](../../MAINTENANCE.md) §3（隔离 headless
shell 的边界）与 [AGENTS.md](../../AGENTS.md)（给 agent 的硬规则）**：本页每个数字都出自沙箱里的
探针，绝对值只能在同一台机器上纵向比，跨环境比一律无意义。

---

### 06 / 07 这两道门为什么单独存在

它们针对的问题**不抛异常、不报警、不改行为**，只改变整台机器的运行质感：

- 启动时在主线程上同步做 IO / D-Bus。本 fork 的历史里真发生过一次：代理在
  `_doEnable()` 里同步构造，顶穿 GDM fallback greeter 的约 12 s 超时，把整个登录拖坏。
  所以 06 直接断言"enable() 期间两个代理都没被构造"，把这类回归钉住。
- 全局状态配平错位。`beginAnimation()` 调 `global.begin_work()` 与
  `compositor.disable_unredirect()`，对应的 `end_work()` / `enable_unredirect()` **只**在
  `endAnimation()` 里发生，而它由 timeline 的 `stopped` 信号驱动；timeline 又是
  `set_actor(actor)` 绑在 **actor 时钟**上的——actor 不再被绘制就不推进。任何"动画没走完"
  的路径都可能把工作计数永久留在错误状态，表现为不空闲、耗电、全屏掉帧，
  而没人会把它联想到一个窗口特效插件。

实测结论：**没有泄漏**。五条路径全部归还着色器（这是可归因的硬门禁，探针 07 已跑六轮，每轮
都是 5/5 场景归还）；`_doDisable()` 确实不主动结束在飞的动画，但没有留下悬挂的工作计数。

> **`begin_work` / `end_work` 的"会话相等"不是有效不变量，别用它当判据。**
> 我第一次拿它报"34 起 / 34 止完全配平"，第二次同样的代码给出 34 / 35，扩展行为毫无变化。
> 两个原因：插桩若装在 `enable()` 之后，启动期的一次 `begin_work` 会落在窗外而其
> `end_work` 落在窗内（方向就是证据：真泄漏应当是 begins 追不上 ends）；更根本的是
> `global.begin_work/end_work` 是**整个 shell 进程共享**的，gnome-shell 自己也在调用，
> 因此这个计数器无法归因到本扩展，只能界定损害范围。
> 07 现在断言的是：插桩在 `boot()` 之前、**本探针不得让未配平差额比开始时更宽**
> （`outstandingAtEnd <= outstandingAtStart`；2026-10-09 三次连跑的首尾分别是 0→0、-1→-1、
> 0→-1，**没有一次是"两边都为 0"**，所以别把 0 当成前提）、同时在飞数不得无界增长
> （每场景 ≤ 2）、以及上面那条逐场景着色器归还。总数只作 metric 供同机纵向比较。

> 一条被移除的假阳性值得记住：按场景切片计数曾报 `overview-close 12 起 / 13 止`，
> 而会话总计是 34/34——一个动画可以合法地跨到下一个场景才结束。留着这种会误报的断言
> 只会训练人去无视红灯。因此 07 断言的是与边界无关的量：逐场景要求"shader 必须归还"，
> 全局要求"会话配平"，外加"同时在飞数不得无界增长"。

---

## 8. 哪些观测能当判据，哪些不能

**能当判据**：`checks` 全绿、哨兵告警计数为 0、`already disposed` 计数为 0、
disable 后 8 处补丁身份相等、`_profileSignalIds` 与 profile 数成比例、零写入三哈希不变、
探针 05 每个特效的 `update-animation` 帧数 > 0、
探针 07 的"本探针未让 `begin_work` 差额变宽"、
探针 06 的 `enable()` 耗时是否越过预算线（60 ms / 250 ms）。

**不能当判据**：

- 沙箱里的任何耗时数字的**绝对值**。软件渲染（llvmpipe）与真实 GPU 不可比——同类测量在
  本 workspace 曾把一次填充从桌面 ~757 ms 量成沙箱 5355 ms。所以 06 的 `enable()` 数字
  只能当**同机纵向**趋势用（这次 5 ms，下次变 40 ms 才是要警觉），不能当横向结论。
- 探针 07 的 **begin/end 会话相等性**（含逐场景差值）。跨场景收尾会合法地让某个窗口内
  ends > begins，而 gnome-shell 自身也调用这两个函数。可用的是"差额没有变宽"和
  "逐场景着色器归还"。
- 单个特效"帧数对不对"。`update-animation` 计数只证明合成器画了，不图画得对。
- teardown 时的 GLib CRITICAL 总量：沙箱关闭会喷一堆与 fork 无关的 shell 内部
  `dateMenu.js already disposed`。`run.sh` 因此只把**指向前扩展自身路径**的那部分算失败，
  其余记录但不判。
- `test-mode` 下的像素可复现性：`fire`、`aura-glow`、`mushroom`、`team-rocket` 的 `_uSeed`
  用的是**未受 `testMode` 保护的** `Math.random()`，这 4 个的帧不保证一致。
- **探针自己制造的 CRITICAL**。`already disposed` 最容易的来源是探针在窗口被 mutter 收走
  之后还去读那个 actor——GJS 的这条 CRITICAL **try/catch 拦不住**，于是 26 个特效就会喷
  26 条，看起来像 fork 的收尾有 bug，实际是探针违反了 `docs/maintenance/shell-internal-api.md` §5
  里给哨兵定的同一条纪律。
  收尾是否发生，看**池子回到 +1** 和 `preview-effect` 已清空这些还活着的证据，别去读死对象。

---

## 12. 当前基线

| 项 | 值 |
| --- | --- |
| 上游版本 | v48，基线提交 `16ab10a` |
| fork 提交数 | 见 `git rev-list --count 16ab10a..HEAD`（不要手抄数字，用命令） |
| 特效数 | 26 |
| bundle 成员 | 70 = 清单 `<file>` 70（2026-10-09 删掉 4 个无人指名的图标后由 74 变 70；`img/scalable/actions/` 剩 5，逐个都有 shipped 文本指名，由 `test/build-freshness.test.mjs` 守着） |
| schema 键 | 主 7 / profile 163 |
| 默认开启的特效 | 只有 `fire`（26 个 `<nick>-enable-effect` 里唯一 `true`） |
| 预热效果 | 干净配置下 `warmedNicks = 1`（= fire）。要测 26 个全预热必须改沙箱 keyfile |
| 补丁处数 | 8 装 / 8 复，两侧都有守卫 |
| 兼容分支站点 | 8 |
| 哨兵符号 | 18（11 函数 + 2 访问器 + 4 字段 + 1 数组检查） |
| L0 | `npm test` 全绿（门数与用例数以命令输出为准，别抄）；`npm run check` 覆盖 extension.js / prefs.js / src 全部 js |
| L1 | 探针与 checks 数量由 `run.sh` 打印；单探针独占一次 shell 启动，冷启动约 20 s，`run.sh all` 实测 **3 分 22 秒 – 3 分 30 秒**（2026-10-09/10 四轮分别计时：3:22 / 3:24 / 3:30 / 3:30，最后一个是本轮 08:47:19–08:50:49；取命令前后 `date` 差值；更早还有未单独计时的连跑，不算进区间；7 次冷启动 + 26 个真窗口，探针增删后这个时长要重测） |
| 跨次稳定性 | 探针 07 已跑**八轮**（2026-10-07 两轮、2026-10-09/10 六轮），每轮 3/3 判据全过。绝对计数六轮 36 / 36、两轮 35 / 36，`outstanding` 首尾出现过 0→0、-1→-1、0→-1 三种：**一致的是判定，不是数字**。第一版曾因 34/34 与 34/35 之间抖动而暴露断言无效 |
| 最近一次完整认证 | 2026-10-10 08:47:19–08:50:49（**3 分 30 秒**），7 探针 103 checks 全 PASS（01/02/03/04/05/06/07 = 13/10/27/25/5/20/3），CRITICAL/JS ERROR 0，零写入三哈希不变。**被认证的工作树是 `9b5e3d4`**；此后只应有记录这次认证的 docs 提交，用 `git diff --stat 9b5e3d4..HEAD` 回读。**触发重跑的清单就是探针的加载路径**：`extension.js`、`src/`、`resources/shaders/`（`.frag` 经 GResource 加载，探针 02 逐个编译它们）——出现这三项之一就得重跑。`prefs.js` / 图标 / `.ui` 的改动**不在**这条清单上：下一行说明它们不在 L1 的加载路径内，它们的门槛是 `npm test` 的四条偏好窗口门 + 本页 L2 行。这一条本轮改过：上一版把 `prefs.js` 也写进触发清单，于是我照旧清单为一次 `prefs.js` 改动重跑了整轮，判据结论与上一次一致（各探针计数 13/10/27/25/5/20/3 逐项相同、全 PASS，只有下面几行那些采样值按本轮重写）——**对"证明 prefs.js 没弄坏什么"这件事是白跑**，所以清单按加载路径重写而不是留着让人空等 3 分半 |
| 认证覆盖的是什么 | 七个探针全部跑在 **shell 进程**里，加载 `extension.js` 与 `src/`；`prefs.js` 与 `resources/` 里的图标、`.ui` 页面**不在其加载路径内**。所以 `prefs.js` 的改动不会让 L1 变红，L1 绿也不证明设置页 —— 那一层只有 L0 的静态门 + 本页 L2 行里的实机验证能说话 |
| enable() 主线程阻塞 | 1 profile：4–6 ms（本轮 5 ms）；20 profiles：**29–46 ms**。2026-10-09/10 八次独立采样：46 / 30 / 29 / 35 / 31 / 33 / 33 / 35 ms。其中 46、31、33、33、35 来自 `run.sh all` 连跑，30 / 29 / 35 来自单跑 `run.sh 06` —— **连跑与单跑没有稳定的高低关系，不要把 46 归因于跑法**。`extension.js` 与 `src/` 自设置页那一轮开工前（`681c150`）起**逐字节未变**（`git diff --stat 681c150..HEAD -- extension.js src/` 实测为空），所以这段差是机器状态而不是代码。**这一项以前记的是单次采样值（6 ms / 35 ms），那正是它能骗人的方式** |
| begin_work / end_work | 五条异常收尾路径全部归还着色器。**绝对计数会漂**：2026-10-09/10 五次 `run.sh all` 分别为 36/36（0 → 0）、35/36（-1 → -1）、35/36（0 → -1）、36/36（0 → 0）、36/36（0 → 0），都 PASS —— 计数器是进程级的、gnome-shell 自己也在调用，所以差额可以是负的（shell 自己的 `end_work` 落在窗内多过一次）。**判据从来不是相等，而是 `probeDidNotWidenTheWorkGap`：结束时不得比开始时更宽**，外加"每场景同时在飞数 ≤ 2"（`noUnboundedWorkAccumulation`）；把"36 / 36"当基线抄进文档就是把它当判据。本轮负差额来自 `overview-close` 场景的 `beginsDelta 12 / endsDelta 13`，也就是 `outstandingWorkByScenario` 末值为 -1——判据看的是"没比开局更宽"，-1 比 0 更窄，所以照常 PASS |
| 动画路径总线 | 首个**非预览**动画会构造 UPower 代理（沙箱 135 µs），之后 `OnBattery` 读本地缓存：gjs 1.88 实测 50 次读共 634 µs（≈13 µs/次，代理 `flags==0` ⇒ GIO 自持 PropertiesChanged 订阅）。有电源约束时第一次 **2.8–7.6 ms**（2026-10-09/10 八次独立采样：2791 / 3156 / 3260 / 3304 / 3466 / 4186 / 4197 / **7639** µs —— 中位约 3.4 ms，最高那次没有任何代码变化可以解释，只能是这台机器当时的状态；60 Hz 一帧是 16.7 ms，所以尾值已接近三成帧预算），之后 28–149 µs（下界 28 µs 是更早一轮的记录，本轮以及 2026-10-09/10 那八次里首帧之外的读值是 42–149 µs，本轮为 72 / 126） |
| ease 覆写落空 | 探针 05 的 `easeFallthroughsNatural`：26 个真窗口各开合一次实测 **0** 次 —— D-034 那条分支在 GNOME 50 / Wayland 的普通窗口流量下走不到，属潜在正确性而非当前故障 |
| L1 观测值 | 着色器 26 个 GType、两轮往返约 140 ms；探针 05 每特效 70–73 帧 |
| 每 profile 的 settings handler | 8（`_profileSignalIds` 的长度就是泄漏计数） |
| 已验证平台 | Ubuntu 26.04.1 / GNOME Shell 50.1 / gjs 1.88 / Wayland，2026-10-01 |
| 最近一次 L2 实机验证 | 2026-10-10 08:03 之后的真实会话（注销重登）。**prefs 侧覆盖率用三种独立方法对上了同一个数**：反射 schema 得 152 条可用说明、扣 26 个开关与 11 条 `description == summary` → 预测 126 行；`Gtk.Builder` 加载发货的 28 个 `.ui`（必须 `menus.ui` 先于 `prefs.ui` 进同一个 builder，否则 `main-menu` 引用不到——这是仪器问题不是产品缺陷）后，真 `_findRowFor` 解析出 137 个绑定键、**0 个找不到 `Adw.ActionRow`**，137 − 11 = 126。真控件跑真方法 8/8（含 `get_ancestor` 是真递归）。整段 boot 内我们前缀的告警 **0 条**、JS ERROR/TypeError/CRITICAL **0 条**。**这一行覆盖的是 08:03 那份 `prefs.js`**：其后的 `f976433` 只改了「View Changelog」这一项的网址字符串。`ps` 现在能看到承载 prefs 的常驻进程 `/usr/bin/gjs -m /usr/share/gnome-shell/org.gnome.Shell.Extensions`（08:15:15 起动，至今仍活着），而 `prefs.js` 的新内容是 08:37:25 才落盘（`stat` mtime，提交 08:41:36）——**进程比文件老**，所以磁盘上那个新地址至今没被任何真实会话加载过——点开菜单看浏览器落在哪儿这一击，要等下一次登录（或那个进程自己退出重启）之后由人手验，本轮不替它声称任何结论。**"杀掉那个进程是否就够、还是必须注销重登"本轮没有实测**，它只是与 shell 侧同类的推断（ESModule 按 specifier 缓存），而那条结论是在 shell 进程上测出来的 |
| prefs 进程已知噪声 | 每开一次偏好窗口打两条 `Type GITypeInfo of property Adw.PreferencesWindow::visible-page does not match …`。**不是本 fork 的**：全仓 `grep -rn visible-page prefs.js src/ extension.js` 为空，且不是我启动的 prefs 进程（08:15:16 那次）同样打这两条。发出方是 GNOME 自己的 `org.gnome.Shell.Extensions` 启动器。日志通道用 `--identifier=org.gnome.Shell.Extensions`（**不是** `gjs`） |

> 运行期间**不要编辑工作树**：零写入证明比较的是开跑前后的 `git status --porcelain`，
> 你在跑的同时改文件（哪怕与测试无关）会让它如实报"工作树被改动"并使该次运行作废。
> 同理，`git commit` 也算改动——先提交，再认证。

> **本表不收单次采样。** "值"列里凡是耗时，要么写成区间并标出采样次数与来源（`run.sh all` 连跑还是
> 单跑某探针），要么就标着它是单样本。上一版 `enable()` 记的 6 ms / 35 ms 就是这样把机器状态
> 存成了"基线"：同一份代码重测，20 profiles 那档实测 29–46 ms。
