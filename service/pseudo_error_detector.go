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

// pseudo200Rule 描述一条内置指纹。
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
type pseudo200Rule struct {
	prefix   string
	requires []string
	reason   string
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

// pseudo200Rules 内置指纹表（顺序匹配，命中即返回）。
var pseudo200Rules = []pseudo200Rule{
	// 提示词提交失败（首部锚定）
	{prefix: "the prompt could not be submitted", reason: "prompt submission rejected"},
	{prefix: "the prompt cannot be submitted", reason: "prompt submission rejected"},

	// 敏感词拦截（首部锚定 + 必须体现违规/拦截语义）
	{
		prefix:   "the prompt contains sensitive words",
		requires: []string{"violat", "blocked", "prohibited"},
		reason:   "prompt contains sensitive words violating policy",
	},
	{
		prefix:   "this prompt contains sensitive words",
		requires: []string{"violat", "blocked", "prohibited"},
		reason:   "prompt contains sensitive words violating policy",
	},

	// Google Prohibited Use Policy 违规（首部锚定 + 必须点名该政策）
	{
		prefix:   "this request violates",
		requires: []string{"prohibited use policy"},
		reason:   "Google Generative AI Prohibited Use policy violation",
	},
	{
		prefix:   "the request violates",
		requires: []string{"prohibited use policy"},
		reason:   "Google Generative AI Prohibited Use policy violation",
	},
	{
		prefix:   "the request was blocked",
		requires: []string{"prohibited use policy"},
		reason:   "Google Generative AI Prohibited Use policy violation",
	},
	{
		prefix:   "the request has been blocked",
		requires: []string{"prohibited use policy"},
		reason:   "Google Generative AI Prohibited Use policy violation",
	},
	{
		prefix:   "request was blocked",
		requires: []string{"prohibited use policy"},
		reason:   "Google Generative AI Prohibited Use policy violation",
	},

	// 安全过滤器拦截（完整报错句式 + 首部锚定）
	{prefix: "prompt blocked by safety filters", reason: "prompt blocked by safety filters"},
	{prefix: "safety: the prompt was blocked", reason: "prompt blocked by safety filters"},
	{prefix: "the prompt was blocked due to safety", reason: "prompt blocked due to safety"},
	{prefix: "the prompt was blocked by safety", reason: "prompt blocked by safety filters"},
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
//  4. 渠道可通过 Pseudo200CustomKeywords 追加自定义特征（简单包含匹配）。
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

	if matched, reason := matchBuiltinPseudo200(contentLower); matched {
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

// matchBuiltinPseudo200 内置指纹匹配：先剥离噪声前缀，再要求首部锚定命中。
func matchBuiltinPseudo200(contentLower string) (bool, string) {
	anchored := stripLeadingNoise(contentLower)
	for _, rule := range pseudo200Rules {
		if !strings.HasPrefix(anchored, rule.prefix) {
			continue
		}
		anyPresent := len(rule.requires) == 0
		for _, req := range rule.requires {
			if strings.Contains(contentLower, req) {
				anyPresent = true
				break
			}
		}
		if anyPresent {
			return true, rule.reason
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
