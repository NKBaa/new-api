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
)

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
