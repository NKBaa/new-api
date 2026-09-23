/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
package service

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/stretchr/testify/assert"
)

func TestSanitizeRelayErrorUserExamples(t *testing.T) {
	// Enable sanitization and use default rules
	common.ErrorSanitizationEnabled = true
	common.ErrorMappingRules = ""

	tests := []struct {
		name                 string
		statusCode           int
		rawError             string
		expectedContains     string
		expectedOverrideCode int
	}{
		{
			name:                 "Example 1: 404 Embeddings API not supported",
			statusCode:           404,
			rawError:             "Embeddings API is not supported for this platform",
			expectedContains:     "当前模型不支持 Embeddings 操作",
			expectedOverrideCode: 400,
		},
		{
			name:                 "Example 2: 400 Sensitive content detected",
			statusCode:           400,
			rawError:             "系统检测到输入或生成内容可能包含不安全或敏感内容，请您避免输入易产生敏感内容的提示语，感谢您的配合。",
			expectedContains:     "输入或生成内容触发安全合规策略",
			expectedOverrideCode: 400,
		},
		{
			name:                 "Example 3: 503 Model experiencing high demand",
			statusCode:           503,
			rawError:             "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
			expectedContains:     "当前模型服务请求量激增或高负载",
			expectedOverrideCode: 503,
		},
		{
			name:                 "Example 4: 404 User does not exist",
			statusCode:           404,
			rawError:             "User does not exist",
			expectedContains:     "上游服务认证异常或账户不可用",
			expectedOverrideCode: 502,
		},
		{
			name:                 "Example 5: 404 Model not supported by configured account in group",
			statusCode:           404,
			rawError:             `Model "gemini-3.5-flash" is not supported by any configured account in this group`,
			expectedContains:     "当前分组暂无支持该模型的可用渠道",
			expectedOverrideCode: 404,
		},
		{
			name:                 "Example 6: 503 Service temporarily unavailable",
			statusCode:           503,
			rawError:             "Service temporarily unavailable",
			expectedContains:     "上游服务暂时不可用",
			expectedOverrideCode: 503,
		},
		{
			name:                 "Example 7: 404 Proxy browser error Google API",
			statusCode:           404,
			rawError:             `Proxy browser error: Google API returned error: 404 NOT_FOUND {"error":{"code":404,"message":"Requested entity was not found.","status":"NOT_FOUND"}}`,
			expectedContains:     "请求的模型或上游资源未找到",
			expectedOverrideCode: 404,
		},
		{
			name:                 "Example 8: 429 Exceeded current quota with external URLs",
			statusCode:           429,
			rawError:             "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://test.dev/billing To monitor your current usage, head to: https://test.dev/usage",
			expectedContains:     "上游渠道配额已耗尽或超出调用频率限制",
			expectedOverrideCode: 429,
		},
		{
			name:                 "Example 9: Quota exceeded for metric free_tier_reque",
			statusCode:           429,
			rawError:             "* Quota exceeded for metric: test.googleapis.com/generate_content_free_tier_reque",
			expectedContains:     "上游渠道配额已耗尽或超出调用频率限制",
			expectedOverrideCode: 429,
		},
		{
			name:                 "Example 10: 429 Provider returned error with provider details",
			statusCode:           429,
			rawError:             `Provider returned error: {"is_byok":false,"provider_name":"Google AI Studio","url":"https://api-inference.huggingface.co/models/***","error":{"code":429,"message":"Resource has been exhausted (e.g. check quota)."}}`,
			expectedContains:     "上游渠道配额已耗尽或超出调用频率限制",
			expectedOverrideCode: 429,
		},
		{
			name:                 "Example 11: 429 当前分组负载已饱和",
			statusCode:           429,
			rawError:             "当前分组负载已饱和，请稍后再试",
			expectedContains:     "当前模型服务请求量激增或高负载",
			expectedOverrideCode: 503,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			apiErr := types.NewOpenAIError(errors.New(tt.rawError), types.ErrorCodeBadResponseStatusCode, tt.statusCode)
			SanitizeRelayError(nil, apiErr)
			assert.Contains(t, apiErr.Error(), tt.expectedContains)
			if tt.expectedOverrideCode > 0 {
				assert.Equal(t, tt.expectedOverrideCode, apiErr.StatusCode)
			}
			// Verify that OpenAI serialization also has the sanitized message
			oai := apiErr.ToOpenAIError()
			assert.Contains(t, oai.Message, tt.expectedContains)
		})
	}
}

func TestSanitizeRelayErrorDisabled(t *testing.T) {
	common.ErrorSanitizationEnabled = false
	raw := "Raw secret upstream error with sensitive URL: https://upstream.secret/key"
	apiErr := types.NewOpenAIError(errors.New(raw), types.ErrorCodeBadResponseStatusCode, 500)
	SanitizeRelayError(nil, apiErr)
	assert.Equal(t, raw, apiErr.Error())
	common.ErrorSanitizationEnabled = true
}

func TestSanitizeRelayErrorCustomRules(t *testing.T) {
	common.ErrorSanitizationEnabled = true
	common.ErrorMappingRules = `[
		{
			"id": 99,
			"name": "Custom Test Rule",
			"match_code": 500,
			"keywords": "my_special_error_keyword, 另一个关键字",
			"replace_msg": "这是自定义的友好报错提示",
			"override_code": 400,
			"enabled": true
		}
	]`
	// Force cache reset
	cachedRulesJSON = ""

	apiErr := types.NewOpenAIError(errors.New("something went wrong with my_special_error_keyword inside"), types.ErrorCodeBadResponseStatusCode, 500)
	SanitizeRelayError(nil, apiErr)
	assert.Equal(t, "这是自定义的友好报错提示", apiErr.Error())
	assert.Equal(t, 400, apiErr.StatusCode)

	// Clean up
	common.ErrorMappingRules = ""
	cachedRulesJSON = ""
}

func TestSanitizeRelayErrorSmartFallback(t *testing.T) {
	common.ErrorSanitizationEnabled = true
	common.ErrorMappingRules = `[]`
	// Force cache reset to empty default
	cachedRulesJSON = ""

	// Unmatched 502 with URL
	apiErr := types.NewOpenAIError(errors.New("random proxy failure calling https://internal.corp/api"), types.ErrorCodeBadResponseStatusCode, 502)
	SanitizeRelayError(nil, apiErr)
	assert.Equal(t, "上游服务暂时不可用或网络异常，请稍后重试。", apiErr.Error())

	// Unmatched 400 context length
	apiErr2 := types.NewOpenAIError(errors.New("this prompt maximum token length 128000 exceeded"), types.ErrorCodeBadResponseStatusCode, 400)
	SanitizeRelayError(nil, apiErr2)
	assert.Equal(t, "提示词长度超出模型限制，请缩减输入。", apiErr2.Error())

	// Clean up
	common.ErrorMappingRules = ""
	cachedRulesJSON = ""
}

func TestSanitizeLogContentAndUserLogs(t *testing.T) {
	common.ErrorSanitizationEnabled = true
	common.ErrorMappingRules = ""
	cachedRulesJSON = ""

	// 1. Matched rule from status_code + keywords
	content1 := "status_code=500, User does not exist, organization does not exist"
	sanitized1 := SanitizeLogContent(content1)
	assert.Equal(t, "上游服务认证异常或账户不可用，请联系管理员。", sanitized1)

	// 2. Matched rule: high demand
	content2 := "status_code=503, currently experiencing high demand. Please try again later."
	sanitized2 := SanitizeLogContent(content2)
	assert.Equal(t, "当前模型服务请求量激增或高负载，请稍后重试。", sanitized2)

	// 3. Fallback for unmapped error with technical details
	content3 := "status_code=502, proxy failed connecting to 192.168.1.1:8080 and https://secret.corp/v1"
	sanitized3 := SanitizeLogContent(content3)
	assert.Equal(t, "上游服务暂时不可用或网络异常，请稍后重试。", sanitized3)

	// 4. Test SanitizeUserLogs batch processor
	logs := []*model.Log{
		{
			Type:    model.LogTypeError,
			Content: "status_code=400, context_length_exceeded: prompt too long",
		},
		{
			Type:    model.LogTypeConsume,
			Content: "normal consume log should remain unchanged",
		},
	}
	SanitizeUserLogs(logs)
	assert.Equal(t, "提示词长度超出该模型上下文上限，请精简输入后重试。", logs[0].Content)
	assert.Equal(t, "normal consume log should remain unchanged", logs[1].Content)

	// 5. Disabled
	common.ErrorSanitizationEnabled = false
	raw := "status_code=500, User does not exist"
	assert.Equal(t, raw, SanitizeLogContent(raw))

	// Clean up
	common.ErrorSanitizationEnabled = true
}

func TestSanitizeRelayErrorFieldsAndUnknown400(t *testing.T) {
	common.ErrorSanitizationEnabled = true
	common.ErrorMappingRules = `[]`
	cachedRulesJSON = ""

	// 1. Unknown 400 error containing internal model names, deployment IDs, and resource groups
	raw400 := "Invalid model azure-gpt-4-0613 for deployment dep-12345 in resource group rg-ai-eastus on cluster ai-node-99"
	apiErr := types.NewOpenAIError(errors.New(raw400), types.ErrorCodeInvalidRequest, 400)

	// Inject dirty upstream fields
	dirtyOAI := types.OpenAIError{
		Message:  raw400,
		Type:     "azure_openai_error",
		Param:    "deployment_id",
		Code:     "invalid_deployment_azure_eastus",
		Metadata: []byte(`{"region":"eastus","cluster":"k8s-ai-node-01"}`),
	}
	apiErr.RelayError = dirtyOAI

	SanitizeRelayError(nil, apiErr)

	// Verify error string is clean
	assert.Equal(t, "请求参数无效或不被上游模型支持，请检查请求配置。", apiErr.Error())
	assert.NotContains(t, apiErr.Error(), "azure")
	assert.NotContains(t, apiErr.Error(), "rg-ai-eastus")

	// Verify OpenAI error fields are normalized and leak-free
	oai := apiErr.ToOpenAIError()
	assert.Equal(t, "请求参数无效或不被上游模型支持，请检查请求配置。", oai.Message)
	assert.Equal(t, "invalid_request_error", oai.Type)
	assert.Equal(t, "", oai.Param)
	assert.Equal(t, "invalid_request_error", oai.Code)
	assert.Nil(t, oai.Metadata)

	// Verify Claude error serialization is standard
	claudeErr := apiErr.ToClaudeError()
	assert.Equal(t, "请求参数无效或不被上游模型支持，请检查请求配置。", claudeErr.Message)
	assert.Equal(t, "invalid_request_error", claudeErr.Type)

	// 2. Upstream 429 error with dirty provider-specific fields
	raw429 := "Provider Google AI Studio: quota exceeded for project prj-987654321"
	apiErr429 := types.NewOpenAIError(errors.New(raw429), types.ErrorCodeBadResponseStatusCode, 429)
	apiErr429.RelayError = types.OpenAIError{
		Message:  raw429,
		Type:     "google_generative_ai_error",
		Param:    "project_id",
		Code:     "quota_exceeded_google_ai_studio_internal",
		Metadata: []byte(`{"project":"prj-987654321"}`),
	}

	SanitizeRelayError(nil, apiErr429)

	oai429 := apiErr429.ToOpenAIError()
	assert.Equal(t, "上游渠道配额已耗尽或超出调用频率限制，请稍后重试。", oai429.Message)
	assert.Equal(t, "rate_limit_error", oai429.Type)
	assert.Equal(t, "", oai429.Param)
	assert.Equal(t, "rate_limit_exceeded", oai429.Code)
	assert.Nil(t, oai429.Metadata)

	claude429 := apiErr429.ToClaudeError()
	assert.Equal(t, "上游渠道配额已耗尽或超出调用频率限制，请稍后重试。", claude429.Message)
	assert.Equal(t, "rate_limit_error", claude429.Type)

	// Clean up
	common.ErrorMappingRules = ""
	cachedRulesJSON = ""
}

