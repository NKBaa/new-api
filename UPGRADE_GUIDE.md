# New API 二次开发移植与升级指南（AI 执行手册）

> 本文档面向 **AI 编码助手**。目标是让 AI 在**不读完整仓库**的前提下，准确理解本仓库相对官方主线的改动，并能安全地把这些改动移植到更新的官方版本上。
>
> 文档中的每个数字与符号都经过实测核对（见 §7 校验命令）。

---

## 0. 元信息

| 项 | 值 |
|---|---|
| 官方基线 | `6370b2942`（`upstream/main`，标签 `v1.0.0-rc.42`）。**上一个基线是 `56758edf9`**，二者之间官方有 20 个提交；本次已把这 20 个提交合并进来（见 §0.3）。更早的基线 `d04c118c8` 见 §0.2 |
| 当前交付提交 | 以 `git log -1` 为准（**本表刻意不写死哈希** —— 每次改文档都会产生新提交，写死必然立刻过期）。代码侧里程碑提交：`855d5fcb7`（合并官方 `v1.0.0-rc.42`）、`8c177d193`（前端高亮与拦截错误映射规则冲突）、`d262745c6`（未匹配错误在网页日志和 API 中保留原文）、`a68059e00`（增加错误规则重叠校验）、`6fab4aa6c`（合并官方 20 个提交到 `56758edf9`）；此前的 B13 选 Key 提交为 `4234fb98e` 与 `7420d157b` |
| GitHub 远端 | `https://github.com/NKBaa/new-api.git`（分支 `main`） |
| 相对官方基线改动 | **163 文件** = 53 新增 + 110 修改 + **0 删除**（即「我们比官方 `6370b2942` 多的东西」） |
| 其中非业务文件 | 4 个（GitHub 侧既有，非本次业务改动）：`.github/workflows/docker-image.yml`(A)、`UPGRADE_GUIDE.md`(A)、`README_CN.md`(A)、`VERSION`(M) |
| 纯业务改动 | **159 文件** = 50 新增 + 109 修改 |
| 模块划分 | 3 个 Go module：根模块 + `relaykit/` + `tokenkit/`（后两者独立，`GOWORK=off` 必须可构建；`tokenkit/` 不得依赖 `relaykit/`） |
| 数据库 | SQLite / MySQL ≥5.7.8 / PostgreSQL ≥9.6 **三方言必须同时支持** |

### 0.1 提交拓扑（重要，影响移植方式）

交付提交的父提交链一路回溯到 `f9cabe103`，并在 `6fab4aa6c` 处并入官方 `56758edf9`（**注意：`d04c118c8` 不是 `f9cabe103` 的祖先，二者是官方 main 上的兄弟链** —— `f9cabe103` 的父是 `0aec08fee`，而 `d04c118c8` 从同一点继续往下走）：

```

```
d04c118c8 (官方基线)
    └── …官方中间提交…
            └── f9cabe103   (GitHub 侧既有提交，含旧版实现)
                    └── d7a16aec2   (当时的 11 项业务移植；业务十二 OpenCode、业务十三聊天选 Key 均为后续追加)
                            └── …(i18n 修复 / 规则可编辑 / OpenCode 渠道 等 ~20 个提交)…
                                    └── 66488a6fe   (文档)
                                            └── 309b9b4f6   (首页风格开关)
                                                    └── 88d694850   (文档)
                                                            └── af7b2a3af   (下拉框宽度修复)
                                                                            └── 7420d157b   (业务十三 聊天预设选 Key)
                                                                                    └── 4234fb98e   (B13-r1 选 Key 弹窗视觉与滚动修订 = 最后一个纯业务代码提交)
                                                                                            └── …(此后均为纯文档提交)…
                                                                                                    └── 6fab4aa6c   (merge: 同步官方 20 个提交到 56758edf9)
                                                                                                            └── …(文档)…
                                                                                                                    └── f5b742afe   (VERSION → v1.0.0-rc.41)
                                                                                                                            └── …(此后均为纯文档提交)…
                                                                                                                                    └── 855d5fcb7   (merge: 同步官方 v1.0.0-rc.42 / 20 个提交)
                                                                                                                                            └── …(文档)…
```

### 0.2 与官方同步（`6fab4aa6c` merge）

交付仓库现在是**官方 `56758edf9` 的直接后代**：上游在 `d04c118c8` 之后又推了 **20 个提交 / 189 个文件**，本次全部并入（`merge` 提交有两个父：`b306070fe` 与 `56758edf9`）。

- **零冲突**。我们的 151 文件差集与官方 189 文件里**只有 21 个文件重叠**，git 全部自动合并：`model/main.go` 的 `AutoMigrate` 列表（官方加 `&UserAccessToken{}`、我们加 `&AffiliateReward{}`，位置相邻但不同行）、`controller/user.go` / `model/option.go` / `router/api-router.go` / `router/channel-router.go` / `relay/common/relay_info.go` / `i18n/keys.go`（双方在不同函数里各加各的），以及 7 个前端 locale JSON（官方 +102 键、我们 +198 键，**没有同名键**，合并后 7062 键、0 重复）。
- **官方本次带来的新东西**：作用域访问令牌（替换原「系统访问令牌」）、管理员用户管理的二次验证、注册角色白名单校验、`moejs` 取代 `sobek` 作为插件运行时、Seedream 5.0 系列、渠道表刷新按钮、Claude `output_config` 修复、若干 i18n 与主题修复。依赖变化（`go.mod`/`go.sum`）由官方一侧带入，**我们没有贡献任何依赖改动**。
- **官方本次删除的 3 个文件**：`web/src/features/security/{components/access-token-card.tsx, components/__tests__/access-token-card.test.tsx, hooks/use-access-token.ts}`。我们从未触碰它们，删除后**无残留引用**。
- **合并后验证（实测）**：`go build` + `go vet` 覆盖 80 个非 root 包 exit 0；`relaykit` 独立构建（`GOWORK=off`）exit 0；56 个改动的 Go 文件 `gofmt` 全 clean；`go test ./model/ -count=1` ok；前端 `typecheck` exit 0、生产构建 exit 0、`vitest` **181 文件 / 2209 用例全过**；**SQLite 端到端**：冷启动建出 198 个 schema 对象、`/api/status` 返回 `home_page_style=classic`，随后**两次重启 DDL 语句均为 0**、schema 指纹与冷启动后**完全一致**、探针数据仍在。
- **未验证**：MySQL 与 PostgreSQL 未在本机实测（见 §6.1 的说明）。本次改动未引入任何方言特有 SQL；但 `AutoMigrate` 列表是双方向同一处追加，升级到真实 MySQL/PG 时**建议先跑一遍 §6.3 的数据库矩阵命令**再上生产。

> 中间提交的完整清单、每个提交做了什么，见 §8（历史记录）。

### 0.3 与官方同步（`855d5fcb7` merge，官方 `v1.0.0-rc.42`）

交付仓库现在是**官方 `6370b2942`（标签 `v1.0.0-rc.42`）的直接后代**：上游在 `56758edf9` 之后又推了 **20 个提交 / 148 个文件**，本次全部并入（`merge` 提交有两个父：`1d76e637c` 与 `6370b2942`）。

- **零冲突**。我们的 163 文件差集与官方 148 文件里**只有 14 个文件重叠**，git 全部自动合并：`common/constants.go`、`relay/channel/gemini/relay-gemini.go`、`relay/channel/openai/relay-openai.go`、`relay/common/relay_info.go`、`relay/response_model_test.go`、`relaykit/dto/channel_settings.go`、`web/src/features/channels/types.ts`，以及 7 个前端 locale JSON（合并后 **7067 键 × 7 语言、0 缺失 / 0 多余 / 0 重复**）。
- **官方本次带来的新东西**：新增独立 Go module **`tokenkit/`**（文本与图片 token 计数，根模块用 `replace` 指向本地目录；`service/tokenizer.go`、`service/token_estimator.go` 被它取代并删除）、多厂商 **Web Search** 计费与编码（`relay/channel/{ali,openai,xai,zhipu_4v}/web_search.go`）、**Google Search grounding** 按查询/按 grounded prompt 计费、高级参数覆盖支持正则条件、`moejs` 升到 `v0.1.0-alpha.6` 并用其 PGO profile 构建、xAI Grok Imagine 视频插件、前端渠道参数覆盖编辑器与用户分组筛选、`middleware/frontend_static.go`（前端静态资源 gzip 缓存）、若干 relayconvert 有损转换与流式计费修复。
- **官方本次删除的文件**：`relaykit/relayconvert/internal/oai_responses/to_gemini_chat_req_preprocess.go`、`service/tokenizer.go`、`service/token_estimator.go`。我们从未触碰它们，删除后**无残留引用**。
- **合并后验证（实测）**：根模块 `go build ./...` exit 0；`go vet ./service/ ./relay/...` exit 0；`relaykit` 与 `tokenkit` **各自 `GOWORK=off` 独立构建 exit 0**、`go vet` exit 0，且两者都不 import 根模块、`tokenkit` 不 import `relaykit`（模块独立性合规）；`tokenkit` 自带测试 ok；`go test ./relay/... ./relaykit/...`（`relaykit` 用 `GOWORK=off`）全 ok；自定义业务（返佣 / 签到 / 错误映射 / 伪 200）测试 ok；前端 `typecheck` exit 0、`oxlint` 无新增、生产构建 exit 0、`vitest` **185 文件 / 2209 通过 + 26 跳过**。
- **lint / 格式基线（如实说明）**：`oxlint` 合并前后均为 **65 warning + 165 error**、`oxfmt --check` 均为 **57 文件**，**逐条比对位置完全一致（0 新增、0 修复）**；官方基线自身也是 165 error / 24 文件。`e2e/doc_parse_test.go` 的 `gofmt` 告警在官方 `6370b2942` 上同样存在，本次未触碰。这些是**上游既有基线**，不是本次合并引入的。
- **已知非合并问题（预存在，已用 `1d76e637c` 对照确认）**：`service` 的 `TestSanitizeRelayErrorFieldsAndUnknown400`、`controller` 的 107 个 `TestSecurityEnrollment*` / Passkey / OAuth 用例失败，**合并前后失败集合逐条完全一致（0 新增）**，根因是 Windows 上 SQLite 临时库在 `TempDir` 清理时被占用（`unlinkat ... being used by another process`）；`relay/channel` 的 `TestUpstreamGetBody_*` 仅在 `-count>=3` 重复运行时失败（测试隔离问题，`-count=1` 通过），合并前同样如此。
- **未验证**：MySQL 与 PostgreSQL 未在本机实测（见 §6.1）。本次改动未引入方言特有 SQL，但官方改动了计费与用量派生路径，上生产前**建议先跑 §6.3 的数据库矩阵命令**。

**因此 `git diff d04c118c8..HEAD` 会包含 `f9cabe103` 等中间提交的改动**（合并后还会包含官方 20 个提交，共 319 文件）。若需"仅业务改动"的单提交补丁，必须用 `git commit-tree` 合成，**父提交用当前官方基线 `56758edf9`**：

```bash
# 合成一个父为 6370b2942、树与 HEAD 相同的虚拟提交
tree=$(git rev-parse 'HEAD^{tree}')
synth=$(git commit-tree "$tree" -p 6370b2942 -m "port 11 businesses")
git format-patch --binary --stdout -1 "$synth" > businesses.patch
```

仓库随附的 `new-api-official-11-businesses.patch` 即以此方式生成，已验证可干净 `git apply` 到纯净 `6370b2942`（`v1.0.0-rc.42`），`git write-tree` 得到的树哈希与交付仓库 `HEAD^{tree}` **完全相同**，**163 个改动文件**（53 新增 + 110 修改 + 0 删除）。

---

## 1. 三条硬约束（违反即失败）

AI 修改本仓库时必须同时满足：

| # | 约束 | 判定方法 |
|---|---|---|
| 1 | **DB 零破坏**：0 `ALTER TABLE`、官方已有表 0 加字段 | 在 `*.go`/`*.sql` 的 **新增行**中搜索 DDL 关键字（文档文字里的「ALTER TABLE」不算） |
| 2 | **零外部轮询进程**：无 sidecar、无 `os/exec`、无新增 `init()` 定时器 | 搜索 `os/exec`、`exec.Command`、`subprocess`、`sidecar` |
| 3 | **只改业务所需**：与 13 项业务无关的官方代码 0 修改 | 逐文件核对 §3 清单；官方既有失败测试**不得**修改 |

**已被明确排除在改动范围外的**（前几轮曾误改，已全部回退，不得重新引入）：

- 全局主题/底层 UI：`web/src/styles/`、`components/ui/table.tsx`、`components/ui/sidebar.tsx`、`nav-group.tsx`、`section-page-layout.tsx`
- 品牌与外壳：`components/footer`、`features/about`、`components/logo`、`system-brand`、`index.html`、`main.tsx`
- 元数据与 CI：`VERSION`、`.github/workflows/*`（`docker-image.yml` 除外，它是 GitHub 侧既有文件，须保留）
- 官方 `features/home/`（21 个官方文件）**源码零改动**，作为回滚通道完整保留；仅在 `features/home/__tests__/` 下**新增** 1 个测试文件 `root-route.test.tsx`（测根路由开关，不改官方源码）。该目录共 22 个受版本控制的文件 = 21 官方 + 1 新增。
- 官方既有失败测试与 Windows SQLite 句柄问题（见 §6.2）
- 官方前端主题底层：`src/styles/`、`ui/table.tsx`、`ui/sidebar.tsx`、`nav-group.tsx`、`section-page-layout.tsx`、`footer.tsx`、`about/`、`logo.tsx`、`system-brand`、`lib/constants.ts`、`main.tsx`、`index.html` 全部零修改
- 构建与依赖元数据：`Dockerfile`、`go.mod`、`go.sum`、`vitest.config.ts` 零修改（新增文件只有 `.go/.tsx/.ts/.json` 四类，无 `os/exec`、无新增 `init()`）

---

## 2. 十三项业务实现索引

每项给出：**涉及文件** → **关键符号** → **存储位置** → **移植注意点**。

### B1 · 充值返佣流水（Affiliate Commission）
- **文件**：`model/affiliate_reward.go`(新)、`model/affiliate_reward_test.go`(新)、`model/topup.go`、`model/redemption.go`、`model/option.go`、`common/constants.go`、`web/src/features/wallet/components/affiliate-rewards-card.tsx` 等
- **符号**：`AffiliateReward{Id, Reference, UserId, RewardQuota, CreatedAt}`、`CreateAffiliateRewardTx(tx, reference, userId, rewardQuota)`、`GetAffiliateCommissionRate()`/`SetAffiliateCommissionRate()`（带 `sync.RWMutex`）
- **存储**：**唯一新增表** `affiliate_rewards`（`Reference varchar(160) uniqueIndex not null`，值形如 `topup-{id}`，即 `reference=topup-{id}` 唯一）；注册于 `model/main.go` 的 `AutoMigrate` 列表（`AutoMigrate(&AffiliateReward{})`，官方基线无此行）。`model/user.go` **零改动**，返佣额度复用官方既有的 `users.aff_quota` / `aff_history` 字段。比例配置复用 `options` 表键 `AffiliateCommissionRate`。
- **要点**：
  - 6 条到账链路（易支付 / Stripe / Creem / Waffo / Waffo Pancake / 管理员手动补单）均在同一 DB 事务内完成「订单置成功 + 用户额度入账 + 返佣入账」；
  - 并发/重试靠**数据库唯一索引**兜底（`isUniqueConstraintError` 判定），非应用层锁；
  - 比例在 `validateOptionValue` 与结算层**双重**限制 `0..100`，并防御 NaN/Inf；
  - 返佣额度以**实际充值额度**为绝对上限；
  - `markUserEverToppedUp` 在 7 处调用（`topup.go` 6 + `redemption.go` 1）；
  - 0 额度守卫：`if quota > 0`（Stripe）/ `if quotaToAdd > 0`（手动补单）/ `if quota > 0`（Creem），避免幂等重放写脏流水。
- **移植注意**：新增表的 `AutoMigrate` 注册必须保留；`Reference` 唯一索引不可去（去掉即失去幂等保护）。

### B2 · 推荐计划说明文案可后台自定义
- **文件**：`web/src/features/wallet/components/affiliate-rewards-card.tsx`、`model/option.go`、`web/src/lib/status-query.ts`
- **符号**：`options` 键 `AffiliateDescription`（后端 `options.AffiliateDescription`）；前端读 `status?.affiliate_description`
- **存储**：`options` 表（0 DDL）
- **移植注意**：空值必须回退到 i18n 默认文案，不得显示空白。

### B3 · 普通用户隐藏响应模型/重定向详情（防穿帮）
- **文件**：`web/src/features/usage-logs/lib/format.ts`、`web/src/features/usage-logs/lib/__tests__/model-mapping-visibility.test.ts`(新)、`web/src/features/usage-logs/**` 多处
- **符号**：`formatModelName(log, isAdmin)` —— `isAdmin=false` 时提前返回脱敏结果
- **判定身份**：用 `isAdminView`（来自 `useLogsViewScope()`）或 `cells.has('user')`，**不要**用原始 role，因为管理员可切到「仅看自己」视图
- **移植注意**：后端已对非管理员剥离 `admin_info`，前端再 gate 一层是**双保险**，两处都不可删。`model/log_other.go` 侧把响应模型相关键纳入敏感键（数据层剥离），并由 `SetAdmin` 写入管理员可见副本 —— 两层缺一不可。

### B4 · 全站默认主题 + 导航圆角
- **文件**：`web/src/lib/theme-customization.ts`、`web/src/lib/theme-storage.ts`、`web/src/context/theme-customization-provider.tsx`、`web/src/context/theme-provider.tsx`、`web/src/stores/system-config-store.ts`、`web/src/components/config-drawer.tsx`
- **符号**：`ThemeNavbarRadius`、`ThemeRadius`、`defaultThemeSettings`、`options.DefaultThemeSettings`
- **机制**：管理员设全站默认 → 未改动过的用户跟随默认；用户主动调整后写 `newapi:theme:v1:user-modified` 锁定；重置即回归跟随。
- **存储**：`options` 表键 `DefaultThemeSettings`（JSON）。**注意**：后端**故意不在 `common` 变量里保留副本**（避免无锁写入），前端经 `/api/status` 读取。
- **移植注意**：这是本仓库**唯一**触碰主题体系的地方，且限定在「默认值下发 + 用户独立存储」，**没有**修改 `styles/` 或底层 UI 组件。

### B5 · OpenRouter 风格极简首页（Landing V2）+ 首页风格开关
- **文件**：`web/src/features/landing-v2/**`（11 文件，全新）、`web/src/routes/landing-v2.tsx`(新)、`web/src/routes/index.tsx`、`web/src/stores/system-config-store.ts`、`web/src/lib/status-query.ts`、`web/src/features/system-settings/general/system-info-section.tsx`、`web/src/features/system-settings/{types.ts,site/index.tsx,site/section-registry.tsx,hooks/use-update-option.ts}`、`model/option.go`、`controller/misc.go`、`web/src/i18n/locales/*.json`
- **符号**：`features/landing-v2/index.tsx`、`use-landing-data.ts`、`HomePageStyle`（后端 option 键）、`home_page_style`（`/api/status` 字段）、`HomePageStyle`（TS 类型 `'classic' | 'landing-v2'`）、`normalizeHomePageStyle(value)`、`config.homePageStyle`
- **根路由行为（已改，不再是「直接顶替」）**：
  - `routes/index.tsx` 的 `RootPage()` 从持久化 store 读 `config.homePageStyle`：`'landing-v2'` → `<LandingV2/>`，**其它一切取值（含 `undefined`/`''`/未知值）→ `<Home/>`（官方首页）**。
  - **默认是官方首页**（`classic`）：`model/option.go` 的 `InitOptionMap()` 默认 `"HomePageStyle" = "classic"`，`normalizeHomePageStyle` 只在严格等于 `'landing-v2'` 时才切换。**老库没有该 option 行也不会变**（实测：删行重启后 `/api/status` 仍返回 `classic`）。
  - 读 **store 而非 `/api/status` 响应**，避免刷新时先闪官方首页；store 由 `main.tsx` 的 `initSystemBranding()` 在 React 挂载前从 localStorage 恢复、再后台刷新。
- **存储**：`options` 表键 `HomePageStyle`（字符串，取值 `classic`/`landing-v2`）—— **0 DDL**，仍是 `options(key,value)` 两列。
- **校验**：`model/option.go` 的 `validateOptionValue` 末尾新增分支，非 `classic`/`landing-v2` 一律返回错误。实测非法值被拒且**不落库**（`<no row>`），空串同样拒绝。
- **下发**：`controller/misc.go` 的 `GetStatus` 在 `"default_theme_settings"` 之后新增 `"home_page_style": common.OptionMap["HomePageStyle"]`；同时 `GetOptions`（`/api/option/`）会把它带给设置页（键名不以 `Token`/`Secret`/`Key` 结尾，不被敏感键过滤）。
- **设置入口**：系统设置 → 站点 → 系统信息 → 新增「Home Page Style」`Select`（`官方首页` / `OpenRouter 风格首页`）；`HomePageStyle` 已加入 `SiteSettings`、`defaultSiteSettings`、`site/section-registry.tsx` 的 build 与 `_systemInfoSchema`/`systemInfoSchemaWithI18n`。改完必须把 `HomePageStyle` 登记进 `use-update-option.ts` 的 `STATUS_RELATED_KEYS`，否则保存后不刷新 `['status']`。
- **⚠️ 该 `Select` 必须显式给宽度**（否则长文案被截断）：`SelectTrigger` 基类含 `w-fit`，`SelectContent` 基类是 `w-(--anchor-width)` + `overflow-x-hidden`。两者叠加时，弹窗宽度被锁死等于触发框宽度，而触发框会塌缩到**当前选中项**的宽度 —— 选中较短的「官方首页」时触发框只有 ~98px，弹窗跟着只有 `min-w-36`（144px），第二项 `OpenRouter style home page`（en 194px / ru 268px）右半被裁掉（实测 en 截断 34.8px、fr 44.7px、ja 36.4px）。**必须同时改两处**：
  - `SelectTrigger` → `className='w-full sm:w-[240px]'`（固定触发框宽度，不再随选中项伸缩）
  - `SelectContent` → `className='w-auto min-w-(--anchor-width)'`（弹窗可**超出**触发框以容纳最长文案；`min-w` 保底与触发框等宽，7 语言全部实测 `clippedBy=[0,0]`）
  - **不要**用 `min-w-[240px]`：它只定死 240px，俄语 `Главная страница в стиле OpenRouter`（268px）仍会被裁掉 28.3px。
  - 该 `className` 经 `cn()`（`tailwind-merge`）后**按源码顺序**追加在基类之后，能正常覆盖 `w-fit` / `w-(--anchor-width)`；实测 `twMerge` 输出已确认 `w-fit` 被移除、`w-(--anchor-width)` 被替换为 `w-auto`。**改这段代码时不要调整基类顺序。**
  - 回归测试：`web/src/features/system-settings/general/__tests__/home-page-style.test.tsx` 的两条用例分别锁定触发框与弹窗的 class 契约（移除任一改动即失败）。
  - 该 `Select` 还必须与同组官方字段（如 `Thinking to Content`）保持一致的敏感字段行为：非授权用户下呈现 `aria-disabled`，并登记进 `SENSITIVE_FORM_FIELDS`（做法与 B11 移植注意第 2 条相同）。
- **i18n**：新增 5 键 × 7 语言（`Home Page Style`、`Official home page`、`OpenRouter style home page`、`Select home page style`、`Layout of the site root route. Custom home page content takes precedence over both layouts.`）。**注意 en 的 key 必须与 `t()` 调用里的字面量逐字一致**（en 的 value 必须等于 key），否则英文界面显示中文。
- **移植注意**：若只想并存不顶替，**不要**应用 `routes/index.tsx`、`store`、`status-query`、`option.go`、`misc.go` 这 5 处的开关改动，只移植 `web/src/features/landing-v2/**` 并把 `/landing-v2` 当作独立预览路由。

### B6 · 防黑产/防自动化（Anti-Abuse）
- **文件**：`controller/checkin.go`、`controller/checkin_antiabuse_test.go`(新)、`common/constants.go`、`setting/operation_setting/checkin_setting.go`、`model/option.go`、`web/src/features/profile/**`
- **符号**：`RequireTopUp`、`BlockAutomatedUA`、`MaxCheckinPerIP`、`MaxRegisterNumPerIP`、`GetMaxRegisterNumPerIP()`/`SetMaxRegisterNumPerIP()`
- **存储**：全部在 `config.GlobalConfig` 注册的 JSON 配置（`checkin_setting`）+ `options` 键 `MaxRegisterNumPerIP` —— **签到设置新增 3 个字段不产生 DDL**（JSON 结构体，非表字段）
- **要点**：充值门槛判定依赖「是否充值过」，用 `checkin:user_topped_up:{userId}` 正缓存；**所有充值/兑换成功路径主动写入该标记**以消除 5 分钟负缓存延迟。
- **移植注意**：`RequireTopUp` 为 `true` 时必须确认 7 处标记写入仍在，否则用户充值后 5 分钟内无法签到。

### B7 · 在线客服预设体系
- **文件**：`setting/console_setting/config.go`、`setting/console_setting/validation.go`、`controller/customer_service_test.go`(新)、`web/src/features/system-settings/content/customer-service-section.tsx`、`web/src/features/landing-v2/components/customer-service*.tsx`
- **符号**：`ConsoleSetting.CustomerService`（JSON 数组字符串）、`CustomerServiceEnabled`、`GetCustomerService()`、`validateCustomerService()`
- **存储**：`console_setting`（注册于 `config.GlobalConfig`，落 `options` 表）—— **0 DDL**
- **移植注意**：官方基线**没有** `CustomerService` 字段，是本次新增；`validation.go` 的 `case "CustomerService"` 分支不可省（否则后台保存会绕过校验）。

### B8 · 本地图片压缩直传（零图床）
- **文件**：`web/src/lib/image-compress.ts`(新)、`controller/option.go`、`common/constants.go`、`web/src/features/system-settings/**`
- **符号**：`image-compress.ts` 导出压缩函数；支持文件选择 + 拖拽 + 剪贴板 `Ctrl+V`
- **机制**：浏览器 Canvas 等比降采样 → WebP/PNG → Data URL 持久化；后端做 **SVG 脚本注入过滤**与体积上限防御。
- **移植注意**：已移除官方原有的 Logo SVG `<title>` 提示与 `accept` 限制（属"与业务无关"回退的一部分）；2 条图片上传错误文案已包 `t()`。

### B9 · 中转报错脱敏与标准化映射
- **文件**：`service/error_sanitizer.go`(新)、`service/error_sanitizer_test.go`(新)、`common/error_rule.go`(新)、`i18n/keys.go`、`i18n/locales/{en,zh-CN,zh-TW}.yaml`、`model/option.go`、`web/src/features/system-settings/request-policies/error-mapping-section.tsx`(新)
- **符号**：`common.ErrorMappingRule{Id, Name, Keywords, MatchCode, ReplaceMsg, MessageKey, Enabled}`、`GetEffectiveErrorMappingRules()`、`MatchErrorRule(c, statusCode, rawMsg)`、`ClassifySmartFallback(c, ...)`、`SanitizeLogContent(c, content)`、`SanitizeUserLogs(c, logs)`
- **存储**：`options` 表键 `ErrorSanitizationEnabled`(bool)、`ErrorMappingRules`(JSON 数组字符串) —— **0 DDL**
- **要点**：
  - **10 条内置预设** + **14 条兜底分类**，全部 key 化（`MessageKey`），经 `i18n.T(c, key)` 按调用方语言下发；
  - **自定义规则无 `MessageKey`，原样输出站长文案**（绝不翻译，`resolveRuleMessage` 在 `MessageKey == ""` 时返回 `ReplaceMsg`）；
  - 翻译缺失时回退预设自带 `ReplaceMsg`，**绝不把 key 暴露给终端用户**；
  - `MessageKey` 字段有 `json:"message_key,omitempty"`，向后兼容旧规则 JSON；
  - 命中规则时网页日志和 API 错误使用替换文案；未命中规则时两者均保留原始错误。
- **规则校验**：`common.ValidateErrorMappingRules` 在保存 `ErrorMappingRules` 前拒绝启用规则之间的状态码范围重叠、空关键词兜底重叠和关键词子串重叠，避免一个错误命中多条规则。
- **前端冲突提示**：`web/src/features/system-settings/request-policies/error-rule-conflicts.ts`(新) 镜像后端判定（同样的分隔符归一化、状态码范围重叠、空关键词兜底与子串重叠规则），在可视化表格与 JSON 模式（以编辑器文本为准）中即时检出冲突：冲突行加 `bg-destructive/5` 底色并显示 `Conflict` 徽标，保存按钮上方用 `Alert variant='destructive'` 列出冲突规则对与重叠关键词，`handleSaveAll` 在冲突时直接拦截并提示；服务端错误经 `handleServerError` 保留原始原因，不再吞成通用文案。
- **移植注意**：`i18n.Translate` 已加 **nil-bundle 守卫**（`Init()` 前调用会 panic，属潜在生产事故）；自定义规则的 JSON 校验与重叠校验在 `validateOptionValue` 的 `case "ErrorMappingRules"`。

### B10 · 全链路 i18n
- **文件**：`i18n/i18n.go`、`i18n/keys.go`、`i18n/locales/{en,zh-CN,zh-TW}.yaml`、`web/src/i18n/locales/{en,zh,zh-TW,ja,fr,ru,vi}.json`、`setting/console_setting/validation.go`
- **规模**：后端 3 语言 × 265 键（其中 24 个 `sanitize.*` 为本次新增）；前端 7 语言 × **6976 键，0 缺失/0 多余/0 重复**（业务十三再 +7 键 × 7 语言）
- **约定**：
  - 后端库 `nicksnyder/go-i18n/v2`，语言 en / zh-CN / zh-TW；
  - 前端 `i18next`，key **就是英文源串**（flat JSON）；
  - **React 组件**用 `useTranslation()`；**非 React 代码**用 `import { t } from 'i18next'`。
- **移植注意**：新增 7 语种键必须**同时**补 7 个文件，否则 i18n 一致性校验失败。
  - 受影响的 7 个文件是 `en.json`、`zh.json`、`zh-TW.json`、`ja.json`、`fr.json`、`ru.json`、`vi.json`。**en 的 value 必须逐字等于 key**（否则英文界面会回退显示 key）。
  - **绝对不要**用 `i18n:sync` 之类的脚本机械追加 —— 本仓库实测该脚本不幂等，且曾因「用文件最后一个 `}` 定位插入点」把词条写到 `translation` 命名空间之外，导致渠道抽屉整块显示英文（详见 §8.2 P0-6）。手工编辑或写一次性脚本时，务必把新键插进 `"translation"` 对象**内部**。

### B11 · 伪 200 拦截与渠道重试（★ 设计已变更两次，务必按新版）
- **文件**：`service/pseudo_error_detector.go`(新)、`service/pseudo_error_detector_test.go`(新)、`relaykit/dto/channel_settings.go`、`controller/channel.go`、`router/channel-router.go`、`router/channel_router_test.go`、`relay/channel/openai/relay-openai.go`、`relay/channel/gemini/relay-gemini.go`、`relay/channel/{openai,gemini}/pseudo_200_test.go`(新)、`service/channel.go`、`web/src/features/channels/**`（types / channel-form / channel-configuration / channel-actions / api / channel-mutate-drawer / 4 个测试）
- **符号**：`IsPseudo200Error(settings dto.ChannelSettings, content string) (bool, string)`、`NewPseudo200Error(reason)`、`GetChannelDefaultPseudo200Rules()`、`MaxPseudo200Length()`、`maxPseudo200Length = 400`、`parsePseudo200Rules` / `matchPseudo200Rules` / `pseudo200RequiresSeparators`、`pseudo200Rule{prefix, requires}`（**无 `reason` 字段**：命中即以该条 `prefix` 作为日志标识，保证「留空用内置」与「回填后保存」两条路径日志一致）
- **存储**：**渠道级**，写在既有的 `channels.setting` TEXT 列（JSON）里，键 `pseudo_200_enabled` / `pseudo_200_custom_keywords` / `pseudo_200_rules` —— `model/channel.go` **零改动** → **0 DDL**
- **接口**：`GET /api/channel/default_pseudo_200_rules`（`authz.ChannelRead`）下发 `{rules, max_chars}`，用于渠道表单开启检测时回填内置规则。
- **⚠️ 关键设计（与历史版本不同，不要照抄旧文档）**：
  - **没有全局开关**，**没有全局规则**。历史上曾实现为 `common.Pseudo200DetectEnabled` / `Pseudo200CustomKeywords`，**已彻底删除**；若在旧分支看到这两个符号，那是废弃代码。
  - 判定**只依据本渠道自身设置**：`channel.Pseudo200Enabled == false` → 恒返回 `false, ""`。渠道之间**无任何共享状态**。
  - relay **8 处**调用点（OpenAI 4 + Gemini 4）均传入 `info.ChannelSetting`。
  - **规则表是可编辑的，不是写死的**：13 条内置指纹现由 `GetChannelDefaultPseudo200Rules()` 渲染成行式文本供渠道编辑；`Pseudo200Rules` **非空时替换**内置表，**为空时沿用**内置表（老渠道行为不变）。
- **规则文本格式**（`Pseudo200Rules`，每行一条）：
  ```
  the prompt could not be submitted
  the prompt contains sensitive words | violat, blocked, prohibited
  ```
  `|` 之前是**首部锚定**前缀，之后是**共现特征**。共现特征的分隔符**同时接受**半角逗号、全角逗号（中文输入法默认）与多余的 `|`（见 `pseudo200RequiresSeparators`）——操作者按直觉输入 `a | b，c` 或 `a | b | c` 时，若只认半角逗号会把 `b，c` 当成**一个**特征，导致规则静默失效。空行与 `#` 开头的行忽略；只有 `|` 没有前缀的行忽略（不得变成"匹配一切"）。

  典型内置条目：`the prompt could not be submitted`、`the prompt contains sensitive words | violat, blocked, prohibited`、`this request violates`。
  行格式记为 **`prefix | requires`**；`parsePseudo200Rules`（渲染/解析）与 `matchPseudo200Rules`（匹配）必须成对使用，`GetChannelDefaultPseudo200Rules()` 负责把 13 条内置表渲染成等价文本。
- **日志标识**：命中时 `reason` **即该条规则的 `prefix`**（不再单独维护描述文案）。因此「留空用内置」与「回填后保存」两条路径的判定与日志**完全一致**。
- **检测算法（低误判是核心）**：
  1. 渠道开关关闭 → 直接放行；
  2. 正文 `len(TrimSpace) > 400` → 放行（真拦截是短句，长文是正常产出）；
  3. **首部锚定 + 特征共现**：先 `stripLeadingNoise` 剥离噪声前缀（`error:` / `failed:` / `google api error:` 等 **8 种**），再要求正文**以某条规则的前缀开头**；配置了 `requires` 时要求其中**任一**出现；
  4. 渠道自定义特征按换行/逗号（含中文逗号）拆分，任一**包含**即命中，同样受 400 字符上限约束。
- **⚠️ 编辑规则时绝不可退化为「简单包含匹配」**：内置规则的 `prefix` 必须**锚定在正文开头**。实测把 13 条前缀当普通关键词做包含匹配，会让 4/4 条正常内容（引用报错、复述政策、解释拦截）**全部误判**。解析与匹配必须走 `parsePseudo200Rules` / `matchPseudo200Rules`。
- **效果（实测）**：正常内容（解释政策、翻译提示、复述报错、代码字符串、越狱原理讨论…）**全部不误判**；真实上游报错**全部命中**。测试用显式 `wantMatch:false`（14 条，含 10 条实测误判场景）与 `wantMatch:true`（4 条）固定该契约。
- **关闭时绝不影响正常请求**：`TestOpenaiHandler_Pseudo200DisabledChannelPassesThrough` 断言同一段拦截文案在**未开启检测**的渠道上**原样放行且正常计费**。
- **历史（已移除，勿重新引入）**：业务十一最初曾实现为「全局开关 + 全局规则」，对应文件 `web/src/features/system-settings/request-policies/pseudo-200-detect-section.tsx`，后按用户要求**整体改为渠道级**，该全局区块与其 i18n 已删除。若在旧分支看到该文件或 `Pseudo200DetectEnabled`，那是废弃代码。
- **命中后行为**：`NewPseudo200Error` 返回 502 + `ErrorCodePromptBlocked` → 触发换渠道重试 → 重试耗尽则退款。**不扣额度、不封渠道**。
- **防误封（显式，非巧合）**：`service/channel.go` 的 `ShouldDisableChannel` **首行**短路：
  ```go
  if err != nil && err.GetErrorCode() == types.ErrorCodePromptBlocked {
      return false
  }
  ```
  这一行不可删。删掉后会退化为依赖三个巧合（错误码无 `channel:` 前缀、502 不在禁用区间、文案不含 `AutomaticDisableKeywords`），任一变动就会误封健康渠道。
- **前端 UI**：渠道编辑抽屉 →「**请求与响应**」(Request & Response) 标签 → Request processing 卡片内：一个渠道级开关；开关打开后出现**可编辑规则 `Textarea`**（首次开启自动回填内置规则）与「**恢复默认**」按钮，其下另有「追加特征」`Textarea`。
  - 「恢复默认」复用既有 i18n 键 `Restore defaults`，未新增词条。
  - 清空规则框 = 回退内置表（与后端 `Pseudo200Rules == ""` 语义一致）。
- **⚠️ 共现特征的分隔符必须容错**（已踩过，属"静默失效"型缺陷）：`requires` 原本只认半角逗号，导致操作者按直觉输入后**前缀能命中但 requires 永远匹配不上，界面无任何提示**。两种真实触发方式：
  1. **全角逗号 `，`**（严重）：中文输入法默认打出全角逗号，`a | b，c` 会把 `b，c` 当成**一个**特征。而同一界面上的「自定义拦截特征」框（`splitCustomKeywords`）**已经支持** `，`，两处行为必须一致；
  2. **多余的 `|`**：`a | b | c` 只取第一个 `|` 作分隔，`b | c` 成为单个特征。
  归一化用 `pseudo200RequiresSeparators`（`strings.NewReplacer("|", ",", "，", ",")`），解析前统一替换。回归测试 `TestIsPseudo200ErrorChannelRulesSeparatorTolerance` 覆盖 6 种写法 + 3 个反向对照（容错**不得**削弱共现要求、前缀空白与大小写须归一、只有 `|` 无前缀的行必须忽略而非"匹配一切"）。
- **移植注意（易错点，均已踩过）**：
  1. `channel-configuration.ts` 的 `configured.requestProcessing` **必须**包含 `values.pseudo_200_enabled`，否则开关打开后卡片不显示「Configured」徽标；
  2. `channel-mutate-drawer.tsx` 的 `SENSITIVE_FORM_FIELDS` **必须**登记**三个**新字段（enabled / custom_keywords / rules），与同组官方字段权限行为一致；
  3. `channel-form.ts` 需 **6 处**改动：zod schema、2 处默认值、`transformChannelToFormDefaults` 解析、`buildSettingJSON` 序列化（+ `channel-configuration.ts` 的 fields 名单、`channel-actions.ts` 的 query key）；
  4. `channel-form-errors.ts` 的 `ADVANCED_SETTINGS_FIELDS` **故意未登记** —— 该名单仅驱动 `isAdvancedSettingsField`/`hasAdvancedSettingsErrors`，二者在仓库中**除自身外无调用方**，且新字段为可选类型不会产生校验错误，属"不修改非业务代码"；
  5. 新增规则框的 i18n 键只有 3 个（`Blocking signatures`、格式占位符、长度与回退说明），**7 个语种都要补**，否则一致性校验失败。
- **⚠️ 已知限制：流式请求只在「首帧」检测，拦截语跨帧会漏检**（真实 MySQL 环境实测确认，**不要**再写成「流式与首包探测」就完事）：
  - 机制：`OaiStreamHandler` 里 3 处检测都被 `info.SendResponseCount == 0` 门控。第 1 帧进 `dataHandler` 后才由 `HandleStreamFormat` 把 `SendResponseCount` 置 1（见 `relay/channel/openai/helper.go:26`），因此只有**第 1 帧**参与判定。
  - 实测矩阵（同一句内置拦截语 `this prompt contains sensitive words, which violates our policy`，检测已开启）：

    | 上游切分方式 | 请求方式 | HTTP | 检出 | 客户端是否看到拦截原文 |
    |---|---|---|---|---|
    | 整句一帧 | 流式 | 502 | ✅ | 否（0 字节下发） |
    | 整句一帧 | 非流式 | 502 | ✅ | 否 |
    | 切成 2 帧（`...sensitive ` + `words, which violates...`） | 流式 | **200** | ❌ | **是，全句泄露** |
    | 切成 2 帧 | 非流式 | 502 | ✅ | 否 |
    | 逐词切分（10 帧） | 流式 | **200** | ❌ | 否（各帧都太短，未命中 400 字符上限内的完整句式） |
    | 逐词切分 | 非流式 | 502 | ✅ | 否 |

  - 结论：**非流式客户端（含本渠道的 SSE 聚合回 JSON 路径）100% 检出**；流式客户端仅当上游把整条拦截语放在首个 SSE 帧时才检出。上游把拒绝语拆成多帧时，泄漏内容**已下发无法追回**，该次请求**照常计费、不触发换渠道重试**。
  - **未修复是刻意决定**（2026-06 实测后经确认）：修复需要把检测窗口从首帧延长到有界多帧，会改变首帧下发时机与延迟。**运维侧绕开办法**：在渠道规则列表里加一条**更靠前**的特征，或使用「追加特征」框（`Pseudo200CustomKeywords`，**包含匹配**、不要求首部锚定）。
  - 回归测试 `TestOaiStreamHandler_DetectsPseudo200StreamChunk` 用的是**单帧** SSE，因此测试通过**不能**证明跨帧场景可用。
  - 若日后要修：`relay/channel/openai/relay-openai.go` L131 / L161 / L177 三处 `SendResponseCount == 0` 门控需一并改成「首帧下发后有界窗口」，并补一个**跨帧**回归用例（当前仓库只用单帧用例，覆盖不到该缺陷）。

---

### B12 · OpenCode 渠道（官方客户端指纹伪装）
- **背景**：OpenCode 上游（默认 `https://opencode.ai/zen`）按客户端指纹拦截。普通客户端直接调用会得到 `400 MissingSessionID`、`403 Forbidden` 或 `429 FreeUsageLimitError`。因此新增独立渠道类型，协议完全兼容 OpenAI，仅在转发时补齐官方 CLI 指纹。
- **渠道类型**：`constant.ChannelTypeOpenCode = 64`（插在 `ChannelTypeSGLang=63` 与 `ChannelTypeDummy` 之间；`ChannelTypeDummy` 无显式值，顺延为 65）。**注意**：`ChannelTypeDummy` 被 `controller/model.go` 用作循环上界（`i <= ChannelTypeDummy`），顺延后这些循环会自动覆盖 64，属预期行为。
- **文件**：`relay/channel/opencode/adaptor.go`(新)、`relay/channel/opencode/constants.go`(新)、`relay/channel/opencode/adaptor_test.go`(新)、`constant/channel.go`、`constant/api_type.go`、`common/api_type.go`、`relay/common/relay_info.go`（`streamSupportedChannels` 注册 64）、`relay/relay_adaptor.go`（`GetAdaptor` 增加 `case constant.APITypeOpenCode`）、`controller/channel.go`、`web/src/features/channels/{constants.ts,lib/channel-type-config.ts,lib/channel-utils.ts}`、`web/src/i18n/locales/*.json`（`en/zh/zh-TW/ja/fr/ru/vi` 7 个）
- **符号**：`opencode.Adaptor{openai.Adaptor}`（**内嵌**，只覆写 `SetupRequestHeader` / `GetModelList` / `GetChannelName`，其余 12 个方法由 embedding 提升）、`SetupOpenCodeHeaders(header *http.Header, c *gin.Context)`、`constant.APITypeOpenCode`、`CHANNEL_TYPE_OPENCODE = 64`
- **存储**：**零新增字段**。渠道类型是既有 `channels.type` 列的一个新取值，配置复用既有列与 `setting` JSON → **0 DDL**。
- **伪装规则（`SetupOpenCodeHeaders`）**：

  | 请求头 | 规则 |
  |---|---|
  | `User-Agent` | 客户端 UA 以 `opencode/` 开头**且版本 ≥ 1.17** 才原样透传；否则覆盖为 `opencode/1.18.31`。前缀判定大小写不敏感，透传时 trim。**注意**：过旧的官方 UA（如 `opencode/1.3.15/cli`）同样被闸门拒绝，必须覆盖 |
  | `Accept` | 固定 `application/json, text/event-stream`（官方 CLI 声明原生支持流式） |
  | `x-opencode-client` | 固定 `cli`；仅当尚无该值时设置 |
  | `x-opencode-session` | 取**第一个非空**信号后规范化：优先请求体阶段派生的稳定标识 → `x-opencode-session` → `x-session-affinity` → `X-Session-Id` → `x-session-id` → `session-id` → `conversation-id`；都没有才新生成 |
  | `x-session-affinity` / `X-Session-Id` | 与 `x-opencode-session` **同值**（1.18.x 的关联别名，同时保留 `x-opencode-session` 以兼容较早的 Zen 部署） |
  | `x-opencode-request` | **每次调用**都生成新 ID（标识"本次请求"，不可继承） |
  | `x-opencode-project` | `prj_ + 24 位十六进制`，由工程信号 SHA-256 确定性派生；仅当尚无该值时设置 |
  | `x-parent-session-id` | **仅在客户端提供时**透传，不凭空生成 |

  **ID 形状（关键）**：`ses_` / `msg_` + 12 位小写十六进制时间字段 + 14 位 base62，总长 26 —— **不是 UUID**。时间字段为 `毫秒 × 0x1000 + 同毫秒自增计数`（`ses_` 取反为 descending），与官方生成器
  `packages/opencode/src/id/id.ts` 一致。非官方形状的下行信号（UUID、外部会话）会被**确定性哈希**成合规 ID 而非丢弃，否则多轮对话每轮换会话、丢掉上游 prompt 缓存亲和性。

  **请求体形状（关键）**：闸门同时校验请求体。免费请求须 `stream: true` 且声明官方内置工具 `bash`/`edit`/`glob`/`grep`/`read`（描述固定为 `Agent tool <name>`），否则在**所有通道**返回 `403 FreeTierError`。非流式客户端由本渠道把 SSE 聚合回 JSON。

- **header_override 优先级最高（不要在适配器里自己处理）**：两条链路都在本函数**之后**套用 override —— 转发链路是 `channel.DoApiRequest` 在 `SetupRequestHeader` 之后调用 `applyHeaderOverrideToRequest`（见 `relay/channel/api_request.go` 注释「确保用户设置优先级最高」）；模型拉取链路是 `applyFetchModelsHeaderOverrides` 在 `buildFetchModelsHeaders` 里于本函数之后调用。因此**只需把 `SetupOpenCodeHeaders` 放在 override 之前**即可，无需特殊分支。
- **模型拉取也要伪装**：`controller/channel.go` 的 `buildFetchModelsHeaders` 增加 `channel.Type == constant.ChannelTypeOpenCode` 分支并调用 `opencode.SetupOpenCodeHeaders(&headers, nil)`（`c == nil` 走到默认指纹分支）。否则后台「获取模型列表」会被上游拦截。
- **前端**：`constants.ts` 新增 `CHANNEL_TYPE_OPENCODE = 64`、`CHANNEL_TYPES[64]='OpenCode'`、`CHANNEL_PROVIDER_PRESENTATION[64]`、`CHANNEL_TYPE_DISPLAY_ORDER` 加入 64（紧随 61）、三个 Set（`MODEL_FETCHABLE_TYPES` / `FIELD_PASSTHROUGH_TYPES` / `OPENAI_FIELD_PASSTHROUGH_TYPES`）加入 64、`TYPE_TO_KEY_PROMPT[64]`；`channel-type-config.ts` 注册配置（**icon `'OpenCode'`**，`@lobehub/icons` 已内置该图标，无需新增资源）；`channel-utils.ts` 的 `TYPE_TO_ICON[64]='OpenCode'`。
  - 历史注：早期版本曾复用官方 `'OpenAI'` 图标（`TYPE_TO_ICON[64]='OpenAI'`），现已改为 `'OpenCode'`。
  - 过旧官方 UA（例如 `opencode/1.3.15/cli`）同样被闸门拒绝，必须覆盖为 `opencode/1.18.31`（见上表 `User-Agent` 行）。
- **⚠️ 必须覆写 `DoRequest`（最隐蔽的坑）**：`openai.Adaptor.DoRequest` 内部调用
  `channel.DoApiRequest(a, ...)`，其中 `a` 是**静态接收者类型**。若本包不覆写 `DoRequest`，
  传下去的是 `*openai.Adaptor`，于是 `SetupRequestHeader` 分发到 openai 的实现，
  **本包的指纹注入被彻底旁路** —— 上游只会看到 `Go-http-client/1.1` 且没有任何
  `x-opencode-*` 头，必然 403。
  - 这类缺陷**无法**被「直接调用 `SetupOpenCodeHeaders`」的单元测试发现，必须用
    **真实 HTTP 服务器抓包**验证（见 `dispatch_test.go`）。
  - 同理，`DoRequest` 内还会对**透传模式**（`PassThroughBodyEnabled` / 全局透传）做兜底整形：
    该模式绕过 `ConvertOpenAIRequest`，否则请求体缺少 agent 形状会 100% 触发 403。

- **⚠️ 易错点**：
  1. `CHANNEL_PROVIDER_PRESENTATION` 有 `satisfies Record<Exclude<keyof typeof CHANNEL_TYPES, 0 | 61>, …>` 约束 —— **给 `CHANNEL_TYPES` 加了键就必须同步加 presentation**，否则 typecheck 直接失败；
  2. `opencode.Adaptor` 用**值内嵌** `openai.Adaptor`（不是指针），embedding 才能提升全部方法满足 `channel.Adaptor` 接口；
  3. `SetupOpenCodeHeaders` 必须容忍 `c == nil` 与 `header == nil`（后台任务无请求上下文）；
  4. 新增的 2 个 i18n 键（渠道描述与 Key 提示）必须加在 `"translation"` **对象内部**（见 §1 约束三与 §8.2 P0-6）。
- **测试**：`relay/channel/opencode/adaptor_test.go` 17 个用例覆盖通用 UA 替换（Cursor / Cherry Studio / NextChat / Python / curl / 空）、官方 UA 透传（含大小写与首尾空白）、client 名注入与不覆盖、session 生成/继承/优先级/空白回退/不覆盖既有、request id 唯一性与强制刷新、`c == nil` 与 `header == nil` 的健壮性、override 覆盖。前端在 `new-api-channel.test.ts` 覆盖下拉选项、排序、三个 Set、图标、默认 Base URL、Key 提示、预置模型与表单往返。
- **自查命令**：`go test -v ./relay/channel/opencode/...`；`bun x vitest run src/features/channels`。

### B13 · 聊天预设跳转前选择 API Key
- **背景**：侧边栏「聊天」应用在跳转前会**静默取第一个启用的令牌**，用户有多个 Key 时无从选择，且客户端会拿到哪个 Key 不可预期。
- **文件**：`web/src/features/chat/components/chat-key-dialog.tsx`(新)、`web/src/features/chat/components/chat-key-prompt-provider.tsx`(新)、`web/src/features/chat/hooks/use-chat-key-prompt.ts`(新)、`web/src/stores/chat-key-preference-store.ts`(新)、两个 `__tests__/`(新)、`web/src/components/layout/components/chat-presets-item.tsx`、`web/src/components/layout/components/authenticated-layout.tsx`、`web/src/features/chat/hooks/use-active-chat-key.ts`、`web/src/routes/_authenticated/chat/$chatId.tsx`、`web/src/i18n/locales/*.json`（7 语言）
- **符号**：`ChatKeyDialog`、`ChatKeyPromptProvider`、`ChatKeyPromptHandle.requestKey(preset, onPick?)`、`useChatKeyPrompt()`、`useChatKeyPreferenceStore`（持久化键 `chat-key-preference`，只存 `lastTokenId`）、`fetchEnabledChatKeys()`、`fetchChatKeyByTokenId(tokenId)`
- **两条启动路径**（同一个弹窗，确认后才启动）：
  1. **`web` 预设需要 Key** → 弹窗 → 确认 → `navigate({to:'/chat/$chatId', params:{chatId}, search:{key: tokenId}})`；`$chatId.tsx` 用 `z.object({key: z.coerce.number().int().positive().optional().catch(undefined)})` 校验 search 参数，非法值一律降级为「无参数」而**不抛 `SearchParamError`**。
  2. **自定义协议预设需要 Key**（cherry / aionui / deepchat / aqbot）→ 弹窗 → 确认 → 回传 tokenId 给调用方 → `fetchChatKeyByTokenId` → `resolveChatUrl` → `window.open`。通过 `requestKey(preset, onPick)` 的第二个参数复用同一弹窗（`ChatKeyPromptProvider` 内部按有无 `onPick` 分流：有则只回传、无则自己 `navigate`）。
  - 不需要 Key 的纯外链预设仍然**直接跳转**，不弹窗。
  - `/chat/{id}` 不带 `key` 参数时**回退为第一个启用令牌**（旧行为保留，直接贴链接仍可用）。
- **存储**：**零新增字段**。弹窗列表读 `GET /api/token/?p=1&size=100`（后端把 `size` 钳到 100）筛选 `status=ENABLED`；**列表接口返回的是脱敏 Key**（`GetMaskedKey()`，保留首 4 末 4），完整密钥必须用 `POST /api/token/{id}/key` 换取（该接口有审计）。上次选择存 `localStorage` 的 `chat-key-preference`，是**全局单值**，不按预设区分。
- **⚠️ 弹窗必须挂在侧边栏之外**：由 `authenticated-layout.tsx` 在 `SidebarProvider` 内、侧边栏**之外**渲染。若嵌进侧边栏，移动端抽屉 `SheetContent` 为 `z-60` 而 dialog overlay/popup 为 `z-50`，弹窗会被抽屉盖住且丢失遮罩。此外 `requestKey` 里必须先 `setOpenMobile(false)` 关掉移动端抽屉。
- **⚠️ 无障碍坑**：`SidebarMenuSubButton` 的 `useRender` 默认渲染 `<a>`；只传 `onClick` 会得到一个**无 `href` 的锚点**，既不可聚焦也不带 `role=button`（实测 `FOCUSABLE=none`、`ROLE_BUTTON_COUNT=0`）。必须补 `render={<button type='button' />}`。业务十三的两处入口都已修。
- **⚠️ TanStack Router 传参坑**：`buildLocation` 用 `dest.search === true` 判断是否继承当前 search，所以不带 `search` 的 `<Link>` 会**继承当前查询串**。跳转到 `/chat/{id}` 的 `Link` 必须显式写 `search={{}}`，否则可能把上一次的 `?key=` 带过去。
- **移植注意**：
  1. `chat-key-preference` **没有**登记进 `frontend-cache.ts` 的 `PRESERVED_LOCAL_STORAGE_KEYS`，因此 `FRONTEND_CACHE_VERSION` 变更时会连同其它键一起被清空（可接受：只丢一个「上次选择」）。
  2. `useEnabledChatKeys(enabled)` 带 `meta:{errorToast:false}` —— 列表失败由弹窗内联渲染（`ErrorState` + 重试），**不要**改成全局 toast。
  3. `ChatKeyDialog` 以 `key={preset?.id ?? 'none'}` 挂载，使 `pickedTokenId` 随预设切换而重置；`open` 同时作为 `useEnabledChatKeys` 的开关，弹窗不可见时不发列表请求。
  4. 本项**未**改动 `chat2link.tsx` 与 `data-table-row-actions.tsx`，二者仍取第一个启用令牌（用户明确划出范围）。
  5. **纯前端改动，未改任何 Go 文件**，不涉及数据库与计费。
- **测试**：`chat-key-dialog.test.tsx` 4 例（只列启用令牌并默认确认第一个 / 确认所选项 / 无启用令牌时给「去创建」入口且确认禁用 / 列表失败显示 `Unable to load API keys` 与重试）；`chat-key-prompt.test.tsx` 4 例（确认后跳转带 `key` 参数 / 取消不改路由且不记忆 / 协议调用方拿到 tokenId 且**路由不变** / 取消不调用协议调用方）。共 **2 文件 / 10 用例**。

#### B13-r1 · 选 Key 弹窗的视觉与滚动修订（同一文件，`4234fb98e`）

弹窗偏小、选项是「裸单选行」、Key 一多就出现 **Windows 原生灰滚动条**，且 Chromium 下选中态出现**黑色垂线**与**空心黑洞**。全部在 `chat-key-dialog.tsx` 内解决，**未改任何 Go / DDL / 数据库 / 公共组件**。

1. **加宽**：`contentClassName` 由 `sm:max-w-md`（448px）改为 `sm:max-w-lg`。headless Chromium 实测 `dialogW=512`。
2. **卡片式选项**：整行包成 `<Label>`，`p-3.5 rounded-xl border transition-all cursor-pointer`；未选中 `border-border/60 hover:bg-muted/40 hover:border-border`，选中 `has-data-[checked]:border-primary / bg-primary/5 / ring-1 / ring-primary`。密钥徽章改为 `<code>`，右对齐。实测选中卡片 `border=oklch(0.692 0.141 243.716)`、`bg=oklab(… / 0.05)`、`box-shadow` 含 `0 0 0 1px <primary>`；未选中 `border=oklab(0.93 0 0 / 0.6)`、`bg=transparent`、`shadow=none`。
3. **黑色垂线 + 空心黑洞**：`RadioGroupItem` 补 `after:hidden`（干掉伪元素 —— 公共基类只写了 `after:absolute after:-inset-x-3 after:-inset-y-2` 而**没有 `content`**，浏览器按 `content:""` 计算出一个真实盒子，是垂线的来源）与 `[&>[data-slot=radio-group-indicator]>span]:bg-primary`（把圆点染回主色）。
   - **⚠️ 必须同时补 `dark:data-checked:bg-transparent`**。公共基类同时有 `data-checked:bg-primary` 与 `dark:data-checked:bg-primary`，二者是不同 variant，`tailwind-merge` **只会删掉前者**，所以只按「`data-checked:bg-transparent`」写，暗色下 `dark:data-checked:bg-primary` 仍然胜出 —— 实测暗色 `ring=oklch(0.54 0.142 248.516)` 且 `dot` 与之同色，即**实心圆盘、圆点不可见**（就是那个「黑洞」）。补上后暗色 `ring=rgba(0,0,0,0)` + 圆点可见。这是 A/B 实测结论，不是推断。
4. **原生滚动条**：列表包进公共 `ScrollArea`（其自带 `scrollbar-width:none` + `::-webkit-scrollbar{display:none}`）。
   - **⚠️ 只写 `max-h-[340px]` 不生效**：`ScrollArea` 的 viewport 是 `size-full`（`height:100%`），挂在**只设了 `max-height`** 的根上时 viewport 不受约束。实测 `rootBox=340, vpClientH=620, vpScroll=620, scrolls=false` —— 完全不滚，内容直接溢出。`display:grid` 不写 `grid-template-rows` 同样失败（`vpClient=620, scrolls=false`）。
   - 实测可用写法（都能滚）：`max-h + flex flex-col + 子元素 min-h-0`、`max-h + grid + grid-template-rows:minmax(0,1fr)`、固定 `height`、根与 viewport 都设 `max-h`。**本项目采用** `flex max-h-[340px] flex-col px-1 py-1 *:min-h-0`。
   - 采用后的实测：条目少 → `saH=196 vpClient=188 vpScroll=188 internalScroll=false`（贴合内容）；条目多 → `saH=340 vpClient=332 vpScroll=584 internalScroll=true`。两种情况下 **`nativeGutter=0`、`scrollbarW=none`**，即无原生滚动条、无宽度跳动。
   - 另外补了 `font-normal`：公共 `Label` 基类带 `font-medium`，不覆盖会把密钥名一起加粗。`data-checked:border-primary` 基类已有，保留为无害冗余。
5. **jsdom 必须补 `getAnimations`**：Base UI 的 `ScrollAreaViewport` 挂载后会调 `viewport.getAnimations()`，jsdom 未实现，抛 `TypeError` 使 `vitest run` **退出码 1**（断言其实全过）。两个 chat 测试文件各加 `beforeAll` 桩（与仓库既有 `user-binding-dialog.test.tsx`、`channel-configuration.test.tsx` 做法一致）。
6. **改动文件**：`chat-key-dialog.tsx`、`chat-key-dialog.test.tsx`、`chat-key-prompt.test.tsx`。`chat-key-dialog.test.tsx` 原 4 例**全部保留通过**，另加 2 例布局/交互回归（点卡片右侧密钥徽章可选中该行；长列表留在 `scroll-area-viewport` 内且根节点 `max-h-[340px]`）。
- **自查命令**：`cd web && bun x vitest run src/features/chat`；`bun run typecheck`。

### B14 · 侧栏 CC Switch 导入入口
- **背景**：CC Switch 是客户端导入目标，不应作为普通聊天预设启动。侧栏新增独立入口，位于「游乐场」和「聊天」之间，供用户先选择 API Key，再打开 CC Switch 导入配置。
- **文件**：`web/src/components/layout/components/cc-switch-menu-item.tsx`（新）、`web/src/features/keys/components/cc-switch-import-provider.tsx`（新）、`web/src/components/layout/components/nav-group.tsx`、`web/src/components/layout/index.ts`、`web/src/components/layout/types.ts`、`web/src/hooks/use-sidebar-data.ts`、`web/src/hooks/use-sidebar-config.ts`、`web/src/components/layout/components/authenticated-layout.tsx`，以及侧栏测试文件。
- **行为**：入口不依赖后台 `Chats` 配置，因此管理员删除旧的 `ccswitch` 项后入口仍存在；入口与聊天模块共用原有管理员 × 用户可见性门控。移动端打开密钥选择前会关闭侧栏抽屉。
- **密钥流程**：列表只显示启用密钥的脱敏值；用户确认后使用既有鉴权接口取得完整密钥，再交给 CC Switch 导入对话框。关闭对话框会清理临时密钥状态；不新增数据库字段或后端接口。
- **废弃 marker**：聊天子菜单只过滤精确的裸值 `ccswitch`（忽略首尾空白和大小写），避免与顶层入口重复并阻止无效的 `/dashboard/ccswitch` 跳转；其他聊天预设和 API 密钥页面的官方 CC Switch 流程不改。
- **移植边界**：保留 API 密钥页面自身的 `CCSwitchDialog` 与行操作，不要把 API 密钥页面改为依赖侧栏的全局 Provider。侧栏 Provider 只服务新增的侧栏入口。
- **提交**：初始实现及修复见 `9a6de705c`、`6b18c18b3`、`8760a2f17`；官方流程恢复见 `e9db0a982`；裸 marker 过滤修复见 `fb89540c6`。
- **自查命令**：`cd web && bun x vitest run src/components/layout/components/__tests__/cc-switch-menu-item.test.tsx src/features/keys/components/__tests__/api-key-listing.test.tsx src/hooks/__tests__/sidebar-config.test.tsx`；`bun run typecheck`；对受影响文件执行 `bun x oxlint`。

---

## 3. 改动文件清单（147 业务文件）

### 3.1 按层统计（实测）

| 层 | 新增 | 修改 | 小计 |
|---|---|---|---|
| 前端 `web/src/` | 27 | 61 | **88** |
| 后端 `*.go`（含 `service`/`model`/`controller`/`relay`/`relaykit`/`common`/`setting`/`router`） | 18 | 38 | **56** |
| 其它（根目录文档、`VERSION`、workflow、`i18n/locales/*.yaml`） | 3 | 4 | 7 |
| **合计** | **48** | **103** | **151** |

其中**业务**文件 147 个（45 新增 + 102 修改），**非业务** 4 个（见 §0）。业务十三（聊天选 Key）自身改了 17 个文件（6 新增 + 11 修改），全部是前端；由于其中 7 个 i18n locale 在业务十二阶段就已在改动清单内，**§3 的净增量是 +6 新增 / +4 修改**。

Go 文件按目录细分的修改数：`controller` 10、`model` 6、`relay` 5、`router` 3、`service` 3、`setting` 3、`common` 2、`constant` 2、`i18n` 2、`relaykit` 2 = **38**（**业务十三未改任何 Go 文件**）。
前端修改数 Top：`web/src/features/**`、`web/src/i18n`、`web/src/lib`、`web/src/context`、`web/src/components`。

### 3.2 新增文件（45 个业务文件）

```
common/error_rule.go
controller/checkin_antiabuse_test.go
controller/customer_service_test.go
model/affiliate_reward.go
model/affiliate_reward_test.go
relay/channel/gemini/pseudo_200_test.go
relay/channel/openai/pseudo_200_test.go
relay/channel/opencode/adaptor.go
relay/channel/opencode/adaptor_test.go
relay/channel/opencode/agent_shape_test.go
relay/channel/opencode/constants.go
relay/channel/opencode/default_model_test.go
relay/channel/opencode/dispatch_test.go
relaykit/types/error_test.go
service/error_sanitizer.go
service/error_sanitizer_test.go
service/pseudo_error_detector.go
service/pseudo_error_detector_test.go
web/src/features/channels/components/__tests__/pseudo-200-i18n.test.tsx
web/src/features/channels/lib/__tests__/pseudo-200-configuration.test.ts
web/src/features/chat/components/__tests__/chat-key-dialog.test.tsx
web/src/features/chat/components/__tests__/chat-key-prompt.test.tsx
web/src/features/chat/components/chat-key-dialog.tsx
web/src/features/chat/components/chat-key-prompt-provider.tsx
web/src/features/chat/hooks/use-chat-key-prompt.ts
web/src/features/home/__tests__/root-route.test.tsx
web/src/features/landing-v2/**                      (11 文件)
web/src/features/profile/__tests__/checkin-topup-gate.test.tsx
web/src/features/system-settings/content/customer-service-section.tsx
web/src/features/system-settings/general/__tests__/home-page-style.test.tsx
web/src/features/system-settings/request-policies/error-mapping-section.tsx
web/src/features/usage-logs/lib/__tests__/model-mapping-visibility.test.ts
web/src/lib/image-compress.ts
web/src/routes/landing-v2.tsx
web/src/stores/chat-key-preference-store.ts
```

（另 3 个非业务**新增**文件：`.github/workflows/docker-image.yml`、`UPGRADE_GUIDE.md`、`README_CN.md`；`VERSION` 为修改。**文档只有两份**：本手册 + `README_CN.md`。仓库内旧文档 `PORTING_GUIDE.md`（「10 大业务」旧版）与原 `PORTING_NOTES.md`（移植过程记录）**均已删除** —— 后者的全部内容已合并进本手册 §8）

### 3.3 新增配置键总表

**`options` 表**：
`MaxRegisterNumPerIP`、`AffiliateCommissionRate`、`AffiliateDescription`、`DefaultThemeSettings`、`HomePageStyle`、`ErrorSanitizationEnabled`、`ErrorMappingRules`

**`console_setting`（JSON，落 options）**：
`customer_service`（结构体 `console_setting.CustomerService`）、`customer_service_enabled`

**`checkin_setting`（JSON，落 options）**：
`require_topup`、`block_automated_ua`、`max_checkin_per_ip`

**`channels.setting`（JSON，渠道级）**：
`pseudo_200_enabled`、`pseudo_200_custom_keywords`、`pseudo_200_rules`

**`channels.type` 新取值**：`64`（OpenCode，见 B12）—— 复用既有列，**不新增任何配置键**。

**新增表**：`affiliate_rewards`（唯一）

---

## 4. 移植 SOP

### 4.1 方式 A：补丁一键应用（推荐）

```bash
git clone <官方仓库> new-api && cd new-api
git checkout 6370b2942                 # 官方基线（= v1.0.0-rc.42，同步时的 upstream/main）
git apply /path/new-api-official-11-businesses.patch
git add -A && git commit -m "port 11 businesses"
```

**已验证**：该补丁可干净应用，`git write-tree` 得到的树哈希与交付仓库 `HEAD^{tree}` **完全相同**（163 文件改动，含新增的 `relay/channel/opencode/` 包、`web/src/features/chat/components/` 与报错映射冲突处理模块）。
> 验证方式（可复现）：`git worktree add --detach 6370b2942` → `git apply --check`（exit 0）→ `git apply` → `git add -A && git write-tree`，树哈希与交付仓库 `HEAD^{tree}` 相同。
> `git apply` 可能提示几行 trailing whitespace —— 那是 markdown 文档里的**有意**换行空格，非错误。

### 4.2 方式 B：变基到更新的官方版本

```bash
git remote add upstream https://github.com/Calcium-Ion/new-api.git
git fetch upstream
git rebase upstream/main            # 或指定目标提交
```

**冲突高发文件与处理**：

| 文件 | 冲突原因 | 处理 |
|---|---|---|
| `relay/channel/{openai,gemini}/relay-*.go` | 上游频繁改动响应处理 | 保留上游逻辑，**只重新插入 8 处 `service.IsPseudo200Error(info.ChannelSetting, …)` 调用** |
| `web/src/features/channels/components/drawers/channel-mutate-drawer.tsx` | 官方 5000+ 行高频变更 | 保留上游，重新插入 `pseudo200Fields`（规则框 + 恢复默认 + 自动回填）与 `SENSITIVE_FORM_FIELDS` 的 **3 个**键 |
| `model/option.go` | 官方持续新增 option | 保留上游，重新加 7 个 `OptionMap[...]`（含 `HomePageStyle` + `validateOptionValue` 分支）与对应 `case` 分支 |
| `web/src/routes/index.tsx` | 官方首页路由 | 保留上游的 `createFileRoute('/')`，把 `component` 换成读 `config.homePageStyle` 的 `RootPage()`；**默认分支必须回 `Home`** |
| `web/src/lib/status-query.ts` / `web/src/stores/system-config-store.ts` | 官方持续新增 status 字段 | 保留上游，重新加 `normalizeHomePageStyle` + `homePageStyle` 字段映射 |
| `model/topup.go` | 官方改充值链路 | 保留上游，重新加 6 处 `processTopUpAffiliateRewardTx` 与 0 额度守卫 |
| `web/src/i18n/locales/*.json` | 官方持续加键 | 保留上游，重新追加本仓库新增键（7 语言**同步**）。**注意**：新键必须加在 `"translation"` **对象内部**，加在根对象会导致 i18next 回退显示英文 key（见 §1 约束三与 §8.2 P0-6） |
| `model/main.go` | AutoMigrate 列表 | 保留上游，重新加 `&AffiliateReward{}` |
| `controller/channel.go` + `router/channel-router.go` | 官方持续新增接口 | 保留上游，重新加 `GetChannelDefaultPseudo200Rules` 与其路由项（`authz.ChannelRead`），以及 `buildFetchModelsHeaders` 的 OpenCode 分支 |
| `constant/channel.go` + `constant/api_type.go` + `common/api_type.go` | 官方持续新增渠道类型 | 保留上游，重新加 `ChannelTypeOpenCode = 64`（**必须插在 `ChannelTypeDummy` 之前**）、`ChannelBaseURLs[64]`、`ChannelTypeNames[64]`、`APITypeOpenCode` 与 `ChannelType2APIType` 分支 |
| `web/src/features/channels/constants.ts` | 官方持续新增渠道类型 | 保留上游，重新加 `CHANNEL_TYPE_OPENCODE`、`CHANNEL_TYPES[64]`、`CHANNEL_PROVIDER_PRESENTATION[64]`（**`satisfies` 约束要求两者同步**）、display order 与 3 个 Set |

### 4.3 变基后必须回归的验证

```bash
# 1. 双 module 构建
go build ./common/... ./model/... ./service/... ./relay/... ./controller/... ./router/... ./setting/...
cd relaykit && GOWORK=off go build ./... && cd ..

# 2. 业务测试
go test ./service/ -run "Pseudo200|Sanitiz|ErrorMapping"
go test ./relay/channel/openai/ ./relay/channel/gemini/ -run Pseudo200
go test ./model/ -run "Affiliate|TopUp"
go test ./controller/ -run "Checkin|CustomerService|HomePageStyle"

# 3. 前端
cd web && bun run typecheck && bun x vitest run --pool=threads
```

> `go build ./...` 在根模块会因 `main.go:44 pattern web/dist: no matching files` 失败 —— 这是**官方既有条件**（前端未构建），非缺陷。用上面的显式包列表，或先 `cd web && bun run build`。

---

## 5. 部署要点

- **端口/环境**：沿用官方；本仓库未新增必需环境变量。
- **`VERSION`**：Dockerfile 用它注入前端与 Go 版本号（**当前 `v1.0.0-rc.42`**）。`.github/workflows/docker-image.yml` 的 `paths` **包含 `VERSION`**，所以改它就会触发一次镜像构建。**不要清空**。版本号与代码的关系：`v1.0.0-rc.42` 对应官方提交 `6370b2942`，而我们已含该提交及其之前全部官方提交，因此 `rc.42` 是"不低于"实际代码的准确说法；后续再同步官方时**记得同步抬高这个号**。
- **三方言**：本次未引入任何方言特有能力；`affiliate_rewards` 用标准 GORM 定义。
  - **MySQL 已实测**：Ubuntu 24.04 + **MySQL 8.0.46**（`caching_sha2_password`、`utf8mb4_0900_ai_ci`、`ONLY_FULL_GROUP_BY` + `STRICT_TRANS_TABLES`），真实二进制部署 + 建表 + 13 项功能 + 官方 MySQL 数据库矩阵测试（见 §6.1 / §6.3）。
  - PostgreSQL 仍未实测（本次未引入 PG 特有写法）。
- **镜像**：`ghcr.io/nkbaa/new-api:latest`（push 到 main 由 `docker-image.yml` 自动构建，多架构 amd64+arm64）。
  - **✅ 当前 `latest` 已包含 `v1.0.0-rc.42` 合并**：对应提交 `0c05b1995`，构建 run `37780559377`（run number 97），**success**，16 分 22 秒，摘要 `sha256:15eedde357395fae558d82fdefce5e70f10d55043fd8bb0c2270d7351eef28da`。**14 项业务 + 官方 `v1.0.0-rc.42` 全部 20 个提交（含 `tokenkit` 模块、多厂商 Web Search 计费、Google Search grounding 计费）+ 错误映射冲突高亮与保存拦截 + 未匹配错误原文保留 + 首页风格开关 + 下拉框宽度修复 + B13-r1 弹窗修订，全都在里面。**
  - **验证方法（可复现）**：侧边栏点聊天应用 → **弹出选 Key 窗口** → 业务十三已就绪（这是最直接的判据，因为业务十三**没有后端接口变化**，`/api/status` 无法区分新旧镜像）；弹窗宽度 448px、选项是**裸单选行** → 是 B13-r1 之前的旧镜像，**512px 卡片式选项 + 选中整行高亮** → B13-r1 已就绪；`curl /api/status` 有 `home_page_style` 字段 → 首页风格开关已就绪；后台「系统设置 → 站点 → 系统信息」展开「Home Page Style」下拉，第二项文案完整不被截断 → 宽度修复已就绪；后台「设置 → 安全」里出现**可按权限分配的新访问令牌**（而不是旧的单个系统令牌）→ 官方 20 个提交已就绪；后台「系统设置 → 请求策略」新增两条相同或重叠关键词规则 → 立即高亮红色 Badge 并拦截保存；`docker run --rm ghcr.io/nkbaa/new-api:latest --version` 应输出 **`v1.0.0-rc.42`** → 版本号已抬高。
  - **摘要自查命令**：`docker buildx imagetools inspect ghcr.io/nkbaa/new-api:latest`（应输出上面的 `15eedde3…`）。
  - **路径过滤器的行为（已实测，别误解）**：`docker-image.yml` 的 `paths` 只含代码目录（`*.go`、`web/**`、`relaykit/**` 等），**不含 `*.md`**。判定依据是**整次 push 涉及的文件集合**，不是最后一个提交：
    - 只包含文档提交的 push → **不触发**。实例：`0d87a54ea`、`bc47442ee` 两次 push 在 Actions 里**都没有任何 run**。
    - push 里**只要含一个**改了代码的提交 → 触发，且 run 的 `head_sha` 记在**该次 push 的最后一个提交**上。**因此不能只看 `head_sha` 判断"这个提交是否改了代码"** —— 例如 run `36325552289` 的 `head_sha` 是纯文档提交 `88d694850`，但它是因为同一次 push 里带了 `309b9b4f6`（首页风格开关，改了 `*.go` 与 `web/**`）才触发的，它构建出来的镜像里包含 `309b9b4f6` 的代码。
    - 相关实例：`af7b2a3af`（宽度修复，改代码）→ run `36330275827` success；`7420d157b`（业务十三，改代码）→ run `36660495979` success；`4234fb98e`（B13-r1，改代码）→ run `36694962074` success；`6fab4aa6c`（合并官方，改代码）→ run `36735279454` success；`f5b742afe`（**只改 `VERSION`**，因为 `paths` 里含 `VERSION`）→ run `36739694276` success。**反向实例**：`2d59bcee7`（纯文档同步提交）push 后，Actions 里**没有新增任何 run**；随后同一类操作三次复现 —— B13-r1 的**代码**提交 `4234fb98e` 触发 run#77，其后的**文档**提交 `5832ed958` push 后**没有新增 run**；合并提交 `6fab4aa6c` 触发 run#78，其后的**文档**提交 `8d2b11d34` 同样没有新增 run；`f5b742afe` 触发 run#79，其后的**文档**提交 push 后同样没有新增 run。这说明了「文档更新不会白白消耗一次 15~26 分钟的镜像构建」，也说明**本手册里的镜像摘要不会因为改文档而失效**。
  - **镜像公开性**：已实测**匿名可拉**（无需 `docker login`）。
  - **⚠️ 部署时必须改镜像名**：仓库自带的 `docker-compose.yml` 是**官方原版未改动**，第 19 行仍是 `image: calciumion/new-api:latest`（官方上游镜像）。直接 `docker compose up -d` 会拉到**没有我们 13 项功能的官方版**。必须改成 `ghcr.io/nkbaa/new-api:latest`。

---

## 6. 测试与已知问题

### 6.1 验证基线（全绿）

| 项 | 结果 |
|---|---|
| 后端 build（显式包列表）+ vet | exit 0 |
| `relaykit` 独立构建（`GOWORK=off`） | exit 0 |
| Go 文件 `gofmt -l` | 全部改动 Go 文件 clean |
| 伪 200 测试（service 12 + relay 4） | 16/16 PASS |
| 伪 200 渠道级语义 | 14 条 `wantMatch:false`（含 10 条实测误判场景）+ 4 条 `wantMatch:true`；`TestOpenaiHandler_Pseudo200DisabledChannelPassesThrough` 断言未开启检测的渠道**原样放行且正常计费** |
| 返佣幂等 | `go test ./model/ -run "Affiliate\|TopUp"` ok；16 goroutine 并发仅 1 条流水 |
| 脱敏 + 错误映射 | `go test ./service/ -run "Pseudo\|Sanitiz\|ErrorMapping"` ok；24 个 sanitize key × en/zh-CN/zh-TW 实际加载 YAML 校验通过 |
| `model` 全量 | `go test ./model/ -count=1` ok |
| OpenCode 渠道测试 | 51/51 PASS（`go test -v ./relay/channel/opencode/...`） |
| 前端 `typecheck` | exit 0（含业务十三与官方同步后重跑） |
| 前端 `src/features/channels` | **23 文件 / 303 用例**全过 |
| 前端 `src/features/chat` | **2 文件 / 10 用例**全过（业务十三 8 例 + B13-r1 新增 2 例） |
| 前端全量 `vitest` | **183 文件 / 2225 用例**全过（合并官方 20 提交后为 181/2209；B13-r1 前为 174/2157） |
| 改动前端文件 lint | 业务十三新增/改动的 9 个文件（不含路由）：**0 warning / 0 error**；第 10 个 `$chatId.tsx` 有 **1 error**（`react/iframe-missing-sandbox`），位于**官方原有行且基线即存在**（见 §6.2-6）。`bun run lint` 全仓基线仍为 66 warn / 182 err |
| 改动前端文件 `oxfmt --check` | 全部通过（`bun run format:check` 全仓仍有 53 个**改动前既有**的不合格式文件，与本次改动文件交集为 0） |
| 前端 i18n | 7 语言 × **7065** 键，0 缺失/多余/重复（冲突提示 +3 键；合并官方 +102 键后；合并前为 6976） |
| 报错规则冲突 UI（实测） | `oxlint` 改动 4 文件 **0 warn / 0 err**；`typecheck` exit 0；`vitest run src/features/system-settings/request-policies/__tests__/` **4 文件 / 58 用例全过**（新增 `error-rule-conflicts.test.ts` 6 例覆盖子串重叠/兜底规则/状态码不重叠/禁用规则/全角与换行分隔符/ID 去重，`settings.test.tsx` 新增 2 例覆盖冲突高亮+保存拦截与无冲突正常保存） |
| 后端 i18n | 3 语言 × 265 键 |
| **MySQL：官方数据库矩阵测试** | **202/202 子用例 PASS**（`-run '^(…)$/mysql'`，见 §6.3 命令） |
| **MySQL：真实二进制部署** | 冷启动建表 → 二次/三次启动 **0 条 DDL**（general log 实测）、数据存活、schema/索引指纹字节一致 |
| **MySQL：首页风格开关端到端** | 无 option 行 → `/api/status` 返回 `classic`；非法值 `landing-v3`/空串被拒且不落库；`landing-v2` 落库并下发；删行重启仍 `classic`；`options` 表列数仍为 2（**0 DDL**） |
| **SQLite：官方同步后回归（实测）** | 冷启动建出 198 个 schema 对象、`/api/status` 返回 `home_page_style=classic`；随后两次重启 **DDL 语句均为 0**、`schema_sha256` 与冷启动后完全一致（`ad400fba…`）、探针行存活 |
| **首页风格下拉框宽度（真实浏览器实测）** | headless Chrome + 生产 `dist` 的 CSS/Public Sans 字体，逐语言量测：修复前选中「官方首页」时触发框 98~164px、弹窗 `min-w-36`，第二项右侧被裁 4.3~44.7px（en 34.8 / fr 44.7 / ja 36.4 / vi 9.1 / ru 4.3 / zh 4.4）；修复后触发框恒为 240px，弹窗按内容取 184.4~304.3px，**7 语言 `clippedBy=[0,0]`**、无横向滚动、未溢出视口 |

### 6.2 官方既有问题（**不要修**）

1. `service/TestObserveChannelAffinityUsageCacheByRelayFormat_*` —— 官方基线同样失败（已用 stash 还原官方状态复现）。
2. `relay/channel/TestUpstreamGetBody_HTTP2RetryAfterGracefulGoAway_PassThrough` —— **偶发**（官方基线连跑 6 次失败 1 次），HTTP/2 时序竞争。
3. Windows `TempDir RemoveAll` 文件句柄占用（**非断言失败**）：`testing.go:1464` 的 cleanup 阶段报 `unlinkat ... audit.db: The process cannot access the file because it is being used by another process`。**实测规模**：在**纯净官方基线 `d04c118c8`** 上跑 `go test ./controller/` 同样有 **97 个**失败，本仓库数量一致 —— 因此与本移植无关。受影响的是所有使用 `t.TempDir()` + SQLite 的用例。**观察到的最典型 5 个**：`TestModelManagementDatabaseMatrix/sqlite`、`TestAuditDatabaseMatrix/sqlite`、`TestSecurityLoginCodeCompletesOnce`、`TestOptionLogoValidation`、`TestGetStatusCustomerService`；其余为 `TestSecurity*` / `TestPasskey*` / `TestOAuth*` / `Test*DatabaseMatrix` 等同类用例。Linux/CI 不受影响。
   - 判定依据：这些失败**全部发生在 cleanup 阶段**（子用例的断言本身已通过），且**在纯净基线上逐一复现**。
4. `bun run lint` 基线 66 warn / 182 err（多在 `scripts/sync-i18n.mjs`）。
5. 前端全量偶发 1 例 jsdom 时序抖动（`model-mapping-editor` / `marketplace-install-dialog`），单跑 3~5 次必过。
6. `web/src/routes/_authenticated/chat/$chatId.tsx` 的 `<iframe>` 无 `sandbox` 属性 → `react/iframe-missing-sandbox` error。**官方基线即存在**（业务十三改动前该文件同样报此错），因为聊天预设需要 `allow='camera; microphone'` 的宽权限，加 `sandbox` 会破坏这些客户端。**不要修**。（该规则未列入 `.oxlintrc.json` 的 override，`src/routes/**` 只关掉了 `react/only-export-components`。）

### 6.3 未验证项（如实声明）

- ~~**MySQL / PostgreSQL 未实测**~~ → **MySQL 已实测通过**。环境与证据如下（可复现）：
  - **环境**：Ubuntu 24.04.4 LTS + **MySQL 8.0.46-0ubuntu0.24.04.4**，`caching_sha2_password`，服务端字符集 `utf8mb4` / `utf8mb4_0900_ai_ci`，`sql_mode` 含 `ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION`。用户 `newapi` 需有建库权限（矩阵测试各自创建一次性库）。
  - **部署与迁移**：冷启动建出 **37 张表**；`affiliate_rewards` 为 `id bigint auto_increment PK` / `reference varchar(160) NOT NULL UNI` / `user_id bigint NOT NULL MUL` / `reward_quota bigint NOT NULL` / `created_at bigint NULL`；重复 `reference` → `ERROR 1062 (23000) Duplicate entry 'dup-ref-1' for key 'affiliate_rewards.idx_affiliate_rewards_reference'`。
  - **迁移幂等性**：第 2、3 次启动的 schema 指纹（445 行列）与索引指纹（216 行）**逐字节一致**，general query log 捕获到的 DDL 语句数为 **0**，数据存活（users/channels/tokens/options 计数不变）。
  - **功能**：`GET /api/setup` → `{"database_type":"mysql"}`；走真实 API 完成初始化与登录；渠道级伪 200 三项设置在 `channels.setting` 里 PUT/GET 往返**逐字节一致**（含嵌入 `\n` 与 `|`）；OpenCode 渠道对真实 mock 上游发出的指纹头全部符合预期（`opencode/1.18.31`、`x-opencode-client: cli`、`x-opencode-request` 每请求刷新、session 稳定）；计费实测：被拦截请求 **−0**，正常请求各 −75，仅正常请求产生 `type=2` 消费流水。
  - **独立日志库**：`LOG_SQL_DSN` 指向另一个库时，`audit_logs` / `logs` 落在日志库，主库 `logs` 保持空。
- **MySQL 测试的官方前置条件（踩过的坑，复现时必须满足）**：
  1. `controller/access_token_audit_test.go:455` 断言 `net.ParseIP(host).IsLoopback()`，**非 loopback 的 MySQL DSN 会让所有 `*DatabaseMatrix/mysql` 子用例失败**。本地跑必须先把远端 3306 隧道到 `127.0.0.1:3306`。
  2. 选子用例**不能**写成一个含 `/` 的完整正则（Go 用 `/` 切分 `-run`），要用 `-run '^(TestA|TestB)$/mysql'`。
  3. `TestDeleteRedemptionBatch/mysql` 断言 `logDB.HasTable(&model.AuditLog{}) == false`（"use an empty test log database"），**要求日志库是"从未建过表"的干净库**。若之前手动在日志库建过表，必须先 drop，否则该用例必失败。
  4. 完整命令（实测通过）：
     ```bash
     TEST_MYSQL_DSN='newapi:***@tcp(127.0.0.1:3306)/newapi_test?charset=utf8mb4&parseTime=true&loc=Local' \
     TEST_MYSQL_LOG_DSN='newapi:***@tcp(127.0.0.1:3306)/newapi_test_log?charset=utf8mb4&parseTime=true&loc=Local' \
     TEST_TASK_DB_DIALECT=mysql \
     go test ./controller/ ./model/ -count=1 -timeout 60m -v \
       -run '^(TestPreConsumePolicyDatabaseMatrix|TestRequestPolicyRoutingDatabaseMatrix|TestModelPricingConversionDatabaseMatrix|TestModelManagementDatabaseMatrix|TestVendorManagementDatabaseMatrix|TestModelDeletionDatabaseMatrix|TestSharedModelPluginPricingDatabaseMatrix|TestDeleteRedemptionBatch|TestAuditDatabaseMatrix|TestAPITokenAuditDatabaseMatrix|TestMigrationSchemaStability|TestInferencePresetSettingsAndDatabaseRoundTrip)$/mysql'
     # → subtest PASS: 202  FAIL: 0
     ```
- **PostgreSQL 仍未实测**：无 PG 环境。本次未引入 PG 特有写法，但**没有** PG 实测证据。
  - 代码侧依据：`affiliate_rewards` 用标准 GORM 定义（`varchar(160)` + `uniqueIndex`），
    未使用方言特有类型、函数或 `ALTER COLUMN`；并发幂等靠 `uniqueIndex` 兜底，三种方言语义一致。
- **`-race` 不可用**：`go: -race requires cgo`。并发幂等性通过行为测试证明（16 goroutine → 1 成功 / 15 拒绝 / 1 条流水 / 额度只入账一次）。唯一索引存在性另用 GORM `GetIndexes` 直接查过：`idx_affiliate_rewards_reference unique=true`。
- **真实浏览器 + 真实后端未跑**：前端验证止于 DOM 行为与提交 payload 层。
- **但「真实二进制 + 真实 MySQL + 真实 HTTP」已跑**（本次首页风格开关的上线前验证，见 §6.1 末行）：Linux/amd64 交叉编译产物在测试机连真 MySQL 冷启动 → `/api/setup` 建管理员 → 登录取 JWT → `PUT /api/option/` 改 `HomePageStyle` → `GET /api/status` 与 `GET /api/option/` 双向核对 → 删行重启复验。**仍未做的是浏览器 UI 点击**（jsdom 已覆盖交互与 payload，但没人在真浏览器里点过下拉框）。
- **流式伪 200 跨帧漏检**：已实测并在 B11 节记录，**刻意未修**（见 B11「已知限制」）。

---

## 7. 校验命令（AI 自检用）

```bash
# 三原则
git diff d04c118c8..HEAD -- '*.go' '*.sql' | grep -E '^\+.*(ALTER TABLE|ADD COLUMN|DROP COLUMN|CREATE INDEX)'   # 应无输出
git diff d04c118c8..HEAD -- '*.go' '*.ts' '*.tsx' | grep -E '^\+.*(os/exec|exec\.Command|subprocess)'           # 应无输出
# 注意：必须限定到代码文件。不限定时，本手册自身含这些关键字的那几行会被 `+` 前缀带出来，属假阳性。

# 伪200 必须是渠道级（旧全局开关必须不存在）
grep -rn 'Pseudo200DetectEnabled' --include=*.go --include=*.ts --include=*.tsx .   # 应无输出
grep -c 'IsPseudo200Error(info.ChannelSetting' relay/channel/openai/relay-openai.go relay/channel/gemini/relay-gemini.go  # 4 + 4

# 规则表可编辑：内置表必须能渲染成文本并原样解析回来
go test ./service/ -run 'TestGetChannelDefaultPseudo200RulesRoundTrip'

# 防误封短路仍在
grep -A2 'func ShouldDisableChannel' service/channel.go | grep ErrorCodePromptBlocked

# 改动规模
git diff --name-status d04c118c8..HEAD | awk '{print substr($1,1,1)}' | sort | uniq -c   # A=48 M=103 D=0

# 首页风格开关：默认必须是 classic，且非法值不落库
grep -n 'HomePageStyle' model/option.go controller/misc.go
go test ./controller/ -run '^TestHomePageStyleOptionIsValidatedAndAdvertised$'
cd web && bun x vitest run src/features/home/__tests__/root-route.test.tsx \
  src/features/system-settings/general/__tests__/home-page-style.test.tsx \
  src/lib/__tests__/status-query.test.tsx

# 首页风格下拉框不能被裁：触发框固定宽度、弹窗可超出触发框
grep -n "w-full sm:w-\[240px\]" web/src/features/system-settings/general/system-info-section.tsx
grep -n "w-auto min-w-(--anchor-width)" web/src/features/system-settings/general/system-info-section.tsx

# 三方言：MySQL 数据库矩阵（需先把远端 3306 隧道到 127.0.0.1，见 §6.3）
TEST_MYSQL_DSN='newapi:***@tcp(127.0.0.1:3306)/newapi_test?charset=utf8mb4&parseTime=true&loc=Local' \
TEST_MYSQL_LOG_DSN='newapi:***@tcp(127.0.0.1:3306)/newapi_test_log?charset=utf8mb4&parseTime=true&loc=Local' \
TEST_TASK_DB_DIALECT=mysql \
go test ./controller/ ./model/ -count=1 -timeout 60m -v \
  -run '^(TestPreConsumePolicyDatabaseMatrix|TestRequestPolicyRoutingDatabaseMatrix|TestModelPricingConversionDatabaseMatrix|TestModelManagementDatabaseMatrix|TestVendorManagementDatabaseMatrix|TestModelDeletionDatabaseMatrix|TestSharedModelPluginPricingDatabaseMatrix|TestDeleteRedemptionBatch|TestAuditDatabaseMatrix|TestAPITokenAuditDatabaseMatrix|TestMigrationSchemaStability|TestInferencePresetSettingsAndDatabaseRoundTrip)$/mysql'
# 期望：subtest PASS 202 / FAIL 0
```

---

## 8. 移植过程记录（历史与背景）

> 本节由原 `PORTING_NOTES.md` 合并而来，**只读参考**，不影响执行。执行本手册只需读 §0–§7 与 §9。
> 合并后 `PORTING_NOTES.md` 不再单独维护、也不再随仓库分发。

### 8.1 交付物与归档

| 交付物 | 路径 |
|---|---|
| 完整源码仓库 | `new-api-official-11biz/` |
| 移植补丁（单提交，可直接 `git apply` **或** `git am`） | `new-api-official-11-businesses.patch`（含 **163 个改动文件**，基于官方 `6370b2942`）。注意：它由 `HEAD^{tree}` 与官方基线的差集生成，**连本手册与 `README_CN.md` 本身也在补丁里**，所以任何一次改动（含改文档）都会让它变；**以文件实际大小为准，不要引用固定字节数**。重新生成的命令见 §0 的 `git commit-tree` 代码块 |
| 技术手册（唯一权威，AI 用） | `UPGRADE_GUIDE.md`（本文件） |
| 白话说明（非技术人员） | `README_CN.md` |
| GitHub 远端 | `https://github.com/NKBaa/new-api.git`（分支 `main`） |

- 仓库内旧文档 `PORTING_GUIDE.md`（称「10 大业务、99 文件」，未涵盖业务十一）**已删除**，唯一权威替代品就是本手册。
- **已推送 GitHub**：全程 **fast-forward**（非强推）、**0 删除**；并**保留** GitHub 侧既有文件 `.github/workflows/docker-image.yml`（push 到 `main` 自动构建镜像）、`UPGRADE_GUIDE.md`、`VERSION`（现为 `v1.0.0-rc.42`）。`main` 与本地 `HEAD` 一致（用 `git log --oneline github/main..HEAD` 应为空来自查）。
- 本地旧版本（`new-api-clean/`、`node_modules/` 残留、3 个旧 `.patch`）已按要求清理，清理前全部内容已归档（见下表，零额外磁盘占用）。
- **历史事故备忘**：原 `PORTING_NOTES.md` 一度被 `Get-Content -Raw` 以 GBK 误读 UTF-8 再写回，全角标点不可逆丢失；当时用 GBK 逆向解码恢复了全部结构、代码、命令与事实。该文件现已并入本手册，**同样的事故不会再影响独立副本（因为副本已不存在）**，但**教训仍然有效：不要用 PowerShell 直接读写本仓库的 UTF-8 中文文档**，改用 `write`/`edit` 工具或 `bun` 脚本。

清理本地旧版本前，已把内容无损归档进本仓库的 git 对象库并打 tag（**零额外磁盘占用**）：

| 归档 tag | 内容 | 恢复方式 |
|---|---|---|
| `archive/old-10-businesses` | 旧 10 业务提交 `116a2e71d`（2563 文件，已逐 blob 校验一致） | `git checkout archive/old-10-businesses` |
| `archive/old-11-businesses` | 旧 11 业务提交 `0bc73d0da`（2567 文件，已逐 blob 校验一致） | `git checkout archive/old-11-businesses` |
| `archive/old-security-fix` | 旧安全修复提交 `98fc0b5ee`（2567 文件，已逐 blob 校验一致） | `git checkout archive/old-security-fix` |
| `archive/patch-blobs-10-biz` | 旧补丁本体 blob `e7c24b80`（483554 字节） | `git cat-file blob archive/patch-blobs-10-biz > 旧.patch` |
| `archive/patch-blobs-11-biz` | 旧补丁本体 blob `ad02ef4d`（502499 字节） | 同上 |
| `archive/patch-blobs-rc40` | 旧补丁本体 blob `9ce5a9b8`（636383 字节） | 同上 |

另有两个回滚点：`backup/custom-11biz-before-push`（推送前的 `c5c0870d8`）、`backup/github-main-f9cabe103`（推送前的 GitHub main）。

**完整提交链**（`f9cabe103..HEAD`，由旧到新，供定位某次改动）：

```
d7a16aec2  port 11 custom business features onto official d04c118c8
6238ccde4  rewrite UPGRADE_GUIDE for AI consumption, add plain-language README_CN, drop stale PORTING_GUIDE
962432cf0  fix(i18n): move misplaced locale entries inside the translation namespace
4f3acda7e  test(pseudo200): cover every built-in signature and the additive custom-keyword rule
82d3d7035  feat(pseudo200): make the built-in signatures an editable per-channel rule list
49f5cb862  document the editable pseudo-200 rule list and refresh file counts
0edf27455  sync all documents with the current state
cb668037e  fix(pseudo200): tolerate full-width commas and extra pipes in rule requires
87bf361e1  sync documents with the separator-tolerance fix
894724c8f  feat(opencode): add OpenCode channel type with official client fingerprint spoofing
61b4c78c7  point UPGRADE_GUIDE at the OpenCode delivery commit
407bea9b8  correct frontend i18n key count in README_CN (6962 -> 6964)
17858ac30  correct stale figures found during the full-project review
877bbc814  fix(opencode): match the real free-tier client fingerprint (UA version + ID format)
6833a8224  fix(opencode): shape the request body as an agent call, not just the headers
125b4078d  fix(opencode): complete the official client fingerprint headers
adaba2781  fix(opencode): override DoRequest so the fingerprint is actually sent
017371d19  test(opencode): use a real free-tier model name in the SSE fixtures
4364b8686  sync upgrade guide and readme with opencode delivery and 2580 file count
9525e64f2  correct stale figures and the Windows failure scope found in the readiness review
de125fff9  record the MySQL production verification
d1ef7cc56  record the MySQL test results and the streaming pseudo-200 limit
66488a6fe  correct the deploy steps, landing route and non-business file list
309b9b4f6  feat(home): add a system setting to choose the home page style
88d694850  record the home page style switch and refresh the figures
af7b2a3af  fix(settings): stop the home page style dropdown from clipping its labels
7420d157b  feat(chat): let users pick the API key before launching a chat preset
（此后为纯文档提交，不再逐条列出）
```

> `4f3acda7e`（规则覆盖测试）与 `82d3d7035`（规则可编辑）是业务十一的第二轮改造，语义细节见 §8.3 第三阶段。

> 注意：旧 11 业务补丁（502499 字节 / 94 文件）与其提交 `0bc73d0da` 的内容**并不完全相同**，故其**本体字节**也单独归档，不依赖提交重建。

### 8.2 移植过程中修复的缺陷（参考实现本身的问题）

参考实现并非可直接照抄——复查发现下列真实缺陷，均已修复并留证。

#### P0-1 · 充值重放重复膨胀用户额度缓存（计费正确性）

参考实现在「订单已成功」的幂等重放分支里把额度写回外层变量（`quota` / `quotaToAdd`），导致事务外的 `syncCreditUserQuotaCache` 以非零额度再次执行 —— 支付方合法重试同一回调即可**反复抬高 Redis 用户余额**（缓存存续期内可见）。官方基线中 Stripe/Creem 重放直接报错返回、Waffo 保持 0 故有保护，仅 Epay 有 `alreadyDone` 守卫。

**修复**：6 条链路的重放分支改用局部 `replayQuota`（`model/topup.go:309`），仅用于补发返佣，不污染外层额度变量。

#### P0-2 · 业务三管理员判定错误，破坏 3 个官方前端测试

`common-log-mobile-card.tsx` 用 `props.cells.has('username')` 判定管理员，但官方列 id 实为 `'user'`，该判断**恒为 false**；叠加测试环境 `ROLE.GUEST`，导致 `formatModelName(log, isAdmin=false)` 早退并丢失 `actualModel`。

**修复**：改为 `cells.has('user')`。同时 `usage-facts.test.tsx` 断言的是业务三**刻意改变**的旧行为，已按 `web/AGENTS.md` 适配为「管理员可见 + 普通用户不可见」两条契约（未削弱断言，且新增了防泄露断言）。

#### P0-3 · 升级会静默丢弃老用户已保存的主题

`isUserThemeModified()` 只认新标记键，升级前已保存外观偏好的用户会**回退到全站默认**。

**修复**：兼容判定 —— 已存在任一外观偏好键即视为已个性化。

#### P0-4 · 业务十 i18n 不完整

参考实现有 8 个 `t()` 调用的键在 7 个语种包里**完全不存在**（`lib/image-compress.ts` 的 6 条图片校验/解码报错、Logo 与二维码处理失败提示），另有 2 条新增键未被引用（`QR Code Image Preview` 对应硬编码 `alt='QR Code Preview'`、二维码 URL 占位符硬编码）。同时 3 个 `Customer service preset *` 键为本节不存在的「先改后存」流程遗留的**死键**。

**修复**：新增 9 条键并 7 语种全量翻译，把硬编码 `alt` 与占位符改为 `t()`，删除 3 条死键。

#### P0-5 · 第二遍复查追加：剩余硬编码中文与键缺失（业务十）

- `error-mapping-section.tsx` 规则回退名 `` `规则 #${index + 1}` `` → `t('Rule #{{index}}')`
- 同文件「脱敏说明」占位符 `'e.g. 当前模型服务请求量激增或高负载，请稍后重试。'` → 英文 i18n 键
- `use-landing-data.ts` 模型描述兜底 `${provider} 高可用接入模型` → `t('{{provider}} model with high-availability access')`

同时修正了自己第一版的实现缺陷：`use-landing-data.ts` 是 React Hook，最初误用 i18next 单例（切换语言不刷新），已改为 `useTranslation()` 并把 `t` 加入 `useMemo` 依赖；`error-mapping-section.tsx` 的模块级 normalizer 才用 i18next 单例（符合 `web/AGENTS.md` 对非 React 环境的规定）。

#### P0-6 · 追加词条的脚本把 20 个词条写到了命名空间之外（渠道抽屉显示英文）

**现象**：中文环境下，渠道编辑抽屉「请求与响应」的伪 200 检测开关、提示语与自定义特征输入框**显示纯英文**。

**根因**：7 个语种的 `web/src/i18n/locales/*.json` 中，末尾 **20 个词条**（伪 200 的 5 个 + 图片上传的 15 个）被追加在 `"translation"` 对象的闭合花括号 `  },` **之后**、根对象 `}` 之内。i18next 查找的是 `json.translation[key]`，取到 `undefined`，于是回退显示英文字面量 key。

> 该缺陷由追加词条的脚本引入：脚本用「文件最后一个 `}`」定位插入点，而该文件结构是 `{"translation": {...}}`，故词条落到了 `translation` 外面。

**修复**：纯结构性文本调整，每个文件仅 **+2/-2 行** —— 把 `  },` 移到 20 个词条之后并改为 `  }`；**词条内容与顺序零改动**。刻意**不重新序列化 JSON**，以保留品牌保护标识所需的 `\u0061` 逃逸序列（实测 7 个文件该序列均完好）。

**新增回归测试** `web/src/features/channels/components/__tests__/pseudo-200-i18n.test.tsx`（3 用例）：断言 locale 根键**只有** `translation`（根因守卫）；**真实渲染**渠道抽屉，断言出现「伪 200 异常检测」且英文 key `Pseudo-200 detection` 消失；断言伪 200 与图片上传词条在 `zh` 下正确解析。已做**变异测试**：把 `zh.json` 还原为错误结构后，3 个用例**全部失败**。

> 注：后端 `i18n/locales/*.yaml` 是 go-i18n 的**扁平结构**，无命名空间问题，未受影响。
> §4.2 的 i18n 冲突处理条目所指的「见 §8.2 P0-6」即本节。

#### P1-1 · `ToClaudeError` 越界修改了**官方通用函数**（已收敛为最小必要改动）

`relaykit/types/error.go` 的 `ToClaudeError()` 是**所有** Claude 协议响应共用的官方函数。参考实现在其中加入了三级兜底：

```go
if isKnownClaudeErrorType(openAIError.Type) { claudeType = openAIError.Type }
else if isKnownClaudeErrorType(codeStr)    { claudeType = codeStr }
else if e.StatusCode > 0                   { claudeType = StandardClaudeType(e.StatusCode) }
```

后两个分支对**未启用脱敏**的普通错误同样生效，实测会改写官方原有输出：

| 场景（未脱敏） | 官方原值 | 参考实现改后 |
|---|---|---|
| 上游自定义 code `vendor_secret_code` / 400 | `vendor_secret_code` | `invalid_request_error` |
| 上游自定义 code `vendor_429` / 429 | `vendor_429` | `rate_limit_error` |
| 上游自定义 code `vendor_502` / 502 | `vendor_502` | `api_error` |

这属于「顺手修了官方问题」—— 超出业务九的范围（业务九只应影响**脱敏出口**）。

**修复**：**仅保留第一个分支**。因为 `SanitizeFields` 写入的 `Type` 本就取自 `StandardOpenAIFields`，其 14 种返回值全部是合法 Claude 类型，所以脱敏路径依然得到标准化类型，而**未脱敏路径与官方逐字符一致**。已用探针程序对 14 类非脱敏错误实测确认。

#### P1-2 · 二维码 ICO 前后端契约不一致

`image-compress.ts` 的 `allowIco` 默认 `true`，而服务端 `validateDataURLImage(qrcode, …, false)` 对**客服二维码明确拒绝 ICO**。结果：用户通过拖拽或 `Ctrl+V` 绕过 `accept` 属性上传 `.ico` 时，前端接受并压缩，直到**保存才被后端报错**，体验割裂。

**修复**：二维码调用处显式传 `allowIco: false`（`customer-service-section.tsx:126`）。现契约双向一致 —— Logo 两侧都允许 ICO，二维码两侧都拒绝 ICO。

#### P1-3 · 其它

- **9 个 TypeScript 编译错误**（参考实现从未通过 `typecheck`）：`Resolver` 类型、`useWatch` 可能为 `undefined`、`SettingsSection` 传入不存在的 `description` prop、landing-v2 误用 `useCopyToClipboard` 的 `isCopied`（官方只返回 `copiedText`）、`routeTree.gen.ts` 未随新路由重新生成。
- 无关改动已全部撤销：`status-query.ts` 伪键、`system-config-storage` 兜底等。

### 8.3 交付前的四轮加固

#### 第一阶段 · 真实业务漏洞与体验缺陷

1. **0 额度流水写入守卫**：`Recharge`(Stripe) / `RechargeCreem` / `ManualCompleteTopUp` 的幂等重放分支外层额度为 0，原代码仍会 `syncCreditUserQuotaCache` 与 `RecordTopupLog`，产生 0 额度（补单路径还会写 `userId=0`）的**脏流水**。已加 `if quota > 0` / `if quotaToAdd > 0` 守卫（Waffo/Pancake 原本已有）。
2. **主动刷新签到判定缓存**：新增 `markUserEverToppedUp(userId)`，在 **6 条充值到账链路 + 1 条卡密兑换链路** 成功后主动写 `checkin:user_topped_up:{userId}=1`（24h），彻底消除原「未充值」负缓存导致的 **5 分钟**签到门槛延迟。共 7 处调用点，缺一处即导致该链路用户充值后 5 分钟内仍无法签到。
3. **修复 3 处单测状态泄漏**：
   - `controller/checkin_antiabuse_test.go`：原先只还原 4 个字段，`MinQuota/MaxQuota` 泄漏 → 改为整结构体快照 + `t.Cleanup`；
   - `model/affiliate_reward_test.go`：GORM create 回调原仅成功路径注销，断言失败会残留 → 增加 `t.Cleanup` 兜底（保留重试前的手动注销语义）；
   - `controller/customer_service_test.go`：`require` 失败走 `FailNow` 使 `defer` 不执行 → 改为 `t.Cleanup` 并快照整个 `ConsoleSetting`。
4. **前端图片文案与 i18n 修正**：`image-compress.ts` 明确拒绝 SVG，但 UI 仍在 `accept` 与提示文案里宣传 SVG（拖拽/粘贴会绕过 `accept` 直到保存才报错）。已从 Logo 与客服二维码两处移除 SVG，并把 14 处未翻译报错（含 10MB 超限）包进 `t()`。

#### 第二阶段 · 交付质量与防护边界

5. **脱敏文案 i18n 化**：`ErrorMappingRule` 新增 `MessageKey`，**10 条内置预设**与**14 条兜底分类**全部 key 化，由 `i18n.T(c, key)` 按调用方语言下发；**自定义规则无 `MessageKey`，原样输出站长文案**。已实测同一 key 在 en / zh-CN / zh-TW 下分别返回对应译文。翻译缺失时回退预设自带 `ReplaceMsg`，**绝不把 key 暴露给终端用户**。
   - 附带修复一个**潜在生产 panic**：`i18n.Translate` 在 `Init()` 之前会因 nil bundle 解引用 panic，已加初始化守卫。
6. **补前端测试**：新增 `model-mapping-visibility.test.ts`（业务三，3 用例）与 `checkin-topup-gate.test.tsx`（业务六，1 用例）。两者均做过**变异测试**验证非空洞：移除 `formatModelName` 的 `isAdmin` 早退 → 3 个用例失败；移除充值门槛判断 → 1 个用例失败。
7. **清理冗余变量**：移除从未被读取的 `common.DefaultThemeSettings`（原仅在 `updateOptionMap` 无锁写入、在 `InitOptionMap` 自赋值）。`options.DefaultThemeSettings` 键与 `/api/status` 广播链路保持不变，前端功能不受影响。

#### 第三阶段 · 业务十一误判治理与配置模型重构

**背景**：对检测器做对抗测试时发现 **11 条正常内容中有 9 条被误判**（如「解释 Google 的 AI 政策」「讨论越狱原理」「翻译安全提示」「代码里含该字符串」），且**完全没有开关**，站长无法关闭。

**第一步：消灭误判（保留至今）**

1. **长度上限收紧**：`maxPseudo200Length` 2000 → **400**（真拦截是短句，长文一律放行）。
2. **内置指纹改用「首部锚定 + 特征共现」的结构判据**：先剥离 `error:` 等噪声前缀；要求正文**以阻断句式开头**，从而区分「整段就是拒绝语」与「正常回答里引用了这句话」；`requires` 采用 **OR 语义**。效果：**10/10 误判场景全部消除，同时 4/4 真实报错仍被正确拦截**。
3. **显式防误封**：`ShouldDisableChannel` 首行对 `ErrorCodePromptBlocked` 直接 `return false`，彻底摆脱对三个巧合的依赖（详见 B11）。

**第二步：配置模型定为「渠道级、渠道间互相独立」（最终形态）**

按需求**不设全局开关、不设全局规则**，检测与规则完全下沉到渠道：`relaykit/dto/channel_settings.go` 的 `ChannelSettings` 新增 `Pseudo200Enabled` / `Pseudo200CustomKeywords` / `Pseudo200Rules`，三者随既有 `setting` TEXT 列以 JSON 存取，`model/channel.go` **零改动** → AutoMigrate 不产生任何 DDL。全局 `common.Pseudo200DetectEnabled` / `Pseudo200CustomKeywords` 及其前端区块、i18n **已彻底移除，零残留**。UI 置于渠道编辑抽屉「请求与响应」标签的 Request processing 卡片，与官方 `force_format` / `thinking_to_content` 同列。

**复查（第二轮）修正的 2 个真实缺陷**：

1. **「Configured」徽标不亮**：`channel-configuration.ts` 的 `configured.requestProcessing` 未包含新字段，导致开启检测后标签与卡片**不显示 Configured 标记**（官方 `force_format` 等字段都会显示）。已补 `values.pseudo_200_enabled`，并新增 `pseudo-200-configuration.test.ts` 固化。**该缺陷用探针实测复现（修复前 `off=idle on=idle`），非推测。**
2. **敏感字段权限名单遗漏**：`SENSITIVE_FORM_FIELDS` 未登记新字段。该数组用于「非授权用户改动了敏感字段则拒绝保存」的校验；字段虽已 `disabled={sensitiveLocked}` 不可编辑，登记后才与同组官方字段完全一致（防止通过其它途径置脏）。已补入并加权限回归测试。
- 另核对：`channel-form-errors.ts` 的 `ADVANCED_SETTINGS_FIELDS` 未登记新字段，但该名单仅驱动 `isAdvancedSettingsField` / `hasAdvancedSettingsErrors`，二者在仓库中**除自身外无任何调用方**，且新字段为可选类型不会产生校验错误，故无可观测差异，**按「不修改非业务代码」原则未改动**。

#### 第四阶段 · 明确不做（按用户要求）

8. **不删除 `features/home`**（11 文件）—— 作为抗上游冲突的官方回滚通道保留，`git diff` 确认零改动。
9. **不碰官方既有失败单测与 Windows SQLite 句柄占用问题**（清单见 §6.2）。

### 8.4 本次改动带来的行为变更（供评审确认）

1. **业务三改变了官方可观测行为**：普通用户不再看到「Response model / 模型映射」区块。这是需求本身，因此 `usage-facts.test.tsx` 由断言「普通用户可见」改为「普通用户不可见 + 管理员可见」。
2. **新增注册限流** `MaxRegisterNumPerIP` 默认 `0`（不限制），不影响存量部署；管理员在「认证设置」显式开启后生效。
3. **签到风控** 3 个开关默认**全关**，行为与官方一致。
4. **报错脱敏** `ErrorSanitizationEnabled` 默认 `true`，管理员在「请求策略 → Error Sanitization」可关闭。内置预设与兜底分类已 key 化，按调用方语言下发；自定义规则原样输出。
5. **伪 200 检测**默认**全关**；仅对**显式开启**的渠道生效，且**绝不会导致渠道被自动封禁**。已知限制见 B11「流式仅首帧检测」。
6. **图片上传不再接受 SVG**（Logo 与客服二维码的 `accept` 与提示文案已与后端校验对齐），二维码**不接受 ICO**。
7. **签到充值门槛的判定缓存实时刷新**：充值/兑换成功后立即写 Redis，原先最长 5 分钟的延迟已消除（无 Redis 时直接查库，行为不变）。
8. **幂等重放不再产生 0 额度流水**：重复支付回调只补发返佣，不再写入 0 额度（含 `userId=0`）的充值日志。
9. **新增 OpenCode 渠道类型 64**：仅新增一个渠道类型取值，**不影响任何存量渠道**；未配置该类型时不产生任何行为变化。
10. **首页风格改为后台可切换，默认仍是官方首页**：根路由 `/` 由 `options.HomePageStyle` 决定（`classic` 默认 = 官方首页；`landing-v2` = OpenRouter 风格）。**未设置过该选项的存量站点行为完全不变**（实测：删掉该行并重启，`/api/status` 仍返回 `classic`）。选项非法时 `validateOptionValue` 直接拒绝且不落库；`options` 表结构不变。
11. **首页风格下拉框显式声明宽度**：官方 `SelectTrigger` 是 `w-fit`、`SelectContent` 是 `w-(--anchor-width)` + `overflow-x-hidden`，组合后弹窗宽度被锁死为「当前选中项」的宽度，选中较短的官方首页时会把第二项文案裁掉（真实浏览器实测 en 34.8px / fr 44.7px / ja 36.4px）。修法是触发框加 `w-full sm:w-[240px]`、弹窗加 `w-auto min-w-(--anchor-width)`，**只影响这一个控件**；`min-w-[240px]` 不够（俄语 268px 仍裁 28.3px），故未采用。
12. **聊天预设跳转前不再静默取第一个令牌**：侧边栏点聊天应用时会先弹出选 Key 窗口，确认后才启动。这对用户是**可见的行为变化**（多了一步），但只有「需要 Key 的预设」才有弹窗，纯外链预设仍然直接跳转；`/chat/{id}` 不带 `key` 参数的老链接行为不变（仍回退第一个启用令牌）。同时修掉了协议预设那一行在键盘/读屏下不可操作的问题。**纯前端改动，0 DDL、0 计费影响。**
13. **选 Key 弹窗的视觉变化（B13-r1，`4234fb98e`）**：弹窗由 448px 加宽到 512px；选项从「裸单选行」改为**整行可点的卡片**，选中行整行高亮（主色描边 + 淡蓝底 + 1px 主色环），密钥以等宽徽章右对齐展示；Key 超过约 6 个时列表区**固定 340px 内部滚动**，不出现浏览器原生滚动条、不产生宽度跳动；单选框的选中态由「实心黑盘」修正为「主色描边 + 实心主色圆点」（暗色模式同样修正）。**仍为纯前端改动，只碰 `chat-key-dialog.tsx` 与两个测试文件，0 DDL、0 Go 改动。**

---

## 9. 给 AI 的行为准则

1. **不要**重新引入全局伪 200 开关或全局规则 —— 设计已定为渠道级。
2. **不要**修改官方既有失败测试；**不要**为通过测试而改官方代码。
3. **不要**触碰 §1 列出的全局主题/底层 UI/品牌文件。
4. 改 `.go` 后跑 `gofmt`；改 `.ts/.tsx` 后跑 `bun run typecheck`。
5. 改前端文案必须**同步 7 个语言文件**；改后端文案同步 3 个 YAML。
6. 行为变更必须补测试（本仓库 `web/AGENTS.md` §3.14 强制要求）；测试不得为空洞——需能通过变异测试验证。
7. 官方问题一律**不改**，只在本文档 §6.2 记录。
8. **文档只有两份**：本手册（AI / 程序员）+ `README_CN.md`（非技术人员）。**不要**再新增 `PORTING_NOTES.md` 之类的第三份移植记录 —— 历史与背景写进 §8。
9. **业务十三（聊天选 Key）不要去「统一」另外两个入口**：`chat2link.tsx` 与 `data-table-row-actions.tsx` 仍取第一个启用令牌，这是**用户明确划定**的范围，不是遗漏。
10. **不要**给 `$chatId.tsx` 的 `<iframe>` 加 `sandbox`（会破坏聊天客户端的摄像头/麦克风权限），该 lint error 是官方基线既有的，见 §6.2-6。
11. **用 `ScrollArea` 时不要只写 `max-h-*`**：其 viewport 是 `size-full`，根节点只设 `max-height` 不会约束它，内容会直接溢出而不滚动（实测 `vpClient=620 vpScroll=620 scrolls=false`）。必须同时给出可传递的高度约束，本仓库采用 `flex flex-col` + `*:min-h-0`（等价写法见 B13-r1 第 4 条）。改动滚动/尺寸时须按 `web/AGENTS.md` §3.14 补布局回归测试，断言滚动容器与高度上限等**稳定契约**，不要快照整串 class。
12. **改 `RadioGroupItem` 的选中背景要连暗色一起覆盖**：基类同时有 `data-checked:bg-primary` 与 `dark:data-checked:bg-primary`，`tailwind-merge` 只消除同 variant 冲突，只写 `data-checked:bg-transparent` 在暗色下会失效并渲染成实心圆盘。
