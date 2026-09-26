package service

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestIsPseudo200ErrorBuiltinRules 逐条覆盖 pseudo200Rules 中的每一条内置指纹
// （含噪声前缀剥离），并给出近似但**不应**命中的对照，锁定「首部锚定 + 特征共现」
// 的判定语义。命中时 reason 必须**恰好**等于该条规则的 prefix，这样渠道把内置表
// 复制出来编辑后，日志仍能精确指向生效的那条特征。新增或修改内置规则时必须同步此表。
func TestIsPseudo200ErrorBuiltinRules(t *testing.T) {
	enabled := dto.ChannelSettings{Pseudo200Enabled: true}

	tests := []struct {
		name       string
		content    string
		wantMatch  bool
		wantReason string // 命中时的准确 prefix
	}{
		// --- 提示词提交失败 ---
		{"could not be submitted", "The prompt could not be submitted.", true, "the prompt could not be submitted"},
		{"cannot be submitted", "The prompt cannot be submitted.", true, "the prompt cannot be submitted"},
		// --- 敏感词拦截（需违规语义共现）---
		{"prompt contains sensitive words + violate", "The prompt contains sensitive words that violate policy.", true, "the prompt contains sensitive words"},
		{"this prompt contains sensitive words + blocked", "This prompt contains sensitive words and was blocked.", true, "this prompt contains sensitive words"},
		// --- Google Prohibited Use Policy（需点名政策）---
		{"this request violates + policy", "This request violates Google's Generative AI Prohibited Use policy.", true, "this request violates"},
		{"the request violates + policy", "The request violates the Prohibited Use Policy.", true, "the request violates"},
		{"the request was blocked + policy", "The request was blocked by the Prohibited Use Policy.", true, "the request was blocked"},
		{"the request has been blocked + policy", "The request has been blocked under the Prohibited Use Policy.", true, "the request has been blocked"},
		{"request was blocked + policy", "Request was blocked: Prohibited Use Policy.", true, "request was blocked"},
		// --- 安全过滤器 ---
		{"blocked by safety filters", "prompt blocked by safety filters", true, "prompt blocked by safety filters"},
		{"safety: prompt was blocked", "safety: the prompt was blocked", true, "safety: the prompt was blocked"},
		{"blocked due to safety", "The prompt was blocked due to safety.", true, "the prompt was blocked due to safety"},
		{"blocked by safety", "The prompt was blocked by safety settings.", true, "the prompt was blocked by safety"},
		// --- 噪声前缀剥离后仍应命中 ---
		{"error: prefix stripped", "Error: The prompt could not be submitted.", true, "the prompt could not be submitted"},
		{"[ERROR] prefix stripped", "[ERROR] the prompt could not be submitted", true, "the prompt could not be submitted"},
		{"google api error prefix stripped", "Google API error: the request was blocked by Prohibited Use Policy", true, "the request was blocked"},
		// --- 不应命中：缺少共现条件 ---
		{"policy named without blocking verb", "This document explains the Prohibited Use Policy.", false, ""},
		{"sensitive words without policy verb", "The prompt contains sensitive words.", false, ""},
		// --- 不应命中：前缀未锚定在开头 ---
		{"refusal phrase not at start", "Note that the prompt could not be submitted yesterday.", false, ""},
		{"quoted refusal phrase", "If the API says 'the prompt could not be submitted', catch it.", false, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			matched, reason := IsPseudo200Error(enabled, tt.content)
			assert.Equal(t, tt.wantMatch, matched, "content: %q", tt.content)
			assert.Equal(t, tt.wantReason, reason)
		})
	}
}

// TestGetChannelDefaultPseudo200RulesRoundTrip 固化「默认规则文本」与内置指纹表
// 的等价性：前端回填的文本必须能被解析回一模一样的规则表，且两者的判定结果对
// 同一批样本完全一致。否则「留空」与「回填后保存」的渠道会出现行为差异。
func TestGetChannelDefaultPseudo200RulesRoundTrip(t *testing.T) {
	rendered := GetChannelDefaultPseudo200Rules()
	require.NotEmpty(t, rendered)
	require.Contains(t, rendered, "\n", "one rule per line")

	parsed := parsePseudo200Rules(rendered)
	require.Len(t, parsed, len(pseudo200Rules), "every built-in rule must round-trip")
	for i, rule := range pseudo200Rules {
		assert.Equal(t, rule.prefix, parsed[i].prefix, "rule %d prefix", i)
		assert.Equal(t, rule.requires, parsed[i].requires, "rule %d requires", i)
	}

	// 同一批样本在「内置表」与「回填的表」下判定必须完全一致。
	samples := []string{
		"The prompt could not be submitted.",
		"The prompt cannot be submitted.",
		"The prompt contains sensitive words that violate policy.",
		"This request violates Google's Generative AI Prohibited Use policy.",
		"Request was blocked: Prohibited Use Policy.",
		"prompt blocked by safety filters",
		"the prompt was blocked by safety settings",
		"Google's Prohibited Use Policy forbids weapons assistance.",
		"The prompt contains sensitive words.",
		"If the API says 'the prompt could not be submitted', catch it.",
	}
	withBuiltin := dto.ChannelSettings{Pseudo200Enabled: true}
	withExplicit := dto.ChannelSettings{Pseudo200Enabled: true, Pseudo200Rules: rendered}
	for _, sample := range samples {
		builtinMatched, builtinReason := IsPseudo200Error(withBuiltin, sample)
		explicitMatched, explicitReason := IsPseudo200Error(withExplicit, sample)
		assert.Equal(t, builtinMatched, explicitMatched, "sample: %q", sample)
		assert.Equal(t, builtinReason, explicitReason, "sample: %q", sample)
	}
}

// TestIsPseudo200ErrorChannelRulesEditable 验证渠道规则表可被真正改写：既能新增
// 自定义特征，也能**删除**内置特征（这是与「只能追加」的 Pseudo200CustomKeywords
// 的关键区别），且原文为空时保持内置行为不变。
func TestIsPseudo200ErrorChannelRulesEditable(t *testing.T) {
	builtinBlocked := "The prompt could not be submitted."

	// 空规则：沿用内置表（老渠道兼容）
	matched, reason := IsPseudo200Error(
		dto.ChannelSettings{Pseudo200Enabled: true},
		builtinBlocked,
	)
	assert.True(t, matched, "blank rules must fall back to the built-in table")
	assert.Equal(t, "the prompt could not be submitted", reason)

	// 改写规则：删掉内置特征，换成运营商自己的特征
	custom := dto.ChannelSettings{
		Pseudo200Enabled: true,
		Pseudo200Rules:   "upstream refused our request\n# this is a comment\naccount flagged | over_quota, frozen",
	}
	matched, _ = IsPseudo200Error(custom, builtinBlocked)
	assert.False(t, matched, "a removed built-in signature must stop matching")

	matched, reason = IsPseudo200Error(custom, "Upstream refused our request.")
	assert.True(t, matched, "an operator-defined prefix must match")
	assert.Equal(t, "upstream refused our request", reason)

	// 带共现条件的自定义规则：任一 requires 命中即判定
	matched, _ = IsPseudo200Error(custom, "account flagged because it is frozen")
	assert.True(t, matched, "requires is satisfied by one of the listed values")

	// requires 全部未出现时不命中
	matched, _ = IsPseudo200Error(custom, "account flagged but nothing else applies")
	assert.False(t, matched, "requires must be present when configured")

	// 注释行与空行不产生规则
	commentOnly := dto.ChannelSettings{
		Pseudo200Enabled: true,
		Pseudo200Rules:   "# only a comment\n\n",
	}
	matched, _ = IsPseudo200Error(commentOnly, builtinBlocked)
	assert.False(t, matched, "comment-only rules resolve to an empty table, not the built-ins")
}

// TestIsPseudo200ErrorChannelRulesStillChannelScoped 规则表同样只作用于本渠道，
// 且仍受总开关与 400 字符上限约束。
func TestIsPseudo200ErrorChannelRulesStillChannelScoped(t *testing.T) {
	rules := "upstream refused our request"

	// 总开关关闭：规则表不生效
	matched, _ := IsPseudo200Error(dto.ChannelSettings{Pseudo200Rules: rules}, "upstream refused our request")
	assert.False(t, matched, "channel rules require the channel switch")

	// 渠道之间独立
	other := dto.ChannelSettings{Pseudo200Enabled: true}
	matched, _ = IsPseudo200Error(other, "upstream refused our request")
	assert.False(t, matched, "another channel must not inherit the rules")

	// 超长正文放行
	long := "upstream refused our request " + string(make([]byte, 600))
	matched, _ = IsPseudo200Error(dto.ChannelSettings{Pseudo200Enabled: true, Pseudo200Rules: rules}, long)
	assert.False(t, matched, "rules must not match oversized content")
}

// TestIsPseudo200ErrorBuiltinRulesUnchanged 证明内置指纹表的行为未被规则表改动破坏：
// 删除 reason 字段、改用 prefix 作为日志标识后，判定结果必须与改造前一致。
func TestIsPseudo200ErrorBuiltinRulesUnchanged(t *testing.T) {
	require.Len(t, pseudo200Rules, 13, "the built-in table keeps all 13 signatures")

	// 曾经误判的样本必须仍然放行（这是首部锚定 + 共现判据的核心价值）
	notBlocked := []string{
		"If the API says 'the prompt could not be submitted', you should catch that error.",
		"Note that the upstream told us the prompt contains sensitive words that violate the policy.",
		"Google's Generative AI Prohibited Use policy forbids weapons and malware assistance.",
		"This document explains when content that violates Google's Prohibited Use Policy may be removed.",
	}
	for _, sample := range notBlocked {
		matched, _ := IsPseudo200Error(enabledChannel(), sample)
		assert.False(t, matched, "sample: %q", sample)
	}
}

func TestIsPseudo200Error(t *testing.T) {
	tests := []struct {
		name      string
		content   string
		wantMatch bool
	}{
		{
			name: "Google Prohibited Use Policy exact error",
			content: `The prompt could not be submitted.
The prompt contains sensitive words that violate Google’s Generative AI Prohibited Use policy.
Try rephrasing the prompt.
If you think this was an error, [send feedback]`,
			wantMatch: true,
		},
		{
			name:      "Google Prohibited with straight quote",
			content:   "This request violates Google's Generative AI Prohibited Use policy.",
			wantMatch: true,
		},
		{
			name:      "Prompt contains sensitive words violating policy",
			content:   "The prompt contains sensitive words that violate policy.",
			wantMatch: true,
		},
		{
			name:      "Safety filters blocked",
			content:   "safety: the prompt was blocked by safety filters",
			wantMatch: true,
		},
		{
			name:      "Normal AI response discussing policy (no false positive)",
			content:   "According to our corporate privacy policy, we protect user data securely.",
			wantMatch: false,
		},
		{
			name:      "Normal AI response asking to rephrase (no false positive)",
			content:   "Could you try rephrasing the question so I can understand better?",
			wantMatch: false,
		},
		{
			name:      "Oversized text guard (> 400 chars)",
			content:   "violate Google's Generative AI Prohibited Use policy " + string(make([]byte, 600)),
			wantMatch: false,
		},
		{
			name:      "Empty content",
			content:   "",
			wantMatch: false,
		},
		// ---- 以下为实测误判场景固化：正常的模型产出/讨论/引用/翻译一律不得命中 ----
		{
			name:      "Answering a question about Google policy",
			content:   "Google's Generative AI Prohibited Use policy forbids weapons and malware assistance.",
			wantMatch: false,
		},
		{
			name:      "Reassuring that the request does not violate policy",
			content:   "Your request does not violate Google's Generative AI Prohibited Use policy.",
			wantMatch: false,
		},
		{
			name:      "Summarizing a policy document",
			content:   "This document explains when content that violates Google's Prohibited Use Policy may be removed.",
			wantMatch: false,
		},
		{
			name:      "Quoting an upstream error while debugging",
			content:   "If the API says 'the prompt contains sensitive words that violate policy', you should catch that error.",
			wantMatch: false,
		},
		{
			name:      "Translating a safety notice",
			content:   "Translation: 'The prompt could not be submitted because it contains sensitive words.'",
			wantMatch: false,
		},
		{
			name:      "Explaining how safety filters behave",
			content:   "When you see safety: the prompt was blocked, the model refused the request.",
			wantMatch: false,
		},
		{
			name:      "Code snippet containing the refusal string",
			content:   `const msg = "prompt blocked by safety filters" // error string to match`,
			wantMatch: false,
		},
		{
			name:      "Discussing prompt injection and jailbreaks",
			content:   "A prompt injection can make a model believe it violates Google's Prohibited Use Policy.",
			wantMatch: false,
		},
		{
			name:      "Paraphrasing the block message while explaining",
			content:   "Note that the upstream told us the prompt contains sensitive words that violate the policy.",
			wantMatch: false,
		},
		{
			name:      "Long legitimate answer that mentions the policy",
			content:   "Google's Generative AI Prohibited Use policy is a document. " + string(make([]byte, 600)),
			wantMatch: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			matched, reason := IsPseudo200Error(enabledChannel(), tt.content)
			assert.Equal(t, tt.wantMatch, matched, "content: %q", tt.content)
			if tt.wantMatch {
				assert.NotEmpty(t, reason)
			}
		})
	}
}

// enabledChannel 返回一个已开启伪 200 检测的渠道设置。
func enabledChannel() dto.ChannelSettings {
	return dto.ChannelSettings{Pseudo200Enabled: true}
}

// TestIsPseudo200ErrorDisabledByChannelSwitch 验证检测完全由渠道自身开关决定：
// 渠道关闭时一律不判定，且其它渠道的设置互不影响。
func TestIsPseudo200ErrorDisabledByChannelSwitch(t *testing.T) {
	blocked := `The prompt could not be submitted.
The prompt contains sensitive words that violate Google’s Generative AI Prohibited Use policy.`

	// 渠道未开启（零值即关闭）
	matched, reason := IsPseudo200Error(dto.ChannelSettings{}, blocked)
	assert.False(t, matched, "a channel that never enabled detection must not match")
	assert.Empty(t, reason)

	// 显式关闭
	matched, _ = IsPseudo200Error(dto.ChannelSettings{Pseudo200Enabled: false}, blocked)
	assert.False(t, matched)

	// 该渠道开启后命中；另一个未开启的渠道仍不命中 —— 渠道之间互相独立
	matched, _ = IsPseudo200Error(enabledChannel(), blocked)
	assert.True(t, matched, "detection must work for the channel that enabled it")
	matched, _ = IsPseudo200Error(dto.ChannelSettings{}, blocked)
	assert.False(t, matched, "other channels must stay unaffected")
}

// TestIsPseudo200ErrorChannelCustomKeywords 验证自定义特征随渠道配置生效，
// 且不同渠道之间互相独立，并同样受 400 字符长度上限约束。
func TestIsPseudo200ErrorChannelCustomKeywords(t *testing.T) {
	// 渠道未配置自定义特征：即使内容含该字符串也不命中
	channelWithout := dto.ChannelSettings{Pseudo200Enabled: true}
	matched, _ := IsPseudo200Error(channelWithout, "upstream says quota_policy_blocked")
	assert.False(t, matched, "no custom keyword configured -> must not match")

	// 该渠道配置后：逗号分隔与换行分隔都应生效
	channelWith := dto.ChannelSettings{
		Pseudo200Enabled:        true,
		Pseudo200CustomKeywords: "quota_policy_blocked, another_signature\nthird_signature",
	}

	matched, reason := IsPseudo200Error(channelWith, "upstream says quota_policy_blocked")
	assert.True(t, matched, "custom keyword (comma separated) must match")
	assert.Contains(t, reason, "custom keyword matched")

	matched, _ = IsPseudo200Error(channelWith, "upstream says third_signature happened")
	assert.True(t, matched, "custom keyword (newline separated) must match")

	matched, _ = IsPseudo200Error(channelWith, "unrelated normal response")
	assert.False(t, matched)

	// 渠道之间独立：未配置的渠道不受影响
	matched, _ = IsPseudo200Error(channelWithout, "upstream says third_signature happened")
	assert.False(t, matched, "another channel must not inherit custom keywords")

	// 自定义特征同样受 400 字符长度上限约束，避免长正文误杀。
	long := "quota_policy_blocked " + string(make([]byte, 600))
	matched, _ = IsPseudo200Error(channelWith, long)
	assert.False(t, matched, "custom keyword must not match oversized content")

	// 渠道关闭时，自定义特征也不生效
	matched, _ = IsPseudo200Error(
		dto.ChannelSettings{Pseudo200CustomKeywords: "quota_policy_blocked"},
		"upstream says quota_policy_blocked",
	)
	assert.False(t, matched, "custom keywords require the channel switch")
}

// TestIsPseudo200ErrorCustomKeywordsAreAdditive 固化「叠加」语义：自定义特征是在
// 内置指纹**之外追加**，而不是替换。配置了自定义特征后，内置指纹必须依然命中。
func TestIsPseudo200ErrorCustomKeywordsAreAdditive(t *testing.T) {
	// 一段命中的是内置指纹（首部锚定）而非自定义特征的正文
	builtinBlocked := "The prompt could not be submitted. The prompt contains sensitive words that violate Google's Generative AI Prohibited Use policy."

	// 基线：无自定义特征时，内置指纹命中
	matched, builtinReason := IsPseudo200Error(
		dto.ChannelSettings{Pseudo200Enabled: true},
		builtinBlocked,
	)
	assert.True(t, matched, "built-in signature matches on its own")
	assert.NotContains(t, builtinReason, "custom keyword")

	// 配置自定义特征后，内置指纹**仍然**命中（未被替换）
	matched, reason := IsPseudo200Error(
		dto.ChannelSettings{
			Pseudo200Enabled:        true,
			Pseudo200CustomKeywords: "totally_unrelated_signature",
		},
		builtinBlocked,
	)
	assert.True(t, matched, "adding custom keywords must not disable the built-in signatures")
	assert.Equal(t, builtinReason, reason, "the built-in signature must still take precedence")

	// 同一渠道上，自定义特征独立生效（两者共存）
	matched, reason = IsPseudo200Error(
		dto.ChannelSettings{
			Pseudo200Enabled:        true,
			Pseudo200CustomKeywords: "totally_unrelated_signature",
		},
		"upstream replied totally_unrelated_signature",
	)
	assert.True(t, matched, "custom keyword still works alongside built-ins")
	assert.Contains(t, reason, "custom keyword matched")
}

// TestShouldDisableChannelNeverBansPromptBlocked 验证提示词级拦截永远不封渠道，
// 即使站长把该文案加入 AutomaticDisableKeywords、或开启自动禁用。
func TestShouldDisableChannelNeverBansPromptBlocked(t *testing.T) {
	prevEnabled := common.AutomaticDisableChannelEnabled
	prevKeywords := operation_setting.AutomaticDisableKeywordsToString()
	t.Cleanup(func() {
		common.AutomaticDisableChannelEnabled = prevEnabled
		operation_setting.AutomaticDisableKeywordsFromString(prevKeywords)
	})

	common.AutomaticDisableChannelEnabled = true
	// 恶意构造：让错误文案命中自动禁用关键词，短路必须仍然生效。
	operation_setting.AutomaticDisableKeywordsFromString("upstream blocked")

	err := NewPseudo200Error("prompt blocked by safety filters")
	assert.Equal(t, types.ErrorCodePromptBlocked, err.GetErrorCode())
	assert.False(t, ShouldDisableChannel(err),
		"a prompt-level block must never disable the channel")
}

func TestNewPseudo200ErrorBehavior(t *testing.T) {
	err := NewPseudo200Error("violate Google’s Generative AI Prohibited Use policy")

	// 1. Should be 502 Bad Gateway
	assert.Equal(t, http.StatusBadGateway, err.StatusCode)
	assert.Equal(t, types.ErrorCodePromptBlocked, err.GetErrorCode())

	// 2. DecideRelayRetry should decide retry when retry budget is available
	c, _ := gin.CreateTestContext(nil)
	decision := DecideRelayRetry(c, err, 1)
	assert.Equal(t, "retry", decision.Action)
	assert.Equal(t, "retry_status_matched", decision.Reason)

	// 3. ShouldDisableChannel should return false (channel must NOT be banned for a prompt-level safety block)
	assert.False(t, ShouldDisableChannel(err))
}
