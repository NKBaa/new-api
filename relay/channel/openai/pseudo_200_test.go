package openai

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOpenaiHandler_DetectsPseudo200Error(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)

	info := &relaycommon.RelayInfo{
		OriginModelName: "gemini-1.5-pro",
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "gemini-1.5-pro",
			// 伪 200 检测是渠道级开关，测试渠道显式开启。
			ChannelSetting: dto.ChannelSettings{Pseudo200Enabled: true},
		},
		RelayFormat: types.RelayFormatOpenAI,
	}

	rawBody := `{
		"id": "chatcmpl-test",
		"object": "chat.completion",
		"created": 1700000000,
		"model": "gemini-1.5-pro",
		"choices": [
			{
				"index": 0,
				"message": {
					"role": "assistant",
					"content": "The prompt could not be submitted.\nThe prompt contains sensitive words that violate Google’s Generative AI Prohibited Use policy.\nTry rephrasing the prompt.\nIf you think this was an error, [send feedback]"
				},
				"finish_reason": "stop"
			}
		]
	}`

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewBufferString(rawBody)),
	}

	usage, apiErr := OpenaiHandler(c, info, resp)
	assert.Nil(t, usage)
	require.NotNil(t, apiErr)
	assert.Equal(t, http.StatusBadGateway, apiErr.StatusCode)
	assert.Equal(t, types.ErrorCodePromptBlocked, apiErr.GetErrorCode())
	assert.Contains(t, apiErr.Error(), "upstream blocked")
}

func TestOaiStreamHandler_DetectsPseudo200StreamChunk(t *testing.T) {
	origTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	defer func() { constant.StreamingTimeout = origTimeout }()

	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	info := &relaycommon.RelayInfo{
		OriginModelName: "gemini-1.5-pro",
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "gemini-1.5-pro",
			// 伪 200 检测是渠道级开关，测试渠道显式开启。
			ChannelSetting: dto.ChannelSettings{Pseudo200Enabled: true},
		},
		RelayFormat:  types.RelayFormatOpenAI,
		RelayMode:    relayconstant.RelayModeChatCompletions,
		StreamStatus: relaycommon.NewStreamStatus(),
	}

	ssePayload := "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"The prompt could not be submitted.\\nThe prompt contains sensitive words that violate Google’s Generative AI Prohibited Use policy.\"}}]}\n\ndata: [DONE]\n\n"

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewBufferString(ssePayload)),
	}

	usage, apiErr := OaiStreamHandler(c, info, resp)
	assert.Nil(t, usage)
	require.NotNil(t, apiErr)
	assert.Equal(t, http.StatusBadGateway, apiErr.StatusCode)
	assert.Equal(t, types.ErrorCodePromptBlocked, apiErr.GetErrorCode())
}

// TestOpenaiHandler_Pseudo200DisabledChannelPassesThrough 证明检测完全由渠道自身
// 开关决定：同一段拦截文案，未开启该功能的渠道必须原样放行，不受其它渠道影响。
func TestOpenaiHandler_Pseudo200DisabledChannelPassesThrough(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)

	info := &relaycommon.RelayInfo{
		OriginModelName: "gemini-1.5-pro",
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "gemini-1.5-pro",
			// 默认零值：该渠道未开启伪 200 检测。
			ChannelSetting: dto.ChannelSettings{},
		},
		RelayFormat: types.RelayFormatOpenAI,
	}

	rawBody := `{
		"id": "chatcmpl-test",
		"object": "chat.completion",
		"created": 1700000000,
		"model": "gemini-1.5-pro",
		"choices": [
			{
				"index": 0,
				"message": {
					"role": "assistant",
					"content": "The prompt could not be submitted.\nThe prompt contains sensitive words that violate Google’s Generative AI Prohibited Use policy.\nTry rephrasing the prompt."
				},
				"finish_reason": "stop"
			}
		]
	}`

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewBufferString(rawBody)),
	}

	usage, apiErr := OpenaiHandler(c, info, resp)
	assert.Nil(t, apiErr, "a channel without the sniffer enabled must not raise a pseudo-200 error")
	require.NotNil(t, usage, "the upstream response must be billed normally")
}
