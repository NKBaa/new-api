package service

import (
	"errors"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
)

// maxPseudo200Length 定义参与伪 200 判定的正文长度上限。
// 上游真实的提示词拦截提示通常是短句（< 150 字符）；一旦是长篇正文，说明模型
// 正常产出了内容（可能只是"在讨论"这些词），一律放行以避免误杀。
const maxPseudo200Length = 400

// MaxPseudo200Length 暴露长度上限，供渠道表单提示操作者。
func MaxPseudo200Length() int {
	return maxPseudo200Length
}

// pseudo200Rule 描述一条指纹。
//
// 结构判据（关键）：真实的上游拦截提示**整段就是那句拒绝语**，因此要求正文
// **以 prefix 开头**（首部锚定）。这样可以区分：
//   - 真报错： "The prompt contains sensitive words that violate ... policy."
//   - 正常产出："Note that the upstream told us the prompt contains sensitive words ..."
//     / "If the API says 'the prompt contains sensitive words ...', you should catch that error."
//     / "const msg = \"prompt blocked by safety filters\""
//
// requires 为附加共现条件：其中**任一**命中即可（OR 语义），用于确认同一句式下
// 确实带有违规/拦截语义。
//
// 命中后写入日志的 reason 即该规则的 prefix，因此不再单独维护描述文案：渠道把
// 内置表复制出来编辑后，日志仍精确指向生效的那一条特征。
type pseudo200Rule struct {
	prefix   string
	requires []string
}

// leadingNoise 是真实上游报错里可能出现在正文最前面的噪声前缀，锚定前先剥离。
var leadingNoise = []string{
	"error:",
	"error -",
	"error ",
	"[error]",
	"failed:",
	"upstream error:",
	"google api error:",
	"api error:",
}

// pseudo200RuleSeparator 分隔一条规则的首部锚定前缀与共现特征。
const pseudo200RuleSeparator = " | "

// pseudo200Rules 内置指纹表（顺序匹配，命中即返回）。
var pseudo200Rules = []pseudo200Rule{
	// 提示词提交失败（首部锚定）
	{prefix: "the prompt could not be submitted"},
	{prefix: "the prompt cannot be submitted"},

	// 敏感词拦截（首部锚定 + 必须体现违规/拦截语义）
	{
		prefix:   "the prompt contains sensitive words",
		requires: []string{"violat", "blocked", "prohibited"},
	},
	{
		prefix:   "this prompt contains sensitive words",
		requires: []string{"violat", "blocked", "prohibited"},
	},

	// Google Prohibited Use Policy 违规（首部锚定 + 必须点名该政策）
	{
		prefix:   "this request violates",
		requires: []string{"prohibited use policy"},
	},
	{
		prefix:   "the request violates",
		requires: []string{"prohibited use policy"},
	},
	{
		prefix:   "the request was blocked",
		requires: []string{"prohibited use policy"},
	},
	{
		prefix:   "the request has been blocked",
		requires: []string{"prohibited use policy"},
	},
	{
		prefix:   "request was blocked",
		requires: []string{"prohibited use policy"},
	},

	// 安全过滤器拦截（完整报错句式 + 首部锚定）
	{prefix: "prompt blocked by safety filters"},
	{prefix: "safety: the prompt was blocked"},
	{prefix: "the prompt was blocked due to safety"},
	{prefix: "the prompt was blocked by safety"},
}

// GetChannelDefaultPseudo200Rules 把内置指纹表渲染成渠道可编辑的文本，供前端在
// 渠道首次开启检测时回填。回填后保存的文本与内置表**完全等价**（同一套解析与匹配
// 逻辑），因此「留空」与「回填后保存」两种渠道的判定行为一致。
func GetChannelDefaultPseudo200Rules() string {
	var builder strings.Builder
	for i, rule := range pseudo200Rules {
		if i > 0 {
			builder.WriteByte('\n')
		}
		builder.WriteString(rule.prefix)
		if len(rule.requires) > 0 {
			builder.WriteString(pseudo200RuleSeparator)
			builder.WriteString(strings.Join(rule.requires, ", "))
		}
	}
	return builder.String()
}

// parsePseudo200Rules 解析渠道可编辑的规则文本：每行一条，写作
// `prefix` 或 `prefix | requires1, requires2`。
//
// 空行与以 '#' 开头的行忽略；缺少 prefix 的行忽略；`|` 只取第一个作为分隔符，
// 因此 prefix 之后的内容一律视为共现特征列表。解析结果为空时**不**回退内置表：
// 调用方已确认原文非空，说明操作者主动清空了规则列表。
func parsePseudo200Rules(raw string) []pseudo200Rule {
	rules := make([]pseudo200Rule, 0, len(pseudo200Rules))
	for line := range strings.SplitSeq(raw, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		prefixPart, requiresPart, hasRequires := strings.Cut(trimmed, "|")
		prefix := strings.ToLower(strings.TrimSpace(prefixPart))
		if prefix == "" {
			continue
		}
		rule := pseudo200Rule{prefix: prefix}
		if hasRequires {
			for req := range strings.SplitSeq(requiresPart, ",") {
				if t := strings.ToLower(strings.TrimSpace(req)); t != "" {
					rule.requires = append(rule.requires, t)
				}
			}
		}
		rules = append(rules, rule)
	}
	return rules
}

// matchPseudo200Rules 在给定指纹表上做匹配：先剥离噪声前缀，再要求首部锚定命中，
// 并在配置了共现特征时要求其中**任一**出现在正文里（OR 语义）。命中返回该规则的
// prefix 作为日志标识。
func matchPseudo200Rules(rules []pseudo200Rule, contentLower string) (bool, string) {
	anchored := stripLeadingNoise(contentLower)
	for _, rule := range rules {
		if !strings.HasPrefix(anchored, rule.prefix) {
			continue
		}
		if len(rule.requires) == 0 {
			return true, rule.prefix
		}
		for _, req := range rule.requires {
			if strings.Contains(contentLower, req) {
				return true, rule.prefix
			}
		}
	}
	return false, ""
}

// IsPseudo200Error checks if the text content matches any known pseudo-200 upstream error signatures.
// Returns (matched, reason).
//
// 开关与规则都是**渠道级**的：每个渠道独立决定是否开启检测、以及追加哪些
// 自定义特征，不存在全局开关。渠道未开启时恒为 false。
//
// 设计要点（最小侵入 + 低误判）：
//  1. 渠道未开启检测时直接放行；
//  2. 超长正文直接放行（结构判据：真拦截是短句，长文是正常产出）；
//  3. 内置指纹采用「首部锚定 + 特征共现」，而非松散两词共现；
//  4. 渠道规则表：Pseudo200Rules 非空时用它替换内置指纹表（前端回填的默认值即
//     内置表的等价文本），为空时使用内置指纹表，保证老渠道行为不变；
//  5. 渠道可通过 Pseudo200CustomKeywords 追加自定义特征（简单包含匹配）。
func IsPseudo200Error(settings dto.ChannelSettings, content string) (bool, string) {
	if !settings.Pseudo200Enabled {
		return false, ""
	}
	if content == "" {
		return false, ""
	}
	trimmed := strings.TrimSpace(content)
	if trimmed == "" || len(trimmed) > maxPseudo200Length {
		return false, ""
	}
	contentLower := strings.ToLower(trimmed)

	// 渠道规则表：原文非空时以解析结果为准（可能是操作者主动删改的规则，也可能是
	// 前端回填的内置默认值）；原文为空则沿用内置指纹表。
	rules := pseudo200Rules
	if strings.TrimSpace(settings.Pseudo200Rules) != "" {
		rules = parsePseudo200Rules(settings.Pseudo200Rules)
	}
	if matched, reason := matchPseudo200Rules(rules, contentLower); matched {
		return true, reason
	}

	// 渠道自定义特征：按换行/逗号拆分，任一命中即判定（同样受长度上限约束）。
	if custom := settings.Pseudo200CustomKeywords; strings.TrimSpace(custom) != "" {
		for _, kw := range splitCustomKeywords(custom) {
			if strings.Contains(contentLower, strings.ToLower(kw)) {
				return true, "custom keyword matched: " + kw
			}
		}
	}

	return false, ""
}

// stripLeadingNoise 剥离正文最前面的常见报错噪声前缀，便于统一做首部锚定。
func stripLeadingNoise(contentLower string) string {
	out := contentLower
	for {
		trimmed := strings.TrimLeft(out, " \t\r\n")
		changed := false
		for _, noise := range leadingNoise {
			if strings.HasPrefix(trimmed, noise) {
				trimmed = trimmed[len(noise):]
				changed = true
				break
			}
		}
		if !changed {
			return trimmed
		}
		out = trimmed
	}
}

// splitCustomKeywords 按换行或逗号拆分自定义特征，忽略空白项。
func splitCustomKeywords(raw string) []string {
	normalized := strings.ReplaceAll(raw, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\n", ",")
	normalized = strings.ReplaceAll(normalized, "，", ",")
	parts := strings.Split(normalized, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// NewPseudo200Error constructs a retryable NewAPIError for pseudo-200 upstream error detections.
// It uses http.StatusBadGateway and ErrorCodePromptBlocked so that:
// 1. service.DecideRelayRetry identifies it as retryable (status 502 is in AutomaticRetryStatusCodeRanges);
// 2. service.ShouldDisableChannel does NOT auto-ban the channel (as it's a prompt-level safety block, not channel failure);
// 3. Billing refunds pre-consumed tokens if all retries are exhausted.
func NewPseudo200Error(matchedReason string) *types.NewAPIError {
	return types.NewOpenAIError(
		errors.New("upstream blocked: "+matchedReason),
		types.ErrorCodePromptBlocked,
		http.StatusBadGateway,
	)
}
