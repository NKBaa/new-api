# New API 二次开发移植与升级指南（AI 执行手册）

> 本文档面向 **AI 编码助手**。目标是让 AI 在**不读完整仓库**的前提下，准确理解本仓库相对官方主线的改动，并能安全地把这些改动移植到更新的官方版本上。
>
> 文档中的每个数字与符号都经过实测核对（见 §7 校验命令）。

---

## 0. 元信息

| 项 | 值 |
|---|---|
| 官方基线 | `d04c118c8`（= `upstream/main`，涵盖 `v1.0.0-rc.40`） |
| 当前交付提交 | `82d3d7035` |
| GitHub 远端 | `https://github.com/NKBaa/new-api.git`（分支 `main`） |
| 相对基线改动 | **120 文件** = 34 新增 + 86 修改 + **0 删除** |
| 其中非业务文件 | 5 个（GitHub 侧既有，非本次业务改动）：`.github/workflows/docker-image.yml`(A)、`PORTING_GUIDE.md`(A，后已删除)、`UPGRADE_GUIDE.md`(A)、`README_CN.md`(A)、`VERSION`(M) |
| 纯业务改动 | **116 文件** = 31 新增 + 85 修改 |
| 模块划分 | 2 个 Go module：根模块 + `relaykit/`（独立，`GOWORK=off` 必须可构建） |
| 数据库 | SQLite / MySQL ≥5.7.8 / PostgreSQL ≥9.6 **三方言必须同时支持** |

### 0.1 提交拓扑（重要，影响移植方式）

交付提交的父提交是 GitHub 上的 `f9cabe103`（**不是**官方基线 `d04c118c8`）：

```
d04c118c8 (官方基线)
    └── …官方中间提交…
            └── f9cabe103   (GitHub 侧既有提交，含旧版实现)
                    └── d7a16aec2   (11 业务移植)
                            └── 6238ccde4   (文档)
                                    └── 962432cf0   (i18n 命名空间修复)
                                            └── 4f3acda7e   (规则覆盖测试)
                                                    └── 82d3d7035   (= 本仓库 HEAD，规则可编辑)
```

**因此 `git diff d04c118c8..HEAD` 会包含 `f9cabe103` 等中间提交的改动。** 若需"仅业务改动"的单提交补丁，必须用 `git commit-tree` 合成：

```bash
# 合成一个父为 d04c118c8、树与 HEAD 相同的虚拟提交
tree=$(git rev-parse 'HEAD^{tree}')
synth=$(git commit-tree "$tree" -p d04c118c8 -m "port 11 businesses")
git format-patch --binary --stdout -1 "$synth" > businesses.patch
```

仓库随附的 `new-api-official-11-businesses.patch` 即以此方式生成，已验证可干净 `git apply` 到纯净 `d04c118c8`，结果与交付仓库 **2574 文件逐字节一致**。

---

## 1. 三条硬约束（违反即失败）

AI 修改本仓库时必须同时满足：

| # | 约束 | 判定方法 |
|---|---|---|
| 1 | **DB 零破坏**：0 `ALTER TABLE`、官方已有表 0 加字段 | 在 `*.go`/`*.sql` 的 **新增行**中搜索 DDL 关键字（文档文字里的「ALTER TABLE」不算） |
| 2 | **零外部轮询进程**：无 sidecar、无 `os/exec`、无新增 `init()` 定时器 | 搜索 `os/exec`、`exec.Command`、`subprocess`、`sidecar` |
| 3 | **只改业务所需**：与 11 业务无关的官方代码 0 修改 | 逐文件核对 §3 清单；官方既有失败测试**不得**修改 |

**已被明确排除在改动范围外的**（前几轮曾误改，已全部回退，不得重新引入）：

- 全局主题/底层 UI：`web/src/styles/`、`components/ui/table.tsx`、`components/ui/sidebar.tsx`、`nav-group.tsx`、`section-page-layout.tsx`
- 品牌与外壳：`components/footer`、`features/about`、`components/logo`、`system-brand`、`index.html`、`main.tsx`
- 元数据与 CI：`VERSION`、`.github/workflows/*`（`docker-image.yml` 除外，它是 GitHub 侧既有文件，须保留）
- 官方 `features/home/`（21 文件）**完整保留**，作为抗上游冲突的回滚通道
- 官方既有失败测试与 Windows SQLite 句柄问题（见 §6.2）

---

## 2. 十一项业务实现索引

每项给出：**涉及文件** → **关键符号** → **存储位置** → **移植注意点**。

### B1 · 充值返佣流水（Affiliate Commission）
- **文件**：`model/affiliate_reward.go`(新)、`model/affiliate_reward_test.go`(新)、`model/topup.go`、`model/redemption.go`、`model/option.go`、`common/constants.go`、`web/src/features/wallet/components/affiliate-rewards-card.tsx` 等
- **符号**：`AffiliateReward{Id, Reference, UserId, RewardQuota, CreatedAt}`、`CreateAffiliateRewardTx(tx, reference, userId, rewardQuota)`、`GetAffiliateCommissionRate()`/`SetAffiliateCommissionRate()`（带 `sync.RWMutex`）
- **存储**：**唯一新增表** `affiliate_rewards`（`Reference varchar(160) uniqueIndex not null`，值形如 `topup-{id}`）；注册于 `model/main.go` 的 `AutoMigrate` 列表（`&AffiliateReward{}`，官方基线无此行）。比例配置复用 `options` 表键 `AffiliateCommissionRate`。
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
- **符号**：`options` 键 `AffiliateDescription`；前端读 `status?.affiliate_description`
- **存储**：`options` 表（0 DDL）
- **移植注意**：空值必须回退到 i18n 默认文案，不得显示空白。

### B3 · 普通用户隐藏响应模型/重定向详情（防穿帮）
- **文件**：`web/src/features/usage-logs/lib/format.ts`、`web/src/features/usage-logs/lib/__tests__/model-mapping-visibility.test.ts`(新)、`web/src/features/usage-logs/**` 多处
- **符号**：`formatModelName(log, isAdmin)` —— `isAdmin=false` 时提前返回脱敏结果
- **判定身份**：用 `isAdminView`（来自 `useLogsViewScope()`）或 `cells.has('user')`，**不要**用原始 role，因为管理员可切到「仅看自己」视图
- **移植注意**：后端已对非管理员剥离 `admin_info`，前端再 gate 一层是**双保险**，两处都不可删。

### B4 · 全站默认主题 + 导航圆角
- **文件**：`web/src/lib/theme-customization.ts`、`web/src/lib/theme-storage.ts`、`web/src/context/theme-customization-provider.tsx`、`web/src/context/theme-provider.tsx`、`web/src/stores/system-config-store.ts`、`web/src/components/config-drawer.tsx`
- **符号**：`ThemeNavbarRadius`、`ThemeRadius`、`defaultThemeSettings`、`options.DefaultThemeSettings`
- **机制**：管理员设全站默认 → 未改动过的用户跟随默认；用户主动调整后写 `newapi:theme:v1:user-modified` 锁定；重置即回归跟随。
- **存储**：`options` 表键 `DefaultThemeSettings`（JSON）。**注意**：后端**故意不在 `common` 变量里保留副本**（避免无锁写入），前端经 `/api/status` 读取。
- **移植注意**：这是本仓库**唯一**触碰主题体系的地方，且限定在「默认值下发 + 用户独立存储」，**没有**修改 `styles/` 或底层 UI 组件。

### B5 · OpenRouter 风格极简首页（Landing V2）
- **文件**：`web/src/features/landing-v2/**`（11 文件，全新）、`web/src/routes/landing-v2.tsx`(新)、主路由单行切换
- **符号**：`features/landing-v2/index.tsx`、`use-landing-data.ts`
- **移植注意**：官方 `features/home/` **零改动**，是物理隔离的并行实现；路由切换只改 1 行，冲突风险极低。

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
  - `MessageKey` 字段有 `json:"message_key,omitempty"`，向后兼容旧规则 JSON。
- **移植注意**：`i18n.Translate` 已加 **nil-bundle 守卫**（`Init()` 前调用会 panic，属潜在生产事故）；自定义规则的 JSON 校验在 `validateOptionValue` 的 `case "ErrorMappingRules"`。

### B10 · 全链路 i18n
- **文件**：`i18n/i18n.go`、`i18n/keys.go`、`i18n/locales/{en,zh-CN,zh-TW}.yaml`、`web/src/i18n/locales/{en,zh,zh-TW,ja,fr,ru,vi}.json`、`setting/console_setting/validation.go`
- **规模**：后端 3 语言 × 265 键（其中 24 个 `sanitize.*` 为本次新增）；前端 7 语言 × **6962 键，0 缺失/0 多余/0 重复**
- **约定**：
  - 后端库 `nicksnyder/go-i18n/v2`，语言 en / zh-CN / zh-TW；
  - 前端 `i18next`，key **就是英文源串**（flat JSON）；
  - **React 组件**用 `useTranslation()`；**非 React 代码**用 `import { t } from 'i18next'`。
- **移植注意**：新增 7 语种键必须**同时**补 7 个文件，否则 i18n 一致性校验失败。

### B11 · 伪 200 拦截与渠道重试（★ 设计已变更两次，务必按新版）
- **文件**：`service/pseudo_error_detector.go`(新)、`service/pseudo_error_detector_test.go`(新)、`relaykit/dto/channel_settings.go`、`controller/channel.go`、`router/channel-router.go`、`router/channel_router_test.go`、`relay/channel/openai/relay-openai.go`、`relay/channel/gemini/relay-gemini.go`、`relay/channel/{openai,gemini}/pseudo_200_test.go`(新)、`service/channel.go`、`web/src/features/channels/**`（types / channel-form / channel-configuration / channel-actions / api / channel-mutate-drawer / 4 个测试）
- **符号**：`IsPseudo200Error(settings dto.ChannelSettings, content string) (bool, string)`、`NewPseudo200Error(reason)`、`GetChannelDefaultPseudo200Rules()`、`MaxPseudo200Length()`、`maxPseudo200Length = 400`、`parsePseudo200Rules` / `matchPseudo200Rules`
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
  `|` 之前是**首部锚定**前缀，之后是**共现特征**（逗号分隔，OR 语义）。空行与 `#` 开头的行忽略。
- **日志标识**：命中时 `reason` **即该条规则的 `prefix`**（不再单独维护描述文案）。因此「留空用内置」与「回填后保存」两条路径的判定与日志**完全一致**。
- **检测算法（低误判是核心）**：
  1. 渠道开关关闭 → 直接放行；
  2. 正文 `len(TrimSpace) > 400` → 放行（真拦截是短句，长文是正常产出）；
  3. **首部锚定 + 特征共现**：先 `stripLeadingNoise` 剥离噪声前缀（`error:` / `failed:` / `google api error:` 等 **8 种**），再要求正文**以某条规则的前缀开头**；配置了 `requires` 时要求其中**任一**出现；
  4. 渠道自定义特征按换行/逗号（含中文逗号）拆分，任一**包含**即命中，同样受 400 字符上限约束。
- **⚠️ 编辑规则时绝不可退化为「简单包含匹配」**：内置规则的 `prefix` 必须**锚定在正文开头**。实测把 13 条前缀当普通关键词做包含匹配，会让 4/4 条正常内容（引用报错、复述政策、解释拦截）**全部误判**。解析与匹配必须走 `parsePseudo200Rules` / `matchPseudo200Rules`。
- **效果（实测）**：正常内容（解释政策、翻译提示、复述报错、代码字符串、越狱原理讨论…）**全部不误判**；真实上游报错**全部命中**。
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
- **移植注意（易错点，均已踩过）**：
  1. `channel-configuration.ts` 的 `configured.requestProcessing` **必须**包含 `values.pseudo_200_enabled`，否则开关打开后卡片不显示「Configured」徽标；
  2. `channel-mutate-drawer.tsx` 的 `SENSITIVE_FORM_FIELDS` **必须**登记**三个**新字段（enabled / custom_keywords / rules），与同组官方字段权限行为一致；
  3. `channel-form.ts` 需 **6 处**改动：zod schema、2 处默认值、`transformChannelToFormDefaults` 解析、`buildSettingJSON` 序列化（+ `channel-configuration.ts` 的 fields 名单、`channel-actions.ts` 的 query key）；
  4. `channel-form-errors.ts` 的 `ADVANCED_SETTINGS_FIELDS` **故意未登记** —— 该名单仅驱动 `isAdvancedSettingsField`/`hasAdvancedSettingsErrors`，二者在仓库中**除自身外无调用方**，且新字段为可选类型不会产生校验错误，属"不修改非业务代码"；
  5. 新增规则框的 i18n 键只有 3 个（`Blocking signatures`、格式占位符、长度与回退说明），**7 个语种都要补**，否则一致性校验失败。

---

## 3. 改动文件清单（116 业务文件）

### 3.1 按层统计（实测）

| 层 | 新增 | 修改 | 小计 |
|---|---|---|---|
| 前端 `web/src/` | 19 | 51 | **70** |
| 后端 `*.go`（含 `service`/`model`/`controller`/`relay`/`relaykit`/`common`/`setting`/`router`/`i18n`） | 12 | 31 | **43** |
| 其它（根目录文档、VERSION、workflow） | 3 | 4 | 7 |
| **合计** | **34** | **86** | **120** |

其中**业务**文件 116 个（31 新增 + 85 修改），**非业务** 5 个（见 §0）。

Go 文件按目录细分的修改数：`controller` 8、`model` 6、`service` 3、`router` 3、`setting` 3、`relay` 3、`i18n` 2、`relaykit` 2、`common` 1。
前端修改数 Top：`web/src/features/**`、`web/src/i18n`、`web/src/lib`、`web/src/context`、`web/src/components`。

### 3.2 新增文件（31 个业务文件）

```
common/error_rule.go
controller/checkin_antiabuse_test.go
controller/customer_service_test.go
model/affiliate_reward.go
model/affiliate_reward_test.go
relay/channel/gemini/pseudo_200_test.go
relay/channel/openai/pseudo_200_test.go
relaykit/types/error_test.go
service/error_sanitizer.go
service/error_sanitizer_test.go
service/pseudo_error_detector.go
service/pseudo_error_detector_test.go
web/src/features/channels/components/__tests__/pseudo-200-i18n.test.tsx
web/src/features/channels/lib/__tests__/pseudo-200-configuration.test.ts
web/src/features/landing-v2/**                      (11 文件)
web/src/features/profile/__tests__/checkin-topup-gate.test.tsx
web/src/features/system-settings/content/customer-service-section.tsx
web/src/features/system-settings/request-policies/error-mapping-section.tsx
web/src/features/usage-logs/lib/__tests__/model-mapping-visibility.test.ts
web/src/lib/image-compress.ts
web/src/routes/landing-v2.tsx
```

（另 5 个非业务新增文件：`.github/workflows/docker-image.yml`、`UPGRADE_GUIDE.md`、`README_CN.md`、`VERSION`，以及后来删除的 `PORTING_GUIDE.md`）

### 3.3 新增配置键总表

**`options` 表**：
`MaxRegisterNumPerIP`、`AffiliateCommissionRate`、`AffiliateDescription`、`DefaultThemeSettings`、`ErrorSanitizationEnabled`、`ErrorMappingRules`

**`console_setting`（JSON，落 options）**：
`customer_service`、`customer_service_enabled`

**`checkin_setting`（JSON，落 options）**：
`require_topup`、`block_automated_ua`、`max_checkin_per_ip`

**`channels.setting`（JSON，渠道级）**：
`pseudo_200_enabled`、`pseudo_200_custom_keywords`、`pseudo_200_rules`

**新增表**：`affiliate_rewards`（唯一）

---

## 4. 移植 SOP

### 4.1 方式 A：补丁一键应用（推荐）

```bash
git clone <官方仓库> new-api && cd new-api
git checkout d04c118c8                 # 官方基线
git apply /path/new-api-official-11-businesses.patch
git add -A && git commit -m "port 11 businesses"
```

**已验证**：该补丁可干净应用，结果与交付仓库 **2574 文件逐字节一致**。
> `git apply` 可能提示 5 行 trailing whitespace —— 那是 markdown 文档里的**有意**换行空格，非错误。

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
| `model/option.go` | 官方持续新增 option | 保留上游，重新加 6 个 `OptionMap[...]` 与对应 `case` 分支 |
| `model/topup.go` | 官方改充值链路 | 保留上游，重新加 6 处 `processTopUpAffiliateRewardTx` 与 0 额度守卫 |
| `web/src/i18n/locales/*.json` | 官方持续加键 | 保留上游，重新追加本仓库新增键（7 语言**同步**）。**注意**：新键必须加在 `"translation"` **对象内部**，加在根对象会导致 i18next 回退显示英文 key（见 §1 约束三与 PORTING_NOTES 1.0.1） |
| `model/main.go` | AutoMigrate 列表 | 保留上游，重新加 `&AffiliateReward{}` |
| `controller/channel.go` + `router/channel-router.go` | 官方持续新增接口 | 保留上游，重新加 `GetChannelDefaultPseudo200Rules` 与其路由项（`authz.ChannelRead`） |

### 4.3 变基后必须回归的验证

```bash
# 1. 双 module 构建
go build ./common/... ./model/... ./service/... ./relay/... ./controller/... ./router/... ./setting/...
cd relaykit && GOWORK=off go build ./... && cd ..

# 2. 业务测试
go test ./service/ -run "Pseudo200|Sanitiz|ErrorMapping"
go test ./relay/channel/openai/ ./relay/channel/gemini/ -run Pseudo200
go test ./model/ -run "Affiliate|TopUp"
go test ./controller/ -run "Checkin|CustomerService"

# 3. 前端
cd web && bun run typecheck && bun x vitest run --pool=threads
```

> `go build ./...` 在根模块会因 `main.go:44 pattern web/dist: no matching files` 失败 —— 这是**官方既有条件**（前端未构建），非缺陷。用上面的显式包列表，或先 `cd web && bun run build`。

---

## 5. 部署要点

- **端口/环境**：沿用官方；本仓库未新增必需环境变量。
- **`VERSION`**：Dockerfile 用它注入前端与 Go 版本号（`v1.0.0-rc.40`）。**不要清空**。
- **三方言**：本次未引入任何方言特有能力；`affiliate_rewards` 用标准 GORM 定义。
- **镜像**：`ghcr.io/nkbaa/new-api:latest`（push 到 main 由 `docker-image.yml` 自动构建，多架构 amd64+arm64，约 25 分钟）。

---

## 6. 测试与已知问题

### 6.1 验证基线（全绿）

| 项 | 结果 |
|---|---|
| 后端 build（显式包列表）+ vet | exit 0 |
| `relaykit` 独立构建（`GOWORK=off`） | exit 0 |
| Go 文件 `gofmt` | 43 文件全 clean |
| 伪 200 测试（service 10 + relay 4） | 14/14 PASS |
| 前端 `typecheck` | exit 0 |
| 前端全量 `vitest` | **170 文件 / 2132 用例**，连续 2 次全过 |
| 改动前端文件 lint | 0 error（1 warning 位于**官方原有行**：`stores/system-config-store.ts` 的 `...(newConfig.currency ?? {})`） |
| 前端 i18n | 7 语言 × 6962 键，0 缺失/多余/重复 |
| 后端 i18n | 3 语言 × 265 键 |

### 6.2 官方既有问题（**不要修**）

1. `service/TestObserveChannelAffinityUsageCacheByRelayFormat_*` —— 官方基线同样失败（已用 stash 还原官方状态复现）。
2. `relay/channel/TestUpstreamGetBody_HTTP2RetryAfterGracefulGoAway_PassThrough` —— **偶发**（官方基线连跑 6 次失败 1 次），HTTP/2 时序竞争。
3. Windows `TempDir RemoveAll` 文件句柄占用（**非断言失败**，`testing.go:1464 cleanup` 报 `being used by another process`）：`controller/` 的 `TestModelManagementDatabaseMatrix/sqlite`、`TestAuditDatabaseMatrix/sqlite/*`、`TestSecurityLoginCodeCompletesOnce`、`TestOptionLogoValidation`、`TestGetStatusCustomerService`。Linux/CI 不受影响。
4. `bun run lint` 基线 66 warn / 182 err（多在 `scripts/sync-i18n.mjs`）。
5. 前端全量偶发 1 例 jsdom 时序抖动（`model-mapping-editor` / `marketplace-install-dialog`），单跑 3~5 次必过。

### 6.3 未验证项（如实声明）

- **MySQL / PostgreSQL 未实测**：仅有 SQLite 环境。本次新增表用标准 GORM，未用方言特性，但**没有**三方言实测证据。
- **`-race` 不可用**：`go: -race requires cgo`。并发幂等性通过行为测试证明（16 goroutine → 1 成功 / 15 拒绝 / 1 条流水 / 额度只入账一次）。
- **真实浏览器 + 真实后端未跑**：前端验证止于 DOM 行为与提交 payload 层。

---

## 7. 校验命令（AI 自检用）

```bash
# 三原则
git diff d04c118c8..HEAD -- '*.go' '*.sql' | grep -E '^\+.*(ALTER TABLE|ADD COLUMN|DROP COLUMN|CREATE INDEX)'   # 应无输出
git diff d04c118c8..HEAD | grep -E 'os/exec|exec\.Command|subprocess'                                            # 应无输出

# 伪200 必须是渠道级（旧全局开关必须不存在）
grep -rn 'Pseudo200DetectEnabled' --include=*.go --include=*.ts --include=*.tsx .   # 应无输出
grep -c 'IsPseudo200Error(info.ChannelSetting' relay/channel/openai/relay-openai.go relay/channel/gemini/relay-gemini.go  # 4 + 4

# 规则表可编辑：内置表必须能渲染成文本并原样解析回来
go test ./service/ -run 'TestGetChannelDefaultPseudo200RulesRoundTrip'

# 防误封短路仍在
grep -A2 'func ShouldDisableChannel' service/channel.go | grep ErrorCodePromptBlocked

# 改动规模
git diff --name-status d04c118c8..HEAD | awk '{print substr($1,1,1)}' | sort | uniq -c   # A=34 M=86 D=0
```

---

## 8. 给 AI 的行为准则

1. **不要**重新引入全局伪 200 开关或全局规则 —— 设计已定为渠道级。
2. **不要**修改官方既有失败测试；**不要**为通过测试而改官方代码。
3. **不要**触碰 §1 列出的全局主题/底层 UI/品牌文件。
4. 改 `.go` 后跑 `gofmt`；改 `.ts/.tsx` 后跑 `bun run typecheck`。
5. 改前端文案必须**同步 7 个语言文件**；改后端文案同步 3 个 YAML。
6. 行为变更必须补测试（本仓库 `web/AGENTS.md` §3.14 强制要求）；测试不得为空洞——需能通过变异测试验证。
7. 官方问题一律**不改**，只在本文档 §6.2 记录。
