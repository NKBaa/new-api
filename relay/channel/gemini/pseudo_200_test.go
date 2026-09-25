package gemini

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGeminiChatHandler_BlockedCandidatesReturnsRetryableError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)

	info := &relaycommon.RelayInfo{
		OriginModelName: "gemini-1.5-pro",
		ChannelMeta: &relaycommon.ChannelMeta{
			UpstreamModelName: "gemini-1.5-pro",
		},
		RelayFormat: types.RelayFormatOpenAI,
	}

	geminiJSON := `{
		"promptFeedback": {
			"blockReason": "SAFETY",
			"safetyRatings": [
				{
					"category": "HARM_CATEGORY_DANGEROUS_CONTENT",
					"probability": "HIGH"
				}
			]
		}
	}`

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewBufferString(geminiJSON)),
	}

	usage, apiErr := GeminiChatHandler(c, info, resp)
	assert.Nil(t, usage)
	require.NotNil(t, apiErr)
	assert.Equal(t, http.StatusBadGateway, apiErr.StatusCode)
	assert.Equal(t, types.ErrorCodePromptBlocked, apiErr.GetErrorCode())
	assert.Contains(t, apiErr.Error(), "SAFETY")
}

func TestGeminiChatHandler_DetectsPseudo200InContent(t *testing.T) {
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

	geminiJSON := `{
		"candidates": [
			{
				"content": {
					"parts": [
						{
							"text": "The prompt could not be submitted. The prompt contains sensitive words that violate Google’s Generative AI Prohibited Use policy."
						}
					],
					"role": "model"
				},
				"finishReason": "STOP",
				"index": 0
			}
		]
	}`

	resp := &http.Response{
		StatusCode: http.StatusOK,
		Header:     make(http.Header),
		Body:       io.NopCloser(bytes.NewBufferString(geminiJSON)),
	}

	usage, apiErr := GeminiChatHandler(c, info, resp)
	assert.Nil(t, usage)
	require.NotNil(t, apiErr)
	assert.Equal(t, http.StatusBadGateway, apiErr.StatusCode)
	assert.Equal(t, types.ErrorCodePromptBlocked, apiErr.GetErrorCode())
}
