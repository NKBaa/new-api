# New API 二次开发全景架构与官方版本合并升级指南

> **版本基准**：官方最新正式发布版 **`v1.0.0-rc.40`**（Git Commit `0aec08fee`）  
> **核心承诺**：**0 ALTER TABLE、已有表 0 加字段**；100% 原生高内聚，零外部轮询进程；全流程商业级白标无痕；上游主线合并冲突率 **< 1%**。

---

## 📑 目录导航
- [一、核心设计原则](#一核心设计原则)
- [一、核心设计原则](#一核心设计原则)
- [二、十大核心业务模块架构全景](#二十大核心业务模块架构全景)
  - [1. 业务一：原生内嵌式充值返佣系统（Affiliate Commission）](#1-业务一原生内嵌式充值返佣系统affiliate-commission)
  - [2. 业务二：推荐计划说明文案后台动态自定义（Referral Description）](#2-业务二推荐计划说明文案后台动态自定义referral-description)
  - [3. 业务三：普通用户隐藏响应模型警告与重定向详情（商业脱敏防穿帮）](#3-业务三普通用户隐藏响应模型警告与重定向详情商业脱敏防穿帮)
  - [4. 业务四：全站默认主题外观管理员一键设定与个性化独立（Theme Storage）](#4-业务四全站默认主题外观管理员一键设定与个性化独立theme-storage)
  - [5. 业务五：OpenRouter 风格极简首页（Landing V2）](#5-业务五openrouter-风格极简首页landing-v2)
  - [6. 业务六：防黑产与防自动化脚本薅羊毛风控体系（Anti-Abuse Controls）](#6-业务六防黑产与防自动化脚本薅羊毛风控体系anti-abuse-controls)
  - [7. 业务七：在线客服预设体系与多形态自适应展示（Customer Service Presets）](#7-业务七在线客服预设体系与多形态自适应展示customer-service-presets)
  - [8. 业务八：全站免第三方图床本地图片智能压缩直传引擎（Zero-Host Local Image Engine）](#8-业务八全站免第三方图床本地图片智能压缩直传引擎zero-host-local-image-engine)
  - [9. 业务九：中转报错自定义脱敏与标准化映射系统（Error Sanitization & Custom Rules）](#9-业务九中转报错自定义脱敏与标准化映射系统error-sanitization--custom-rules)
  - [10. 业务十：新增业务全链路国际化多语言对齐（Comprehensive i18n & Multi-Language Support）](#10-业务十新增业务全链路国际化多语言对齐comprehensive-i18n--multi-language-support)
- [三、代码改动清单（99 个二次开发文件全览）](#三代码改动清单99-个二次开发文件全览)
  - [1. 变更宏观统计与架构分层](#1-变更宏观统计与架构分层)
  - [2. 分层详细改动清单（8 大模块详表）](#2-分层详细改动清单8-大模块详表)
- [四、官方版本合并变基标准操作程序（Rebase SOP）](#四官方版本合并变基标准操作程序rebase-sop)
  - [1. 标准 5 步合并流程](#1-标准-5-步合并流程)
  - [2. v1.0.0-rc.40 关键架构演进适配经验](#2-v100-rc40-关键架构演进适配经验)
  - [3. 核心冲突常客文件快速解决代码对照](#3-核心冲突常客文件快速解决代码对照)
  - [4. 架构正交性与长期合并兼容性矩阵](#4-架构正交性与长期合并兼容性矩阵)
- [五、生产环境部署配置与运维建议](#五生产环境部署配置与运维建议)
- [六、全业务功能验收测试清单（Checklist）](#六全业务功能验收测试清单checklist)

---

## 一、核心设计原则

本项目在设计与实现二次开发特性时，始终将**长期可维护性**与**与官方主线平滑合并能力**置于首位：

1. **零破坏已有表结构（Zero Schema Mutation）**：
   - 对系统所有已有表（`users`、`topups`、`logs`、`options` 等）保持 **0 ALTER TABLE、已有表 0 加字段**；
   - 仅新增 1 张独立的流水表 `affiliate_rewards`，其余所有业务开关与元数据全部复用原生的 `options`、`operation_setting` 与 `console_setting` 架构，最大化保障数据库迁移的纯净安全。
2. **纯原生内嵌高内聚（Zero External Sidecars）**：
   - 彻底摒弃外部 Python/Node.js 轮询脚本或常驻辅助进程；
   - 充值返利、防刷限流、客服下发、白标防闪烁全部在 Go 核心事务与 React 状态层中闭环完成，天然支持水平扩展与分布式高可用。
3. **商业化严谨与防穿帮（Three-Tier Privacy Sandbox）**：
   - 建立“数据层脱敏 + 写入层提权 + 视图层隔离”三层防护；
   - 隐藏敏感模型重定向警告与底层真实渠道名，全站彻底消除开源原版标识泄漏，保证商业平台严谨性。
4. **极简首页与全局原生主题解耦驱动（Native Theme Harmony）**：
   - 彻底摒弃对侧边栏、表格、外壳等底层公共 UI 组件的硬编码侵入；
   - 首页采用独立的 OpenRouter 风格极简架构（Landing V2），全站控制台风格则 100% 依托官方原生主题体系与全站默认配置（Dark + Neutral + Compact）驱动，兼顾极客质感的同时对官方后续主线组件更新保持 **100% 零冲突**。
5. **零第三方图床依赖（Zero Image Hosting Dependency）**：
   - 二维码与 Logo 直传支持本地文件选择、拖拽直传与剪贴板 `Ctrl+V` 一键粘贴；
   - 浏览器原生 HTML5 Canvas 自动自适应压缩为高清轻量 Data URL，后端搭配严格的 SVG 脚本注入净化与体积防御。
6. **全维度风控防护（Multi-Vector Anti-Abuse Defenses）**：
   - 充值门槛拦截、自动化 UA 阻断、单 IP 每日签到上限、单 IP 24h 注册上限、关键路由频控，全套独立后台热更新开关，精准瓦解批量小号囤积与脚本自动化套利。

---

## 二、十大核心业务模块架构全景

### 1. 业务一：原生内嵌式充值返佣系统（Affiliate Commission）
- **痛点背景**：原版仅支持新用户注册时一次性奖励固定额度，缺乏持续激励推广者裂变的商业充值分销机制。市面第三方脚本依赖数据库轮询，延迟大且易重复发佣。
- **技术架构**：
  - 在所有 6 种充值到账链路（易支付、Stripe、Creem、Waffo、Waffo Pancake、管理员后台手动补单）中挂载 `processTopUpAffiliateReward(topup)`；
  - 触发事务级原子结算，按后台配置的比例（`AffiliateCommissionRate`，如 7%）折算额度累加至邀请人的 `aff_quota` 与 `aff_history`，并写入系统日志；
  - 独立表 `affiliate_rewards` 以 `reference = topup-{id}` 建立唯一索引，从数据库行级彻底杜绝并发回调与网络重试导致的重复发佣；
  - **严格比例边界校验与安全额度换算**：在 Option 校验层与结算层双重严格限制 0% ~ 100% 有效范围，杜绝非法浮点数（NaN/Inf）或超出 100% 的异常配置；返佣额度采用安全的四舍五入并强制以实际充值额度为绝对上限，避免溢出与计算漂移。
- **存储与选项**：新增表 `affiliate_rewards`；Option 键 `AffiliateCommissionRate`。
- **效果体验**：用户充值到账瞬间，邀请人钱包卡片的“待提现余额”和“累计收益”实时增加，支持随时自主划转至可用余额。

### 2. 业务二：推荐计划说明文案后台动态自定义（Referral Description）
- **痛点背景**：钱包页面的推荐返利说明文案硬编码在前端多语言包中，站长调整返佣规则后前台文案无法动态同步。
- **技术架构**：
  - 复用系统原生 `options` 广播机制，在「系统设置 → 计费与展示 → 额度设置」中提供输入框；
  - 后端在 `/api/status` 中广播 `affiliate_description`；前端钱包卡片优先读取该字段，留空时自动优雅回退为多语言默认文案。
- **存储与选项**：复用 `options` 表（键 `AffiliateDescription`）。
- **效果体验**：后台配置实时生效，普通用户打开钱包页面即刻看到最新专属推广说明。

### 3. 业务三：普通用户隐藏响应模型警告与重定向详情（商业脱敏防穿帮）
- **痛点背景**：当渠道配置了模型映射（如内部私有后缀 `-PPV`）或上游返回版本号略有出入时，普通用户前台会弹出橙色 `⚠️ 响应模型: xxx` 警告，且详情弹窗泄露真实渠道模型名。
- **技术架构**：
  - **数据层脱敏**：在 `model/log_other.go` 中将 `"response_model"`, `"upstream_model_name"`, `"is_model_mapped"` 纳为 `legacySensitiveLogOtherKeys` 敏感字段，非管理员调用 API 时服务端在根源处序列化剥离；
  - **写入层提权**：仅管理员可见的审计信息改用官方原生的 `other.SetAdmin(...)` 写入 `admin_info`；
  - **视图层隔离**：表格列、移动端卡片、详情弹窗对普通用户仅展示其调用的标准模型名；管理员账号完整保留链路诊断排查信息。
- **效果体验**：普通用户界面无橙色穿帮警告；管理员在后台一键查看完整调用链路与真实模型。

### 4. 业务四：全站默认主题外观管理员一键设定与个性化独立（Theme Storage）
- **痛点背景**：原版外观设置仅保存在用户本地，站长无法设定全站默认主题风格（明暗、主题色、字体、圆角、密度）。
- **技术架构**：
  - 管理员在右侧「主题设置」抽屉选择好明暗模式、颜色预设、字体、圆角、密度后，点击底部的【设为全站默认】一键落库至 `options.DefaultThemeSettings`；
  - 无痕新访客或未修改过主题的用户首次进入网站，首屏自动呈现全站默认主题（如 Dark + Neutral + Compact）；
  - 用户一旦在抽屉中主动调整任何选项，前端写入 `newapi:theme:v1:user-modified` 标记锁定其个人喜好；此后管理员再次调整全站默认，该用户外观保持不变；
  - 用户若在抽屉中点击【重置】，清除个人标记，瞬间恢复跟随管理员设定的最新全站默认主题。
  - **首页可动标题栏圆角独立配置（Floating Header Radius）**：在主题抽屉中加回并升级「首页可动标题栏圆角」设置，提供 6 档精细化尺寸（默认 16px、胶囊 Full、中圆 12px、微圆 6px、直角 0、跟随全局 Auto）。针对 Tailwind CSS v4 中 `@theme inline` 导致 `--radius-2xl` 在全局直角设置（`--radius: 0`）下塌陷为方角的问题，采用明确像素类名（`rounded-[16px]` 等）锁死固定语义，杜绝塌陷，保证抽屉小图预览与实际页面效果 100% 一致，并支持一键【设为全站默认】同步至新访客。
- **存储与选项**：复用 `options` 表（键 `DefaultThemeSettings`）。

### 5. 业务五：OpenRouter 风格极简首页（Landing V2）
- **痛点背景**：原版首页风格偏向浮夸营销化，横向割裂线较多，缺乏面向专业开发者的极简质感。
- **技术架构**：
  - **OpenRouter 风格极简首页 (`features/landing-v2/`)**：连续纯黑画卷，剔除生硬分割线；经典药丸形浮动顶栏（Pill Shape）保留；管理员若配置了自定义首页内容则优先展示，未配置则无缝展示全新开发者极简首页；
  - **真实高可用性监控对接**：首页模型目录接入系统统一性能监控接口 `/api/perf-metrics/summary?hours=24`，展示真实采样成功率（如 `100.00%`，满分祖母绿灯 `bg-emerald-500`）与毫秒级延迟；当无近 24 小时采样监控数据时，以客观中立符号（`—`）展示，无公开模型时显示空状态，杜绝展示虚构的满分指标或臆造的推测延迟；
  - **早期同步持久化注水（Early Sync Hydration）**：在 `web/index.html` 的 `<head>` 中注入同步脚本，首字节渲染前从本地缓存同步更新标题，彻底消灭首屏弱网时 "New API" 标题闪烁；
  - **老首页完整保留防冲突**：原版 `features/home` 源码 100% 完整保留，主路由单行组件切换，官方后续主线更新自动静默合并；
  - **全站风格交由原生主题驱动**：彻底移除对侧边栏、表格、页面外壳的硬编码穿透侵入，全面交还给业务四的全局默认主题（管理员设为 Dark + Neutral + 紧凑即可呈现纯正 OpenRouter 质感），实现底层组件 0 侵入与 0 冲突。

### 6. 业务六：防黑产与防自动化脚本薅羊毛风控体系（Anti-Abuse Controls）
- **痛点背景**：开源自动化签到脚本与黑产利用批量注册小号集群每天刷取并囤积赠送额度，消耗平台成本。
- **技术架构**：
  - **充值/卡密兑换门槛开关**（`checkin_setting.require_topup`）：通过 `model.HasUserEverToppedUp(userId)` 校验用户是否曾有线上充值或卡密兑换成功记录，未付费账号无法签到，个人中心显示友好引导；
  - **自动化脚本 UA 拦截开关**（`checkin_setting.block_automated_ua`）：识别并拦截 Python-requests、Axios、Node-fetch、Curl、Aiohttp、Httpx、Urllib、PostmanRuntime 等脚本直连；
  - **单 IP 每日签到上限**（`checkin_setting.max_checkin_per_ip`）：限制同一 IP 每天最多签到成功 N 次，支持 Redis 分布式与内存滑动计数，带原子预留与失败回滚；
  - **单 IP 滚动 24 小时注册上限**（`MaxRegisterNumPerIP`）：在认证设置中限制单 IP 滚动 24 小时最大注册账号数，基于 Redis Sorted Set 滑动窗口或内存滑动时间戳队列实现，杜绝跨午夜重置的套利漏洞；
  - **关键接口频控**：为 `POST /api/user/checkin` 挂载 `middleware.CriticalRateLimit()`。

### 7. 业务七：在线客服预设体系与多形态自适应展示（Customer Service Presets）
- **痛点背景**：原版缺少标准化的在线客服系统，站长手写 HTML 繁琐脆弱且缺乏移动端适配，客服渠道分散且不支持动态启闭与自由排序。
- **技术架构**：
  - **后台可视化多渠道管理**（【系统设置】→【内容设置】→【客服信息预设】）：支持一键添加微信、QQ、Telegram、邮箱或自定义预设渠道；配置项包含客服名称、联系账号、说明文案与外部跳转链接，支持自由拖拽排序与实时启用开关；
  - **前台双形态与自适应排版引擎**：
    - **首页多卡片黄金自适应排版**：内置响应式卡片排版算法（单项黄金居中、双项对称并列、三项横向平铺、四项 2x2 对称矩阵、多项流式居中对齐，告别传统网格在单双项时的左倾与生硬空白）；卡片内部统一等高布局与操作按钮基线对齐；支持一键复制联系账号、新标签页跳转；
    - **大图 Lightbox 扫码灯箱**：配备全屏高保真 Lightbox 弹窗，点击缩略图或放大镜图标即刻居中弹出，支持暗色背景毛玻璃衬托与平滑缩放，极大提升移动端扫码体验；
    - **全站折叠式浮动客服球**：在全站公共视图右下角注入折叠浮动客服球，支持点击展开抽屉面板，移动端自适应贴边避让主要操作区；
- **存储与选项**：复用官方原生 `console_setting` 架构（`customer_service`、`customer_service_enabled`），保持已有表 0 ALTER TABLE。

### 8. 业务八：全站免第三方图床本地图片智能压缩直传引擎（Zero-Host Local Image Engine）
- **痛点背景**：原版系统 Logo 与客服二维码仅支持填写外部公网 HTTP/HTTPS 链接，站长必须自行采购或搭建第三方图床。外部图床不仅配置繁琐，而且极其容易因图床欠费、服务下线、防盗链拦截或 SSL 证书过期导致全站图标破损与客服二维码失效；同时外链存在劫持、泄露运营隐私或被溯源的风险。
- **技术架构**（整合系统 Logo 与客服二维码免图床底层能力）：
  - **三维一体化直传交互（3-Way Zero-Friction Input）**：统一为系统 Logo（`SystemInfoSection`）与客服二维码设置打通“本地文件选择 + 虚线区域拖拽直传 + 全局 `Ctrl+V` 剪贴板一键粘贴”三合一极简录入；截图后直接在浏览器中按 `Ctrl+V` 即可完成秒级上传与实时预览；同时完整保留“切换为公网 URL”模式，兼顾传统 CDN 部署；
  - **浏览器原生 Canvas 智能等比自适应压缩（`lib/image-compress.ts`）**：
    - 在前端抽象出共享的通用压缩引擎，通过浏览器原生 HTML5 Canvas 针对不同使用场景执行等比自适应降采样与高质量压缩；
    - 系统 Logo 按原图长宽比等比缩小至最大 256x256 物理像素，优先导出为轻量 WebP 或 PNG，将体积从几 MB 极限自适应压缩至 10KB ~ 30KB；
    - 客服二维码等比缩放至最大 500x500，平衡扫码识别率与数据体积；首屏加载零额外网络请求与延迟，杜绝外链加载白屏；
  - **标准化 RFC 2397 Data URL 与官方纯原版 100% 零故障无缝平替**：
    - 图片转码为标准 Data URL（`data:image/webp;base64,...`）持久化存储于官方原生字段（`options.Logo` 与 `console_setting.customer_service`），无需新建表也不加列；
    - 严格遵循 W3C 与 RFC 2397 规范：无论未来站长切换到官方哪一个全新源码版本或官方 Docker 原版镜像，前台所有的 `<img src="..." />`、`<link rel="icon" />`（网页 Favicon）均能原生秒级解码正常显示，**数据库无需执行任何清洗或处理即可直接平替使用**；
  - **安全注入深度防御与根路径放行**：前后端建立统一安全屏障，严格过滤 SVG 格式中的恶意 `<script>` 脚本注入、`javascript:` 伪协议及 XSS 载荷；限制数据体积不超过 500KB；后端放行 `/logo.png` 等根路径相对地址，并提供一键【恢复默认】能力。
- **存储与选项**：复用官方原生 `options.Logo` 与 `console_setting.customer_service`。

### 9. 业务九：中转报错自定义脱敏与标准化映射系统（Error Sanitization & Custom Rules）
- **痛点背景**：原版中转直接将上游各类真实原始报错原封不动抛给终端用户，泄露了上游渠道供应商（如 Google AI Studio、HuggingFace、Azure 等）、内部组织/账户、私有模型名称、免费层配额详情指标、第三方平台 URL 与敏感网络拓扑；同时各类供应商的报错格式五花八门，用户体验粗糙且易造成穿帮。
- **技术架构**：
  - **0 ALTER TABLE 纯 options 存储**：复用原生 `options` 表（存储 `ErrorSanitizationEnabled` 与 `ErrorMappingRules`），完全不改数据库表结构；
  - **双端闭环脱敏（API 返回 + 用户控制台）**：
    - **API 接口调用端**：在 `controller/relay.go` 和 `relay/channel/gemini/relay-gemini.go` 的出口 `defer func()` 中挂载 `service.SanitizeRelayError(c, newAPIError)`，返回对客户端友好规范的报错原因并覆盖指定状态码；
    - **普通用户控制台**：在 `controller/log.go` 的 `GetUserLogs`（用户自身使用日志接口）与 `GetLogByKey`（令牌日志接口）中调用 `service.SanitizeUserLogs`，普通用户在 Web 控制台查看到的错误日志行与详情弹窗同样转换为友好中文原因，彻底杜绝敏感参数与内部信息暴露；
    - **管理员系统控制台**：系统控制台「所有日志」及底层数据库仍 100% 完整保留真实上游原始报错、渠道名与运维诊断参数，方便管理员精准排错；
  - **高精度规则匹配与动态热生效**：支持状态码匹配（`MatchCode`，0 为任意状态码）、不区分大小写多关键词（逗号或换行分隔）、规范原因替换（`ReplaceMsg`）与状态码覆盖（`OverrideCode`）；内置线程安全内存缓存与快速热更新；
  - **内置 10 大预设模板（精准覆盖 11 类生产高频报错）**：预设涵盖 Embeddings 不支持、敏感内容过滤、上游高负载激增、账户组织不存在、分组无可用渠道、503 服务不可用、404 资源未找到、429 配额耗尽/超频、400 上下文超长、401 凭证失效等；
  - **全字段级深度脱敏（Comprehensive Field Sanitization）**：不仅全面脱敏错误主体信息（`Message`），更统一对返回的 `Code`、`Type`、`Param`（彻底清空）及 `Metadata`（置空 `nil`）进行官方标准化映射（`SanitizeFields`）。无论是 OpenAI 协议还是 Claude 协议，均严格映射为官方合法标准错误类型（如 `invalid_request_error`、`rate_limit_error`、`api_error` 等），从根源杜绝上游供应商私有报错类型（如 `azure_openai_error`、`google_generative_ai_error`）、内部参数名称（`deployment_id`、`project_id`）与集群元数据泄露；
  - **兜底智能脱敏分类器（Smart Fallback Classifier）**：未命中规则的报错自动执行兜底脱敏，杜绝任何未知报错穿帮。针对未命中的 400 Bad Request，基于语义智能识别（长度超限、合规审核、媒体格式、工具参数等）输出友好提示，未知 400 统一兜底为“请求参数无效或不被上游模型支持，请检查请求配置。”，彻底摒弃简单的技术字符串正则替换回传；对 413（请求过大）、422（语义校验失败）、5xx（上游服务异常）及其他未知状态码全面执行标准化友好文案兜底，杜绝上游原始堆栈穿透；
  - **控制台双模式统一管理（请求策略栏）**：在【系统设置】→【请求策略】中提供「报错脱敏与映射」专区，与请求输入审查、重试路由、渠道健康形成完整转发控制闭环；完全对齐官方标准的 `[ ⊞ 可视化 | <> JSON ]` 双模式交互：
    - **可视化模式**：支持全局总开关、规则关键字多维搜索、行内状态实时切换、新增/编辑规则弹窗以及一键【恢复预设模板】；
    - **JSON 模式**：内置官方统一的 `<JsonCodeEditor>`，支持直接批量粘贴、编辑原始 JSON 规则数组或单个规则对象，带有行号、语法高亮与实时校验，并与可视化表格双向无缝转换。
- **存储与选项**：复用 `options` 表（键 `ErrorSanitizationEnabled`、`ErrorMappingRules`）。

### 10. 业务十：新增业务全链路国际化多语言对齐（Comprehensive i18n & Multi-Language Support）
- **痛点背景**：在开源项目二次开发或企业白标交付过程中，二次开发新增的表单、按钮、提示与风控策略极易出现裸中文硬编码（Hardcoded Strings）或多语言词条缺漏。当系统切换至英文、繁体中文或日文时，界面出现语言夹杂与排版折行，严重破坏商业化平台的一致性与专业交付标准。
- **技术架构**：
  - **全链路零硬编码标准（Zero Hardcoded Strings Standard）**：
    - 严格对二次开发新增的全部模块（充值返佣、推广文案、模型隐藏脱敏、主题设置抽屉与标题栏圆角、极简首页 Landing V2、风控防刷拦截、客服预设、免图床图片直传、报错脱敏与 JSON/可视化双模式编辑器）进行逐行排查；
    - 所有的 UI 文本、表单标签（`FormLabel`）、输入占位符（`placeholder`）、表单描述（`FormDescription`）、操作按钮、操作反馈（`toast.success` / `toast.error`）、Zod 表单验证器报错文本（`systemInfoSchemaWithI18n` 等）全部通过 `const { t } = useTranslation()` 统一驱动；
  - **全语种齐平覆盖与语义化 Key**：
    - 全面覆盖简体中文（`zh_CN`）、繁体中文（`zh_TW`）、英文（`en`）、日文（`ja`）等多语言字典包，补齐包括但不限于 `Error Mapping & Sanitization`、`Visual Mode`、`JSON Mode`、`Import Preset Template`、`Click or drag logo image here`、`Local uploaded image` 等全部新增词条；
    - 采用官方推荐的自然语义（Natural English Key）作为国际化标识键，若遇到小众语种未定义词条，系统天然优雅降级回退至英语，杜绝界面出现空串或未解析占位符；
  - **动态传参与富文本插值合规**：
    - 针对包含动态数值与参数的提示文案（如剩余额度、返佣百分比、IP 限制频次），统一采用 i18next 官方标准的插值语法 `{{key}}` 进行传递，杜绝手动拼接字符串引发的语序颠倒与多语言语法错误。
- **效果体验**：用户在任何语言环境下使用系统，所有二次开发新增页面、操作抽屉、弹窗提示与校验报错均能实现丝滑、精准的母语级呈现，真正达到企业级商业软件的交付品质。

---

## 三、代码改动清单（99 个二次开发文件全览）

### 1. 变更宏观统计与架构分层

整个二次开发工程由 **99 个** 代码与配置文件构成（不含本文档自身），分层结构清晰，严格遵循正交解耦与官方原版零污染原则：

```
new-api/ (99 files)
├── 后端配置、常量与系统验证层 (5 files)    ──> common/constants.go, common/error_rule.go, setting/
├── 核心业务控制器与接口路由层 (9 files)    ──> controller/checkin.go, log.go, misc.go, relay.go, relay-gemini.go...
├── 数据模型、返利流水与脱敏层 (16 files)   ──> model/affiliate_reward*, option.go, service/, relaykit/types/
├── 前端全局基础设施与主题层 (13 files)     ──> web/lib/image-compress.ts, public-header.tsx, index.html...
├── 公共外壳、白标与极简路由 (4 files)      ──> footer.tsx, routes/index.tsx, system-brand.tsx, public-header.tsx
├── OpenRouter 极简首页与客服 (12 files)   ──> features/landing-v2/ (11 组件) + routes/landing-v2.tsx
├── 控制台各业务功能与后台设置 (30 files)   ──> system-settings/, usage-logs/, dashboard/, profile/, wallet/...
└── 国际化语言包与自动化构建 (10 files)    ──> i18n/ 7 语种包, static-keys.ts, VERSION, docker-image.yml
```

### 2. 分层详细改动清单（8 大模块详表）

#### (1) 系统配置、常量与安全校验层 (5 个文件)

| 文件绝对路径 | 变更类型 | 核心职责说明 |
|---|---|---|
| [`common/constants.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/common/constants.go) | `MODIFY` | 定义全局配置变量 `AffiliateCommissionRate`、`DefaultThemeSettings`、`ErrorSanitizationEnabled` 与 `ErrorMappingRules`。 |
| [`common/error_rule.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/common/error_rule.go) | `NEW` | 定义 `ErrorMappingRule` 实体结构（状态码匹配、多关键词、规范返回原因、返回码覆盖与启用状态）。 |
| [`setting/console_setting/config.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/setting/console_setting/config.go) | `MODIFY` | `ConsoleSetting` 结构体扩展 `CustomerService` (JSON 字符串) 与 `CustomerServiceEnabled` 开关。 |
| [`setting/console_setting/validation.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/setting/console_setting/validation.go) | `MODIFY` | 实现 `validateCustomerService` 验证器：校验客服字段、支持 Data URL（<500KB）与网络 URL、过滤 XSS 脚本字符。 |
| [`setting/operation_setting/checkin_setting.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/setting/operation_setting/checkin_setting.go) | `MODIFY` | 签到配置扩展 `RequireTopUp`、`BlockAutomatedUA`、`MaxCheckinPerIP` 三大防刷参数。 |

#### (2) 核心业务控制器、接口路由与频控 (9 个文件)

| 文件绝对路径 | 变更类型 | 核心职责说明 |
|---|---|---|
| [`controller/checkin.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/controller/checkin.go) | `MODIFY` | 签到接口植入防刷校验：充值门槛拦截、自动化 UA 阻断、单 IP 每日签到原子计数与回滚。 |
| [`controller/checkin_antiabuse_test.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/controller/checkin_antiabuse_test.go) | `NEW` | 签到防黑产全套单元测试：UA 拦截、充值门槛、单 IP 计数限制与并发幂等校验。 |
| [`controller/customer_service_test.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/controller/customer_service_test.go) | `NEW` | 在线客服预设单元测试：CRUD 保存、Data URL 二维码校验、XSS 注入攻击拦截测试。 |
| [`controller/log.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/controller/log.go) | `MODIFY` | 普通用户使用日志与令牌日志脱敏：在 `GetUserLogs` 与 `GetLogByKey` 中调用 `service.SanitizeUserLogs`，普通用户在控制台查看到的错误日志与详情弹窗同样转换为友好中文原因，彻底杜绝敏感参数与内部信息暴露；管理员「所有日志」及底层存储 100% 保留原始技术报错排查。 |
| [`controller/misc.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/controller/misc.go) | `MODIFY` | 在 `/api/status` 响应中输出 `"affiliate_description"`、`"default_theme_settings"`、`"customer_service_enabled"` 及客服预设列表。 |
| [`controller/relay.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/controller/relay.go) | `MODIFY` | 中转出口唯一切点 `defer func()` 挂载 `service.SanitizeRelayError`，仅脱敏返回给客户端的错误，控制台数据库日志保留 100% 原始报错。 |
| [`controller/user.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/controller/user.go) | `MODIFY` | 注册接口引入 `MaxRegisterNumPerIP` 单 IP 滚动 24 小时注册频控上限检测，支持 Redis Sorted Set 滑动窗口及内存滑动时间戳队列，原子预留与回滚。 |
| [`relay/channel/gemini/relay-gemini.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/relay/channel/gemini/relay-gemini.go) | `MODIFY` | Gemini 渠道中转处理器：在错误响应出口处同步挂载 `service.SanitizeRelayError`，确保 Gemini 原生与 Claude 格式错误同样经过统一报错脱敏与自定义映射规则。 |
| [`router/api-router.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/router/api-router.go) | `MODIFY` | 为 `POST /api/user/checkin` 挂载 `middleware.CriticalRateLimit()` 接口高危频控。 |

#### (3) 数据模型、返利流水与脱敏服务层 (16 个文件)

| 文件绝对路径 | 变更类型 | 核心职责说明 |
|---|---|---|
| [`model/affiliate_reward.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/model/affiliate_reward.go) | `NEW` | 定义 `AffiliateReward` 实体，实现 `CreateAffiliateReward` 幂等入账事务（唯一索引拦截并发重复）。 |
| [`model/affiliate_reward_test.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/model/affiliate_reward_test.go) | `NEW` | 增加返佣幂等防并发测试、非法入参拦截测试、额度累加正确性测试。 |
| [`model/main.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/model/main.go) | `MODIFY` | 在 `DB.AutoMigrate(...)` 列表中注册 `&AffiliateReward{}` 独立流水表。 |
| [`model/option.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/model/option.go) | `MODIFY` | 注册 `AffiliateCommissionRate`、`AffiliateDescription`、`DefaultThemeSettings`、`ErrorSanitizationEnabled`、`ErrorMappingRules`、`MaxRegisterNumPerIP`；增加返佣比例 0–100% 严格边界校验与非数值防护、规则 JSON 校验与 Logo 校验。 |
| [`model/topup.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/model/topup.go) | `MODIFY` | 实现 `processTopUpAffiliateReward` 结算函数，增加返佣比例边界安全校验、四舍五入安全转换与充值上限封顶保护；在 6 种充值到账链路挂载调用；新增 `HasUserEverToppedUp(userId)` 历史充值查询。 |
| [`model/user.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/model/user.go) | `MODIFY` | 新增 `GetUserInviterId(userId int) int` 辅助查询函数。 |
| [`model/log_other.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/model/log_other.go) | `MODIFY` | 将 `"response_model"`, `"upstream_model_name"`, `"is_model_mapped"` 纳为 `legacySensitiveLogOtherKeys` 敏感脱敏字段。 |
| [`model/task_cas_test.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/model/task_cas_test.go) | `MODIFY` | 测试清理逻辑中注册并清空 `affiliate_rewards` 表，保障单元测试环境数据隔离。 |
| [`service/error_sanitizer.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/service/error_sanitizer.go) | `NEW` | 报错脱敏核心引擎：内置覆盖 11 类生产报错的 10 大预设规则、多关键词匹配、动态覆盖状态码，以及未知 400（语义智能匹配与安全兜底）与全状态码防泄露兜底分类器。 |
| [`service/error_sanitizer_test.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/service/error_sanitizer_test.go) | `NEW` | 报错脱敏全套单元测试：全面验证 11 类典型报错用例、自定义规则拦截、未知 400/429 脏字段与上游部署/集群拓扑深度脱敏校验。 |
| [`service/log_info_generate.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/service/log_info_generate.go) | `MODIFY` | 文本请求链路中的模型映射与响应模型改用 `other.SetAdmin(...)` 写入 `admin_info`。 |
| [`service/task_billing.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/service/task_billing.go) | `MODIFY` | 异步任务计费链路中的模型映射与响应模型改用 `other.SetAdmin(...)` 写入 `admin_info`。 |
| [`relaykit/types/error.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/relaykit/types/error.go) | `MODIFY` | 扩展 `SetMessage` 同步更新底层 `OpenAIError` / `ClaudeError`，新增 `StandardOpenAIFields`、`StandardClaudeType` 与 `SanitizeFields`，统一字段级（Type/Code/Param/Metadata）官方标准脱敏。 |
| [`relaykit/types/error_test.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/relaykit/types/error_test.go) | `NEW` | 标准错误码映射与全字段清洗单测：验证各 HTTP 状态码映射到 OpenAI 与 Claude 标准类型、清理供应商脏字段与元数据置空。 |
| [`controller/access_token_audit_test.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/controller/access_token_audit_test.go) | `MODIFY` | 适配 Windows SQLite 测试隔离环境，配置 `_pragma=busy_timeout(30000)&_pragma=journal_mode(WAL)&_txlock=immediate`。 |
| [`service/channel_affinity_usage_cache_test.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/service/channel_affinity_usage_cache_test.go) | `MODIFY` | 适配官方 rc.40 测试隔离环境，优化纳秒级时钟防止测试时间戳碰撞。 |

#### (4) 前端全局基础设施与主题外观层 (13 个文件)

| 文件绝对路径 | 变更类型 | 核心职责说明 |
|---|---|---|
| [`web/src/lib/image-compress.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/lib/image-compress.ts) | `NEW` | 统一轻量化 HTML5 Canvas 图片高清压缩引擎与 SVG XSS 深度防御（业务八全站免图床直传引擎底层，支持 PNG/JPG/WebP/SVG/ICO，供客服二维码与系统 Logo 共享复用）。 |
| [`web/index.html`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/index.html) | `MODIFY` | **Early Sync Hydration**：在 `<head>` 注入早期同步持久化注水脚本，首字节渲染前从本地缓存恢复站点标题，彻底消除标签页偶发闪烁 "New API"。 |
| [`web/src/main.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/main.tsx) | `MODIFY` | 过滤根应用初始挂载时的默认标题设置，避免在服务端异步配置返回前将 `document.title` 误设为 "New API"。 |
| [`web/src/lib/constants.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/lib/constants.ts) | `MODIFY` | 将 `DEFAULT_SYSTEM_NAME` 回退常量设为空字符串，消除白标穿帮隐患。 |
| [`web/src/lib/status-query.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/lib/status-query.ts) | `MODIFY` | `mapStatusDataToConfig` 映射服务端的 `default_theme_settings` 与 `customer_service` 预设数据。 |
| [`web/src/lib/theme-customization.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/lib/theme-customization.ts) | `MODIFY` | 定义 `DefaultThemeSettings` 类型、JSON 序列化解析工具与个性化锁定工具函数。 |
| [`web/src/lib/theme-storage.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/lib/theme-storage.ts) | `MODIFY` | 对接官方 rc.40 `localStorage` 持久化架构；引入 `isUserThemeModified` / `markUserThemeModified` / `clearUserThemeModified` 实现全站默认与个性化锁定的平滑衔接。 |
| [`web/src/context/theme-provider.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/context/theme-provider.tsx) | `MODIFY` | 采用 React 渲染期状态调节模式消除级联渲染；支持未修改用户跟随全站默认明暗主题；手动变更锁定个性化；重置恢复默认。 |
| [`web/src/context/theme-customization-provider.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/context/theme-customization-provider.tsx) | `MODIFY` | 支持未修改用户跟随全站默认颜色预设、字体、圆角、密度；手动变更锁定个性化；重置恢复全站默认。 |
| [`web/src/features/auth/types.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/auth/types.ts) | `MODIFY` | `SystemStatus` 状态结构体扩展 `affiliate_description?: string` 字段。 |
| [`web/src/stores/system-config-store.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/stores/system-config-store.ts) | `MODIFY` | `SystemConfig` 结构增加 `defaultThemeSettings` 与 `customerService` 字段。 |
| [`web/src/assets/logo.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/assets/logo.tsx) | `MODIFY` | 移除 Logo SVG 内部写死的 `<title>New API</title>` 标签，消除悬停时的品牌文字提示。 |
| [`web/src/components/config-drawer.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/components/config-drawer.tsx) | `MODIFY` | 识别管理员身份，在底部提供【设为全站默认】按钮，一键持久化保存当前外观配置至服务器；新增「首页可动标题栏圆角」独立选择器。 |

#### (5) 公共外壳、白标与极简首页路由层 (4 个文件)

| 文件绝对路径 | 变更类型 | 核心职责说明 |
|---|---|---|
| [`web/src/components/layout/components/footer.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/components/layout/components/footer.tsx) | `MODIFY` | 彻底移除底部写死的 New API 项目归属与外部仓库链接；自定义页脚容器圆角收敛为 `rounded-lg`；重构 map key 为语义化键消除 Oxlint 报错。 |
| [`web/src/components/layout/components/public-header.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/components/layout/components/public-header.tsx) | `MODIFY` | 首页浮动导航条圆角像素级锁定：读取 `themeCustomization.floatingHeaderRadius` 并通过 `navbarRadiusClass` 精准匹配具体 Tailwind 类（`rounded-[16px]`、`rounded-full` 等），规避 Tailwind v4 `--radius: 0` 变量塌陷为直角的 bug。 |
| [`web/src/components/layout/components/system-brand.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/components/layout/components/system-brand.tsx) | `MODIFY` | 侧边栏品牌展示组件过滤写死的 "New API"，优先使用管理员后台配置的品牌名。 |
| [`web/src/routes/index.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/routes/index.tsx) | `MODIFY` | 主路由组件由 `Home` 平滑指向 `LandingV2`（原版 `features/home` 源码 100% 完整保留）。 |

#### (6) OpenRouter 极简首页与客服展示组件 (12 个文件)

| 文件绝对路径 | 变更类型 | 核心职责说明 |
|---|---|---|
| [`web/src/features/landing-v2/index.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/landing-v2/index.tsx) | `NEW` | 首页入口组件：集成 Hero、模型浏览器、快速接入、兼容生态、特性摘要、在线客服卡片与全站右下角客服悬浮窗；页脚透传 `border-t-0` 保持纯黑无缝过渡。 |
| [`web/src/features/landing-v2/components/hero.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/landing-v2/components/hero.tsx) | `NEW` | 首屏 Hero 区域：等宽标题、系统运行状态指示灯、API Base URL 动态绑定与一键复制；移除横向分割线。 |
| [`web/src/features/landing-v2/components/model-browser.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/landing-v2/components/model-browser.tsx) | `NEW` | 核心模型目录表格：展示可用性健康状态灯与真实探测延迟；支持搜索过滤、分类筛选与紧凑分页控制。 |
| [`web/src/features/landing-v2/components/quickstart.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/landing-v2/components/quickstart.tsx) | `NEW` | 开发者极速接入代码沙盒：多语言（cURL/Python/TS）切换展示与一键复制代码；自然留白过渡无分割线。 |
| [`web/src/features/landing-v2/components/compatible-tools.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/landing-v2/components/compatible-tools.tsx) | `NEW` | 兼容生态客户端列表（NextChat、Cherry Studio、Chatbox 等）：动态注入当前 Base URL；无横向分割线。 |
| [`web/src/features/landing-v2/components/features-summary.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/landing-v2/components/features-summary.tsx) | `NEW` | 架构特性卡片矩阵（低延迟、零加价、隐私沙盒、高可用）：等宽标题与极简微边框卡片；无横向分割线。 |
| [`web/src/features/landing-v2/components/customer-service.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/landing-v2/components/customer-service.tsx) | `NEW` | 首页客服展示区块：内置**自适应排版引擎**（单项黄金居中、双项对称并列、三项平铺、四项 2x2 对称矩阵、多项流式居中对齐，告别传统网格左倾留白）；卡片统一自适应等高；支持一键复制联系方式、跳转链接与二维码大图灯箱预览。 |
| [`web/src/features/landing-v2/components/customer-service-floating.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/landing-v2/components/customer-service-floating.tsx) | `NEW` | 全站右下角浮动客服球：点击弹出卡片面板，集成二维码弹窗与多渠道快捷入口。 |
| [`web/src/features/landing-v2/hooks/use-landing-data.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/landing-v2/hooks/use-landing-data.ts) | `NEW` | **全面接入系统统一性能监控**：调用 `/api/perf-metrics/summary` 提取 24 小时采样成功率与真实平均延迟。 |
| [`web/src/features/landing-v2/constants.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/landing-v2/constants.ts) | `NEW` | 定义模型分类常量（All, Flagship, Reasoning, Coding, Vision 等）与代码示例模版。 |
| [`web/src/features/landing-v2/types.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/landing-v2/types.ts) | `NEW` | 定义 `ModelCatalogItem`（含 `availabilityRate`）与首页视图数据模型接口。 |
| [`web/src/routes/landing-v2.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/routes/landing-v2.tsx) | `NEW` | 独立预览路由 `/landing-v2`。 |

#### (7) 控制台业务功能与后台设置层 (30 个文件)

> **极简洁癖设计说明**：报错脱敏与映射功能完全遵循官方规范集成在「请求策略（Request Policies）」中。原 `features/system-settings/operations/` 及路由完全恢复为官方 100% 原版，零侵入、零多余修改、零残留。

| 文件绝对路径 | 变更类型 | 核心职责说明 |
|---|---|---|
| [`web/src/features/dashboard/components/overview/overview-dashboard.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/dashboard/components/overview/overview-dashboard.tsx) | `MODIFY` | 移除非必要炫彩光晕；新增显式 `API Base` 复制栏并等宽微调；多客户端代码预览框舒展高度，舒畅展示完整多行 JSON 请求体。 |
| [`web/src/features/dashboard/components/overview/summary-cards.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/dashboard/components/overview/summary-cards.tsx) | `MODIFY` | 移除刺眼彩色渐变卡片背景，统一为纯粹深色微边框 `bg-card border-border/50`。 |
| [`web/src/features/about/index.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/about/index.tsx) | `MODIFY` | 清除「关于」页面未配置内容时的默认 New API 项目仓库链接与版权漏标，呈现纯净专业的未配置提示状态。 |
| [`web/src/features/pricing/index.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/pricing/index.tsx) | `MODIFY` | 彻底移除页面顶部 600px 刺眼蓝紫极光渐变光斑（`radial-gradient`），使模型广场视觉纯净无缝衔接。 |
| [`web/src/features/rankings/index.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/rankings/index.tsx) | `MODIFY` | 移除顶部蓝紫极光渐变光斑；重构嵌套三元为 clean if-else 消除 Oxlint 报错；骨架屏圆角统一收敛为 `rounded-lg`。 |
| [`web/src/features/wallet/components/affiliate-rewards-card.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/wallet/components/affiliate-rewards-card.tsx) | `MODIFY` | 钱包卡片动态读取并展示后台自定义推荐说明文案，留空时自动回退默认国际化文案。 |
| [`web/src/features/profile/components/checkin-calendar-card.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/profile/components/checkin-calendar-card.tsx) | `MODIFY` | 签到卡片感知充值门槛拦截：未充值用户展示“需先充值”友好按钮与充值引导提示。 |
| [`web/src/features/profile/types.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/profile/types.ts) | `MODIFY` | 签到状态类型补充 `require_topup` 与 `has_topped_up` 字段。 |
| [`web/src/features/usage-logs/types.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/usage-logs/types.ts) | `MODIFY` | `LogOtherData` 类型定义在 `admin_info` 命名空间下拓展 `is_model_mapped`、`upstream_model_name` 与 `response_model`。 |
| [`web/src/features/usage-logs/lib/format.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/usage-logs/lib/format.ts) | `MODIFY` | `formatModelName(log, isAdmin)` 非管理员强制返回 `isMapped: false, responseModel: undefined`。 |
| [`web/src/features/usage-logs/components/columns/common-logs-columns.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/usage-logs/components/columns/common-logs-columns.tsx) | `MODIFY` | 严格基于 `isAdmin` 权限隐藏映射指示与响应模型弹窗区块。 |
| [`web/src/features/usage-logs/components/common-log-mobile-card.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/usage-logs/components/common-log-mobile-card.tsx) | `MODIFY` | 移动端日志卡片根据管理员权限隔离模型映射信息，非管理员仅呈现用户调用模型。 |
| [`web/src/features/usage-logs/components/dialogs/details-dialog.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/usage-logs/components/dialogs/details-dialog.tsx) | `MODIFY` | 详情弹窗非管理员隐藏响应模型与映射诊断信息。 |
| [`web/src/features/usage-logs/components/dialogs/task-details-dialog.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/usage-logs/components/dialogs/task-details-dialog.tsx) | `MODIFY` | 异步任务详情弹窗增加 `props.isAdmin` 鉴权判断，仅管理员展示 `Actual Model` 真实上游模型名。 |
| [`web/src/features/system-settings/types.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/types.ts) | `MODIFY` | `BillingSettings` 增加返佣字段；定义 `ErrorMappingRule` 实体接口；`OperationsSettings` 保持 100% 官方原样无残留。 |
| [`web/src/features/system-settings/billing/index.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/billing/index.tsx) | `MODIFY` | 注册额度与返佣配置项视图组件。 |
| [`web/src/features/system-settings/billing/section-registry.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/billing/section-registry.tsx) | `MODIFY` | 在计费配置表单区块中挂载 `AffiliateCommissionRate` 与 `AffiliateDescription` 的默认值与双向绑定。 |
| [`web/src/features/system-settings/general/quota-settings-section.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/general/quota-settings-section.tsx) | `MODIFY` | 增加「充值返利比例 (%)」与「推荐计划说明文案」两个可编辑配置表单项。 |
| [`web/src/features/system-settings/general/checkin-settings-section.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/general/checkin-settings-section.tsx) | `MODIFY` | 增加防黑产配置区：充值门槛开关、自动化 UA 拦截开关、单 IP 每日签到上限输入框。 |
| [`web/src/features/system-settings/general/system-info-section.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/general/system-info-section.tsx) | `MODIFY` | **系统信息布局和谐化与 Logo 直传升级**：将“文档链接”上移与“服务器地址”合并为规整 2x2 栅格；Logo 上传卡片横向通栏展示并配备 64px 预览窗；支持本地选择、拖拽直传、剪贴板 `Ctrl+V` 一键粘贴、智能 Canvas 自适应压缩（WebP/PNG 最大 256x256）、一键重置默认。 |
| [`web/src/features/system-settings/auth/basic-auth-section.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/auth/basic-auth-section.tsx) | `MODIFY` | 增加「单 IP 注册限制 (24小时)」输入项。 |
| [`web/src/features/system-settings/auth/index.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/auth/index.tsx) | `MODIFY` | 认证设置注册 `MaxRegisterNumPerIP` 表单绑定。 |
| [`web/src/features/system-settings/auth/section-registry.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/auth/section-registry.tsx) | `MODIFY` | 认证设置表单字段映射注册。 |
| [`web/src/features/system-settings/content/customer-service-section.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/content/customer-service-section.tsx) | `NEW` | **客服信息预设后台配置面板**：全面对齐 `<StaticDataTable>` 列规范（直接实体接收防 500 崩溃）；弹窗集成取消/保存 Footer 与即时自动持久化；支持微信/QQ/TG/邮箱等多预设通道、CRUD 增删改查、排序、开关、以及**二维码本地选择/拖拽/Ctrl+V 粘贴直传与 Canvas 智能压缩**。 |
| [`web/src/features/system-settings/content/index.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/content/index.tsx) | `MODIFY` | 内容设置注册客服预设区块组件。 |
| [`web/src/features/system-settings/content/section-registry.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/content/section-registry.tsx) | `MODIFY` | 内容设置表单挂载 `CustomerService` 与 `CustomerServiceEnabled`。 |
| [`web/src/features/system-settings/hooks/use-update-option.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/hooks/use-update-option.ts) | `MODIFY` | 将 `DefaultThemeSettings` 加入 `STATUS_RELATED_KEYS`，配置更新时自动使 status 缓存失效并触发前台更新。 |
| [`web/src/features/system-settings/request-policies/defaults.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/request-policies/defaults.ts) | `MODIFY` | 请求策略默认配置扩展 `ErrorSanitizationEnabled` 与 `ErrorMappingRules` 字段。 |
| [`web/src/features/system-settings/request-policies/error-mapping-section.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/request-policies/error-mapping-section.tsx) | `NEW` | **报错脱敏与自定义映射规则面板**：遵循官方设计规范置于「请求策略」，接入官方统一的 `[ ⊞ 可视化 | <> JSON ]` 双模式交互，支持直观数据表格、全局开关、搜索、行内切换、弹窗编辑，以及 `<JsonCodeEditor>` 批量 JSON 导入与无损双向转换。 |
| [`web/src/features/system-settings/request-policies/section-registry.tsx`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/features/system-settings/request-policies/section-registry.tsx) | `MODIFY` | 请求策略子路由注册 `error-mapping` 页面与导航项。 |

#### (8) 国际化语言包与自动化构建工程 (10 个文件)

| 文件绝对路径 | 变更类型 | 核心职责说明 |
|---|---|---|
| [`web/src/i18n/locales/zh.json`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/i18n/locales/zh.json) | `MODIFY` | 补充充值返利比例、推荐文案、全站默认主题、防黑产签到/注册配置、客服预设、Logo 本地直传、报错脱敏与自定义映射规则的中文字典词条。 |
| [`web/src/i18n/locales/en.json`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/i18n/locales/en.json) | `MODIFY` | 补充充值返利比例、推荐文案、全站默认主题、防黑产签到/注册配置、客服预设、Logo 本地直传、报错脱敏与自定义映射规则的英文字典词条。 |
| [`web/src/i18n/locales/zh-TW.json`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/i18n/locales/zh-TW.json) | `MODIFY` | 补齐二次开发新增业务全部繁体中文本地化词条，实现 100% 词条对齐（0 缺失）。 |
| [`web/src/i18n/locales/ja.json`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/i18n/locales/ja.json) | `MODIFY` | 补齐二次开发新增业务全部日文本地化词条，地道自然译文，实现 100% 词条对齐（0 缺失）。 |
| [`web/src/i18n/locales/fr.json`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/i18n/locales/fr.json) | `MODIFY` | 补齐二次开发新增业务全部法文本地化词条，地道自然译文，实现 100% 词条对齐（0 缺失）。 |
| [`web/src/i18n/locales/ru.json`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/i18n/locales/ru.json) | `MODIFY` | 补齐二次开发新增业务全部俄文本地化词条，地道自然译文，实现 100% 词条对齐（0 缺失）。 |
| [`web/src/i18n/locales/vi.json`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/i18n/locales/vi.json) | `MODIFY` | 补齐二次开发新增业务全部越南文本地化词条，地道自然译文，实现 100% 词条对齐（0 缺失）。 |
| [`web/src/i18n/static-keys.ts`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/web/src/i18n/static-keys.ts) | `MODIFY` | 注册 `'Error Sanitization'` 动态标题静态翻译键。 |
| [`VERSION`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/VERSION) | `MODIFY` | 填入具体版本号 `v1.0.0-rc.40`，杜绝未知版本显示。 |
| [`.github/workflows/docker-image.yml`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/.github/workflows/docker-image.yml) | `NEW` | 配置 GitHub Actions 自动构建 `linux/amd64` 与 `linux/arm64` 双架构 Docker 镜像并推送至 GHCR，包含完整后端源码路径触发。 |

---

## 四、官方版本合并变基标准操作程序（Rebase SOP）

### 1. 标准 5 步合并流程

当官方上游发布了更新（如 `v1.0.0-rc.41` 或更新的主线提交）时，依照标准 SOP 执行：

```bash
# ==========================================================
# 步骤 1：确认远端与本地工作区干净
# ==========================================================
git checkout main
git status

# ==========================================================
# 步骤 2：获取上游最新发布 Tag 或最新 main 分支
# ==========================================================
git fetch upstream

# ==========================================================
# 步骤 3：变基（Rebase）到最新上游提交之上
# ==========================================================
# 推荐基于官方发布的正式 Tag 变基：
git rebase v1.0.0-rc.41
# 或直接变基至官方主分支：
# git rebase upstream/main

# ==========================================================
# 步骤 4：若提示有文件冲突，按照下方第 3 节手册快速解决并继续
# ==========================================================
# 编辑冲突文件保留双方代码后：
# git add <冲突文件路径>
# git rebase --continue

# ==========================================================
# 步骤 5：单元测试验证与强制推送至私有远端
# ==========================================================
go test ./controller/... ./model/... -v
git push origin main --force-with-lease
```

### 2. v1.0.0-rc.40 关键架构演进适配经验

在本次从 `rc.39` 升至官方最新 `rc.40`（Commit `0aec08fee`）的过程中，提炼出以下核心适配规范：

1. **主题存储体系迁移（Cookie 转向 localStorage）**：
   - 官方在 rc.40 中将主题偏好由 Cookie 存储彻底重构为 `theme-storage.ts`（使用 `localStorage` 键 `newapi:theme:v1:*`）；
   - 本项目在 `theme-storage.ts` 中无缝扩展 `isUserThemeModified` / `markUserThemeModified` / `clearUserThemeModified`，使用独立的 `newapi:theme:v1:user-modified` 键；
   - 彻底解决了访客初次进入加载管理员默认主题、用户手动变更后锁定喜好、重置后还原默认主题的优雅共存。
2. **Windows 平台 SQLite 并发锁与测试隔离**：
   - 官方测试在并发运行时，Windows 平台原生 SQLite 极易触发 `SQLITE_BUSY (database is locked)`；
   - 本项目在测试环境统一为 SQLite 添加 DSN 参数：`?_pragma=busy_timeout(30000)&_pragma=journal_mode(WAL)&_txlock=immediate`，让所有并发测试队列化等待，保障 Go 单元测试 100% 稳定通过。
3. **前端代码规范（Oxlint 零警告）**：
   - 新增的客服组件（890 行）、Logo 上传组件均遵守 React Compiler 规范，不滥用 useEffect 触发级联渲染，Oxlint 全量扫描 0 警告 0 报错。

### 3. 核心冲突常客文件快速解决代码对照

若未来官方上游在最邻近的几个文件中新增了字段，只需确认以下核心代码片段保留即可：

#### ① [`model/option.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/model/option.go)

在 `InitOptionMap()` 中保留：
```go
common.OptionMap["MaxRegisterNumPerIP"] = strconv.Itoa(common.MaxRegisterNumPerIP)
common.OptionMap["AffiliateCommissionRate"] = strconv.FormatFloat(common.AffiliateCommissionRate, 'f', -1, 64)
common.OptionMap["AffiliateDescription"] = ""
common.OptionMap["DefaultThemeSettings"] = common.DefaultThemeSettings
```

在 `validateOptionValue(key, value)` 中保留 Logo 校验：
```go
if key == "Logo" {
    if len(value) > 500000 {
        return fmt.Errorf("Logo 数据过大（不能超过 500KB）")
    }
    if value != "" {
        lower := strings.ToLower(value)
        if strings.Contains(lower, "<script") || strings.Contains(lower, "javascript:") {
            return fmt.Errorf("Logo 包含不允许的内容")
        }
    }
}
```

在 `updateOptionMap(key, value)` 中保留：
```go
case "MaxRegisterNumPerIP":
    intValue, _ := strconv.Atoi(value)
    common.MaxRegisterNumPerIP = intValue
case "AffiliateCommissionRate":
    common.AffiliateCommissionRate, _ = strconv.ParseFloat(value, 64)
case "AffiliateDescription":
case "DefaultThemeSettings":
    common.DefaultThemeSettings = value
```

#### ② [`controller/misc.go`](file:///c:/Users/www34/Desktop/Newapi%20%E4%BA%8C%E6%AC%A1%E5%BC%80%E5%8F%91/new-api/controller/misc.go)

在 `GetStatus(c *gin.Context)` 中保留响应字段：
```go
"customer_service_enabled": cs.CustomerServiceEnabled,
"affiliate_description":    common.OptionMap["AffiliateDescription"],
"default_theme_settings":   common.OptionMap["DefaultThemeSettings"],
```
并在条件判断中保留：
```go
if cs.CustomerServiceEnabled {
    data["customer_service"] = console_setting.GetCustomerService()
}
```

### 4. 架构正交性与长期合并兼容性矩阵

| 架构分层 | 官方后续演进可能性 | 本二次开发应对策略与兼容性保证 | 冲突概率 |
| :--- | :--- | :--- | :---: |
| **数据库结构** | 官方增删系统字段、修改索引或新增官方功能表 | 对官方已有表保持 **0 ALTER TABLE、0 加字段**；仅新增 1 张独立流水表 `affiliate_rewards`。官方任何迁移脚本均 100% 独立平滑执行。 | **0%** |
| **充值到账链路** | 官方新增支付渠道或重构支付回调验证 | 采用原子级辅助函数 `processTopUpAffiliateReward(topup)`，仅在订单状态置为充值成功的关键节点触发，不侵入具体支付网关协议解析。 | **极低 (<1%)** |
| **首页模块** | 官方大幅重写或重构 `features/home` | 原版 `features/home` **源码 100% 完整保留，不删不改**；新首页物理隔离在全新目录 `features/landing-v2`。官方无论如何修改老首页，Git 均能静默合入，绝无 `modify/delete` 冲突。 | **0%** |
| **控制台 19 个子页面** | 官方持续优化 API 密钥、渠道管理、使用日志等界面的表单和数据操作 | **0 侵入具体业务页面**；所有黑白灰开发者质感均通过 4 层公共基础设施组件（`theme.css`、`sidebar.tsx`、`section-page-layout.tsx`、`table.tsx`）无感穿透，官方子页面升级 100% 原样吸收。 | **0%** |
| **脱敏与审计** | 官方调整日志持久化结构 | 将内部敏感字段登记在 `legacySensitiveLogOtherKeys`，并统一使用官方原生的 `other.SetAdmin(...)` 写入 `admin_info`，完全复用官方的原生审计沙盒。 | **极低 (<1%)** |
| **在线客服与 Logo** | 官方重构设置页面或更换 Logo 读取方式 | 依赖原生 `options` 表与 `console_setting` 架构，Logo 保存为标准 URL 或轻量 Data URL，100% 兼容原生 `<img src={logo}>` 渲染。 | **0%** |
| **防黑产风控** | 官方优化签到与注册逻辑 | 风控逻辑挂载在 `controller/checkin.go` 与 `controller/user.go` 的前置检查阶段，不影响核心签到发奖与创建用户事务。 | **极低 (<1%)** |
| **多语言词条** | 官方新增多语言 key 或调整排序 | 新增词条均追加在 `zh.json` 与 `en.json` 的独立命名空间中，Git 能自动逐行合并。 | **极低 (<1%)** |
| **自动化容器发布** | 官方更新 Dockerfile 或构建环境 | 我们使用独立的 `.github/workflows/docker-image.yml` 自动化构建多架构镜像并推送到独立私有 GHCR，不篡改官方构建文件。 | **0%** |

---

## 五、生产环境部署配置与运维建议

### 1. 标准单容器 Docker Compose 配置
无需任何外部脚本或常驻辅助容器，开箱即用：

```yaml
services:
  # ==========================================================
  # New API 原生高可用服务（业务全内嵌，数据库零破坏）
  # ==========================================================
  newapi:
    image: ghcr.io/nkbaa/new-api:latest
    container_name: newapi
    network_mode: "host"
    restart: always
    command: --log-dir /app/logs

    volumes:
      - ./data:/data
      - ./logs:/app/logs

    environment:
      TZ: "Asia/Shanghai"
      PORT: "3050"
      
      # 信任所有反向代理（确保能准确获取客户端真实 IP 以精准执行风控）
      TRUSTED_PROXIES: "0.0.0.0/0,::/0"

      # MySQL 主数据库和独立日志数据库（原版完全不动）
      SQL_DSN: "root:NKB20040925@tcp(127.0.0.1:3306)/newapi"
      LOG_SQL_DSN: "root:NKB20040925@tcp(127.0.0.1:3306)/lognewapi"

      # 连接池参数优化
      SQL_MAX_IDLE_CONNS: "30"
      SQL_MAX_OPEN_CONNS: "100"
      SQL_MAX_LIFETIME: "300"

      # Redis 缓存（强烈建议开启，防刷限流与单 IP 计数将在 Redis 执行分布式原子操作）
      REDIS_CONN_STRING: "redis://127.0.0.1:6379/2"
      REDIS_POOL_SIZE: "64"
      MEMORY_CACHE_ENABLED: "true"
      BATCH_UPDATE_INTERVAL: "5"
```

### 2. 服务器拉取与一键启动
```bash
# 强制拉取最新多架构镜像
docker compose pull newapi

# 平滑重建并后台启动
docker compose up -d --force-recreate
```

### 3. 模型重定向与推理后缀注意点（Thinking Model Blacklist）
- **现象**：当渠道配置了模型重定向（例如 `gemini-3.7-flash -> gemini-3.7-flash-high` 或 `*-low`），但实际向后端请求的依然是基础模型（如 `gemini-3.7-flash`）。
- **根因**：官方原生内置了推理强度后缀自动解析机制（Reasoning Effort Suffix），包含 `-max`、`-xhigh`、`-high`、`-medium`、`-low`、`-minimal`、`-none`。当目标模型以 `gemini-` 开头且命中上述后缀时，系统默认将其识别为推理强度参数并把模型名裁切还原为基础模型。
- **配置方案**：在【系统设置】→【模型设置】→【思考模型黑名单 (Thinking Model Blacklist)】中填入目标模型名（如 `gemini-3.7-flash-high`、`gemini-3.8-flash-high`、`gemini-3.5-flash-low`）或正则 `re:^gemini-.*-(high|low|medium|max)$`。系统识别到黑名单后会保留完整真实模型名直通后端，且该配置持久化在数据库中，版本升级 0 冲突。

---

## 六、全业务功能验收测试清单（Checklist）

### 1. 业务一（内嵌充值返利）
- [ ] 管理员进入后台「系统设置」→「计费与展示」→「额度设置」；
- [ ] 在**「充值返利比例 (%)」**中输入 `7`，点击保存；
- [ ] 用户 B 通过用户 A 的邀请链接注册（双方正常收到固定注册奖励）；
- [ ] 用户 B 进行在线充值（例如充值 ＄10 即 5,000,000 额度）；
- [ ] 充值成功瞬间，用户 A 自动收到 7%（即 350,000 额度）返利，可在钱包卡片查看到「待提现余额」与「累计收益」同时增加，且可随时点击划转；
- [ ] 用户 A 的日志中生成一条系统日志：`邀请用户充值奖励，增加邀请额度: ＄0.700000 额度`；
- [ ] 若将比例改为 `0`，后续充值不再发放佣金；改为 `7` 恢复发放，历史不补发。

### 2. 业务二（推荐文案自定义）
- [ ] 在「额度设置」的**「推荐计划说明文案」**中输入自定义文案（如：`用户通过您的推荐链接注册并充值后，您即可获得 7% 充值返利。可随时将累计奖励转入余额。`），点击保存；
- [ ] 普通用户访问钱包页面，推荐计划卡片立即显示该自定义说明；
- [ ] 后台将该输入框清空并保存，前台自动恢复显示官方默认多语言文案。

### 3. 业务三（普通用户隐藏响应模型警告与重定向）
- [ ] 后台配置一个带重定向映射的渠道（例如将 `claude-3-5-sonnet` 重定向到实际渠道的某私有模型名）；
- [ ] 普通用户发起调用，查看「使用日志」：
  - 表格中仅显示标准模型名字，**无橙色警告徽标，无映射详情**；
  - 点击查看详情弹窗，**不显示「响应模型」和「模型映射」区块**；
- [ ] 管理员账号登录后台查看相同日志：
  - 完整显示真实渠道、模型映射信息与排查详情。

### 4. 业务四（全站默认主题外观设定与个性化独立）
- [ ] 管理员登录，打开右侧主题设置抽屉（调出深色模式 + 薰衣草梦颜色预设等），底部看到【设为全站默认】按钮；
- [ ] 点击【设为全站默认】，提示保存成功，配置成功存入 `options` 表；
- [ ] 打开浏览器无痕窗口（新访客模式）访问网站首页，首屏直接呈现深色模式与薰衣草梦预设；
- [ ] 该访客在主题设置中自行修改为“浅色 + 日落霞光”，刷新后保持自己的个性化外观；
- [ ] 管理员再次将全站默认主题改为其他主题，该已自定义用户的界面不会被覆盖（不沿用）；
- [ ] 该用户点击主题抽屉底部的【重置】按钮，界面立即清除个性化记录，瞬间恢复为管理员当前设定的全站默认主题；
- [ ] **首页浮动标题栏圆角独立配置验证**：
  - [ ] 在主题设置抽屉中定位「首页浮动标题栏圆角」选择器，检查 6 档选项：**默认（16px）、大圆角（Full）、中圆角（12px）、小圆角（6px）、直角（0px）、跟随全站**；
  - [ ] 切换各个选项，前往首页向下滚动观察吸顶浮动导航条：切换立即生效，对应形态清晰分明；
  - [ ] 尤其验证“默认（16px）”选项：在 Tailwind v4 下稳固呈现经典优雅微弧（`rounded-[16px]`），绝不塌陷为尖锐直角；
  - [ ] 管理员选择好偏好的全站默认外观后点击【设为全站默认】，新访客首屏即生效对应主题与标题栏圆角策略。

### 5. 业务五（OpenRouter 极简首页与实时可用性监控）
- [ ] **首页开发者体验与实时指标**：
  - [ ] 访客访问网站根路径 `/`，呈现 OpenRouter 极简黑白灰开发者首页，各区块之间无生硬割裂的横向分界线，过渡平滑沉浸；
  - [ ] 检查 Base URL 复制栏与代码沙盒（cURL/Python/TS），域名与后台配置的 `server_address` 实时一致；
  - [ ] 检查首页模型表格：包含 **Model / Context / Availability / Latency / Action**，不再展示歧义的死板价格列；
  - [ ] 验证 **Availability（可用性）** 与系统内部模型监控完全对齐（如 `100.00%`），满分呈现标准祖母绿状态圆点（`bg-emerald-500`）；
  - [ ] 鼠标悬停在可用性列文字上，正确弹出系统统一提示：*“成功率排除业务拒绝并包含当前未完整小时”*；
  - [ ] 验证有流量探测的模型展示毫秒级真实平均延迟（如 `45ms`、`120ms`），并支持分类药丸（Reasoning / Coding 等）筛选与一键复制模型 ID；
  - [ ] 表格支持每页 `10 / 20 / 50 / 全部` 切换与紧凑分页；
- [ ] **全站白标与防闪烁测试**：
  - [ ] 彻底清空浏览器缓存或在弱网模式下强制刷新首页及控制台页面；
  - [ ] 检查浏览器标签页标题与 Logo 提示，首屏渲染前后**绝对不出现任何 "New API" 品牌字样闪烁**（`<head>` 同步早期持久化注水生效）；
  - [ ] 检查全站各级页面底部页脚，确认无硬编码的外部仓库链接与 `New API` 归属链接；
  - [ ] 在未配置自定义关于内容的情况下访问 `/about`，页面优雅显示“未设置关于内容”，绝对不泄漏任何默认项目仓库或底层框架品牌；
- [ ] **全站公开页面与原版药丸形顶栏体验**：
  - [ ] 访问 `/pricing`（模型与定价）页面：顶部刺眼蓝紫极光渐变已彻底移除，背景与首页一致呈现中性纯净质感；
  - [ ] 访问 `/rankings`（模型排行榜）页面：顶部蓝紫光斑已剔除，骨架屏圆角统一收敛为标准 `rounded-lg`（8px）；
  - [ ] 在首页或二级公开页面向下滚动，观察吸顶悬浮导航条：官方原生 `rounded-2xl` 药丸形态平滑吸顶与毛玻璃过渡，0 侵入；
- [ ] **全站控制台风格与原生主题抽屉联动**：
  - [ ] 登录控制台，全站侧边栏、表格与页面外壳完全遵循官方原生 Theme Token 驱动；
  - [ ] 打开右侧「主题设置」抽屉，选择「Dark 模式 + Neutral 预设 + 紧凑密度」并点击【设为全站默认】，整站自然呈现极简黑灰硬核质感，底层公共组件 0 硬编码侵入；
- [ ] **控制台概览与快捷接入面板**：
  - [ ] 顶部显示 `API Base: {server_address} [Copy]`，字距等宽舒适；
  - [ ] 多客户端面板可在 cURL / Python / Cursor / Cherry Studio / Claude Code 之间切换，代码框纵向舒展舒畅，完整清晰展示多行请求体，复制时自动提取当前用户的真实可用 Key；
- [ ] **上游零冲突策略保留**：
  - [ ] 原版 `features/home` 源码依然完整存在，主路由可随时无损切回。

### 6. 业务六（防黑产与防自动化脚本薅羊毛加固）
- [ ] **充值/卡密兑换门槛开关验证**：
  - [ ] 在【系统设置】→【计费与展示】→【签到设置】开启「仅允许充值或兑换过的用户签到」；
  - [ ] 注册新账号（未充值），个人中心签到卡片显示「需先充值」，点击签到提示「仅限充值或兑换过的用户参与每日签到」；
  - [ ] 通过易支付、Stripe 等充值任意金额（或使用卡密兑换），签到卡片恢复为「立即签到」，签到顺利成功；
  - [ ] 后台关闭该开关，未充值用户即可正常参与签到；
- [ ] **自动化脚本 UA 拦截开关验证**：
  - [ ] 开启「拦截自动化脚本 User-Agent」；
  - [ ] 使用 Python requests 或 Curl 发起签到请求，接口返回 `{"success": false, "message": "检测到自动化脚本请求，已拦截"}`，日志记录拦截告警；
  - [ ] 使用真实浏览器访问签到，正常通过；
  - [ ] 后台关闭该开关，脚本即可像以往一样签到；
- [ ] **单 IP 每日签到上限验证**：
  - [ ] 将「单 IP 每日签到上限」设置为 `1`；
  - [ ] 同一 IP 下账号 A 签到成功；账号 B 随后在同一 IP 签到，提示「该 IP 今日签到次数已达上限」；
  - [ ] 后台将其改回 `0`，多账号签到立即不再受限；
- [ ] **单 IP 24小时注册上限验证**：
  - [ ] 在【系统设置】→【认证设置】将「单 IP 注册上限（24小时）」设置为 `2`；
  - [ ] 同一 IP 注册前 2 个账号成功，注册第 3 个账号时提示「该 IP 注册账号数量已达上限，请明天再试」；
  - [ ] 改为 `0` 即解除限制。

### 7. 业务七（在线客服预设体系与多形态自适应展示）
- [ ] **后台客服预设配置**：
  - [ ] 管理员进入【系统设置】→【内容设置】→【客服信息预设】；
  - [ ] 开启「启用客服信息预设」总开关；
  - [ ] 点击「添加客服预设」，选择预设类型（微信、QQ、Telegram、邮箱或自定义）；
  - [ ] 填写客服名称、联系账号、说明文字、跳转链接；
  - [ ] 点击保存，配置成功实时生效；
- [ ] **前台客服卡片与自适应排版/大图灯箱预览**：
  - [ ] 仅配置 1 个客服时，访问首页，客服卡片自动呈现**单卡片黄金居中**排版（`max-w-md`），视觉重心平稳，杜绝左倾死板空白；
  - [ ] 配置 2 个客服时，自动呈现双列居中并列；配置 4 个客服时，自动呈现 2×2 对称矩阵网格；
  - [ ] 无论单项还是多项，同一行卡片自适应严格等高，底部的「立即联系」操作按钮齐平对齐；
  - [ ] 点击「复制」按钮，快速复制客服联系方式到剪贴板，弹出成功提示；
  - [ ] 若配置了跳转链接，点击外部链接图标可在新标签页直接跳转；
  - [ ] 若配置了二维码，卡片内展示清晰的二维码缩略图，点击缩略图或右下角放大镜，弹出高清 Lightbox 大图弹窗，扫码体验极佳；
- [ ] **全站右下角浮动客服**：
  - [ ] 在首页右下角观察到带有在线客服图标的悬浮按钮；
  - [ ] 点击悬浮按钮，弹出浮动面板，完整展示所有已启用的客服渠道与二维码快捷扫码；
  - [ ] 移动端下自适应显示，不会遮挡主要操作按键。

### 8. 业务八（全站免第三方图床本地图片智能压缩直传引擎）
- [ ] **三维本地直传体验（覆盖 Logo 与客服二维码）**：
  - [ ] 在【系统设置】→【通用设置】→【系统信息设置】（Logo）与【内容设置】→【客服信息预设】（二维码）中分别测试上传；
  - [ ] **点击选择文件**：选择本地 PNG/JPG/WebP 图片，图片秒级完成压缩预览；
  - [ ] **区域拖拽上传**：将桌面或文件夹中的图片直接拖拽到虚线上传框，释放后自动压缩并呈现预览；
  - [ ] **剪贴板一键粘贴**：截图软件截屏或网页右键复制图片后，在浏览器中直接按 `Ctrl+V`，图片即刻被捕获并完成压缩；
- [ ] **智能 Canvas 压缩与轻量化验证**：
  - [ ] 上传一张几 MB 大小的超高清原图，检查生成的 Data URL，Logo 压缩至 10~30KB，二维码压缩至合适扫码尺寸，加载毫秒级响应，网络面板无多余外链请求；
- [ ] **一键恢复默认与外部 URL 兼容**：
  - [ ] Logo 预览卡片点击【恢复默认】，自动重置为 `/logo.png`，保存后整站图标恢复官方原生；
  - [ ] 点击【切换为图片URL】，可无缝切换为输入外部 CDN 链接（`https://...`）；
- [ ] **官方纯原版零故障切回兼容性**：
  - [ ] 将数据库接入官方纯原版程序，前台顶栏、侧边栏、移动端及浏览器 Favicon 均能正常秒级渲染本地图片，无需任何 SQL 迁移或数据清洗。

### 9. 业务九（中转报错自定义脱敏与标准化映射系统）
- [ ] **请求策略与全局报错脱敏开关验证**：
  - [ ] 进入【系统设置】→【请求策略】→【报错脱敏与映射】；
  - [ ] 开启「启用中转报错脱敏与标准化映射」开关，点击保存；
  - [ ] 客户端调用触发 404/503/429 或敏感词报错时，返回标准化脱敏信息，杜绝泄露底层供应商、真实上游节点及账号状态；
  - [ ] **未知 400 与全状态码智能兜底脱敏**：未命中自定义规则的 400 Bad Request（含内部私有模型、上游部署名、集群节点等）统一由智能分类器安全兜底，杜绝泄露内部拓扑；
  - [ ] **全协议错误字段深度净化**：报错响应中 `type`、`code` 规范映射为官方标准枚举（如 `invalid_request_error`），`param` 彻底清空，`metadata` 彻底置空，彻底杜绝供应商私有错误类型与参数泄露；
  - [ ] 关闭该开关后，接口恢复官方原始报错；
- [ ] **官方 [ ⊞ 可视化 | <> JSON ] 双模式切换与批量快速添加验证**：
  - [ ] 观察操作栏顶部的「可视化 / JSON」双选项卡，样式与官方规范完全统一；
  - [ ] 在「可视化」模式下可进行搜索、行内状态开关切换、点击「添加脱敏规则」弹窗配置、点击「恢复预设模板」；
  - [ ] 切换至「JSON」模式，展示代码编辑器 `<JsonCodeEditor>`，实时呈现所有规则的格式化 JSON 字符串；
  - [ ] 在 JSON 编辑器中直接粘贴新规则数组（如 `[{"name": "...", "keywords": "...", "replace_msg": "..."}]`）或单个规则对象，切换回「可视化」模式，表格即时解析并呈现新增规则；
  - [ ] 在 JSON 模式中输入错误语法（如缺少引号），切换时弹出友好错误提示并阻止损坏；
  - [ ] 在 JSON 模式下直接点击【保存设置】，刷新页面确认修改成功持久化生效；
- [ ] **双端脱敏闭环与管理后台审计日志完整性验证**：
  - [ ] **API 客户端调用端**：终端应用调用 API 接口触发错误时，接收到统一脱敏后的友好原因与规范状态码，无上游技术细节泄漏；
  - [ ] **普通用户控制台端**：普通用户登录后台，进入【使用日志】（`GetUserLogs`）或通过 Key 查看令牌日志（`GetLogByKey`），表格中的“详情”列以及点击弹出的详情弹窗中的错误信息均已转换为脱敏后的规范友好中文，底层敏感参数与技术栈堆栈彻底被安全阻断；
  - [ ] **管理员系统控制台端**：管理员登录后台，进入【所有日志】或直接查询数据库，依然能查看 100% 原始完整的真实上游报错、渠道名称与技术诊断参数，运维排查不受任何阻碍。

### 10. 业务十（新增业务全链路国际化多语言完备验证）
- [ ] **多语言即时切换生效验证**：
  - [ ] 在控制台顶栏或个人中心将语言在「简体中文」、「English」、「繁體中文」、「日本語」之间随意切换；
  - [ ] 观察【系统设置】→【请求策略】中的「报错脱敏与映射」专区：标题、说明、可视化/JSON 双选项卡、表单项、表格列名、一键【恢复预设模板】弹窗均即时渲染为对应语言；
  - [ ] 观察【系统设置】→【通用设置】→【系统信息设置】中的「系统 Logo」上传区：拖拽提示「Click or drag logo image here」、状态指示「Local uploaded image」、操作按钮「Replace Image / Remove Image」均精准匹配当前语言；
  - [ ] 观察【系统设置】→【内容设置】→【客服信息预设】：新增预设弹窗、字段 Label、表格操作按钮、提示信息均无任何中文裸字符残留；
  - [ ] 观察右侧「主题设置」抽屉：明暗模式、预设颜色名、圆角档位（默认 16px、胶囊 Full 等）及【设为全站默认】按钮均精准多语言展示；
- [ ] **表单校验与操作反馈多语言验证**：
  - [ ] 在系统信息或客服设置中故意输入非法内容触发 Zod 校验，校验报错提示文本精准呈现为当前语言，无硬编码报错；
  - [ ] 保存设置或点击复制，弹出的 Toast 消息（如「规则保存成功」、「已复制到剪贴板」）均为对应语言。

