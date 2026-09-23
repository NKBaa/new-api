# New API 源码全量移植与补丁实录手册（Source Code Porting Guide）

> **适用场景**：用于将本项目积累的所有二次开发特性（共 10 大业务、99 个文件）快速、完整、零遗漏地移植到任意官方全新源码分支（如基准 `v1.0.0-rc.40` 或后续更高版本）。  
> **核心承诺**：**0 ALTER TABLE、已有表 0 加字段**；100% 原生高内聚，零外部进程；全商业白标无痕；运维设置（Operations）零污染残留。  
> **改动规模**：**24 个新增文件**（全量落盘） + **75 个修改文件**（精准补丁） = **99 个文件**。

---

## 📑 目录导航

- [一、移植概览与配套工具](#一移植概览与配套工具)
- [二、方案 A：Git Patch 一键快速移植（推荐 3 分钟完成）](#二方案-agit-patch-一键快速移植推荐-3-分钟完成)
- [三、方案 B：源码分层分步手工移植实施指南](#三方案-b源码分层分步手工移植实施指南)
  - [阶段 1：后端基础配置与数据实体（Common / Model / Setting）](#阶段-1后端基础配置与数据实体common--model--setting)
  - [阶段 2：后端中转服务、脱敏与风控路由（Service / Controller / Router）](#阶段-2后端中转服务脱敏与风控路由service--controller--router)
  - [阶段 3：前端全局基础设施与主题外观（Lib / Context / Stores）](#阶段-3前端全局基础设施与主题外观lib--context--stores)
  - [阶段 4：公共外壳、白标与极简首页（Layout / Landing V2）](#阶段-4公共外壳白标与极简首页layout--landing-v2)
  - [阶段 5：控制台业务改造与隐私脱敏（Usage Logs / Profile / Wallet）](#阶段-5控制台业务改造与隐私脱敏usage-logs--profile--wallet)
  - [阶段 6：系统设置面板全面挂载（System Settings）](#阶段-6系统设置面板全面挂载system-settings)
  - [阶段 7：多语言国际化全覆盖与自动化构建（i18n / DevOps）](#阶段-7多语言国际化全覆盖与自动化构建i18n--devops)
- [四、24 个新增文件全量源码备查录](#四24-个新增文件全量源码备查录)
- [五、移植后编译构建与全业务功能验收](#五移植后编译构建与全业务功能验收)

---

## 一、移植概览与配套工具

### 1. 改动分类统计

| 分类 | 文件数量 | 主要构成 |
|---|:---:|---|
| **新增文件 (NEW)** | **24** | 返利流水实体模型及测试、报错脱敏引擎及测试、错误标准化及全字段脱敏测试、客服预设面板、请求策略报错脱敏面板、图片 Canvas 压缩引擎、OpenRouter 极简首页 12 个组件与独立路由、Docker GitHub Actions 自动化工作流。 |
| **修改文件 (MODIFIED)** | **75** | 系统常量定义、原生 Options 注册与边界安全校验、充值返利安全换算钩子、签到与滚动 24 小时注册风控拦截、日志脱敏与模型隐藏、主题存储与全站默认、公共页脚/顶栏白标、控制台视觉收敛、7 语种国际化全量对齐等。 |
| **合计改动文件** | **99** | 严格遵循正交解耦，与官方基准提交 `0aec08fee` 比对精确一致，无任何运维模块（Operations）残留。 |

### 2. 数据库设计原则（极其重要）
- **官方已有表保持绝对纯净**：`users`、`logs`、`topups`、`options`、`tokens`、`channels` 等官方表结构保持 **0 ALTER TABLE、0 字段新增**。
- **唯一新增表**：仅在 `model/main.go` 中通过 AutoMigrate 注册 `&AffiliateReward{}` 独立流水表（用于充值返利订单的唯一性幂等防刷）。
- **所有业务开关与动态数据**：全部落库在官方原生的 `options` 表中（以 key-value 形式持久化），平滑兼容 SQLite、MySQL、PostgreSQL。

### 3. 配套 Patch 补丁文件
在工程根目录下配套生成了全量 Git Patch 补丁：
- 补丁文件：`new-api-custom-v1.0.0-rc.40.patch`
- 大小：约 743 KB
- 适用基准：官方 `v1.0.0-rc.40`（Git Commit `0aec08fee`）

---

## 二、方案 A：Git Patch 一键快速移植（推荐 3 分钟完成）

如果你的目标仓库是官方标准的 `QuantumNous/new-api`，且基于 `v1.0.0-rc.40`（或邻近版本），可直接使用 Git Patch 一键自动打入所有 99 个文件：

```bash
# 1. 切换到干净的官方新仓库根目录
cd /path/to/clean-new-api
git checkout -b custom-porting 0aec08fee

# 2. 模拟试运行检查（确保 100% 可以平滑合入，无语法报错）
git apply --check /path/to/new-api-custom-v1.0.0-rc.40.patch

# 3. 正式打入所有补丁
git apply /path/to/new-api-custom-v1.0.0-rc.40.patch

# 4. 查看改动状态（应正好为 99 个文件的变更与新增）
git status

# 5. 执行单元测试验证
go test ./service -run TestSanitizeRelayError
(cd relaykit && go test ./types)
go test ./model -run TestCreateAffiliateReward
go test ./controller -run TestCustomerServiceValidation

# 6. 提交本次移植
git add -A
git commit -m "feat: port all 99 custom features and optimizations onto clean base"
```

> **提示**：若目标官方版本较新（如 `rc.41`），若个别文件提示冲突，可使用 `git apply --reject` 自动应用无冲突文件，并对生成的 `.rej` 文件按照下文「方案 B」进行精细化微调。

---

## 三、方案 B：源码分层分步手工移植实施指南

当需要将二次开发特性手动移植到有较大结构变动的新版源码时，请严格按照以下 7 个依赖阶段依序移植。

---

### 阶段 1：后端基础配置与数据实体（Common / Model / Setting）

#### 1.1 新增文件落盘
1. **[`common/error_rule.go`](file:///common/error_rule.go)**（新建）：定义 `ErrorMappingRule` 结构体。
2. **[`model/affiliate_reward.go`](file:///model/affiliate_reward.go)**（新建）：定义 `AffiliateReward` 结构体与 `CreateAffiliateReward` 幂等创建事务。

#### 1.2 [`common/constants.go`](file:///common/constants.go) 补丁
在常量声明区追加全局变量：
```go
var (
    AffiliateCommissionRate  = 0.0 // 充值返利百分比
    DefaultThemeSettings     = ""  // 全站默认外观配置 JSON
    ErrorSanitizationEnabled = true // 报错脱敏全局总开关
    ErrorMappingRules        = ""  // 自定义映射规则 JSON
)
```

#### 1.3 [`setting/console_setting/config.go`](file:///setting/console_setting/config.go) 补丁
在 `ConsoleSetting` 结构体中追加客服配置：
```go
type ConsoleSetting struct {
    // ... 官方原有字段 ...
    CustomerService        string `json:"customer_service"`
    CustomerServiceEnabled bool   `json:"customer_service_enabled"`
}
```

#### 1.4 [`setting/console_setting/validation.go`](file:///setting/console_setting/validation.go) 补丁
追加客服预设数据验证器 `validateCustomerService(setting *ConsoleSetting) error`，防范 XSS 与非法图片注入。

#### 1.5 [`setting/operation_setting/checkin_setting.go`](file:///setting/operation_setting/checkin_setting.go) 补丁
在 `CheckinSetting` 结构体中追加三大防黑产参数：
```go
type CheckinSetting struct {
    // ... 官方原有字段 ...
    RequireTopUp     bool `json:"require_topup"`
    BlockAutomatedUA bool `json:"block_automated_ua"`
    MaxCheckinPerIP  int  `json:"max_checkin_per_ip"`
}
```

#### 1.6 [`model/main.go`](file:///model/main.go) 补丁
在 `migrateDB()` 的 `DB.AutoMigrate(...)` 列表中注册新增表：
```go
func migrateDB() error {
    return DB.AutoMigrate(
        // ... 官方已有实体 ...
        &User{},
        &AffiliateReward{}, // <--- 仅新增这一行独立流水表
        &UserSession{},
        // ...
    )
}
```

#### 1.7 [`model/option.go`](file:///model/option.go) 补丁
1. `InitOptionMap()` 中初始化新 Option 键：
   ```go
   common.OptionMap["AffiliateCommissionRate"] = strconv.FormatFloat(common.AffiliateCommissionRate, 'f', -1, 64)
   common.OptionMap["AffiliateDescription"] = ""
   common.OptionMap["DefaultThemeSettings"] = common.DefaultThemeSettings
   common.OptionMap["ErrorSanitizationEnabled"] = strconv.FormatBool(common.ErrorSanitizationEnabled)
   common.OptionMap["ErrorMappingRules"] = common.ErrorMappingRules
   common.OptionMap["MaxRegisterNumPerIP"] = strconv.Itoa(common.MaxRegisterNumPerIP)
   ```
2. `ValidateOptionKey()` 中增加校验：
   - 对 `AffiliateCommissionRate` 验证必须为 0% ~ 100% 之间合法浮点数（非 NaN/Inf）。
   - 对 `ErrorMappingRules` 验证必须为合法 JSON 数组。
   - 对 `Logo` 验证体积不能超过 500KB，放行根相对路径与 Data URL，并严格过滤 `<script` 与 `javascript:`。
3. `updateOptionMap(key, value)` 中增加对上述 6 个键的热更新解析逻辑。

#### 1.8 [`model/topup.go`](file:///model/topup.go) 补丁
1. 追加返利结算辅助函数 `processTopUpAffiliateReward(topUp *TopUp, creditedQuota int)`，内置返佣比例边界（0–100%）校验、安全四舍五入换算与充值上限封顶保护。
2. 追加防黑产充值记录查询函数 `HasUserEverToppedUp(userId int) bool`（同时检查 `TopUp` 与 `Redemption` 卡密表）。
3. 在全部 6 种充值到账链路后调用结算：
   - `RechargeEpay`
   - `Recharge` (Stripe)
   - `ManualCompleteTopUp`
   - `RechargeCreem`
   - `RechargeWaffo`
   - `RechargeWaffoPancake`

#### 1.9 [`model/user.go`](file:///model/user.go) 补丁
追加查询邀请人 ID 的辅助函数：
```go
func GetUserInviterId(userId int) int {
    if userId <= 0 { return 0 }
    var inviterId int
    err := DB.Model(&User{}).Select("inviter_id").Where("id = ?", userId).Scan(&inviterId).Error
    if err != nil { return 0 }
    return inviterId
}
```

---

### 阶段 2：后端中转服务、脱敏与风控路由（Service / Controller / Router）

#### 2.1 新增文件落盘
1. **[`service/error_sanitizer.go`](file:///service/error_sanitizer.go)**（新建）：脱敏核心引擎（内置 10 大预设规则、状态码覆盖、动态多关键词匹配与未知 400 及全状态码智能兜底脱敏分类器）。
2. **[`relaykit/types/error_test.go`](file:///relaykit/types/error_test.go)**（新建）：标准错误码映射与全字段清洗单测。

#### 2.2 [`relaykit/types/error.go`](file:///relaykit/types/error.go) 补丁
在 `NewAPIError` 结构上实现 `SetMessage`、`ClearMetadata()` 与 `SanitizeFields(statusCode)`，新增 `StandardOpenAIFields` 与 `StandardClaudeType`，无论客户端是 OpenAI 还是 Claude 协议，均将报错响应中的 `Type`、`Code`、`Param` 与 `Metadata` 强制转换为官方合法安全字段，杜绝上游供应商私有错误类型、内部参数名称与集群元数据泄露。

#### 2.3 [`service/log_info_generate.go`](file:///service/log_info_generate.go) 与 [`service/task_billing.go`](file:///service/task_billing.go) 补丁
将敏感字段从 `other.SetPublic(...)` 提升为管理员专属可见：
```go
// 文本请求与任务计费链路
other.SetAdmin("is_model_mapped", true)
other.SetAdmin("upstream_model_name", relayInfo.UpstreamModelName)
other.SetAdmin("response_model", *observation)
```

#### 2.4 [`model/log_other.go`](file:///model/log_other.go) 补丁
将 `"response_model"`, `"upstream_model_name"`, `"is_model_mapped"` 纳为 `legacySensitiveLogOtherKeys`，非管理员查询日志接口序列化时自动抹除。

#### 2.5 [`controller/relay.go`](file:///controller/relay.go) 与 [`relay/channel/gemini/relay-gemini.go`](file:///relay/channel/gemini/relay-gemini.go) 补丁
在 API 出口处统一挂载脱敏引擎：
```go
// controller/relay.go 的 RelayTextHelper 出口 defer 块
if newAPIError != nil {
    service.ResetStatusCode(newAPIError, c.GetString("status_code_mapping"))
    service.SanitizeRelayError(c, newAPIError) // <--- 统一脱敏挂载
    return newAPIError
}
```

#### 2.6 [`controller/log.go`](file:///controller/log.go) 补丁
在普通用户查询日志的两个接口 `GetUserLogs` 与 `GetLogByKey` 中调用 `service.SanitizeUserLogs(logs)`，保证普通用户在控制台表格与详情弹窗看到的报错同样为规范友好信息，而系统管理员「所有日志」及底层数据库 100% 保留原始诊断信息。

#### 2.7 [`controller/checkin.go`](file:///controller/checkin.go) 补丁
在签到接口前置链路加入三道风控防线：
1. 充值门槛拦截：`if checkinSetting.RequireTopUp && !model.HasUserEverToppedUp(user.Id)`
2. 自动化 UA 拦截：`if checkinSetting.BlockAutomatedUA && isAutomatedUserAgent(ua)`
3. 单 IP 每日原子计数与超额拦截（支持 Redis 分布式与内存降级）。

#### 2.8 [`controller/misc.go`](file:///controller/misc.go) 补丁
在 `/api/status` 响应中广播客服配置、全站默认主题与返利文案：
```go
data["customer_service_enabled"] = cs.CustomerServiceEnabled
data["affiliate_description"] = common.OptionMap["AffiliateDescription"]
data["default_theme_settings"] = common.OptionMap["DefaultThemeSettings"]
if cs.CustomerServiceEnabled {
    data["customer_service"] = console_setting.GetCustomerService()
}
```

#### 2.9 [`controller/user.go`](file:///controller/user.go) 补丁
在注册接口引入单 IP 滚动 24 小时最大注册账号数频控校验（`MaxRegisterNumPerIP`），支持 Redis Sorted Set 滑动窗口及内存滑动时间戳队列，原子预留与回滚，杜绝跨午夜重置的套利漏洞。

#### 2.10 [`router/api-router.go`](file:///router/api-router.go) 补丁
为 `POST /api/user/checkin` 挂载 `middleware.CriticalRateLimit()` 高危接口频控中间件。

---

### 阶段 3：前端全局基础设施与主题外观（Lib / Context / Stores）

#### 3.1 新增文件落盘
1. **[`web/src/lib/image-compress.ts`](file:///web/src/lib/image-compress.ts)**（新建）：浏览器 Canvas 图片自适应压缩引擎（最大 256x256 / 500x500，输出轻量 WebP/PNG，防 SVG XSS 注入）。

#### 3.2 [`web/index.html`](file:///web/index.html) 补丁
在 `<head>` 中注入**早期同步持久化注水脚本（Early Sync Hydration）**，首字节渲染前从 `localStorage` 读取缓存系统标题，彻底消除弱网下标签页闪烁 "New API"：
```html
<script>
  (function () {
    try {
      var savedTitle = localStorage.getItem('newapi:cached_system_name');
      if (savedTitle && savedTitle.trim()) {
        document.title = savedTitle.trim();
      }
    } catch (e) {}
  })();
</script>
```

#### 3.3 [`web/src/lib/constants.ts`](file:///web/src/lib/constants.ts) 与 [`web/src/assets/logo.tsx`](file:///web/src/assets/logo.tsx) 补丁
- 将 `DEFAULT_SYSTEM_NAME` 回退常量设为空字符串。
- 移除 Logo SVG 内写死的 `<title>New API</title>` 标签，彻底避免悬停时品牌穿帮。

#### 3.4 主题存储与全站默认系统
- **[`web/src/lib/theme-customization.ts`](file:///web/src/lib/theme-customization.ts)**：定义 `DefaultThemeSettings` 类型与解析函数。
- **[`web/src/lib/theme-storage.ts`](file:///web/src/lib/theme-storage.ts)**：扩展 `isUserThemeModified` / `markUserThemeModified` / `clearUserThemeModified`。
- **[`web/src/context/theme-provider.tsx`](file:///web/src/context/theme-provider.tsx)** 与 **[`web/src/context/theme-customization-provider.tsx`](file:///web/src/context/theme-customization-provider.tsx)**：未修改用户默认跟随服务端全站设定，手动调整锁定个性化，重置按钮恢复默认。
- **[`web/src/components/config-drawer.tsx`](file:///web/src/components/config-drawer.tsx)**：底部为管理员提供【设为全站默认】按钮，并集成「首页可动标题栏圆角」选择器。

---

### 阶段 4：公共外壳、白标与极简首页（Layout / Landing V2）

#### 4.1 新增文件落盘（OpenRouter 风格极简首页 12 个文件）
将下列文件原样放入 `web/src/features/landing-v2/` 目录：
1. `index.tsx`
2. `types.ts`
3. `constants.ts`
4. `hooks/use-landing-data.ts`
5. `components/hero.tsx`
6. `components/model-browser.tsx`
7. `components/quickstart.tsx`
8. `components/compatible-tools.tsx`
9. `components/features-summary.tsx`
10. `components/customer-service.tsx`
11. `components/customer-service-floating.tsx`
12. 路由文件 **[`web/src/routes/landing-v2.tsx`](file:///web/src/routes/landing-v2.tsx)**

#### 4.2 [`web/src/routes/index.tsx`](file:///web/src/routes/index.tsx) 补丁
将根路由组件平滑指向 `LandingV2`（原版 `features/home` 源码 100% 完整保留）：
```tsx
import { LandingV2 } from '@/features/landing-v2'
// ...
export const Route = createFileRoute('/')({
  component: LandingV2,
})
```

#### 4.3 [`web/src/components/layout/components/public-header.tsx`](file:///web/src/components/layout/components/public-header.tsx) 补丁
读取 `themeCustomization.floatingHeaderRadius`，通过明确的 Tailwind 类（`rounded-[16px]`、`rounded-full` 等）渲染吸顶悬浮导航栏，规避 Tailwind CSS v4 在直角设置下 `--radius: 0` 导致药丸导航栏塌陷的问题。

#### 4.4 [`web/src/components/layout/components/footer.tsx`](file:///web/src/components/layout/components/footer.tsx) 与 [`system-brand.tsx`](file:///web/src/components/layout/components/system-brand.tsx) 补丁
- 移除页脚官方硬编码链接与版权漏标。
- 侧边栏品牌展示过滤硬编码 "New API"，优先使用自定义系统名称。

---

### 阶段 5：控制台业务改造与隐私脱敏（Usage Logs / Profile / Wallet）

#### 5.1 模型脱敏防穿帮（使用日志全套 6 文件）
- **[`usage-logs/types.ts`](file:///usage-logs/types.ts)**：在 `admin_info` 下定义映射与真实上游模型字段。
- **[`usage-logs/lib/format.ts`](file:///usage-logs/lib/format.ts)**：`formatModelName(log, isAdmin)` 非管理员强制返回未映射。
- **[`usage-logs/components/columns/common-logs-columns.tsx`](file:///usage-logs/components/columns/common-logs-columns.tsx)**、**[`common-log-mobile-card.tsx`](file:///usage-logs/components/common-log-mobile-card.tsx)**、**[`details-dialog.tsx`](file:///usage-logs/components/dialogs/details-dialog.tsx)**、**[`task-details-dialog.tsx`](file:///usage-logs/components/dialogs/task-details-dialog.tsx)**：严格判断 `isAdmin`，非管理员不展示橙色 `⚠️ 响应模型: xxx` 徽标、映射详情与真实渠道模型名。

#### 5.2 个人中心与钱包
- **[`profile/components/checkin-calendar-card.tsx`](file:///profile/components/checkin-calendar-card.tsx)**：感知充值门槛拦截，未充值用户展示「需先充值」友好引导。
- **[`wallet/components/affiliate-rewards-card.tsx`](file:///wallet/components/affiliate-rewards-card.tsx)**：动态读取并展示后台自定义的推荐计划说明文案。

#### 5.3 控制台公共视觉微调
- **[`about/index.tsx`](file:///about/index.tsx)**：未配置内容时呈现纯净专业占位，不泄露官方仓库链接。
- **[`pricing/index.tsx`](file:///pricing/index.tsx)** 与 **[`rankings/index.tsx`](file:///rankings/index.tsx)**：移除顶部 600px 刺眼蓝紫极光光斑，骨架屏圆角统一收敛为 `rounded-lg`。
- **[`dashboard/components/overview/overview-dashboard.tsx`](file:///dashboard/components/overview/overview-dashboard.tsx)**：顶部增加 Base URL 复制栏，多语言代码预览框高度自然伸展。

---

### 阶段 6：系统设置面板全面挂载（System Settings）

#### 6.1 新增文件落盘
1. **[`web/src/features/system-settings/content/customer-service-section.tsx`](file:///web/src/features/system-settings/content/customer-service-section.tsx)**（新建）：在线客服预设配置面板（数据表格、拖拽排序、CRUD 弹窗、二维码本地直传与 Canvas 压缩）。
2. **[`web/src/features/system-settings/request-policies/error-mapping-section.tsx`](file:///web/src/features/system-settings/request-policies/error-mapping-section.tsx)**（新建）：报错脱敏与自定义映射规则面板，提供官方标准的 `[ ⊞ 可视化 | <> JSON ]` 双模式交互，内置 `<JsonCodeEditor>` 批量导入与无损双向转换。

#### 6.2 挂载与绑定
- **[`system-settings/types.ts`](file:///system-settings/types.ts)**：`BillingSettings` 扩展返利字段；定义 `ErrorMappingRule` 接口；`OperationsSettings` 保持官方原样。
- **[`system-settings/auth/`](file:///system-settings/auth/)**：在认证设置中挂载「单 IP 注册限制（24小时）」输入项。
- **[`system-settings/billing/`](file:///system-settings/billing/)** 与 **[`system-settings/general/quota-settings-section.tsx`](file:///system-settings/general/quota-settings-section.tsx)**：挂载「充值返利比例 (%)」与「推荐计划说明文案」表单项。
- **[`system-settings/general/checkin-settings-section.tsx`](file:///system-settings/general/checkin-settings-section.tsx)**：挂载充值门槛开关、自动化 UA 拦截开关、单 IP 每日签到上限输入框。
- **[`system-settings/general/system-info-section.tsx`](file:///system-settings/general/system-info-section.tsx)**：实现 Logo 本地选择/拖拽/Ctrl+V 粘贴直传、Canvas 智能高清轻量压缩、预览窗口与一键恢复默认。
- **[`system-settings/content/`](file:///system-settings/content/)**：注册客服信息预设配置区块。
- **[`system-settings/request-policies/`](file:///system-settings/request-policies/)**：在 `defaults.ts` 与 `section-registry.tsx` 中注册 `error-mapping` 路由与子导航。
- **[`system-settings/hooks/use-update-option.ts`](file:///system-settings/hooks/use-update-option.ts)**：将 `DefaultThemeSettings` 加入 `STATUS_RELATED_KEYS` 缓存自动失效集合。

---

### 阶段 7：多语言国际化全覆盖与自动化构建（i18n / DevOps）

#### 7.1 新增业务全链路国际化规范（业务十）
- **零硬编码规范（Zero Hardcoded Strings）**：所有二次开发新增页面、抽屉设置、表单项（`FormLabel`）、占位说明（`placeholder`）、操作按钮、反馈弹窗（`toast`）与校验报错（Zod resolver）必须统一调用 `const { t } = useTranslation()`。
- **全 7 语种字典 100% 齐平（0 缺失键）**：
  - **[`web/src/i18n/static-keys.ts`](file:///web/src/i18n/static-keys.ts)**：注册 `'Error Sanitization'` 等动态标题翻译键，防止构建阶段 tree-shaking 遗漏。
  - **`web/src/i18n/locales/` 全语种字典**（`zh.json`, `en.json`, `zh-TW.json`, `ja.json`, `fr.json`, `ru.json`, `vi.json`）：全面补齐二次开发新增业务全部词条，地道自然译文，实现所有 7 种语言 100% 词条对齐（0 缺失），确保语种切换时 100% 丝滑无裸字符串。

#### 7.2 自动化构建与版本标记
- **[`.github/workflows/docker-image.yml`](file:///.github/workflows/docker-image.yml)**（新建）：配置 GitHub Actions 自动构建 `linux/amd64` 与 `linux/arm64` 双架构 Docker 镜像并推送至 GHCR，包含完整后端源码触发路径。
- **[`VERSION`](file:///VERSION)**：填入基准版本号（如 `v1.0.0-rc.40`）。

---

## 四、24 个新增文件全量源码备查录

移植时，若选择手工创建新增文件，可直接参考或复制本仓库中对应的源码文件（全部位于标准目录）：

| 序号 | 目标文件路径 | 核心代码行数 | 功能职责与备查说明 |
|:---:|---|:---:|---|
| 1 | `common/error_rule.go` | 13 行 | 错误映射规则结构体定义 |
| 2 | `model/affiliate_reward.go` | 77 行 | 充值返利流水实体与唯一索引防重入入账事务 |
| 3 | `model/affiliate_reward_test.go` | 154 行 | 返佣事务幂等性、比例范围与边界测试 |
| 4 | `service/error_sanitizer.go` | 360 行 | 报错脱敏核心引擎与 10 大生产预设规则（含未知 400 与全状态码兜底脱敏） |
| 5 | `service/error_sanitizer_test.go` | 304 行 | 报错脱敏 11 类典型用例及未知 400/429 脏字段与拓扑脱敏单测 |
| 6 | `relaykit/types/error_test.go` | 78 行 | 官方错误标准化与全字段（Code/Type/Param/Metadata）清洗单测 |
| 7 | `controller/checkin_antiabuse_test.go` | 435 行 | 签到防黑产与滚动 24 小时单 IP 注册频控单测 |
| 8 | `controller/customer_service_test.go` | 137 行 | 客服配置校验与防 XSS 单测 |
| 9 | `web/src/lib/image-compress.ts` | 277 行 | HTML5 Canvas 高清轻量压缩与 SVG 净化 |
| 10 | `web/src/routes/landing-v2.tsx` | 12 行 | 独立预览路由组件 |
| 11 | `web/src/features/landing-v2/index.tsx` | 48 行 | OpenRouter 极简首页主容器 |
| 12 | `web/src/features/landing-v2/types.ts` | 65 行 | 首页数据接口定义 |
| 13 | `web/src/features/landing-v2/constants.ts` | 118 行 | 模型分类与接入代码模板 |
| 14 | `web/src/features/landing-v2/hooks/use-landing-data.ts` | 148 行 | 系统性能监控与高可用指标抓取 |
| 15 | `web/src/features/landing-v2/components/hero.tsx` | 89 行 | 首屏 Hero 与 Base URL 复制栏 |
| 16 | `web/src/features/landing-v2/components/model-browser.tsx` | 215 行 | 模型可用性与探测延迟目录 |
| 17 | `web/src/features/landing-v2/components/quickstart.tsx` | 112 行 | 极简接入代码沙盒 |
| 18 | `web/src/features/landing-v2/components/compatible-tools.tsx` | 108 行 | 兼容生态客户端列表 |
| 19 | `web/src/features/landing-v2/components/features-summary.tsx` | 92 行 | 平台架构特性卡片 |
| 20 | `web/src/features/landing-v2/components/customer-service.tsx` | 280 行 | 首页自适应居中客服与大图灯箱 |
| 21 | `web/src/features/landing-v2/components/customer-service-floating.tsx` | 195 行 | 全站右下角浮动客服球 |
| 22 | `web/src/features/system-settings/content/customer-service-section.tsx` | 445 行 | 客服信息后台配置面板 |
| 23 | `web/src/features/system-settings/request-policies/error-mapping-section.tsx` | 415 行 | 请求策略报错脱敏 [ ⊞ 可视化 \| <> JSON ] 双模式面板 |
| 24 | `.github/workflows/docker-image.yml` | 80 行 | GHCR 容器双架构 (amd64/arm64) 自动构建工作流 |

> **提示**：所有上述 24 个文件的完整代码均已包含在根目录的 `new-api-custom-v1.0.0-rc.40.patch` 补丁包中，使用 `git apply` 可秒级完整生成，无需手工逐字键入。

---

## 五、移植后编译构建与全业务功能验收

移植完成后，按照以下步骤依次执行编译、测试与端到端功能验收：

### 1. 后端单元测试自动化验证
```bash
# 验证报错脱敏核心引擎（11 大典型报错用例及未知 400 兜底）
go test ./service -v -run TestSanitizeRelayError

# 验证官方错误标准化与全字段清洗单测
(cd relaykit && go test -v ./types)

# 验证充值返利防重入幂等入账事务
go test ./model -v -run TestCreateAffiliateReward

# 验证客服信息数据校验与安全过滤
go test ./controller -v -run TestCustomerServiceValidation
```

### 2. 前端依赖与代码质量检查
```bash
cd web

# 代码静态检查与规范扫描（确保 0 报错 0 警告）
npm run lint  # 或 bun run oxlint

# 生产环境静态打包构建
npm run build # 或 bun run build
```

### 3. 数据库零改动确认检查
启动后端服务，观察控制台输出日志：
1. 确认系统未对 `users`、`topups`、`logs`、`options` 表执行任何 `ALTER TABLE` 语句。
2. 确认仅新增了 1 张独立表 `affiliate_rewards`。
3. 数据库已有数据 100% 保持原生兼容。

### 4. 关键功能点快速点击核验（Checklist）
- [ ] **充值返利（业务一）**：在「额度设置」将比例设为 `7%`，测试充值到账后邀请人钱包卡片待提现额度即时到账。
- [ ] **推广说明（业务二）**：在后台自定义推荐文案，前台钱包卡片即刻同步更新并支持优雅回退。
- [ ] **商业脱敏（业务三）**：普通用户日志与详情中完全隐藏 `⚠️ 响应模型` 与内部映射模型名，管理员审计不受影响。
- [ ] **全站默认主题（业务四）**：管理员在主题抽屉点击【设为全站默认】，无痕新访客进入首屏自动生效，且已自定义用户不被覆盖；吸顶导航条圆角 6 档平滑切换无塌陷。
- [ ] **极简首页与实时监控（业务五）**：根路径呈现沉浸纯黑 OpenRouter 极简首页，模型可用性与延迟与系统监控一致；首字节注水消灭 "New API" 标题闪烁。
- [ ] **风控防刷（业务六）**：开启「充值门槛」与「自动化 UA 拦截」，使用 Curl 或未付费小号签到均被拦截并友好提示。
- [ ] **客服预设与自适应排版（业务七）**：后台添加客服，首页客服自动单项黄金居中或多项矩阵平铺，支持 Lightbox 放大，右下角展示浮动客服球。
- [ ] **全站免图床直传引擎（业务八）**：系统 Logo 与客服二维码支持拖拽与 `Ctrl+V` 一键粘贴，Canvas 自动压缩至 10~30KB，切回官方原版前台与 Favicon 100% 正常显示。
- [ ] **报错脱敏与 JSON 模式（业务九）**：在「请求策略」测试可视化表格与 `<JsonCodeEditor>` 双模式无损双向切换与批量粘贴；API 与用户控制台闭环脱敏。
- [ ] **全业务多语言国际化（业务十）**：切换中/英/繁/日，所有新增页面、抽屉、上传提示、校验报错均无中文裸字符串残留，语言切换瞬时生效。
